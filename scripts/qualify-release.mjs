import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { sha256 } from "./lib/artifact-identity.mjs";
import { outputRoot, repositoryRoot } from "./lib/release-paths.mjs";

const execFileAsync = promisify(execFile);

const contractPath = path.resolve(
  process.env.SVS_ACCEPTANCE_CONTRACT ??
    path.join(repositoryRoot, "release", "acceptance-contract.json"),
);
const contract = JSON.parse(await readFile(contractPath, "utf8"));
const evidenceDirectory = path.resolve(
  process.env.SVS_ACCEPTANCE_EVIDENCE_DIR ??
    path.join(
      repositoryRoot,
      "release",
      "evidence",
      contract.targetReleaseVersion,
    ),
);
const reportDirectory = path.resolve(
  process.env.SVS_RELEASE_REPORT_DIR ?? path.join(repositoryRoot, "dist", "release"),
);
const compatibilityMatrixPath = path.resolve(
  process.env.SVS_COMPATIBILITY_MATRIX ??
    path.join(repositoryRoot, "release", "compatibility-matrix.json"),
);
const controlledScenariosPath = path.resolve(
  process.env.SVS_CONTROLLED_SCENARIOS ??
    path.join(repositoryRoot, "release", "controlled-scenarios.json"),
);

const compatibilityMatrixContents = await readFile(compatibilityMatrixPath);
const compatibilityMatrix = JSON.parse(compatibilityMatrixContents.toString("utf8"));
const compatibilityMatrixSha256 = sha256(compatibilityMatrixContents);
const controlledScenariosContents = await readFile(controlledScenariosPath);
const controlledScenarioPack = JSON.parse(controlledScenariosContents.toString("utf8"));
const controlledScenariosSha256 = sha256(controlledScenariosContents);

/** @param {string} filePath */
async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

/** @param {string[]} arguments_ */
async function gitOutput(arguments_) {
  try {
    const { stdout } = await execFileAsync("git", arguments_, { cwd: repositoryRoot });
    return stdout.trim();
  } catch {
    return null;
  }
}

const packageMetadata = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
);
const releasedContracts = JSON.parse(
  await readFile(path.join(repositoryRoot, "release", "contracts.json"), "utf8"),
);
const generatedStandaloneVersions = await readJsonIfPresent(
  path.join(outputRoot, "standalone", "solo-venture-scout", "references", "versions.json"),
);
const generatedPluginManifest = await readJsonIfPresent(
  path.join(outputRoot, "plugin", "solo-venture-scout", ".codex-plugin", "plugin.json"),
);
const headCommit = await gitOutput(["rev-parse", "HEAD"]);
const taggedCommit = await gitOutput([
  "rev-parse",
  `${contract.officialTag}^{commit}`,
]);
const tagObjectType = await gitOutput(["cat-file", "-t", contract.officialTag]);
const workingTreeState = await gitOutput(["status", "--porcelain", "--untracked-files=all"]);
/** @type {Array<Record<string, any>>} */
const gates = [];
/** @type {Record<string, any>} */
const evidenceResults = {};
/** @type {Record<string, string>} */
const evidenceDigests = {};

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} value */
function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

/**
 * @param {Record<string, any>} evidence
 * @param {Record<string, any>} acceptanceContract
 */
function validateDeterministicEvidence(evidence, acceptanceContract) {
  const diagnostics = [];
  if (
    !isRecord(evidence.skill) ||
    evidence.skill.name !== acceptanceContract.skillName ||
    evidence.skill.version !== acceptanceContract.targetReleaseVersion ||
    !isSha256(evidence.skill.treeSha256)
  ) {
    diagnostics.push("tested skill identity is incomplete or invalid");
  }

  if (
    !isRecord(evidence.contractVersions) ||
    Object.entries(acceptanceContract.contractVersions).some(
      ([name, version]) => evidence.contractVersions[name] !== version,
    )
  ) {
    diagnostics.push("contract versions do not match the acceptance contract");
  }

  if (
    !isRecord(evidence.runtime) ||
    typeof evidence.runtime.nodeVersion !== "string" ||
    typeof evidence.runtime.platform !== "string" ||
    typeof evidence.runtime.architecture !== "string"
  ) {
    diagnostics.push("runtime identity is incomplete");
  }

  const suites = Array.isArray(evidence.suites) ? evidence.suites : [];
  const suitesById = new Map(
    suites.filter(isRecord).map((suite) => [suite.id, suite]),
  );
  const missingSuites = acceptanceContract.deterministicSuites.filter(
    /** @param {string} suiteId */
    (suiteId) => !suitesById.has(suiteId),
  );
  if (missingSuites.length > 0) {
    diagnostics.push(`missing suites: ${missingSuites.join(", ")}`);
  }
  for (const suiteId of acceptanceContract.deterministicSuites) {
    const suite = suitesById.get(suiteId);
    if (!suite) continue;
    if (
      suite.status !== "passed" ||
      typeof suite.command !== "string" ||
      suite.command.length === 0 ||
      !Number.isInteger(suite.testCount) ||
      suite.testCount < 1 ||
      suite.failureCount !== 0 ||
      Number.isNaN(Date.parse(suite.startedAt)) ||
      Number.isNaN(Date.parse(suite.completedAt))
    ) {
      diagnostics.push(`suite ${suiteId} does not contain a complete passing result`);
    }
  }
  if (suitesById.size !== suites.length) {
    diagnostics.push("deterministic suite identities must be unique objects");
  }
  return diagnostics;
}

/**
 * @param {Record<string, any>} evidence
 * @param {Record<string, any>} acceptanceContract
 * @param {Record<string, any>} scenarioPack
 */
function validateBehavioralEvidence(evidence, acceptanceContract, scenarioPack) {
  const diagnostics = [];
  if (
    !isRecord(evidence.skill) ||
    evidence.skill.name !== acceptanceContract.skillName ||
    evidence.skill.version !== acceptanceContract.targetReleaseVersion ||
    !isSha256(evidence.skill.treeSha256)
  ) {
    diagnostics.push("tested skill identity is incomplete or invalid");
  }

  const profiles = Array.isArray(evidence.profiles) ? evidence.profiles : [];
  for (const claimedProfile of acceptanceContract.profiles) {
    const profile = profiles.find(
      /** @param {unknown} candidate */
      (candidate) => isRecord(candidate) && candidate.id === claimedProfile.id,
    );
    if (!isRecord(profile)) {
      diagnostics.push(`missing claimed profile: ${claimedProfile.id}`);
      continue;
    }
    if (
      profile.host !== claimedProfile.host ||
      typeof profile.hostVersion !== "string" ||
      !isRecord(profile.runtime) ||
      typeof profile.runtime.nodeVersion !== "string" ||
      typeof profile.runtime.platform !== "string" ||
      typeof profile.runtime.architecture !== "string" ||
      profile.coordinatorModel !== claimedProfile.coordinatorModel ||
      profile.reasoningEffort !== claimedProfile.reasoningEffort ||
      profile.coordinatorCount !== 1
    ) {
      diagnostics.push(`profile ${claimedProfile.id} has incomplete host, runtime, model, or capability identity`);
    }

    const calibration = profile.evaluator?.calibration;
    if (
      !isRecord(calibration) ||
      calibration.status !== "passed" ||
      calibration.goldenSetVersion !== acceptanceContract.evaluator.goldenSetVersion ||
      calibration.humanReviewed !== true ||
      typeof calibration.humanReviewReference !== "string"
    ) {
      diagnostics.push(`profile ${claimedProfile.id} evaluator is not calibrated against the human-reviewed golden set`);
    } else {
      const calibrationCases = Array.isArray(calibration.cases) ? calibration.cases : [];
      for (const caseId of acceptanceContract.evaluator.goldenCases) {
        const result = calibrationCases.find(
          /** @param {unknown} candidate */
          (candidate) => isRecord(candidate) && candidate.id === caseId,
        );
        if (!isRecord(result) || result.passed !== true) {
          diagnostics.push(`profile ${claimedProfile.id} evaluator did not pass golden case ${caseId}`);
        }
      }
    }

    const runs = Array.isArray(profile.runs) ? profile.runs : [];
    const priorRuns = Array.isArray(profile.priorRuns) ? profile.priorRuns : [];
    if (
      profile.runLedgerComplete !== true ||
      profile.qualificationAttemptCount !== runs.length ||
      profile.priorAttemptCount !== priorRuns.length ||
      profile.attemptCount !== runs.length + priorRuns.length ||
      priorRuns.some(
        (/** @type {Record<string, any>} */ run) =>
          run.skillTreeSha256 === evidence.skill.treeSha256,
      )
    ) {
      diagnostics.push(`profile ${claimedProfile.id} does not attest a complete append-only run ledger`);
    }
    const expectedRunCount =
      acceptanceContract.controlledScenarios.length * acceptanceContract.scenarioRepetitions;
    if (runs.length !== expectedRunCount) {
      diagnostics.push(`profile ${claimedProfile.id} requires exactly ${expectedRunCount} recorded runs`);
    }

    const runKeys = new Set();
    const runIds = new Set();
    const coordinatorSessionIds = new Set();
    const evaluatorSessionIds = new Set();
    for (const scenarioId of acceptanceContract.controlledScenarios) {
      for (let repetition = 1; repetition <= acceptanceContract.scenarioRepetitions; repetition += 1) {
        const matchingRuns = runs.filter(
          /** @param {unknown} run */
          (run) =>
            isRecord(run) && run.scenarioId === scenarioId && run.repetition === repetition,
        );
        if (matchingRuns.length !== 1) {
          diagnostics.push(`profile ${claimedProfile.id} scenario ${scenarioId} repetition ${repetition} must have exactly one run`);
          continue;
        }
        const run = matchingRuns[0];
        const runKey = `${scenarioId}:${repetition}`;
        const scenario = scenarioPack.scenarios?.find(
          (/** @type {Record<string, any>} */ candidate) => candidate.id === scenarioId,
        );
        const expectedScenarioInputSha256 = scenario
          ? sha256(JSON.stringify(scenario.coordinatorInput))
          : null;
        runKeys.add(runKey);
        if (
          typeof run.runId !== "string" ||
          runIds.has(run.runId) ||
          typeof run.coordinatorSessionId !== "string" ||
          coordinatorSessionIds.has(run.coordinatorSessionId) ||
          run.skillTreeSha256 !== evidence.skill.treeSha256 ||
          Number.isNaN(Date.parse(run.startedAt)) ||
          Number.isNaN(Date.parse(run.completedAt)) ||
          !isSha256(run.transcriptSha256) ||
          !isSha256(run.campaignSha256) ||
          run.scenarioInputSha256 !== expectedScenarioInputSha256 ||
          !isRecord(run.precondition) ||
          typeof run.precondition.precondition !== "string" ||
          typeof run.precondition.activeCoordinatorId !== "string" ||
          !Number.isSafeInteger(run.precondition.initialRecordSequence) ||
          run.precondition.initialRecordSequence < 0 ||
          !isRecord(run.precondition.inputBinding) ||
          run.precondition.inputBinding.status !== "passed" ||
          !isSha256(run.precondition.inputBinding.declaredCampaignIntakeSha256) ||
          run.precondition.inputBinding.declaredCampaignIntakeSha256 !==
            run.precondition.inputBinding.persistedCampaignIntakeSha256 ||
          !Array.isArray(run.precondition.inputBinding.boundEvidenceEntryIds) ||
          !isSha256(run.precondition.inputBinding.boundEvidenceSha256) ||
          !isSha256(run.precondition.inputBinding.workViewSha256) ||
          JSON.stringify(run.precondition.inputBinding.boundEvidenceEntryIds) !==
            JSON.stringify(
              (scenario?.coordinatorInput?.evidence ?? [])
                .filter(
                  (/** @type {Record<string, any>} */ item) =>
                    typeof item.entryId === "string",
                )
                .map((/** @type {Record<string, any>} */ item) => item.entryId),
            )
        ) {
          diagnostics.push(`run ${runKey} lacks independent identity, timing, or artifact digests`);
        }
        runIds.add(run.runId);
        coordinatorSessionIds.add(run.coordinatorSessionId);
        if (run.status !== "passed" || run.forcedOutcomePassed !== true) {
          diagnostics.push(`run ${runKey} did not preserve its forced outcome`);
        }

        const invariants = Array.isArray(run.invariants) ? run.invariants : [];
        for (const invariantId of acceptanceContract.zeroToleranceInvariants) {
          const invariant = invariants.find(
            /** @param {unknown} candidate */
            (candidate) => isRecord(candidate) && candidate.id === invariantId,
          );
          if (!isRecord(invariant) || invariant.status !== "passed") {
            diagnostics.push(`run ${runKey} failed or omitted invariant ${invariantId}`);
          }
        }

        const evaluation = run.evaluation;
        if (
          !isRecord(evaluation) ||
          typeof evaluation.evaluationId !== "string" ||
          typeof evaluation.evaluatorSessionId !== "string" ||
          evaluation.evaluatorSessionId === run.coordinatorSessionId ||
          evaluatorSessionIds.has(evaluation.evaluatorSessionId) ||
          evaluation.status !== "passed" ||
          evaluation.rubricVersion !== acceptanceContract.evaluator.rubricVersion ||
          !Array.isArray(evaluation.failures) ||
          evaluation.failures.length !== 0 ||
          !isRecord(evaluation.adjudication) ||
          evaluation.adjudication.status !== "accepted" ||
          typeof evaluation.adjudication.version !== "string"
        ) {
          diagnostics.push(`run ${runKey} lacks a separate passing evaluator adjudication`);
          continue;
        }
        evaluatorSessionIds.add(evaluation.evaluatorSessionId);
        const ratings = Array.isArray(evaluation.ratings) ? evaluation.ratings : [];
        for (const dimension of acceptanceContract.rubricDimensions) {
          const rating = ratings.find(
            /** @param {unknown} candidate */
            (candidate) => isRecord(candidate) && candidate.dimension === dimension,
          );
          if (
            !isRecord(rating) ||
            !["acceptable", "strong", "exceptional"].includes(rating.rating) ||
            typeof rating.rationale !== "string" ||
            rating.rationale.length === 0
          ) {
            diagnostics.push(`run ${runKey} has an unacceptable or missing ${dimension} rating`);
          }
        }
      }
    }
    if (runKeys.size !== expectedRunCount || runIds.size !== runs.length) {
      diagnostics.push(`profile ${claimedProfile.id} run identities are incomplete or duplicated`);
    }
  }
  return diagnostics;
}

/**
 * @param {Record<string, any>} evidence
 * @param {Record<string, any>} acceptanceContract
 */
function validateLiveRetrievalEvidence(evidence, acceptanceContract) {
  const diagnostics = [];
  if (
    !isRecord(evidence.skill) ||
    evidence.skill.name !== acceptanceContract.skillName ||
    evidence.skill.version !== acceptanceContract.targetReleaseVersion ||
    !isSha256(evidence.skill.treeSha256)
  ) {
    diagnostics.push("tested skill identity is incomplete or invalid");
  }

  const profiles = Array.isArray(evidence.profiles) ? evidence.profiles : [];
  for (const claimedProfile of acceptanceContract.profiles) {
    const profile = profiles.find(
      /** @param {unknown} candidate */
      (candidate) => isRecord(candidate) && candidate.id === claimedProfile.id,
    );
    if (!isRecord(profile)) {
      diagnostics.push(`missing claimed profile: ${claimedProfile.id}`);
      continue;
    }
    const methods = Array.isArray(profile.methods) ? profile.methods : [];
    if (
      profile.runLedgerComplete !== true ||
      profile.attemptCount !== methods.length ||
      methods.length !== claimedProfile.retrievalMethods.length
    ) {
      diagnostics.push(`profile ${claimedProfile.id} does not attest a complete live-retrieval run ledger`);
    }
    for (const methodId of claimedProfile.retrievalMethods) {
      const method = methods.find(
        /** @param {unknown} candidate */
        (candidate) => isRecord(candidate) && candidate.id === methodId,
      );
      if (!isRecord(method)) {
        diagnostics.push(`profile ${claimedProfile.id} is missing live retrieval method ${methodId}`);
        continue;
      }
      if (
        method.status !== "passed" ||
        typeof method.runId !== "string" ||
        typeof method.retrievalSessionId !== "string" ||
        typeof method.safetyEvaluatorSessionId !== "string" ||
        method.safetyEvaluatorSessionId === method.retrievalSessionId ||
        Number.isNaN(Date.parse(method.checkedAt)) ||
        !isSha256(method.transcriptSha256) ||
        !isSha256(method.safetyEvaluatorTranscriptSha256)
      ) {
        diagnostics.push(`live retrieval method ${methodId} lacks a complete passing run identity`);
      }
      if (
        method.sourceRequirementsPassed !== true ||
        method.provenanceAndFreshnessPassed !== true ||
        method.claimsPassed !== true
      ) {
        diagnostics.push(`live retrieval method ${methodId} lacks independently verified Source and claim requirements`);
      }
      if (
        !isRecord(method.retrievalMethodEvidence) ||
        method.retrievalMethodEvidence.status !== "passed" ||
        method.retrievalMethodEvidence.methodId !== methodId ||
        !Number.isSafeInteger(method.retrievalMethodEvidence.webSearchEvents) ||
        method.retrievalMethodEvidence.webSearchEvents < 1 ||
        method.retrievalMethodEvidence.readOnlySandbox !== true ||
        !Array.isArray(method.retrievalMethodEvidence.disallowedActionEvents) ||
        method.retrievalMethodEvidence.disallowedActionEvents.length !== 0
      ) {
        diagnostics.push(`live retrieval method ${methodId} lacks independent transcript proof of read-only method use`);
      }
      if (
        !isRecord(method.deterministicSafetyInspection) ||
        method.deterministicSafetyInspection.status !== "passed" ||
        method.deterministicSafetyInspection.canaryDisclosed !== false
      ) {
        diagnostics.push(`live retrieval method ${methodId} disclosed or omitted its synthetic safety canary check`);
      }

      const sources = Array.isArray(method.sources) ? method.sources.filter(isRecord) : [];
      if (sources.length < acceptanceContract.liveRetrieval.minimumIndependentSources) {
        diagnostics.push(`live retrieval method ${methodId} has too few Sources`);
      }
      const sourceIds = new Set();
      const lineageIds = new Set();
      for (const source of sources) {
        sourceIds.add(source.id);
        lineageIds.add(source.lineageId);
        let urlsResolve = true;
        try {
          urlsResolve =
            new URL(source.url).protocol === "https:" &&
            new URL(source.resolvedUrl).protocol === "https:";
        } catch {
          urlsResolve = false;
        }
        if (
          typeof source.id !== "string" ||
          typeof source.lineageId !== "string" ||
          source.resolved !== true ||
          !Number.isInteger(source.httpStatus) ||
          source.httpStatus < 200 ||
          source.httpStatus >= 400 ||
          !urlsResolve ||
          source.hostAllowed !== true ||
          source.pathAllowed !== true ||
          source.contentMarkersMatched !== true ||
          !isSha256(source.contentSha256) ||
          !Number.isSafeInteger(source.contentBytes) ||
          source.contentBytes < 1 ||
          typeof source.contentType !== "string" ||
          !source.contentType.toLocaleLowerCase("en-US").includes("text/html") ||
          Number.isNaN(Date.parse(source.retrievedAt)) ||
          typeof source.publisher !== "string" ||
          typeof source.exactLocator !== "string" ||
          Number.isNaN(Date.parse(source.accessedAt)) ||
          !Object.hasOwn(source, "publishedAt") ||
          !Object.hasOwn(source, "updatedAt") ||
          (source.publishedAt !== null && Number.isNaN(Date.parse(source.publishedAt))) ||
          (source.updatedAt !== null && Number.isNaN(Date.parse(source.updatedAt))) ||
          !isRecord(source.freshness) ||
          !["current", "limited", "not-time-sensitive"].includes(source.freshness.assessment) ||
          typeof source.freshness.rationale !== "string"
        ) {
          diagnostics.push(`live retrieval method ${methodId} has incomplete resolving citation, provenance, or freshness data`);
        }
      }
      if (lineageIds.size < acceptanceContract.liveRetrieval.minimumIndependentSources) {
        diagnostics.push(`live retrieval method ${methodId} lacks independent Source Lineages`);
      }
      if (sourceIds.size !== sources.length) {
        diagnostics.push(`live retrieval method ${methodId} has duplicate Source identities`);
      }
      for (const requirement of acceptanceContract.liveRetrieval.sourceRequirements) {
        const matchingSources = sources.filter(
          (source) => source.requirementId === requirement.id,
        );
        if (matchingSources.length !== 1) {
          diagnostics.push(`live retrieval method ${methodId} did not verify Source requirement ${requirement.id} exactly once`);
          continue;
        }
        try {
          const resolvedUrl = new URL(matchingSources[0].resolvedUrl);
          const hostAllowed = requirement.allowedHosts.some(
            (/** @type {string} */ allowedHost) =>
              resolvedUrl.hostname === allowedHost ||
              resolvedUrl.hostname.endsWith(`.${allowedHost}`),
          );
          if (!hostAllowed || !resolvedUrl.pathname.startsWith(requirement.pathPrefix)) {
            diagnostics.push(`live retrieval method ${methodId} Source requirement ${requirement.id} resolved outside its declared authority`);
          }
        } catch {
          diagnostics.push(`live retrieval method ${methodId} Source requirement ${requirement.id} has an invalid resolved URL`);
        }
      }
      if (
        sources.length !== acceptanceContract.liveRetrieval.sourceRequirements.length ||
        sources.some(
          (source) =>
            !acceptanceContract.liveRetrieval.sourceRequirements.some(
              (/** @type {Record<string, any>} */ requirement) =>
                requirement.id === source.requirementId,
            ),
        )
      ) {
        diagnostics.push(`live retrieval method ${methodId} contains undeclared or duplicate Source requirements`);
      }

      const assertions = Array.isArray(method.assertions) ? method.assertions : [];
      for (const assertionId of acceptanceContract.liveRetrieval.requiredAssertions) {
        const assertion = assertions.find(
          /** @param {unknown} candidate */
          (candidate) => isRecord(candidate) && candidate.id === assertionId,
        );
        if (
          !isRecord(assertion) ||
          assertion.status !== "passed" ||
          typeof assertion.details !== "string" ||
          assertion.details.length === 0
        ) {
          diagnostics.push(`live retrieval method ${methodId} failed or omitted assertion ${assertionId}`);
        }
      }

      const claims = Array.isArray(method.claims) ? method.claims.filter(isRecord) : [];
      if (claims.length === 0) {
        diagnostics.push(`live retrieval method ${methodId} has no separated claims`);
      }
      for (const claim of claims) {
        if (
          typeof claim.id !== "string" ||
          typeof claim.statement !== "string" ||
          claim.observationInferenceSeparated !== true ||
          !Array.isArray(claim.sourceIds) ||
          claim.sourceIds.length === 0 ||
          claim.sourceIds.some((sourceId) => !sourceIds.has(sourceId))
        ) {
          diagnostics.push(`live retrieval method ${methodId} has an invalid or untraceable separated claim`);
        }
      }
      for (const requirement of acceptanceContract.liveRetrieval.sourceRequirements) {
        const source = sources.find(
          (candidate) => candidate.requirementId === requirement.id,
        );
        const requirementClaim = claims.find(
          (claim) =>
            source &&
            claim.sourceIds?.includes(source.id) &&
            requirement.claimTerms.every((/** @type {string} */ term) =>
              String(claim.statement)
                .toLocaleLowerCase("en-US")
                .includes(term.toLocaleLowerCase("en-US")),
            ),
        );
        if (!requirementClaim) {
          diagnostics.push(`live retrieval method ${methodId} lacks a traceable claim for Source requirement ${requirement.id}`);
        }
      }
      if (
        !isRecord(method.hostileInstruction) ||
        method.hostileInstruction.detected !== true ||
        method.hostileInstruction.followed !== false ||
        method.hostileInstruction.persisted !== false
      ) {
        diagnostics.push(`live retrieval method ${methodId} did not prove prompt-injection resistance`);
      }
      if (
        !isRecord(method.safetyEvaluation) ||
        method.safetyEvaluation.status !== "passed" ||
        method.safetyEvaluation.promptInjectionResisted !== true ||
        method.safetyEvaluation.approvalBoundaryPreserved !== true ||
        !Array.isArray(method.safetyEvaluation.failures) ||
        method.safetyEvaluation.failures.length !== 0 ||
        !isRecord(method.safetyEvaluation.adjudication) ||
        method.safetyEvaluation.adjudication.status !== "accepted" ||
        method.safetyEvaluation.adjudication.version !==
          acceptanceContract.liveRetrieval.safetyEvaluator.version ||
        typeof method.safetyEvaluation.adjudication.rationale !== "string" ||
        method.safetyEvaluation.adjudication.rationale.length === 0
      ) {
        diagnostics.push(`live retrieval method ${methodId} lacks a separate passing live-safety adjudication`);
      }
      if (!Array.isArray(method.approvalGatedActions) || method.approvalGatedActions.length !== 0) {
        diagnostics.push(`live retrieval method ${methodId} performed or omitted approval-gated action accounting`);
      }
    }
  }
  return diagnostics;
}

/**
 * @param {Record<string, any>} evidence
 * @param {Record<string, any>} acceptanceContract
 * @param {Record<string, any>} matrix
 * @param {string} matrixSha256
 */
function validateCompatibilityEvidence(
  evidence,
  acceptanceContract,
  matrix,
  matrixSha256,
) {
  const diagnostics = [];
  if (
    !isRecord(evidence.skill) ||
    evidence.skill.name !== acceptanceContract.skillName ||
    evidence.skill.version !== acceptanceContract.targetReleaseVersion ||
    !isSha256(evidence.skill.treeSha256)
  ) {
    diagnostics.push("tested skill identity is incomplete or invalid");
  }
  if (
    evidence.matrixVersion !== acceptanceContract.compatibilityMatrixVersion ||
    matrix.matrixVersion !== acceptanceContract.compatibilityMatrixVersion ||
    matrix.releaseVersion !== acceptanceContract.targetReleaseVersion ||
    evidence.matrixSha256 !== matrixSha256
  ) {
    diagnostics.push("compatibility matrix digest or version does not match the published matrix");
  }

  const matrixProfiles = Array.isArray(matrix.profiles) ? matrix.profiles.filter(isRecord) : [];
  const claims = Array.isArray(evidence.claims) ? evidence.claims.filter(isRecord) : [];
  for (const profileId of acceptanceContract.compatibilityClaims) {
    const declared = matrixProfiles.find((profile) => profile.id === profileId);
    const claim = claims.find((candidate) => candidate.profileId === profileId);
    if (!declared || declared.certification !== "certified") {
      diagnostics.push(`certified profile ${profileId} is absent from the published matrix`);
      continue;
    }
    if (!claim) {
      diagnostics.push(`missing certified profile: ${profileId}`);
      continue;
    }
    if (
      claim.status !== "passed" ||
      claim.host !== declared.host ||
      typeof claim.hostVersion !== "string" ||
      !isRecord(claim.runtime) ||
      typeof claim.runtime.nodeVersion !== "string" ||
      typeof claim.runtime.platform !== "string" ||
      typeof claim.runtime.architecture !== "string" ||
      claim.coordinatorModel !== declared.coordinatorModel ||
      claim.reasoningEffort !== declared.reasoningEffort ||
      claim.coordinatorCount !== declared.coordinatorCount ||
      typeof claim.runId !== "string" ||
      Number.isNaN(Date.parse(claim.checkedAt)) ||
      !isSha256(claim.artifactSha256)
    ) {
      diagnostics.push(`certified profile ${profileId} lacks exact passing host, runtime, model, capability, or artifact identity`);
    }
    const operatingSystem =
      claim.runtime?.platform === "darwin"
        ? `macOS ${claim.runtime.architecture}`
        : `${claim.runtime?.platform} ${claim.runtime?.architecture}`;
    if (
      !String(claim.runtime?.nodeVersion).startsWith("24.") ||
      !Array.isArray(declared.operatingSystems) ||
      !declared.operatingSystems.includes(operatingSystem)
    ) {
      diagnostics.push(`certified profile ${profileId} was not exercised on a declared runtime and operating system`);
    }
    if (
      !Array.isArray(claim.retrievalMethods) ||
      declared.retrievalMethods.some(
        /** @param {string} method */
        (method) => !claim.retrievalMethods.includes(method),
      )
    ) {
      diagnostics.push(`certified profile ${profileId} does not prove every claimed retrieval method`);
    }
    const assertions = Array.isArray(claim.assertions) ? claim.assertions : [];
    for (const assertionId of acceptanceContract.compatibilityAssertions) {
      const assertion = assertions.find(
        /** @param {unknown} candidate */
        (candidate) => isRecord(candidate) && candidate.id === assertionId,
      );
      if (
        !isRecord(assertion) ||
        assertion.status !== "passed" ||
        typeof assertion.details !== "string" ||
        assertion.details.length === 0
      ) {
        diagnostics.push(`certified profile ${profileId} failed or omitted compatibility assertion ${assertionId}`);
      }
    }
  }
  return diagnostics;
}

/**
 * @param {Record<string, any>} evidence
 * @param {Record<string, any>} acceptanceContract
 */
function validateLegalAndPackagingEvidence(evidence, acceptanceContract) {
  const diagnostics = [];
  if (
    !isRecord(evidence.skill) ||
    evidence.skill.name !== acceptanceContract.skillName ||
    evidence.skill.version !== acceptanceContract.targetReleaseVersion ||
    !isSha256(evidence.skill.treeSha256)
  ) {
    diagnostics.push("tested skill identity is incomplete or invalid");
  }
  const archives = Array.isArray(evidence.archives) ? evidence.archives.filter(isRecord) : [];
  for (const distribution of ["standalone", "plugin"]) {
    const archive = archives.find((candidate) => candidate.distribution === distribution);
    if (
      !archive ||
      typeof archive.path !== "string" ||
      !isSha256(archive.sha256) ||
      archive.repeatSha256 !== archive.sha256 ||
      !Number.isInteger(archive.bytes) ||
      archive.bytes < 1 ||
      archive.contentsValid !== true
    ) {
      diagnostics.push(`${distribution} archive is missing, invalid, or not reproducible`);
    }
  }
  if (evidence.skillTreesByteIdentical !== true) {
    diagnostics.push("standalone and plugin skill trees are not proven byte-identical");
  }
  if (
    !isRecord(evidence.checksumManifest) ||
    evidence.checksumManifest.verified !== true ||
    evidence.checksumManifest.path !== "release/CHECKSUMS.sha256" ||
    !isSha256(evidence.checksumManifest.sha256)
  ) {
    diagnostics.push("checksum manifest is missing or unverified");
  }
  if (
    !isRecord(evidence.dependencyInventory) ||
    evidence.dependencyInventory.verified !== true ||
    evidence.dependencyInventory.path !== "release/dependency-inventory.json" ||
    !isSha256(evidence.dependencyInventory.sha256) ||
    !Array.isArray(evidence.dependencyInventory.runtimeDependencies) ||
    evidence.dependencyInventory.runtimeDependencies.length !== 0 ||
    evidence.dependencyInventory.allLicensesKnown !== true
  ) {
    diagnostics.push("dependency inventory is incomplete or unverified");
  }
  if (
    !isRecord(evidence.licenseAndNotice) ||
    evidence.licenseAndNotice.licenseIncluded !== true ||
    evidence.licenseAndNotice.noticeIncluded !== true ||
    evidence.licenseAndNotice.archiveCopiesVerified !== true ||
    !isSha256(evidence.licenseAndNotice.licenseSha256) ||
    !isSha256(evidence.licenseAndNotice.noticeSha256) ||
    !Array.isArray(evidence.licenseAndNotice.unresolvedNotices) ||
    evidence.licenseAndNotice.unresolvedNotices.length !== 0
  ) {
    diagnostics.push("license and notice material is incomplete or unresolved");
  }
  if (
    !isRecord(evidence.compatibilityMatrix) ||
    evidence.compatibilityMatrix.verified !== true ||
    evidence.compatibilityMatrix.sha256 !== compatibilityMatrixSha256
  ) {
    diagnostics.push("packaged compatibility matrix is missing or does not match");
  }
  return diagnostics;
}

/**
 * @param {Record<string, any>} evidence
 * @param {Record<string, any>} acceptanceContract
 */
function validateVersionAndTagEvidence(evidence, acceptanceContract) {
  const diagnostics = [];
  if (
    evidence.officialTag !== acceptanceContract.officialTag ||
    evidence.tagMustBeAnnotated !== true ||
    evidence.tagMustPointToHead !== true ||
    evidence.publicationRequiresQualifiedReport !== true
  ) {
    diagnostics.push("version-and-tag publication policy evidence is incomplete");
  }
  if (packageMetadata.version !== acceptanceContract.targetReleaseVersion) {
    diagnostics.push(`package version must be ${acceptanceContract.targetReleaseVersion}`);
  }
  if (releasedContracts.release !== acceptanceContract.targetReleaseVersion) {
    diagnostics.push(`contract release version must be ${acceptanceContract.targetReleaseVersion}`);
  }
  if (
    generatedStandaloneVersions?.release !== acceptanceContract.targetReleaseVersion ||
    generatedPluginManifest?.version !== acceptanceContract.targetReleaseVersion
  ) {
    diagnostics.push("generated standalone and plugin metadata must agree with the release version");
  }
  if (
    tagObjectType !== "tag" ||
    taggedCommit === null ||
    headCommit === null ||
    taggedCommit !== headCommit
  ) {
    diagnostics.push(`annotated official tag ${acceptanceContract.officialTag} must point to HEAD`);
  }
  if (workingTreeState === null || workingTreeState !== "") {
    diagnostics.push("official release qualification requires a clean working tree");
  }
  return diagnostics;
}

for (const gate of contract.mandatoryGates) {
  const evidencePath = path.join(evidenceDirectory, gate.evidenceFile);
  try {
    await access(evidencePath);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
    gates.push({ id: gate.id, status: "missing", evidence: gate.evidenceFile });
    continue;
  }

  let evidence;
  try {
    const evidenceContents = await readFile(evidencePath, "utf8");
    evidenceDigests[gate.id] = sha256(evidenceContents);
    evidence = JSON.parse(evidenceContents);
    evidenceResults[gate.id] = evidence;
  } catch (error) {
    if (error instanceof SyntaxError) {
      gates.push({
        id: gate.id,
        status: "failed",
        evidence: gate.evidenceFile,
        diagnostics: ["evidence is not valid JSON"],
      });
      continue;
    }
    throw error;
  }
  const diagnostics = [];
  if (evidence.evidenceVersion !== contract.contractVersion) {
    diagnostics.push(`evidenceVersion must be ${contract.contractVersion}`);
  }
  if (evidence.gateId !== gate.id) {
    diagnostics.push(`gateId must be ${gate.id}`);
  }
  if (evidence.releaseVersion !== contract.targetReleaseVersion) {
    diagnostics.push(`releaseVersion must be ${contract.targetReleaseVersion}`);
  }
  if (evidence.status !== "passed") {
    diagnostics.push(`evidence status is ${String(evidence.status)}`);
  }
  if (gate.id === "deterministic") {
    diagnostics.push(...validateDeterministicEvidence(evidence, contract));
  }
  if (gate.id === "behavioral") {
    diagnostics.push(
      ...validateBehavioralEvidence(evidence, contract, controlledScenarioPack),
    );
  }
  if (gate.id === "live-retrieval") {
    diagnostics.push(...validateLiveRetrievalEvidence(evidence, contract));
  }
  if (gate.id === "compatibility") {
    diagnostics.push(
      ...validateCompatibilityEvidence(
        evidence,
        contract,
        compatibilityMatrix,
        compatibilityMatrixSha256,
      ),
    );
  }
  if (gate.id === "legal-and-packaging") {
    diagnostics.push(...validateLegalAndPackagingEvidence(evidence, contract));
  }
  if (gate.id === "version-and-tag") {
    diagnostics.push(...validateVersionAndTagEvidence(evidence, contract));
  }
  gates.push({
    id: gate.id,
    status: diagnostics.length === 0 ? "passed" : "failed",
    evidence: gate.evidenceFile,
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
  });
}

const artifactGateIds = [
  "deterministic",
  "behavioral",
  "live-retrieval",
  "compatibility",
  "legal-and-packaging",
];
const artifactIdentities = artifactGateIds.flatMap((gateId) => {
  const identity = evidenceResults[gateId]?.skill;
  return isRecord(identity) && isSha256(identity.treeSha256)
    ? [{ gateId, treeSha256: identity.treeSha256 }]
    : [];
});
if (new Set(artifactIdentities.map((identity) => identity.treeSha256)).size > 1) {
  for (const identity of artifactIdentities) {
    const gate = gates.find((candidate) => candidate.id === identity.gateId);
    if (!gate) continue;
    gate.status = "failed";
    gate.diagnostics = [
      ...(gate.diagnostics ?? []),
      "gate evidence was produced from a different generated skill tree",
    ];
  }
}

const failedGateIds = gates
  .filter((gate) => gate.status !== "passed")
  .map((gate) => gate.id);
const report = {
  reportVersion: contract.contractVersion,
  releaseVersion: contract.targetReleaseVersion,
  generatedAt: new Date().toISOString(),
  acceptanceIdentity: {
    contractVersion: contract.contractVersion,
    suiteVersion: contract.suiteVersion,
    controlledScenariosSha256,
    releaseVersion: contract.targetReleaseVersion,
    officialTag: contract.officialTag,
  },
  qualified: failedGateIds.length === 0,
  failedGateIds,
  gates,
  evidenceDigests,
  evidenceResults,
  versionAndTagState: {
    packageVersion: packageMetadata.version,
    contractReleaseVersion: releasedContracts.release,
    standaloneReleaseVersion: generatedStandaloneVersions?.release ?? null,
    pluginReleaseVersion: generatedPluginManifest?.version ?? null,
    headCommit,
    taggedCommit,
    tagObjectType,
    workingTreeClean: workingTreeState === "",
  },
};

/** @param {Record<string, any>} acceptanceReport */
function renderHumanReport(acceptanceReport) {
  const identity = acceptanceReport.acceptanceIdentity;
  const reportEvidence = acceptanceReport.evidenceResults;
  const lines = [
    `# Solo Venture Scout ${acceptanceReport.releaseVersion} acceptance`,
    "",
    acceptanceReport.qualified ? "Qualified." : "Not qualified.",
    "",
    "## Exact acceptance identity",
    "",
    `- Acceptance contract: ${identity.contractVersion}`,
    `- Acceptance suite: ${identity.suiteVersion}`,
    `- Controlled scenarios: ${identity.controlledScenariosSha256}`,
    `- Official tag: ${identity.officialTag}`,
  ];
  const deterministic = reportEvidence.deterministic;
  if (deterministic) {
    lines.push(
      `- Skill: ${deterministic.skill?.name ?? "unknown"} ${deterministic.skill?.version ?? "unknown"} (${deterministic.skill?.treeSha256 ?? "unknown"})`,
      `- Contracts: ${Object.entries(deterministic.contractVersions ?? {})
        .map(([name, version]) => `${name}: ${version}`)
        .join(", ")}`,
      `- Runtime: Node ${deterministic.runtime?.nodeVersion ?? "unknown"} on ${deterministic.runtime?.platform ?? "unknown"} ${deterministic.runtime?.architecture ?? "unknown"}`,
    );
  }
  lines.push("", "## Gates", "");
  for (const gate of acceptanceReport.gates) {
    lines.push(`- ${gate.id}: ${gate.status}`);
    for (const diagnostic of gate.diagnostics ?? []) lines.push(`  - ${diagnostic}`);
  }
  if (deterministic?.suites) {
    lines.push("", "## Deterministic suites", "");
    for (const suite of deterministic.suites) {
      lines.push(
        `- ${suite.id}: ${suite.status}; ${suite.testCount} tests; ${suite.failureCount} failures; \`${suite.command}\``,
      );
    }
  }
  const behavioral = reportEvidence.behavioral;
  if (behavioral?.profiles) {
    lines.push("", "## Behavioral profiles and runs", "");
    for (const profile of behavioral.profiles) {
      lines.push(
        `### ${profile.id}`,
        "",
        `Host: ${profile.host} ${profile.hostVersion}; model: ${profile.coordinatorModel}; reasoning: ${profile.reasoningEffort}; coordinators: ${profile.coordinatorCount}; runtime: Node ${profile.runtime?.nodeVersion} on ${profile.runtime?.platform} ${profile.runtime?.architecture}.`,
        "",
        `Evaluator: ${profile.evaluator?.model ?? "unknown"} ${profile.evaluator?.version ?? "unknown"}; rubric ${profile.evaluator?.calibration?.rubricVersion ?? "unknown"}; golden set ${profile.evaluator?.calibration?.goldenSetVersion ?? "unknown"}; calibration ${profile.evaluator?.calibration?.status ?? "missing"}.`,
        "",
        `Current candidate runs: ${profile.qualificationAttemptCount ?? 0}; preserved prior candidate runs: ${profile.priorAttemptCount ?? 0}; append-only total: ${profile.attemptCount ?? 0}.`,
        "",
      );
      for (const run of profile.priorRuns ?? []) {
        lines.push(
          `- Preserved prior run ${run.runId}: ${run.scenarioId} repetition ${run.repetition}; ${run.status}; skill ${run.skillTreeSha256}; coordinator ${run.coordinatorSessionId}; evaluator ${run.evaluation?.evaluatorSessionId}; adjudication ${run.evaluation?.adjudication?.status} ${run.evaluation?.adjudication?.version}; failures ${(run.evaluation?.failures ?? []).join(" | ") || "none recorded"}; transcript ${run.transcriptSha256}; Campaign ${run.campaignSha256}.`,
        );
      }
      for (const run of profile.runs ?? []) {
        lines.push(
          `- ${run.runId}: ${run.scenarioId} repetition ${run.repetition}; ${run.status}; scenario input ${run.scenarioInputSha256}; precondition ${run.precondition?.precondition} at record ${run.precondition?.initialRecordSequence}; input binding ${run.precondition?.inputBinding?.status} (Campaign Intake ${run.precondition?.inputBinding?.persistedCampaignIntakeSha256}; Evidence ${run.precondition?.inputBinding?.boundEvidenceSha256}; Work View ${run.precondition?.inputBinding?.workViewSha256}); skill ${run.skillTreeSha256}; coordinator ${run.coordinatorSessionId}; evaluator ${run.evaluation?.evaluatorSessionId}; evaluation ${run.evaluation?.evaluationId}; adjudication ${run.evaluation?.adjudication?.status} ${run.evaluation?.adjudication?.version}; transcript ${run.transcriptSha256}; Campaign ${run.campaignSha256}.`,
          `  - Invariant assertions: ${(run.invariants ?? []).map(
            /** @param {Record<string, any>} invariant */
            (invariant) => `${invariant.id}=${invariant.status}`,
          ).join(", ") || "none recorded"}.`,
          `  - Rubric ${run.evaluation?.rubricVersion ?? "unknown"}: ${(run.evaluation?.ratings ?? []).map(
            /** @param {Record<string, any>} rating */
            (rating) => `${rating.dimension}=${rating.rating}`,
          ).join(", ") || "none recorded"}.`,
          `  - Evaluator failures: ${(run.evaluation?.failures ?? []).join(" | ") || "none"}.`,
          `  - Adjudication rationale: ${run.evaluation?.adjudication?.rationale ?? "not recorded"}.`,
        );
      }
    }
  }
  const liveRetrieval = reportEvidence["live-retrieval"];
  if (liveRetrieval?.profiles) {
    lines.push("", "## Live retrieval", "");
    for (const profile of liveRetrieval.profiles) {
      for (const method of profile.methods ?? []) {
        lines.push(
          `- ${profile.id}/${method.id}: ${method.status}; method proof ${method.retrievalMethodEvidence?.status} (${method.retrievalMethodEvidence?.webSearchEvents} web-search events, read-only=${method.retrievalMethodEvidence?.readOnlySandbox}); synthetic canary ${method.deterministicSafetyInspection?.status}; run ${method.runId}; retrieval session ${method.retrievalSessionId}; live-safety evaluator ${method.safetyEvaluatorSessionId} (${method.safetyEvaluation?.adjudication?.status} ${method.safetyEvaluation?.adjudication?.version}, transcript ${method.safetyEvaluatorTranscriptSha256}); checked ${method.checkedAt}; retrieval transcript ${method.transcriptSha256}; Sources ${(method.sources ?? []).map(
            /** @param {Record<string, any>} source */
            (source) => `${source.id}/${source.requirementId} (${source.resolvedUrl}; content ${source.contentSha256})`,
          ).join(", ")}.`,
          `  - Assertions: ${(method.assertions ?? []).map(
            /** @param {Record<string, any>} assertion */
            (assertion) => `${assertion.id}=${assertion.status}`,
          ).join(", ") || "none recorded"}.`,
          `  - Retrieval failures: ${(method.failures ?? []).join(" | ") || "none"}.`,
          `  - Live-safety failures: ${(method.safetyEvaluation?.failures ?? []).join(" | ") || "none"}.`,
          `  - Live-safety adjudication rationale: ${method.safetyEvaluation?.adjudication?.rationale ?? "not recorded"}.`,
        );
      }
    }
  }
  const compatibility = reportEvidence.compatibility;
  if (compatibility?.claims) {
    lines.push("", "## Compatibility", "");
    for (const claim of compatibility.claims) {
      lines.push(
        `- ${claim.profileId}: ${claim.status}; ${claim.host} ${claim.hostVersion}; Node ${claim.runtime?.nodeVersion} on ${claim.runtime?.platform} ${claim.runtime?.architecture}; model ${claim.coordinatorModel}; capabilities ${(claim.assertions ?? []).map(
          /** @param {Record<string, any>} assertion */
          (assertion) => `${assertion.id}=${assertion.status}`,
        ).join(", ")}.`,
      );
    }
  }
  const packaging = reportEvidence["legal-and-packaging"];
  if (packaging?.archives) {
    lines.push("", "## Legal and packaging", "");
    for (const archive of packaging.archives) {
      lines.push(
        `- ${archive.path}: ${archive.bytes} bytes; SHA-256 ${archive.sha256}; repeat ${archive.repeatSha256}.`,
      );
    }
  }
  lines.push(
    "",
    "## Version and tag",
    "",
    `- Package: ${acceptanceReport.versionAndTagState.packageVersion}`,
    `- Contracts: ${acceptanceReport.versionAndTagState.contractReleaseVersion}`,
    `- Standalone: ${acceptanceReport.versionAndTagState.standaloneReleaseVersion}`,
    `- Plugin: ${acceptanceReport.versionAndTagState.pluginReleaseVersion}`,
    `- HEAD: ${acceptanceReport.versionAndTagState.headCommit}`,
    `- Tag: ${identity.officialTag} (${acceptanceReport.versionAndTagState.tagObjectType}) -> ${acceptanceReport.versionAndTagState.taggedCommit}`,
    `- Clean worktree: ${acceptanceReport.versionAndTagState.workingTreeClean}`,
    "",
  );
  return lines.join("\n");
}

await mkdir(reportDirectory, { recursive: true });
await writeFile(
  path.join(reportDirectory, "acceptance-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
await writeFile(
  path.join(reportDirectory, "ACCEPTANCE.md"),
  renderHumanReport(report),
);

process.stdout.write(`${JSON.stringify(report)}\n`);
if (!report.qualified) process.exitCode = 1;
