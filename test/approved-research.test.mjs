import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { publicResearchReservationCommand } from "./support/campaign-commands.mjs";
import { buildPackagedScout, runProcess } from "./support/packaged-scout.mjs";

/**
 * @param {string} kernelPath
 * @param {Record<string, unknown>} command
 */
async function runKernel(kernelPath, command) {
  const result = await runProcess(process.execPath, [kernelPath], {
    input: `${JSON.stringify(command)}\n`,
  });
  return { ...result, response: JSON.parse(result.stdout) };
}

/**
 * @param {string} kernelPath
 * @param {string} campaignPath
 * @param {number} [paidSpendCap]
 */
async function createConfirmedCampaign(kernelPath, campaignPath, paidSpendCap = 25) {
  for (const command of [
    {
      envelopeVersion: "0.1.0",
      requestId: "create-approved-research-campaign-1",
      command: "createCampaign",
      payload: {
        campaignPath,
        campaignId: "campaign-approved-research",
        coordinatorId: "coordinator-primary",
        createdAt: "2026-09-01T09:00:00.000Z",
        leaseExpiresAt: "2099-09-01T09:30:00.000Z",
      },
    },
    {
      envelopeVersion: "0.1.0",
      requestId: "confirm-approved-research-intake-1",
      command: "confirmCampaignIntake",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        confirmedAt: "2026-09-01T09:10:00.000Z",
        intake: {
          version: 1,
          explicitlyConfirmed: true,
          developerProfileSnapshot: {
            capturedAt: "2026-09-01T09:05:00.000Z",
            capacity: { state: "known", value: "15 hours per week" },
            capabilities: { state: "known", value: "TypeScript" },
            access: { state: "known", value: "Developer-controlled analyst portal" },
            boundaries: { state: "known", value: "Read-only research; no outreach" },
            operatingPreferences: { state: "unknown" },
            riskTolerance: { state: "known", value: "Low irreversible downside" },
          },
          commercialOutcomeTarget: {
            amount: 10000,
            currency: "GBP",
            metric: "monthly recurring revenue",
            deadline: "2027-09-01",
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
            paidSpendCap: { amount: paidSpendCap, currency: "GBP" },
          },
        },
      },
    },
  ]) {
    const result = await runKernel(kernelPath, command);
    assert.equal(result.code, 0, result.stderr);
  }
}

function researchApprovalRequest() {
  return {
    id: "decision-analyst-report-access",
    access: "restricted-and-paid",
    action: "Read one analyst report in the developer-controlled portal",
    purpose: "Resolve the market-size Evidence Gap for one Opportunity",
    source: {
      id: "source-analyst-report",
      description: "Named analyst report",
      url: "https://research.example.com/reports/market-size",
    },
    accessMethod: "Use the developer's existing signed-in browser session read-only",
    data: {
      accessed: ["Report text and publication metadata"],
      retained: ["Citation metadata and neutral atomic paraphrases"],
    },
    externalEffects: [],
    maximumCost: { amount: 12, currency: "GBP" },
    risks: ["The report may be outdated or methodologically opaque"],
    duration: {
      startsAt: "2026-09-01T09:20:00.000Z",
      expiresAt: "2026-09-01T10:20:00.000Z",
    },
    alternatives: ["Continue with public Sources and leave the Evidence Gap open"],
    lawfulActivity: true,
    externalValidationAction: false,
  };
}

test("a complete Research Approval request becomes one durable checkpointed Pending Decision", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-approval-request-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "approval-request");
  await createConfirmedCampaign(kernelPath, campaignPath);

  const requested = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "request-research-approval-1",
    command: "requestResearchApproval",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      requestedAt: "2026-09-01T09:15:00.000Z",
      request: researchApprovalRequest(),
    },
  });

  assert.equal(requested.code, 0, requested.stderr);
  assert.equal(requested.response.result.requested, true);
  assert.deepEqual(requested.response.result.pendingDecision.request, researchApprovalRequest());
  assert.deepEqual(requested.response.result.workView.pause, {
    reason: "pending-decision",
    pendingDecisionId: "decision-analyst-report-access",
    decisionType: "research-approval",
    requestedAction: "Read one analyst report in the developer-controlled portal",
    resumable: true,
  });
  assert.deepEqual(
    JSON.parse(
      await readFile(path.join(campaignPath, "checkpoints", "000000000006.json"), "utf8"),
    ),
    {
      campaignId: "campaign-approved-research",
      recordSequence: 6,
      recordedAt: "2026-09-01T09:15:00.000Z",
    },
  );

  const resumed = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "resume-pending-research-approval-1",
    command: "resumeCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      resumedAt: "2026-09-01T09:30:00.000Z",
      leaseExpiresAt: "2099-09-01T10:00:00.000Z",
    },
  });

  assert.equal(resumed.code, 0, resumed.stderr);
  assert.deepEqual(
    resumed.response.result.summary.currentPause,
    requested.response.result.workView.pause,
  );
  assert.equal(resumed.response.result.workView.recordSequence, 8);
  assert.deepEqual(resumed.response.result.pendingDecision, requested.response.result.pendingDecision);
});

test("informational actions preserve the active Pending Decision and it cannot be replaced", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-approval-information-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "approval-information");
  await createConfirmedCampaign(kernelPath, campaignPath);

  const requested = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "request-research-approval-for-information-1",
    command: "requestResearchApproval",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      requestedAt: "2026-09-01T09:15:00.000Z",
      request: researchApprovalRequest(),
    },
  });
  assert.equal(requested.code, 0, requested.stderr);

  const explained = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "explain-research-approval-1",
    command: "recordResearchApprovalInformation",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T09:16:00.000Z",
      decisionId: "decision-analyst-report-access",
      information: {
        id: "approval-information-cost-alternative",
        question: "Can this Campaign continue without buying the report?",
        explanation: "Yes. Public Research may continue and the named Evidence Gap can remain open.",
      },
    },
  });

  assert.equal(explained.code, 0, explained.stderr);
  assert.equal(explained.response.result.recorded, true);
  assert.deepEqual(explained.response.result.pendingDecision, requested.response.result.pendingDecision);
  assert.equal(explained.response.result.workView.recordSequence, 8);

  const replacement = researchApprovalRequest();
  replacement.id = "decision-replacement";
  replacement.action = "Read a changed report scope";
  const replaced = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "replace-research-approval-1",
    command: "requestResearchApproval",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      requestedAt: "2026-09-01T09:17:00.000Z",
      request: replacement,
    },
  });

  assert.equal(replaced.code, 3);
  assert.equal(replaced.response.error.code, "SVS-PENDING-DECISION-ACTIVE");
  const inspected = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "inspect-after-information-1",
    command: "inspectCampaign",
    payload: { campaignPath },
  });
  assert.deepEqual(inspected.response.result.pendingDecision, requested.response.result.pendingDecision);
  assert.equal(inspected.response.result.workView.recordSequence, 8);
});

test("only an explicit response for the unchanged scope consumes a Pending Decision", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-approval-response-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "approval-response");
  await createConfirmedCampaign(kernelPath, campaignPath);
  const scope = researchApprovalRequest();
  const requested = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "request-research-approval-for-response-1",
    command: "requestResearchApproval",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      requestedAt: "2026-09-01T09:15:00.000Z",
      request: scope,
    },
  });
  assert.equal(requested.code, 0, requested.stderr);

  const changedScope = structuredClone(scope);
  changedScope.purpose = "Use the report for a broader commercial estimate";
  const changed = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "approve-changed-research-scope-1",
    command: "respondResearchApproval",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      respondedAt: "2026-09-01T09:16:00.000Z",
      decisionId: scope.id,
      response: {
        kind: "approve",
        approval: {
          id: "approval-analyst-report-access",
          explicitlyApproved: true,
          scope: changedScope,
        },
      },
    },
  });
  assert.equal(changed.code, 3);
  assert.equal(changed.response.error.code, "SVS-RESEARCH-APPROVAL-SCOPE-CHANGED");

  const approved = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "approve-research-scope-1",
    command: "respondResearchApproval",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      respondedAt: "2026-09-01T09:17:00.000Z",
      decisionId: scope.id,
      response: {
        kind: "approve",
        approval: {
          id: "approval-analyst-report-access",
          explicitlyApproved: true,
          scope,
        },
      },
    },
  });

  assert.equal(approved.code, 0, approved.stderr);
  assert.equal(approved.response.result.responded, true);
  assert.equal(approved.response.result.pendingDecision, null);
  assert.equal(approved.response.result.workView.pause, null);
  assert.deepEqual(approved.response.result.researchApprovals, [
    {
      id: "approval-analyst-report-access",
      decisionId: scope.id,
      approvedAt: "2026-09-01T09:17:00.000Z",
      scope,
    },
  ]);
  assert.match(
    approved.response.result.workView.nextPermittedActions.join(" "),
    /approved-research/,
  );
});

test("refusal records the resulting Evidence Gap and independent research can continue", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-approval-refusal-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "approval-refusal");
  await createConfirmedCampaign(kernelPath, campaignPath);
  const scope = researchApprovalRequest();
  const requested = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "request-research-approval-for-refusal-1",
    command: "requestResearchApproval",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      requestedAt: "2026-09-01T09:15:00.000Z",
      request: scope,
    },
  });
  assert.equal(requested.code, 0, requested.stderr);

  const refused = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "refuse-research-approval-1",
    command: "respondResearchApproval",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      respondedAt: "2026-09-01T09:16:00.000Z",
      decisionId: scope.id,
      response: {
        kind: "refuse",
        refusal: {
          id: "refusal-analyst-report-access",
          explicitlyRefused: true,
          rationale: "Do not use paid or authenticated research for this question.",
          evidenceGap: {
            type: "evidence-gap",
            id: "gap-analyst-market-size-unavailable",
            question: "Can public independent Sources establish the relevant market-size range?",
            affectedDecisionIds: ["decision-qualify-opportunity"],
            resolutionCriteria: "Independent public Sources support a traceable range.",
            resolutionMethod: "Continue bounded Public Research or leave the gate unresolved.",
            status: "open",
            resolution: null,
          },
        },
      },
    },
  });

  assert.equal(refused.code, 0, refused.stderr);
  assert.equal(refused.response.result.pendingDecision, null);
  assert.deepEqual(refused.response.result.researchApprovals, []);
  assert.deepEqual(refused.response.result.evidenceGap, {
    type: "evidence-gap",
    id: "gap-analyst-market-size-unavailable",
    question: "Can public independent Sources establish the relevant market-size range?",
    affectedDecisionIds: ["decision-qualify-opportunity"],
    resolutionCriteria: "Independent public Sources support a traceable range.",
    resolutionMethod: "Continue bounded Public Research or leave the gate unresolved.",
    status: "open",
    resolution: null,
  });
  assert.deepEqual(refused.response.result.workView.reasoning.openEvidenceGapIds, [
    "gap-analyst-market-size-unavailable",
  ]);

  const reserved = await runKernel(
    kernelPath,
    publicResearchReservationCommand(campaignPath, {
      requestId: "reserve-independent-public-research-1",
      payload: {
        reservedAt: "2026-09-01T09:17:00.000Z",
        reservation: { id: "reservation-independent-public-source" },
      },
    }),
  );
  assert.equal(reserved.code, 0, reserved.stderr);
});

test("Research Expenditure records approval provenance and budget effects without payment details", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-expenditure-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "research-expenditure");
  await createConfirmedCampaign(kernelPath, campaignPath);
  const scope = researchApprovalRequest();
  for (const command of [
    {
      envelopeVersion: "0.1.0",
      requestId: "request-research-approval-for-expenditure-1",
      command: "requestResearchApproval",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        requestedAt: "2026-09-01T09:15:00.000Z",
        request: scope,
      },
    },
    {
      envelopeVersion: "0.1.0",
      requestId: "approve-research-for-expenditure-1",
      command: "respondResearchApproval",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        respondedAt: "2026-09-01T09:17:00.000Z",
        decisionId: scope.id,
        response: {
          kind: "approve",
          approval: {
            id: "approval-analyst-report-access",
            explicitlyApproved: true,
            scope,
          },
        },
      },
    },
  ]) {
    const result = await runKernel(kernelPath, command);
    assert.equal(result.code, 0, result.stderr);
  }

  const command = {
    envelopeVersion: "0.1.0",
    requestId: "record-research-expenditure-1",
    command: "recordResearchExpenditure",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      incurredAt: "2026-09-01T09:21:00.000Z",
      expenditure: {
        id: "expenditure-analyst-report",
        approvalId: "approval-analyst-report-access",
        sourceId: scope.source.id,
        purpose: scope.purpose,
        amount: 8,
        currency: "GBP",
      },
    },
  };
  const recorded = await runKernel(kernelPath, command);

  assert.equal(recorded.code, 0, `${recorded.stderr}\n${JSON.stringify(recorded.response)}`);
  assert.equal(recorded.response.result.recorded, true);
  assert.deepEqual(recorded.response.result.expenditure, {
    ...command.payload.expenditure,
    incurredAt: command.payload.incurredAt,
    approvalDecisionId: scope.id,
  });
  assert.deepEqual(
    {
      paidSpendCap: recorded.response.result.researchBudget.paidSpendCap,
      recordedPaidSpend: recorded.response.result.researchBudget.recordedPaidSpend,
      remainingPaidSpend: recorded.response.result.researchBudget.remainingPaidSpend,
    },
    {
      paidSpendCap: { amount: 25, currency: "GBP" },
      recordedPaidSpend: { amount: 8, currency: "GBP" },
      remainingPaidSpend: { amount: 17, currency: "GBP" },
    },
  );

  const replay = await runKernel(kernelPath, command);
  assert.equal(replay.code, 0, replay.stderr);
  assert.equal(replay.response.result.recorded, false);
  assert.equal(replay.response.result.researchBudget.recordedPaidSpend.amount, 8);

  const unsafe = structuredClone(command);
  unsafe.requestId = "record-expenditure-with-payment-details-1";
  Object.assign(unsafe.payload.expenditure, { paymentDetails: "card ending 4242" });
  const rejected = await runKernel(kernelPath, unsafe);
  assert.equal(rejected.code, 3);
  assert.equal(rejected.response.error.code, "SVS-RESEARCH-EXPENDITURE-INVALID");
});

test("Research Approval cannot authorize unlawful, external-validation, or over-budget work", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-approval-safety-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "approval-safety");
  await createConfirmedCampaign(kernelPath, campaignPath);
  const recordsBefore = await readFile(path.join(campaignPath, "records.jsonl"));

  const cases = /** @type {Array<[string, (request: ReturnType<typeof researchApprovalRequest>) => void, string]>} */ ([
    [
      "request-unlawful-research-1",
      (request) => Object.assign(request, { lawfulActivity: false }),
      "SVS-RESEARCH-APPROVAL-INVALID",
    ],
    [
      "request-external-validation-1",
      (request) => Object.assign(request, { externalValidationAction: true }),
      "SVS-RESEARCH-APPROVAL-INVALID",
    ],
    [
      "request-over-budget-research-1",
      (request) => {
        request.maximumCost.amount = 26;
      },
      "SVS-RESEARCH-APPROVAL-BUDGET-INVALID",
    ],
  ]);
  for (const [requestId, mutate, expectedCode] of cases) {
    const request = researchApprovalRequest();
    mutate(request);
    const result = await runKernel(kernelPath, {
      envelopeVersion: "0.1.0",
      requestId,
      command: "requestResearchApproval",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        requestedAt: "2026-09-01T09:15:00.000Z",
        request,
      },
    });
    assert.equal(result.code, 3);
    assert.equal(result.response.error.code, expectedCode);
    assert.deepEqual(
      await readFile(path.join(campaignPath, "records.jsonl")),
      recordsBefore,
    );
  }
});
