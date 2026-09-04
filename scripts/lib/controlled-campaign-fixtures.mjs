import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  completeAdversarialResearch,
  createDiscoveryCampaign,
  enterInconclusiveComparison,
  prepareDeveloperSelectedCampaign,
  prepareEligibleCampaign,
  prepareNoQualifierCampaign,
} from "../../test/discovery.test.mjs";
import { runKernel } from "../../test/support/packaged-scout.mjs";

const baselineStatements = [
  {
    id: "preference-low-operating-burden",
    text: "Prefer low ongoing operating burden.",
    classification: "preference",
    importance: "major",
  },
  {
    id: "advantage-operations-domain",
    text: "Existing access to operations workflow expertise.",
    classification: "advantage",
    rationale: "The expertise can reduce validation and acquisition effort.",
  },
];

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

/** @param {Record<string, any>} scenario @param {string} campaignPath @param {string} kernelPath */
async function createScenarioIntake(scenario, campaignPath, kernelPath) {
  const input = scenario.coordinatorInput;
  const intake = input.campaignIntake;
  const sourceCap = scenario.id === "budget-and-capability-pressure" ? 5 : 30;
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
        intake: {
          version: intake.version,
          explicitlyConfirmed: true,
          developerProfileSnapshot: {
            capturedAt: input.deterministic.now,
            capacity: { state: "known", value: "Solo operation" },
            capabilities: {
              state: "known",
              value: input.capabilityProfile.host,
            },
            access: { state: "none" },
            boundaries: {
              state: "known",
              value: input.capabilityProfile.retrieval,
            },
            operatingPreferences: {
              state: "known",
              value: "Use only the controlled scenario fixtures.",
            },
            riskTolerance: { state: "known", value: "Low irreversible downside" },
          },
          commercialOutcomeTarget: commercialOutcomeTarget(intake.target),
          statements: intakeStatements(intake),
          researchBudget: {
            profile: sourceCap === 5 ? "custom" : "quick",
            sourceCap,
            discoverySweepCap: sourceCap === 5 ? 1 : 4,
            sourceFamilyMinimum: sourceCap === 5 ? 1 : 3,
            deepenedOpportunityCap: 2,
            minimumComparisonSet: 2,
            adversarialSourceReserve: sourceCap === 5 ? 1 : 6,
            paidSpendCap: { amount: 0, currency: "GBP" },
          },
        },
      },
    },
  ];
  for (const command of commands) {
    const result = await runKernel(kernelPath, command);
    assert.equal(result.code, 0, `${result.stderr}\n${JSON.stringify(result.response)}`);
  }
}

/** @param {string} campaignPath @param {string} kernelPath */
async function prepareInterruptedResearch(campaignPath, kernelPath) {
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
        intake: {
          version: 1,
          explicitlyConfirmed: true,
          developerProfileSnapshot: {
            capturedAt: "2026-09-04T10:11:00.000Z",
            capacity: { state: "known", value: "Solo operation" },
            capabilities: { state: "known", value: "TypeScript" },
            access: { state: "known", value: "Developer-controlled authenticated access" },
            boundaries: { state: "known", value: "No repeated ambiguous charges" },
            operatingPreferences: { state: "unknown" },
            riskTolerance: { state: "known", value: "Low irreversible downside" },
          },
          commercialOutcomeTarget: {
            amount: 9_000,
            currency: "GBP",
            metric: "monthly recurring revenue",
            deadline: "2027-11-30",
          },
          statements: [],
          researchBudget: {
            profile: "quick",
            sourceCap: 30,
            discoverySweepCap: 4,
            sourceFamilyMinimum: 3,
            deepenedOpportunityCap: 2,
            minimumComparisonSet: 2,
            adversarialSourceReserve: 6,
            paidSpendCap: { amount: 20, currency: "GBP" },
          },
        },
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
  if (precondition === "eligible-after-adversarial-challenge") {
    await prepareEligibleCampaign(kernelPath, campaignPath, baselineStatements);
    await completeAdversarialResearch(kernelPath, campaignPath);
  } else if (precondition === "no-qualifying-opportunity-ready") {
    await prepareNoQualifierCampaign(kernelPath, campaignPath);
  } else if (precondition === "inconclusive-comparison") {
    await enterInconclusiveComparison(kernelPath, campaignPath);
  } else if (precondition === "developer-selected-terminal") {
    await prepareDeveloperSelectedCampaign(kernelPath, campaignPath);
  } else if (precondition === "ambiguous-approved-research-reservation") {
    await prepareInterruptedResearch(campaignPath, kernelPath);
  } else {
    await createScenarioIntake(scenario, campaignPath, kernelPath);
  }
  const workView = JSON.parse(
    await readFile(path.join(campaignPath, "work-view.json"), "utf8"),
  );
  return {
    precondition,
    activeCoordinatorId: "coordinator-primary",
    initialRecordSequence: workView.recordSequence,
  };
}
