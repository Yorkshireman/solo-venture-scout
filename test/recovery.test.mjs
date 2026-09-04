import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildPackagedScout, runKernel } from "./support/packaged-scout.mjs";

/**
 * @param {string} campaignPath
 * @param {number} [paidSpendCap]
 */
function confirmedIntakeCommand(campaignPath, paidSpendCap = 0) {
  return {
    envelopeVersion: "0.1.0",
    requestId: `confirm-${path.basename(campaignPath)}-1`,
    command: "confirmCampaignIntake",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      confirmedAt: "2026-01-01T00:10:00.000Z",
      intake: {
        version: 1,
        explicitlyConfirmed: true,
        developerProfileSnapshot: {
          capturedAt: "2026-01-01T00:05:00.000Z",
          capacity: { state: "known", value: "15 hours per week" },
          capabilities: { state: "known", value: "TypeScript" },
          access: { state: "none" },
          boundaries: { state: "known", value: "No regulated decisions" },
          operatingPreferences: { state: "unknown" },
          riskTolerance: { state: "known", value: "Low irreversible downside" },
        },
        commercialOutcomeTarget: {
          amount: 10_000,
          currency: "GBP",
          metric: "monthly recurring revenue",
          deadline: "2027-01-01",
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
  };
}

test("resume completes durable interrupted intent before taking over an expired lease", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-recovery-intent-");
  const storagePath = await mkdtemp(
    path.join(tmpdir(), "solo-venture-scout-storage-"),
  );
  const campaignPath = path.join(storagePath, "durable-intent");
  assert.equal(
    (
      await runKernel(kernelPath, {
        envelopeVersion: "0.1.0",
        requestId: "create-durable-intent-1",
        command: "createCampaign",
        payload: {
          campaignPath,
        campaignId: "campaign-durable-intent",
        coordinatorId: "coordinator-original",
        createdAt: "2025-01-01T00:00:00.000Z",
        leaseExpiresAt: "2025-01-01T00:30:00.000Z",
        },
      })
    ).code,
    0,
  );
  const recordsBeforeInterruption = await readFile(
    path.join(campaignPath, "records.jsonl"),
  );
  const interruptedCommand = {
    envelopeVersion: "0.1.0",
    requestId: "resume-interrupted-intent-1",
    command: "resumeCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-interrupted",
      resumedAt: "2025-01-01T01:00:00.000Z",
      leaseExpiresAt: "2025-01-01T01:30:00.000Z",
    },
  };

  const interrupted = await runKernel(
    kernelPath,
    interruptedCommand,
    {
      ...process.env,
      NODE_ENV: "test",
      SVS_FAULT_INJECTION: "after-operation-intent",
    },
  );

  assert.equal(interrupted.code, 3);
  assert.deepEqual(
    await readFile(path.join(campaignPath, "records.jsonl")),
    recordsBeforeInterruption,
  );

  const resumed = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "resume-recovery-takeover-1",
    command: "resumeCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-recovery",
      resumedAt: "2025-01-01T02:00:00.000Z",
      leaseExpiresAt: "2025-01-01T02:30:00.000Z",
    },
  });

  assert.equal(resumed.code, 0, resumed.stderr);
  assert.equal(resumed.response.result.workView.recordSequence, 6);
  assert.equal(
    resumed.response.result.lease.coordinatorId,
    "coordinator-recovery",
  );
  assert.deepEqual(resumed.response.result.summary.recovery, {
    recoveredOperations: [
      {
        requestId: "resume-interrupted-intent-1",
        operation: "resume-campaign",
        resolution: "completed-from-durable-intent",
      },
    ],
    projectionsRegenerated: true,
    autonomousContinuation: true,
  });
  const records = (await readFile(path.join(campaignPath, "records.jsonl"), "utf8"))
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    records
      .filter((record) => record.type === "operation-intent")
      .map((record) => record.requestId),
    [
      "create-durable-intent-1",
      "resume-interrupted-intent-1",
      "resume-recovery-takeover-1",
    ],
  );
});

test("resume reserves ambiguous Approved Research and pauses for a precise decision", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-recovery-approved-",
  );
  const storagePath = await mkdtemp(
    path.join(tmpdir(), "solo-venture-scout-storage-"),
  );
  const campaignPath = path.join(storagePath, "approved-research-recovery");
  const requestedAt = new Date(Date.now() - 120_000).toISOString();
  const respondedAt = new Date(Date.now() - 90_000).toISOString();
  const reservedAt = new Date(Date.now() - 60_000).toISOString();
  const resumedAt = new Date(Date.now() - 30_000).toISOString();
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
  const approvalRequest = {
    id: "decision-recovery-report-access",
    access: "restricted-and-paid",
    action: "read-source",
    purpose: "Resolve one named Evidence Gap from the analyst report",
    source: {
      id: "source-recovery-analyst-report",
      description: "Named analyst report",
      url: "https://research.example.com/recovery-report",
    },
    accessMethod: "developer-controlled-authenticated-and-paid-read-only",
    data: {
      accessed: ["Report text and publication metadata"],
      retained: ["Citation metadata and one neutral paraphrase"],
    },
    externalEffects: [],
    maximumCost: { amount: 12, currency: "GBP" },
    risks: ["The report may be outdated"],
    duration: { startsAt: requestedAt, expiresAt },
    alternatives: ["Leave the Evidence Gap unresolved"],
    lawfulActivity: true,
    externalValidationAction: false,
  };
  for (const command of [
    {
      envelopeVersion: "0.1.0",
      requestId: "create-approved-recovery-1",
      command: "createCampaign",
      payload: {
        campaignPath,
        campaignId: "campaign-approved-recovery",
        coordinatorId: "coordinator-primary",
        createdAt: "2026-01-01T00:00:00.000Z",
        leaseExpiresAt: "2099-01-01T00:00:00.000Z",
      },
    },
    confirmedIntakeCommand(campaignPath, 20),
    {
      envelopeVersion: "0.1.0",
      requestId: "request-approved-recovery-1",
      command: "requestResearchApproval",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        requestedAt,
        request: approvalRequest,
      },
    },
    {
      envelopeVersion: "0.1.0",
      requestId: "approve-recovery-research-1",
      command: "respondResearchApproval",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        respondedAt,
        decisionId: approvalRequest.id,
        response: {
          kind: "approve",
          approval: {
            id: "approval-recovery-report-access",
            explicitlyApproved: true,
            scope: approvalRequest,
          },
        },
      },
    },
    {
      envelopeVersion: "0.1.0",
      requestId: "reserve-approved-recovery-1",
      command: "reserveApprovedResearch",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        reservedAt,
        reservation: {
          id: "reservation-approved-recovery-1",
          sourceUnits: 1,
          purpose: approvalRequest.purpose,
          retrievalRoute: approvalRequest.accessMethod,
          approvalId: "approval-recovery-report-access",
        },
      },
    },
  ]) {
    const result = await runKernel(kernelPath, command);
    assert.equal(
      result.code,
      0,
      `${command.command}: ${result.stderr}\n${JSON.stringify(result.response)}`,
    );
  }

  const repeatedApproval = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "reserve-approved-recovery-again-1",
    command: "reserveApprovedResearch",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      reservedAt: new Date(Date.now() - 50_000).toISOString(),
      reservation: {
        id: "reservation-approved-recovery-2",
        sourceUnits: 1,
        purpose: approvalRequest.purpose,
        retrievalRoute: approvalRequest.accessMethod,
        approvalId: "approval-recovery-report-access",
      },
    },
  });
  assert.equal(repeatedApproval.code, 3);
  assert.equal(
    repeatedApproval.response.error.code,
    "SVS-RESEARCH-APPROVAL-ALREADY-RESERVED",
  );

  const resumed = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "resume-approved-recovery-1",
    command: "resumeCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      resumedAt,
      leaseExpiresAt: expiresAt,
    },
  });

  assert.equal(resumed.code, 0, resumed.stderr);
  assert.deepEqual(resumed.response.result.workView.pause, {
    reason: "pending-decision",
    pendingDecisionId:
      "interrupted-approved-research:reservation-approved-recovery-1",
    decisionType: "interrupted-approved-research",
    requestedAction: "record-completed-result-or-resolve-without-result",
    resumable: true,
  });
  assert.deepEqual(resumed.response.result.pendingDecision, {
    id: "interrupted-approved-research:reservation-approved-recovery-1",
    type: "interrupted-approved-research",
    requestedAt: resumedAt,
    question:
      "Did the approved Source work complete, and was a charge incurred before interruption? Do not repeat access or payment.",
    reservations: [
      {
        reservationId: "reservation-approved-recovery-1",
        approvalId: "approval-recovery-report-access",
        access: "restricted-and-paid",
        sourceId: "source-recovery-analyst-report",
        purpose: approvalRequest.purpose,
        maximumCost: { amount: 12, currency: "GBP" },
      },
    ],
    options: [
      {
        kind: "record-completed-result",
        action: "recordApprovedResearchObservation",
      },
      {
        kind: "resolve-without-result",
        action: "respondInterruptedResearch",
      },
    ],
  });
  assert.deepEqual(resumed.response.result.summary.recovery, {
    recoveredOperations: [],
    projectionsRegenerated: false,
    unresolvedResearchReservations: ["reservation-approved-recovery-1"],
    autonomousContinuation: false,
  });
  const budget = JSON.parse(
    await readFile(path.join(campaignPath, "research-budget.json"), "utf8"),
  );
  assert.equal(budget.reservedSourceUnits, 1);
  assert.deepEqual(budget.reservedPaidSpend, { amount: 12, currency: "GBP" });
  assert.deepEqual(budget.remainingPaidSpend, { amount: 8, currency: "GBP" });

  const resumedAgain = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "resume-approved-recovery-again-1",
    command: "resumeCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      resumedAt: new Date(Date.now() - 10_000).toISOString(),
      leaseExpiresAt: expiresAt,
    },
  });
  assert.equal(resumedAgain.code, 0, resumedAgain.stderr);
  assert.equal(
    resumedAgain.response.result.pendingDecision.id,
    resumed.response.result.pendingDecision.id,
  );
  assert.equal(
    resumedAgain.response.result.pendingDecision.requestedAt,
    resumed.response.result.pendingDecision.requestedAt,
  );

  const prematureChargedResponse = {
    envelopeVersion: "0.1.0",
    requestId: "respond-approved-recovery-before-expenditure-1",
    command: "respondInterruptedResearch",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      respondedAt: new Date(Date.now() - 5_000).toISOString(),
      decisionId: resumed.response.result.pendingDecision.id,
      response: {
        kind: "resolve-without-result",
        reservations: [
          {
            reservationId: "reservation-approved-recovery-1",
            externalWorkCompleted: false,
            charge: {
              incurred: true,
              expenditureId: "expenditure-interrupted-approved-recovery-1",
            },
          },
        ],
        explicitlyConfirmed: true,
        rationale: "The charge completed, but Source access did not return a result.",
      },
    },
  };
  const prematureResponse = await runKernel(kernelPath, prematureChargedResponse);
  assert.equal(prematureResponse.code, 3);
  assert.equal(
    prematureResponse.response.error.code,
    "SVS-INTERRUPTED-RESEARCH-RESPONSE-INVALID",
  );

  const expenditure = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "record-interrupted-approved-expenditure-1",
    command: "recordResearchExpenditure",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      incurredAt: new Date(Date.now() - 4_000).toISOString(),
      expenditure: {
        id: "expenditure-interrupted-approved-recovery-1",
        approvalId: "approval-recovery-report-access",
        sourceId: approvalRequest.source.id,
        purpose: approvalRequest.purpose,
        amount: 7,
        currency: "GBP",
      },
    },
  });
  assert.equal(expenditure.code, 0, expenditure.stderr);

  const decisionResponse = structuredClone(prematureChargedResponse);
  decisionResponse.requestId = "respond-approved-recovery-1";
  decisionResponse.payload.respondedAt = new Date(Date.now() - 2_000).toISOString();
  const responded = await runKernel(kernelPath, decisionResponse);
  assert.equal(
    responded.code,
    0,
    `${responded.stderr}\n${JSON.stringify(responded.response)}`,
  );
  assert.equal(responded.response.result.responded, true);
  assert.deepEqual(responded.response.result.closedReservationIds, [
    "reservation-approved-recovery-1",
  ]);
  assert.equal(responded.response.result.pendingDecision, null);
  assert.equal(responded.response.result.workView.pause, null);
  assert.equal(responded.response.result.researchBudget.reservedSourceUnits, 0);
  assert.equal(responded.response.result.researchBudget.settledSourceUnits, 1);
  assert.deepEqual(responded.response.result.researchBudget.recordedPaidSpend, {
    amount: 7,
    currency: "GBP",
  });
  assert.deepEqual(responded.response.result.researchBudget.remainingPaidSpend, {
    amount: 13,
    currency: "GBP",
  });
  assert.equal(
    responded.response.result.workView.completedWork.includes(
      "Approved Research reservation reservation-approved-recovery-1 closed without retry",
    ),
    true,
  );
  const recordsBeforeResponseReplay = await readFile(
    path.join(campaignPath, "records.jsonl"),
  );
  const responseReplay = await runKernel(kernelPath, decisionResponse);
  assert.equal(responseReplay.code, 0, responseReplay.stderr);
  assert.equal(responseReplay.response.result.responded, false);
  assert.deepEqual(
    await readFile(path.join(campaignPath, "records.jsonl")),
    recordsBeforeResponseReplay,
  );

  const secondRequestedAt = new Date(Date.now() - 1_500).toISOString();
  const secondApprovedAt = new Date(Date.now() - 1_400).toISOString();
  const secondReservedAt = new Date(Date.now() - 1_300).toISOString();
  const secondResumedAt = new Date(Date.now() - 1_200).toISOString();
  const secondIncurredAt = new Date(Date.now() - 1_100).toISOString();
  const secondAccessedAt = new Date(Date.now() - 1_000).toISOString();
  const secondRecordedAt = new Date(Date.now() - 900).toISOString();
  const completedScope = {
    ...approvalRequest,
    id: "decision-completed-recovery-report-access",
    purpose: "Recover the completed result from a second named analyst report",
    source: {
      id: "source-completed-recovery-report",
      description: "Second named analyst report",
      url: "https://research.example.com/completed-recovery-report",
    },
    maximumCost: { amount: 6, currency: "GBP" },
    duration: { startsAt: secondRequestedAt, expiresAt },
  };
  for (const command of [
    {
      envelopeVersion: "0.1.0",
      requestId: "request-completed-recovery-1",
      command: "requestResearchApproval",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        requestedAt: secondRequestedAt,
        request: completedScope,
      },
    },
    {
      envelopeVersion: "0.1.0",
      requestId: "approve-completed-recovery-1",
      command: "respondResearchApproval",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        respondedAt: secondApprovedAt,
        decisionId: completedScope.id,
        response: {
          kind: "approve",
          approval: {
            id: "approval-completed-recovery-report-access",
            explicitlyApproved: true,
            scope: completedScope,
          },
        },
      },
    },
    {
      envelopeVersion: "0.1.0",
      requestId: "reserve-completed-approved-recovery-1",
      command: "reserveApprovedResearch",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        reservedAt: secondReservedAt,
        reservation: {
          id: "reservation-completed-approved-recovery-1",
          sourceUnits: 1,
          purpose: completedScope.purpose,
          retrievalRoute: completedScope.accessMethod,
          approvalId: "approval-completed-recovery-report-access",
        },
      },
    },
    {
      envelopeVersion: "0.1.0",
      requestId: "resume-completed-approved-recovery-1",
      command: "resumeCampaign",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        resumedAt: secondResumedAt,
        leaseExpiresAt: expiresAt,
      },
    },
    {
      envelopeVersion: "0.1.0",
      requestId: "record-completed-approved-expenditure-1",
      command: "recordResearchExpenditure",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        incurredAt: secondIncurredAt,
        expenditure: {
          id: "expenditure-completed-approved-recovery-1",
          approvalId: "approval-completed-recovery-report-access",
          sourceId: completedScope.source.id,
          purpose: completedScope.purpose,
          amount: 5,
          currency: "GBP",
        },
      },
    },
  ]) {
    const response = await runKernel(kernelPath, command);
    assert.equal(
      response.code,
      0,
      `${command.command}: ${response.stderr}\n${JSON.stringify(response.response)}`,
    );
  }

  const completedResult = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "record-completed-approved-result-1",
    command: "recordApprovedResearchObservation",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: secondRecordedAt,
      reservationId: "reservation-completed-approved-recovery-1",
      source: {
        id: completedScope.source.id,
        retrievalMode: completedScope.accessMethod,
        url: completedScope.source.url,
        publisher: "Example Research",
        originator: null,
        publishedAt: "2026-01-01",
        updatedAt: null,
        accessedAt: secondAccessedAt,
        exactLocator: "Results, paragraph 3",
      },
      observation: {
        id: "observation-completed-approved-recovery-1",
        text: "The report describes the named estimate for the target market.",
        sourceId: completedScope.source.id,
        exactLocator: "Results, paragraph 3",
      },
      charge: {
        incurred: true,
        expenditureId: "expenditure-completed-approved-recovery-1",
      },
    },
  });
  assert.equal(
    completedResult.code,
    0,
    `${completedResult.stderr}\n${JSON.stringify(completedResult.response)}`,
  );
  assert.equal(completedResult.response.result.pendingDecision, undefined);
  assert.equal(completedResult.response.result.workView.pause, null);
  assert.equal(
    completedResult.response.result.researchBudget.recordedPaidSpend.amount,
    12,
  );
});

test("resume regenerates projections after faults around the authoritative commit and checkpoint", async (context) => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-recovery-projections-",
  );
  const faultPoints = [
    "after-authoritative-records",
    "after-authoritative-commit",
    "after-work-view-projection",
    "after-lease-projection",
    "after-checkpoint",
    "after-research-budget-projection",
  ];

  for (const [index, faultPoint] of faultPoints.entries()) {
    await context.test(faultPoint, async () => {
      const storagePath = await mkdtemp(
        path.join(tmpdir(), "solo-venture-scout-storage-"),
      );
      const campaignPath = path.join(storagePath, `projection-${index}`);
      assert.equal(
        (
          await runKernel(kernelPath, {
            envelopeVersion: "0.1.0",
            requestId: `create-projection-${index}-1`,
            command: "createCampaign",
            payload: {
              campaignPath,
              campaignId: `campaign-projection-${index}`,
              coordinatorId: "coordinator-primary",
              createdAt: "2026-01-01T00:00:00.000Z",
              leaseExpiresAt: "2099-01-01T00:00:00.000Z",
            },
          })
        ).code,
        0,
      );
      const confirmation = confirmedIntakeCommand(campaignPath);

      const interrupted = await runKernel(kernelPath, confirmation, {
        ...process.env,
        NODE_ENV: "test",
        SVS_FAULT_INJECTION: faultPoint,
      });

      assert.equal(interrupted.code, 3, faultPoint);

      const resumed = await runKernel(kernelPath, {
        envelopeVersion: "0.1.0",
        requestId: `resume-projection-${index}-1`,
        command: "resumeCampaign",
        payload: {
          campaignPath,
          coordinatorId: "coordinator-primary",
          resumedAt: "2026-01-01T00:20:00.000Z",
          leaseExpiresAt: "2099-01-01T00:00:00.000Z",
        },
      });

      assert.equal(resumed.code, 0, `${faultPoint}: ${resumed.stderr}`);
      assert.equal(
        resumed.response.result.workView.phase,
        "campaign-intake-confirmed",
      );
      assert.equal(resumed.response.result.workView.recordSequence, 6);
      assert.deepEqual(resumed.response.result.summary.recovery, {
        recoveredOperations: [
          {
            requestId: confirmation.requestId,
            operation: "confirm-campaign-intake",
            resolution: "authoritative-records-present",
          },
        ],
        projectionsRegenerated: true,
        autonomousContinuation: true,
      });
      const inspected = await runKernel(kernelPath, {
        envelopeVersion: "0.1.0",
        requestId: `inspect-projection-${index}-1`,
        command: "inspectCampaign",
        payload: { campaignPath },
      });
      assert.equal(inspected.code, 0, `${faultPoint}: ${inspected.stderr}`);
      assert.equal(inspected.response.result.validation.checkpointSequence, 6);
    });
  }

  await context.test("missing projection directories", async () => {
    const storagePath = await mkdtemp(
      path.join(tmpdir(), "solo-venture-scout-storage-"),
    );
    const campaignPath = path.join(storagePath, "missing-projection-directory");
    for (const command of [
      {
        envelopeVersion: "0.1.0",
        requestId: "create-missing-projection-directory-1",
        command: "createCampaign",
        payload: {
          campaignPath,
          campaignId: "campaign-missing-projection-directory",
          coordinatorId: "coordinator-primary",
          createdAt: "2025-01-01T00:00:00.000Z",
          leaseExpiresAt: "2099-01-01T00:30:00.000Z",
        },
      },
      confirmedIntakeCommand(campaignPath),
    ]) {
      const response = await runKernel(kernelPath, command);
      assert.equal(response.code, 0, response.stderr);
    }
    await rm(path.join(campaignPath, "checkpoints"), {
      recursive: true,
      force: true,
    });

    const resumed = await runKernel(kernelPath, {
      envelopeVersion: "0.1.0",
      requestId: "resume-missing-projection-directory-1",
      command: "resumeCampaign",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        resumedAt: "2026-01-01T01:00:00.000Z",
        leaseExpiresAt: "2099-01-01T01:30:00.000Z",
      },
    });
    assert.equal(resumed.code, 0, resumed.stderr);
    assert.equal(
      resumed.response.result.summary.recovery.projectionsRegenerated,
      true,
    );
    assert.deepEqual(
      JSON.parse(
        await readFile(
          path.join(campaignPath, "checkpoints", "000000000006.json"),
          "utf8",
        ),
      ).recordSequence,
      6,
    );
  });
});

/**
 * @param {string[]} values
 * @returns {string[][]}
 */
function permutations(values) {
  if (values.length < 2) {
    return [values];
  }
  return values.flatMap((value, index) =>
    permutations(values.filter((_, candidate) => candidate !== index)).map(
      (tail) => [value, ...tail],
    ),
  );
}

test("duplicate and out-of-order reservation inputs have one canonical result for every arrival order", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-recovery-order-",
  );
  const reservationIds = ["reservation-charlie", "reservation-alpha", "reservation-bravo"];
  /** @type {Array<{completedReservations: string[], researchBudget: unknown, nextPermittedActions: string[]}>} */
  const canonicalResults = [];

  for (const [campaignIndex, arrivalOrder] of permutations(
    reservationIds,
  ).entries()) {
    const storagePath = await mkdtemp(
      path.join(tmpdir(), "solo-venture-scout-storage-"),
    );
    const campaignPath = path.join(storagePath, `arrival-${campaignIndex}`);
    assert.equal(
      (
        await runKernel(kernelPath, {
          envelopeVersion: "0.1.0",
          requestId: `create-arrival-${campaignIndex}-1`,
          command: "createCampaign",
          payload: {
            campaignPath,
            campaignId: `campaign-arrival-${campaignIndex}`,
            coordinatorId: "coordinator-primary",
            createdAt: "2026-01-01T00:00:00.000Z",
            leaseExpiresAt: "2099-01-01T00:00:00.000Z",
          },
        })
      ).code,
      0,
    );
    const firstReservation = {
      envelopeVersion: "0.1.0",
      requestId: `reserve-${arrivalOrder[0]}-1`,
      command: "reservePublicResearch",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        reservedAt: "2026-01-01T00:20:00.000Z",
        reservation: {
          id: arrivalOrder[0],
          sourceUnits: 1,
          purpose: `Examine ${arrivalOrder[0]}`,
          retrievalRoute: "public-web-search",
        },
      },
    };

    const premature = await runKernel(kernelPath, firstReservation);
    assert.equal(premature.code, 3);
    assert.equal(premature.response.error.code, "SVS-PUBLIC-RESEARCH-NOT-AVAILABLE");
    assert.equal(
      (await readFile(path.join(campaignPath, "records.jsonl"), "utf8"))
        .trimEnd()
        .split("\n").length,
      2,
    );
    assert.equal(
      (await runKernel(kernelPath, confirmedIntakeCommand(campaignPath))).code,
      0,
    );

    const commands = new Map(
      arrivalOrder.map((reservationId, reservationIndex) => [
        reservationId,
        {
          envelopeVersion: "0.1.0",
          requestId: `reserve-${reservationId}-1`,
          command: "reservePublicResearch",
          payload: {
            campaignPath,
            coordinatorId: "coordinator-primary",
            reservedAt: `2026-01-01T00:${String(20 + reservationIndex).padStart(2, "0")}:00.000Z`,
            reservation: {
              id: reservationId,
              sourceUnits: 1,
              purpose: `Examine ${reservationId}`,
              retrievalRoute: "public-web-search",
            },
          },
        },
      ]),
    );
    for (const reservationId of arrivalOrder) {
      const reservationCommand = commands.get(reservationId);
      assert.ok(reservationCommand);
      const result = await runKernel(kernelPath, reservationCommand);
      assert.equal(result.code, 0, JSON.stringify(result.response));
    }
    const recordsBeforeDuplicates = await readFile(
      path.join(campaignPath, "records.jsonl"),
    );
    const duplicate = commands.get(arrivalOrder[1]);
    assert.ok(duplicate);
    const duplicateWithReorderedFields = {
      command: duplicate.command,
      payload: {
        reservation: {
          retrievalRoute: duplicate.payload.reservation.retrievalRoute,
          purpose: duplicate.payload.reservation.purpose,
          sourceUnits: duplicate.payload.reservation.sourceUnits,
          id: duplicate.payload.reservation.id,
        },
        reservedAt: duplicate.payload.reservedAt,
        coordinatorId: duplicate.payload.coordinatorId,
        campaignPath: duplicate.payload.campaignPath,
      },
      requestId: duplicate.requestId,
      envelopeVersion: duplicate.envelopeVersion,
    };
    const replay = await runKernel(kernelPath, duplicateWithReorderedFields);
    assert.equal(replay.code, 0, JSON.stringify(replay.response));
    assert.equal(replay.response.result.reserved, false);
    assert.deepEqual(
      await readFile(path.join(campaignPath, "records.jsonl")),
      recordsBeforeDuplicates,
    );
    const conflict = await runKernel(kernelPath, {
      ...duplicate,
      payload: {
        ...duplicate.payload,
        reservedAt: "2026-01-01T00:59:00.000Z",
      },
    });
    assert.equal(conflict.code, 3);
    assert.equal(conflict.response.error.code, "SVS-CAMPAIGN-REQUEST-CONFLICT");

    const inspected = await runKernel(kernelPath, {
      envelopeVersion: "0.1.0",
      requestId: `inspect-arrival-${campaignIndex}-1`,
      command: "inspectCampaign",
      payload: { campaignPath },
    });
    assert.equal(inspected.code, 0, inspected.stderr);
    canonicalResults.push({
      completedReservations:
        inspected.response.result.workView.completedWork.filter(
          (/** @type {string} */ entry) =>
            entry.startsWith("Public Research reservation"),
        ),
      researchBudget: inspected.response.result.researchBudget,
      nextPermittedActions:
        inspected.response.result.workView.nextPermittedActions,
    });
  }

  assert.ok(
    canonicalResults.every(
      (result) =>
        JSON.stringify(result) === JSON.stringify(canonicalResults[0]),
    ),
  );
});

test("concurrent stale-lease takeovers elect exactly one coordinator", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-recovery-concurrency-",
  );
  const storagePath = await mkdtemp(
    path.join(tmpdir(), "solo-venture-scout-storage-"),
  );
  const campaignPath = path.join(storagePath, "concurrent-takeover");
  assert.equal(
    (
      await runKernel(kernelPath, {
        envelopeVersion: "0.1.0",
        requestId: "create-concurrent-takeover-1",
        command: "createCampaign",
        payload: {
          campaignPath,
          campaignId: "campaign-concurrent-takeover",
          coordinatorId: "coordinator-original",
          createdAt: "2025-01-01T00:00:00.000Z",
          leaseExpiresAt: "2025-01-01T00:30:00.000Z",
        },
      })
    ).code,
    0,
  );
  const contenders = Array.from({ length: 32 }, (_, index) => ({
    envelopeVersion: "0.1.0",
    requestId: `resume-concurrent-takeover-${index}`,
    command: "resumeCampaign",
    payload: {
      campaignPath,
      coordinatorId: `coordinator-contender-${index}`,
      resumedAt: "2026-01-01T00:00:00.000Z",
      leaseExpiresAt: "2099-01-01T00:00:00.000Z",
    },
  }));

  const results = await Promise.all(
    contenders.map((command) => runKernel(kernelPath, command)),
  );

  const successes = results.filter((result) => result.code === 0);
  assert.equal(
    successes.length,
    1,
    `expected one winner, received ${JSON.stringify(results.map((result) => result.response))}`,
  );
  assert.equal(
    results.every(
      (result) =>
        result.code === 0 ||
        ["SVS-CAMPAIGN-LOCKED", "SVS-CAMPAIGN-LEASE-HELD"].includes(
          result.response.error.code,
        ),
    ),
    true,
  );
  const inspected = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "inspect-concurrent-takeover-1",
    command: "inspectCampaign",
    payload: { campaignPath },
  });
  assert.equal(inspected.code, 0, inspected.stderr);
  assert.equal(inspected.response.result.validation.recordCount, 4);
  assert.equal(
    inspected.response.result.lease.coordinatorId,
    successes[0].response.result.lease.coordinatorId,
  );
});
