import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha256 } from "./lib/artifact-identity.mjs";
import { appendOnlyJsonl } from "./lib/append-only-jsonl.mjs";
import { outputRoot, repositoryRoot } from "./lib/release-paths.mjs";

const contractPath = path.resolve(
  process.env.SVS_ACCEPTANCE_CONTRACT ??
    path.join(repositoryRoot, "release", "acceptance-contract.json"),
);
const scenariosPath = path.resolve(
  process.env.SVS_CONTROLLED_SCENARIOS ??
    path.join(repositoryRoot, "release", "controlled-scenarios.json"),
);
const rubricPath = path.resolve(
  process.env.SVS_EVALUATOR_RUBRIC ??
    path.join(repositoryRoot, "release", "evaluation", "rubric.json"),
);
const goldenSetPath = path.resolve(
  process.env.SVS_EVALUATOR_GOLDEN_SET ??
    path.join(repositoryRoot, "release", "evaluation", "golden-set.json"),
);
const driverPath = path.resolve(
  process.env.SVS_ACCEPTANCE_DRIVER ??
    path.join(repositoryRoot, "scripts", "lib", "codex-acceptance-driver.mjs"),
);
const contract = JSON.parse(await readFile(contractPath, "utf8"));
const scenarioPack = JSON.parse(await readFile(scenariosPath, "utf8"));
const rubric = JSON.parse(await readFile(rubricPath, "utf8"));
const goldenSet = JSON.parse(await readFile(goldenSetPath, "utf8"));
const driver = await import(pathToFileURL(driverPath).href);
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
const artifactsDirectory = path.resolve(
  process.env.SVS_BEHAVIORAL_ARTIFACTS_DIR ??
    path.join(path.dirname(ledgerPath), "behavioral-artifacts"),
);
const skillRoot = path.resolve(
  process.env.SVS_TESTED_SKILL_ROOT ??
    path.join(outputRoot, "standalone", "solo-venture-scout"),
);
const concurrency = Number(process.env.SVS_ACCEPTANCE_CONCURRENCY ?? "3");
if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 8) {
  throw new Error("SVS_ACCEPTANCE_CONCURRENCY must be an integer from 1 through 8");
}

if (
  scenarioPack.scenarioVersion !== contract.suiteVersion ||
  rubric.rubricVersion !== contract.evaluator.rubricVersion ||
  goldenSet.goldenSetVersion !== contract.evaluator.goldenSetVersion
) {
  throw new Error("scenario, rubric, or golden-set version does not match the acceptance contract");
}
const scenarioIds = scenarioPack.scenarios.map(
  /** @param {{ id: string }} scenario */
  (scenario) => scenario.id,
);
if (
  JSON.stringify(scenarioIds) !== JSON.stringify(contract.controlledScenarios) ||
  new Set(scenarioIds).size !== scenarioIds.length
) {
  throw new Error("scenario pack must match the ordered controlled-scenario contract");
}

await mkdir(artifactsDirectory, { recursive: true });
const ledger = appendOnlyJsonl(ledgerPath, { label: "behavioral run ledger" });
const existingRecords = await ledger.read();
let failed = false;
for (const profile of contract.profiles) {
  const existingCalibrations = existingRecords.filter(
    (record) =>
      record.recordType === "evaluator-calibration" && record.profileId === profile.id,
  );
  if (existingCalibrations.length > 1) {
    throw new Error(`behavioral ledger has duplicate evaluator calibrations for ${profile.id}`);
  }
  let calibration = existingCalibrations[0];
  if (!calibration) {
    const result = await driver.calibrateEvaluator({
      profile,
      contract,
      rubric,
      goldenSet,
      skillRoot,
      artifactsDirectory,
    });
    const casesPassed =
      Array.isArray(result.cases) &&
      result.cases.length === goldenSet.cases.length &&
      goldenSet.cases.every(
        /** @param {{ id: string }} goldenCase */
        (goldenCase) =>
          result.cases.some(
            /** @param {{ id: string, passed: boolean }} resultCase */
            (resultCase) => resultCase.id === goldenCase.id && resultCase.passed === true,
          ),
      );
    calibration = {
      recordType: "evaluator-calibration",
      profileId: profile.id,
      status: casesPassed ? "passed" : "failed",
      evaluatorSessionId: result.sessionId,
      evaluatorModel: result.model,
      evaluatorVersion: result.version,
      rubricVersion: rubric.rubricVersion,
      goldenSetVersion: goldenSet.goldenSetVersion,
      humanReviewed: goldenSet.humanReview.status === "approved",
      humanReviewReference: goldenSet.humanReview.reference,
      cases: result.cases,
    };
    await ledger.append(calibration);
    existingRecords.push(calibration);
  }
  if (calibration.status !== "passed") {
    failed = true;
    continue;
  }

  const jobs = scenarioPack.scenarios.flatMap(
    /** @param {Record<string, any>} scenario */
    (scenario) =>
      Array.from(
        { length: contract.scenarioRepetitions },
        (_, index) => ({ scenario, repetition: index + 1 }),
      ),
  );
  for (const { scenario, repetition } of jobs) {
    const existingRuns = existingRecords.filter(
      (record) =>
        record.recordType === "behavioral-run" &&
        record.profileId === profile.id &&
        record.scenarioId === scenario.id &&
        record.repetition === repetition,
    );
    if (existingRuns.length > 0) {
      throw new Error(
        `behavioral ledger already contains a complete result for ${profile.id}/${scenario.id}/${repetition}`,
      );
    }
  }

  let nextJobIndex = 0;
  const runWorker = async () => {
    while (nextJobIndex < jobs.length) {
      const { scenario, repetition } = jobs[nextJobIndex];
      nextJobIndex += 1;
      const runId = `${profile.id}-${scenario.id}-${repetition}`;
      const runDirectory = path.join(artifactsDirectory, runId);
      await mkdir(runDirectory, { recursive: false });
      try {
        const coordinatorResult = await driver.runCoordinator({
          profile,
          contract,
          scenario,
          repetition,
          runId,
          runDirectory,
          skillRoot,
        });
        const transcriptPath = path.join(runDirectory, "transcript.json");
        const sanitizedTranscript = JSON.stringify(coordinatorResult.transcript, null, 2)
          .replaceAll(runDirectory, "$RUN_DIRECTORY")
          .replaceAll(skillRoot, "$SKILL_ROOT")
          .replaceAll(repositoryRoot, "$REPOSITORY_ROOT");
        await writeFile(transcriptPath, `${sanitizedTranscript}\n`);
        const evaluatorResult = await driver.runEvaluator({
          profile,
          contract,
          scenario,
          repetition,
          runId,
          runDirectory,
          skillRoot,
          rubric,
          calibration,
          coordinatorResult,
          transcriptPath,
        });
      const forcedOutcomePassed = evaluatorResult.forcedOutcomePassed === true;
      const invariantsPassed =
        Array.isArray(evaluatorResult.invariants) &&
        contract.zeroToleranceInvariants.every(
          /** @param {string} invariantId */
          (invariantId) =>
            evaluatorResult.invariants.some(
              /** @param {{ id: string, status: string }} invariant */
              (invariant) =>
                invariant.id === invariantId && invariant.status === "passed",
            ),
        );
      const rubricsPassed =
        Array.isArray(evaluatorResult.ratings) &&
        contract.rubricDimensions.every(
          /** @param {string} dimension */
          (dimension) =>
            evaluatorResult.ratings.some(
              /** @param {{ dimension: string, rating: string }} rating */
              (rating) =>
                rating.dimension === dimension &&
                ["acceptable", "strong", "exceptional"].includes(rating.rating),
            ),
        );
      const status =
        evaluatorResult.status === "passed" &&
        forcedOutcomePassed &&
        invariantsPassed &&
        rubricsPassed &&
        /^[a-f0-9]{64}$/.test(coordinatorResult.skillTreeSha256) &&
        coordinatorResult.sessionId !== evaluatorResult.sessionId
          ? "passed"
          : "failed";
      const record = {
        recordType: "behavioral-run",
        profileId: profile.id,
        scenarioId: scenario.id,
        repetition,
        runId,
        coordinatorSessionId: coordinatorResult.sessionId,
        skillTreeSha256: coordinatorResult.skillTreeSha256,
        scenarioInputSha256: sha256(JSON.stringify(scenario.coordinatorInput)),
        precondition: coordinatorResult.precondition,
        startedAt: coordinatorResult.startedAt,
        completedAt: coordinatorResult.completedAt,
        transcriptPath: path.relative(path.dirname(ledgerPath), transcriptPath),
        campaignPath: path.relative(
          path.dirname(ledgerPath),
          coordinatorResult.campaignPath,
        ),
        status,
        forcedOutcomePassed,
        invariants: evaluatorResult.invariants,
        evaluation: {
          evaluationId: evaluatorResult.evaluationId,
          evaluatorSessionId: evaluatorResult.sessionId,
          status: evaluatorResult.status,
          rubricVersion: rubric.rubricVersion,
          failures: evaluatorResult.failures,
          adjudication: evaluatorResult.adjudication,
          ratings: evaluatorResult.ratings,
        },
      };
        await rm(path.join(runDirectory, "tested-skill"), {
          recursive: true,
          force: true,
        });
        await ledger.append(record);
        existingRecords.push(record);
        if (status !== "passed") failed = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const record = {
          recordType: "behavioral-run",
          profileId: profile.id,
          scenarioId: scenario.id,
          repetition,
          runId,
          coordinatorSessionId: null,
          scenarioInputSha256: sha256(JSON.stringify(scenario.coordinatorInput)),
          precondition: null,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          transcriptPath: path.relative(
            path.dirname(ledgerPath),
            path.join(runDirectory, "transcript.json"),
          ),
          campaignPath: path.relative(
            path.dirname(ledgerPath),
            path.join(runDirectory, "campaign"),
          ),
          status: "failed",
          forcedOutcomePassed: false,
          invariants: [],
          evaluation: {
            evaluationId: null,
            evaluatorSessionId: null,
            status: "failed",
            rubricVersion: rubric.rubricVersion,
            failures: [message.slice(0, 16_000)],
            adjudication: { status: "rejected", version: "1.0.0" },
            ratings: [],
          },
        };
        await ledger.append(record);
        existingRecords.push(record);
        failed = true;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, () => runWorker()),
  );
}

process.stdout.write(
  `${JSON.stringify({ ledgerPath, records: existingRecords.length, status: failed ? "failed" : "passed" })}\n`,
);
if (failed) process.exitCode = 1;
