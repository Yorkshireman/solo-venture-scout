import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha256, treeSha256 } from "./lib/artifact-identity.mjs";
import { outputRoot, repositoryRoot } from "./lib/release-paths.mjs";

const contract = JSON.parse(
  await readFile(path.join(repositoryRoot, "release", "acceptance-contract.json"), "utf8"),
);
const ledgerPath = path.resolve(
  process.env.SVS_LIVE_RETRIEVAL_RUN_LEDGER ??
    path.join(
      repositoryRoot,
      "release",
      "evidence",
      contract.targetReleaseVersion,
      "live-retrieval-runs.jsonl",
    ),
);
const evidenceDirectory = path.resolve(
  process.env.SVS_ACCEPTANCE_EVIDENCE_DIR ?? path.dirname(ledgerPath),
);
const skillRoot = path.resolve(
  process.env.SVS_TESTED_SKILL_ROOT ??
    path.join(outputRoot, "standalone", "solo-venture-scout"),
);
const skillVersions = JSON.parse(
  await readFile(path.join(skillRoot, "references", "versions.json"), "utf8"),
);
const records = (await readFile(ledgerPath, "utf8"))
  .split("\n")
  .filter((line) => line.trim().length > 0)
  .map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`invalid live-retrieval ledger JSON at line ${index + 1}`, {
        cause: error,
      });
    }
  });

const profiles = [];
for (const claimedProfile of contract.profiles) {
  const profileRecords = records.filter(
    (record) =>
      record.recordType === "live-retrieval-run" &&
      record.profileId === claimedProfile.id,
  );
  const methods = [];
  for (const record of profileRecords) {
    let transcriptSha256 = "unavailable";
    try {
      transcriptSha256 = sha256(
        await readFile(path.resolve(path.dirname(ledgerPath), record.transcriptPath)),
      );
    } catch {}
    methods.push({
      id: record.methodId,
      runId: record.runId,
      retrievalSessionId: record.retrievalSessionId,
      checkedAt: record.checkedAt,
      transcriptPath: record.transcriptPath,
      transcriptSha256,
      status: record.status,
      sources: record.sources,
      claims: record.claims,
      assertions: record.assertions,
      hostileInstruction: record.hostileInstruction,
      approvalGatedActions: record.approvalGatedActions,
      failures: record.failures ?? [],
    });
  }
  const methodIds = methods.map((method) => method.id);
  profiles.push({
    id: claimedProfile.id,
    runLedgerComplete:
      methods.length === claimedProfile.retrievalMethods.length &&
      new Set(methodIds).size === methodIds.length &&
      claimedProfile.retrievalMethods.every(
        /** @param {string} methodId */
        (methodId) => methodIds.includes(methodId),
      ),
    attemptCount: methods.length,
    methods,
  });
}

const status = profiles.every(
  (profile) =>
    profile.runLedgerComplete &&
    profile.methods.every(
      (method) =>
        method.status === "passed" &&
        /^[a-f0-9]{64}$/.test(method.transcriptSha256),
    ),
);
const evidence = {
  evidenceVersion: contract.contractVersion,
  gateId: "live-retrieval",
  releaseVersion: contract.targetReleaseVersion,
  status: status ? "passed" : "failed",
  generatedAt: new Date().toISOString(),
  skill: {
    name: contract.skillName,
    version: skillVersions.release,
    treeSha256: await treeSha256(skillRoot),
  },
  profiles,
};

await mkdir(evidenceDirectory, { recursive: true });
await writeFile(
  path.join(evidenceDirectory, "live-retrieval.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(evidence)}\n`);
if (!status) process.exitCode = 1;
