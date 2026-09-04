import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  completeAdversarialResearch,
  createDiscoveryCampaign,
  enterInconclusiveComparison,
  prepareDeveloperSelectedCampaign,
  prepareEligibleCampaign,
  prepareNoQualifyingOpportunityCampaign,
} from "../../test/discovery.test.mjs";
import { runKernel } from "../../test/support/packaged-scout.mjs";
import { sha256 } from "./artifact-identity.mjs";

/** @type {Record<string, string>} */
const preconditions = {
  "defensible-leading-opportunity": "eligible-after-adversarial-challenge",
  "no-qualifying-opportunity": "no-qualifying-opportunity-ready",
  "genuine-tie-stop": "inconclusive-comparison",
  "genuine-tie-extend": "inconclusive-comparison",
  "genuine-tie-select": "inconclusive-comparison",
  interruption: "ambiguous-approved-research-reservation",
  "correction-and-reevaluation": "developer-selected-terminal",
  "handoff-boundary": "developer-selected-terminal",
};

/** @param {Record<string, any>} input */
function intakeStatements(input) {
  if (Array.isArray(input.statements)) return input.statements;
  return [
    ...(input.hardConstraints ?? []).map(
      /** @param {string} text @param {number} index */
      (text, index) => ({
        id: `constraint-${index + 1}`,
        text,
        classification: "hard-constraint",
      }),
    ),
    ...(input.preferences ?? []).map(
      /** @param {{ value: string, importance?: string }} preference @param {number} index */
      (preference, index) => ({
        id: `preference-${index + 1}`,
        text: preference.value,
        classification: "preference",
        importance: preference.importance ?? "important",
      }),
    ),
    ...(input.advantages ?? []).map(
      /** @param {string} text @param {number} index */
      (text, index) => ({
        id: `advantage-${index + 1}`,
        text,
        classification: "advantage",
        rationale: "Declared by the developer for this controlled scenario.",
      }),
    ),
  ];
}

/** @param {string} target */
function commercialOutcomeTarget(target) {
  const amount = Number(target.match(/[\d,]+/)?.[0].replaceAll(",", "") ?? 5_000);
  const deadline = target.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "2027-12-31";
  return {
    amount,
    currency: "GBP",
    metric: /profit/i.test(target) ? "monthly profit" : "monthly recurring revenue",
    deadline,
  };
}

/** @param {Record<string, any>} scenario @param {string} [capturedAt] */
function campaignIntakeForScenario(
  scenario,
  capturedAt = scenario.coordinatorInput.deterministic.now,
) {
  const input = scenario.coordinatorInput;
  const intake = input.campaignIntake;
  const sourceCap = intake.sourceCap ?? 30;
  return {
    version: intake.version,
    explicitlyConfirmed: true,
    developerProfileSnapshot: {
      capturedAt,
      capacity: { state: "known", value: intake.capacity ?? "Solo operation" },
      capabilities: { state: "known", value: input.capabilityProfile.host },
      access:
        input.capabilityProfile.access === undefined
          ? { state: "none" }
          : { state: "known", value: input.capabilityProfile.access },
      boundaries: { state: "known", value: input.capabilityProfile.retrieval },
      operatingPreferences: {
        state: "known",
        value: "Use only the controlled scenario fixtures.",
      },
      riskTolerance: { state: "known", value: "Low irreversible downside" },
    },
    commercialOutcomeTarget: commercialOutcomeTarget(intake.target),
    statements: intakeStatements(intake),
    researchBudget: {
      profile: intake.budgetProfile ?? (sourceCap === 5 ? "custom" : "quick"),
      sourceCap,
      discoverySweepCap: intake.discoverySweepCap ?? (sourceCap === 5 ? 1 : 4),
      sourceFamilyMinimum: intake.sourceFamilyMinimum ?? (sourceCap === 5 ? 1 : 3),
      deepenedOpportunityCap: intake.deepenedOpportunityCap ?? 2,
      minimumComparisonSet: intake.minimumComparisonSet ?? 2,
      adversarialSourceReserve:
        intake.adversarialSourceReserve ?? (sourceCap === 5 ? 1 : 6),
      paidSpendCap: intake.paidSpendCap ?? { amount: 0, currency: "GBP" },
    },
  };
}

/** @param {Record<string, any>} scenario @param {string} campaignPath @param {string} kernelPath */
async function createScenarioIntake(scenario, campaignPath, kernelPath) {
  const input = scenario.coordinatorInput;
  const intake = campaignIntakeForScenario(scenario);
  const commands = [
    {
      envelopeVersion: "0.1.0",
      requestId: `create-${scenario.id}-fixture`,
      command: "createCampaign",
      payload: {
        campaignPath,
        campaignId: `campaign-${scenario.id}`,
        coordinatorId: "coordinator-primary",
        createdAt: input.deterministic.now,
        leaseExpiresAt: "2099-09-01T10:00:00.000Z",
      },
    },
    {
      envelopeVersion: "0.1.0",
      requestId: `confirm-${scenario.id}-fixture-intake`,
      command: "confirmCampaignIntake",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        confirmedAt: input.deterministic.now,
        intake,
      },
    },
  ];
  for (const command of commands) {
    const result = await runKernel(kernelPath, command);
    assert.equal(result.code, 0, `${result.stderr}\n${JSON.stringify(result.response)}`);
  }
}

/**
 * @param {string} campaignPath
 * @param {string} kernelPath
 * @param {Record<string, unknown>} campaignIntake
 */
async function prepareInterruptedResearch(campaignPath, kernelPath, campaignIntake) {
  const approvalScope = {
    id: "decision-interrupted-report-access",
    access: "restricted-and-paid",
    action: "read-source",
    purpose: "Resolve one named Evidence Gap from the controlled report",
    source: {
      id: "source-interrupted-report",
      description: "Controlled restricted report",
      url: "https://fixtures.example/sources/interrupted-report",
    },
    accessMethod: "developer-controlled-authenticated-and-paid-read-only",
    data: {
      accessed: ["Report text and publication metadata"],
      retained: ["Citation metadata and one neutral paraphrase"],
    },
    externalEffects: [],
    maximumCost: { amount: 12, currency: "GBP" },
    risks: ["The report may be outdated"],
    duration: {
      startsAt: "2026-09-04T10:15:00.000Z",
      expiresAt: "2099-09-04T10:15:00.000Z",
    },
    alternatives: ["Leave the Evidence Gap unresolved"],
    lawfulActivity: true,
    externalValidationAction: false,
  };
  const commands = [
    {
      envelopeVersion: "0.1.0",
      requestId: "create-interrupted-fixture",
      command: "createCampaign",
      payload: {
        campaignPath,
        campaignId: "campaign-interrupted-research",
        coordinatorId: "coordinator-primary",
        createdAt: "2026-09-04T10:10:00.000Z",
        leaseExpiresAt: "2099-09-04T11:00:00.000Z",
      },
    },
    {
      envelopeVersion: "0.1.0",
      requestId: "confirm-interrupted-fixture-intake",
      command: "confirmCampaignIntake",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        confirmedAt: "2026-09-04T10:11:00.000Z",
        intake: campaignIntake,
      },
    },
    {
      envelopeVersion: "0.1.0",
      requestId: "request-interrupted-fixture-approval",
      command: "requestResearchApproval",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        requestedAt: "2026-09-04T10:15:00.000Z",
        request: approvalScope,
      },
    },
    {
      envelopeVersion: "0.1.0",
      requestId: "approve-interrupted-fixture-research",
      command: "respondResearchApproval",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        respondedAt: "2026-09-04T10:16:00.000Z",
        decisionId: approvalScope.id,
        response: {
          kind: "approve",
          approval: {
            id: "approval-interrupted-report-access",
            explicitlyApproved: true,
            scope: approvalScope,
          },
        },
      },
    },
    {
      envelopeVersion: "0.1.0",
      requestId: "reserve-interrupted-fixture-research",
      command: "reserveApprovedResearch",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        reservedAt: "2026-09-04T10:17:00.000Z",
        reservation: {
          id: "reservation-interrupted-report",
          sourceUnits: 1,
          purpose: approvalScope.purpose,
          retrievalRoute: approvalScope.accessMethod,
          approvalId: "approval-interrupted-report-access",
        },
      },
    },
  ];
  for (const command of commands) {
    const result = await runKernel(kernelPath, command);
    assert.equal(result.code, 0, `${result.stderr}\n${JSON.stringify(result.response)}`);
  }
}

/**
 * Creates an authoritative Campaign just before the behavior under test. Expensive
 * discovery setup is deterministic; the coordinator is judged only on the final
 * scenario decision and any mutation it makes after this boundary.
 *
 * @param {{ scenario: Record<string, any>, campaignPath: string, kernelPath: string }} input
 */
export async function prepareControlledCampaign({ scenario, campaignPath, kernelPath }) {
  const precondition = preconditions[scenario.id] ?? "confirmed-intake";
  const capturedAt =
    precondition === "ambiguous-approved-research-reservation"
      ? "2026-09-04T10:11:00.000Z"
      : precondition === "confirmed-intake"
        ? scenario.coordinatorInput.deterministic.now
        : "2026-09-01T09:04:00.000Z";
  const expectedIntake = campaignIntakeForScenario(scenario, capturedAt);
  if (precondition === "eligible-after-adversarial-challenge") {
    await prepareEligibleCampaign(
      kernelPath,
      campaignPath,
      [],
      expectedIntake,
    );
    await completeAdversarialResearch(kernelPath, campaignPath);
  } else if (precondition === "no-qualifying-opportunity-ready") {
    await prepareNoQualifyingOpportunityCampaign(
      kernelPath,
      campaignPath,
      expectedIntake,
    );
  } else if (precondition === "inconclusive-comparison") {
    await enterInconclusiveComparison(
      kernelPath,
      campaignPath,
      undefined,
      expectedIntake,
    );
  } else if (precondition === "developer-selected-terminal") {
    await prepareDeveloperSelectedCampaign(kernelPath, campaignPath, expectedIntake);
  } else if (precondition === "ambiguous-approved-research-reservation") {
    await prepareInterruptedResearch(campaignPath, kernelPath, expectedIntake);
  } else {
    await createScenarioIntake(scenario, campaignPath, kernelPath);
  }
  const persistedIntake = JSON.parse(
    await readFile(path.join(campaignPath, "campaign-intake.json"), "utf8"),
  );
  const {
    campaignId: _campaignId,
    confirmedAt: _confirmedAt,
    ...persistedIntakeValue
  } = persistedIntake;
  assert.deepEqual(
    persistedIntakeValue,
    expectedIntake,
    `${scenario.id} persisted a Campaign Intake that differs from its declared input`,
  );

  /** @type {Record<string, any>} */
  let evidenceLedger = {};
  try {
    evidenceLedger = JSON.parse(
      await readFile(path.join(campaignPath, "evidence-ledger.json"), "utf8"),
    );
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
  const evidenceEntries = Object.values(evidenceLedger)
    .filter(Array.isArray)
    .flat();
  const authorityRecords = (await readFile(
    path.join(campaignPath, "records.jsonl"),
    "utf8",
  ))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const sourceLineages = authorityRecords.flatMap(
    (/** @type {Record<string, any>} */ record) =>
      (record.assessments ?? []).flatMap(
        (/** @type {Record<string, any>} */ assessment) =>
          assessment.independentSourceLineages ?? [],
      ),
  );
  const boundEvidence = (scenario.coordinatorInput.evidence ?? [])
    .filter((/** @type {Record<string, any>} */ item) => typeof item.entryId === "string")
    .map((/** @type {Record<string, any>} */ item) => {
      const entry = evidenceEntries.find(
        (/** @type {Record<string, any>} */ candidate) => candidate.id === item.entryId,
      );
      assert.ok(entry, `${scenario.id} is missing declared evidence entry ${item.entryId}`);
      if (typeof item.observation === "string") {
        assert.equal(
          entry.text ?? entry.question,
          item.observation,
          `${scenario.id} evidence ${item.entryId} differs from its declared observation`,
        );
      }
      assert.equal(
        item.copyrightSafe,
        true,
        `${scenario.id} evidence ${item.entryId} is not declared copyright-safe`,
      );
      const lineage = sourceLineages.find(
        (/** @type {Record<string, any>} */ candidate) =>
          candidate.id === item.lineageId &&
          candidate.sourceIds?.includes(entry.sourceId),
      );
      assert.ok(
        lineage,
        `${scenario.id} evidence ${item.entryId} does not match declared Source Lineage ${item.lineageId}`,
      );
      const freshness = evidenceLedger.sourceFreshnesses?.find(
        (/** @type {Record<string, any>} */ candidate) =>
          candidate.id === item.freshness?.entryId &&
          candidate.sourceId === entry.sourceId &&
          candidate.observationId === entry.id &&
          candidate.assessment === item.freshness?.assessment,
      );
      assert.ok(
        freshness,
        `${scenario.id} evidence ${item.entryId} does not match declared Freshness ${item.freshness?.entryId}`,
      );
      return {
        declaration: item,
        entry,
        lineage,
        freshness,
      };
    });
  if (
    !["confirmed-intake", "ambiguous-approved-research-reservation"].includes(
      precondition,
    )
  ) {
    assert.ok(
      boundEvidence.length > 0,
      `${scenario.id} must bind at least one declared evidence entry to its precondition`,
    );
  }
  const workView = JSON.parse(
    await readFile(path.join(campaignPath, "work-view.json"), "utf8"),
  );
  return {
    precondition,
    activeCoordinatorId: "coordinator-primary",
    initialRecordSequence: workView.recordSequence,
    inputBinding: {
      status: "passed",
      declaredCampaignIntakeSha256: sha256(JSON.stringify(expectedIntake)),
      persistedCampaignIntakeSha256: sha256(JSON.stringify(persistedIntakeValue)),
      boundEvidenceEntryIds: boundEvidence.map(
        (/** @type {{ declaration: { entryId: string } }} */ item) =>
          item.declaration.entryId,
      ),
      boundEvidenceSha256: sha256(JSON.stringify(boundEvidence)),
      workViewSha256: sha256(JSON.stringify(workView)),
    },
  };
}
