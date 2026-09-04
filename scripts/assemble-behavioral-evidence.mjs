import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { sha256, treeSha256 } from "./lib/artifact-identity.mjs";
import { outputRoot, repositoryRoot } from "./lib/release-paths.mjs";

const execFileAsync = promisify(execFile);
const contract = JSON.parse(
  await readFile(path.join(repositoryRoot, "release", "acceptance-contract.json"), "utf8"),
);
const ledgerPath = path.resolve(
  process.env.SVS_BEHAVIORAL_RUN_LEDGER ??
    path.join(
      repositoryRoot,
      "release",
      "evidence",
      contract.targetReleaseVersion,
      "behavioral-runs.jsonl",
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
      throw new Error(`invalid behavioral ledger JSON at line ${index + 1}`, {
        cause: error,
      });
    }
  });
const hostVersion =
  process.env.SVS_CODEX_VERSION ??
  (await execFileAsync("codex", ["--version"])).stdout.trim();

const profiles = [];
for (const claimedProfile of contract.profiles) {
  const calibrationRecords = records.filter(
    (record) =>
      record.recordType === "evaluator-calibration" &&
      record.profileId === claimedProfile.id,
  );
  const runRecords = records.filter(
    (record) =>
      record.recordType === "behavioral-run" && record.profileId === claimedProfile.id,
  );
  const calibration = calibrationRecords[0];
  const runs = [];
  for (const record of runRecords) {
    let transcriptSha256 = "unavailable";
    let campaignSha256 = "unavailable";
    try {
      transcriptSha256 = sha256(
        await readFile(path.resolve(path.dirname(ledgerPath), record.transcriptPath)),
      );
      campaignSha256 = await treeSha256(
        path.resolve(path.dirname(ledgerPath), record.campaignPath),
      );
    } catch {}
    runs.push({
      scenarioId: record.scenarioId,
      repetition: record.repetition,
      runId: record.runId,
      coordinatorSessionId: record.coordinatorSessionId,
      skillTreeSha256: record.skillTreeSha256,
      scenarioInputSha256: record.scenarioInputSha256,
      precondition: record.precondition,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      transcriptPath: record.transcriptPath,
      campaignPath: record.campaignPath,
      transcriptSha256,
      campaignSha256,
      status: record.status,
      forcedOutcomePassed: record.forcedOutcomePassed,
      invariants: record.invariants,
      evaluation: record.evaluation,
    });
  }
  const scenarioOrder = new Map(
    contract.controlledScenarios.map(
      /** @param {string} scenarioId @param {number} index */
      (scenarioId, index) => [scenarioId, index],
    ),
  );
  runs.sort(
    (left, right) =>
      (scenarioOrder.get(left.scenarioId) ?? Number.MAX_SAFE_INTEGER) -
        (scenarioOrder.get(right.scenarioId) ?? Number.MAX_SAFE_INTEGER) ||
      left.repetition - right.repetition,
  );
  const expectedRunCount =
    contract.controlledScenarios.length * contract.scenarioRepetitions;
  const expectedKeys = new Set();
  for (const scenarioId of contract.controlledScenarios) {
    for (let repetition = 1; repetition <= contract.scenarioRepetitions; repetition += 1) {
      expectedKeys.add(`${scenarioId}:${repetition}`);
    }
  }
  const actualKeys = runs.map((run) => `${run.scenarioId}:${run.repetition}`);
  const runLedgerComplete =
    calibrationRecords.length === 1 &&
    runs.length === expectedRunCount &&
    new Set(actualKeys).size === expectedRunCount &&
    actualKeys.every((key) => expectedKeys.has(key));
  profiles.push({
    id: claimedProfile.id,
    host: claimedProfile.host,
    hostVersion,
    runtime: {
      nodeVersion: process.versions.node,
      platform: process.platform,
      architecture: process.arch,
    },
    coordinatorModel: claimedProfile.coordinatorModel,
    reasoningEffort: claimedProfile.reasoningEffort,
    coordinatorCount: claimedProfile.coordinatorCount,
    evaluator: {
      model: calibration?.evaluatorModel,
      version: calibration?.evaluatorVersion,
      calibration: calibration
        ? {
            status: calibration.status,
            rubricVersion: calibration.rubricVersion,
            goldenSetVersion: calibration.goldenSetVersion,
            humanReviewed: calibration.humanReviewed,
            humanReviewReference: calibration.humanReviewReference,
            cases: calibration.cases,
          }
        : null,
    },
    runLedgerComplete,
    attemptCount: runs.length,
    runs,
  });
}

const status = profiles.every(
  (profile) =>
    profile.runLedgerComplete &&
    profile.evaluator.calibration?.status === "passed" &&
    profile.runs.every(
      (run) =>
        run.status === "passed" &&
        run.forcedOutcomePassed === true &&
        /^[a-f0-9]{64}$/.test(run.transcriptSha256) &&
        /^[a-f0-9]{64}$/.test(run.campaignSha256) &&
        /^[a-f0-9]{64}$/.test(run.scenarioInputSha256) &&
        typeof run.precondition?.precondition === "string" &&
        Number.isSafeInteger(run.precondition?.initialRecordSequence) &&
        run.evaluation?.status === "passed",
    ),
);
const evidence = {
  evidenceVersion: contract.contractVersion,
  gateId: "behavioral",
  releaseVersion: contract.targetReleaseVersion,
  status: status ? "passed" : "failed",
  generatedAt: new Date().toISOString(),
  suiteVersion: contract.suiteVersion,
  skill: {
    name: contract.skillName,
    version: skillVersions.release,
    treeSha256: await treeSha256(skillRoot),
  },
  profiles,
};

await mkdir(evidenceDirectory, { recursive: true });
await writeFile(
  path.join(evidenceDirectory, "behavioral.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(evidence)}\n`);
if (!status) process.exitCode = 1;
