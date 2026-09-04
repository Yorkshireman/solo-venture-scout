import { randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { sha256, treeSha256 } from "./lib/artifact-identity.mjs";
import { outputRoot, repositoryRoot } from "./lib/release-paths.mjs";

const execFileAsync = promisify(execFile);
const contract = JSON.parse(
  await readFile(path.join(repositoryRoot, "release", "acceptance-contract.json"), "utf8"),
);
const matrixContents = await readFile(
  path.join(repositoryRoot, "release", "compatibility-matrix.json"),
);
const matrix = JSON.parse(matrixContents.toString("utf8"));
const evidenceDirectory = path.resolve(
  process.env.SVS_ACCEPTANCE_EVIDENCE_DIR ??
    path.join(repositoryRoot, "release", "evidence", contract.targetReleaseVersion),
);
const skillRoot = path.join(outputRoot, "standalone", "solo-venture-scout");
const kernelPath = path.join(skillRoot, "scripts", "scout-kernel.mjs");
const versions = JSON.parse(
  await readFile(path.join(skillRoot, "references", "versions.json"), "utf8"),
);
const liveEvidence = JSON.parse(
  await readFile(path.join(evidenceDirectory, "live-retrieval.json"), "utf8"),
);
const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-compatibility-"));

/** @param {Record<string, unknown>} command */
function runKernel(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [kernelPath], { cwd: repositoryRoot });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      let response = null;
      try {
        response = JSON.parse(stdout);
      } catch {}
      resolve({ code, stdout, stderr, response });
    });
    child.stdin.end(`${JSON.stringify(command)}\n`);
  });
}

try {
  const profileClaims = [];
  for (const profileId of contract.compatibilityClaims) {
    const declared = matrix.profiles.find(
      /** @param {{ id: string }} profile */
      (profile) => profile.id === profileId,
    );
    if (!declared || declared.certification !== "certified") {
      throw new Error(`certified profile ${profileId} is missing from the compatibility matrix`);
    }
    const profileStorage = path.join(storagePath, profileId);
    await mkdir(profileStorage);
    const campaignPath = path.join(profileStorage, "campaign");
    const createdAt = new Date();
    const leaseExpiresAt = new Date(createdAt.getTime() + 10 * 60 * 1000);
    const preflight = await runKernel({
      envelopeVersion: versions.commandEnvelope,
      requestId: `compatibility-preflight-${profileId}`,
      command: "preflight",
      payload: {
        storagePath: profileStorage,
        retrievalRoutes: declared.retrievalMethods.map(
          /** @param {string} id */
          (id) => ({ id, available: true, public: true, lawful: true }),
        ),
      },
    });
    const created = await runKernel({
      envelopeVersion: versions.commandEnvelope,
      requestId: `compatibility-create-${profileId}`,
      command: "createCampaign",
      payload: {
        campaignPath,
        campaignId: `compatibility-${profileId}`,
        coordinatorId: "coordinator-compatibility",
        createdAt: createdAt.toISOString(),
        leaseExpiresAt: leaseExpiresAt.toISOString(),
      },
    });
    const inspected = await runKernel({
      envelopeVersion: versions.commandEnvelope,
      requestId: `compatibility-inspect-${profileId}`,
      command: "inspectCampaign",
      payload: { campaignPath },
    });
    const skillContents = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
    const openaiMetadata = await readFile(
      path.join(skillRoot, "agents", "openai.yaml"),
      "utf8",
    );
    const pluginManifest = JSON.parse(
      await readFile(
        path.join(
          outputRoot,
          "plugin",
          "solo-venture-scout",
          ".codex-plugin",
          "plugin.json",
        ),
        "utf8",
      ),
    );
    const liveProfile = liveEvidence.profiles?.find(
      /** @param {{ id: string }} profile */
      (profile) => profile.id === profileId,
    );
    const liveMethodsPassed = declared.retrievalMethods.every(
      /** @param {string} methodId */
      (methodId) =>
        liveProfile?.methods?.some(
          /** @param {{ id: string, status: string }} method */
          (method) => method.id === methodId && method.status === "passed",
        ),
    );
    const assertions = [
      {
        id: "preflight",
        status: preflight.code === 0 && preflight.response?.result?.ready === true ? "passed" : "failed",
        details: "The packaged preflight accepted Node 24, writable storage, and the claimed lawful public route without creating Campaign state.",
      },
      {
        id: "packaged-skill-discovery",
        status:
          /^---\n[\s\S]*name: solo-venture-scout/m.test(skillContents) &&
          /allow_implicit_invocation:\s*false/.test(openaiMetadata) &&
          pluginManifest.skills === "./skills/"
            ? "passed"
            : "failed",
        details: "The generated standalone skill and skills-only plugin expose the expected explicit-invocation metadata.",
      },
      {
        id: "kernel-execution",
        status: preflight.code === 0 && created.code === 0 && inspected.code === 0 ? "passed" : "failed",
        details: "The generated bundled kernel executed through its JSON subprocess interface.",
      },
      {
        id: "campaign-persistence",
        status:
          created.response?.result?.created === true &&
          inspected.response?.result?.workView?.recordSequence === 2 &&
          (await stat(path.join(campaignPath, "records.jsonl"))).isFile()
            ? "passed"
            : "failed",
        details: "A Campaign created by the packaged kernel was inspectable from its persisted append-only authority.",
      },
      {
        id: "public-retrieval",
        status: liveEvidence.status === "passed" && liveMethodsPassed ? "passed" : "failed",
        details: "The separately recorded live-retrieval gate passed every retrieval method claimed by this profile.",
      },
    ];
    const hostVersion =
      process.env.SVS_CODEX_VERSION ??
      (await execFileAsync("codex", ["--version"])).stdout.trim();
    const operatingSystem =
      process.platform === "darwin"
        ? `macOS ${process.arch}`
        : `${process.platform} ${process.arch}`;
    const environmentMatches =
      process.versions.node.startsWith("24.") &&
      declared.operatingSystems.includes(operatingSystem);
    profileClaims.push({
      profileId,
      status:
        environmentMatches &&
        assertions.every((assertion) => assertion.status === "passed")
        ? "passed"
        : "failed",
      host: declared.host,
      hostVersion,
      runtime: {
        nodeVersion: process.versions.node,
        platform: process.platform,
        architecture: process.arch,
      },
      coordinatorModel: declared.coordinatorModel,
      reasoningEffort: declared.reasoningEffort,
      coordinatorCount: declared.coordinatorCount,
      retrievalMethods: declared.retrievalMethods,
      runId: randomUUID(),
      checkedAt: new Date().toISOString(),
      artifactSha256: sha256(
        `${preflight.stdout}\n${created.stdout}\n${inspected.stdout}\n${skillContents}`,
      ),
      assertions,
    });
  }

  const evidence = {
    evidenceVersion: contract.contractVersion,
    gateId: "compatibility",
    releaseVersion: contract.targetReleaseVersion,
    status: profileClaims.every((claim) => claim.status === "passed")
      ? "passed"
      : "failed",
    generatedAt: new Date().toISOString(),
    matrixVersion: matrix.matrixVersion,
    matrixSha256: sha256(matrixContents),
    skill: {
      name: contract.skillName,
      version: versions.release,
      treeSha256: await treeSha256(skillRoot),
    },
    claims: profileClaims,
  };
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(
    path.join(evidenceDirectory, "compatibility.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
  if (evidence.status !== "passed") process.exitCode = 1;
} finally {
  await rm(storagePath, { recursive: true, force: true });
}
