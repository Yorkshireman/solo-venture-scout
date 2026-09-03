import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
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

/** @param {string} campaignPath */
function intake(campaignPath) {
  return {
    envelopeVersion: "0.1.0",
    requestId: "confirm-reevaluation-intake-1",
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
          access: { state: "none" },
          boundaries: { state: "known", value: "Public Sources only" },
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
          paidSpendCap: { amount: 0, currency: "GBP" },
        },
      },
    },
  };
}

test("a developer challenge appends a reasoned Intake revision and re-evaluation without rewriting history", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-reevaluate-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "reevaluation-campaign");
  for (const command of [
    {
      envelopeVersion: "0.1.0",
      requestId: "create-reevaluation-campaign-1",
      command: "createCampaign",
      payload: {
        campaignPath,
        campaignId: "campaign-reevaluation",
        coordinatorId: "coordinator-primary",
        createdAt: "2026-09-01T09:00:00.000Z",
        leaseExpiresAt: "2099-09-01T09:30:00.000Z",
      },
    },
    intake(campaignPath),
  ]) {
    const result = await runKernel(kernelPath, command);
    assert.equal(result.code, 0, result.stderr);
  }

  const revisedIntake = structuredClone(intake(campaignPath).payload.intake);
  revisedIntake.version = 2;
  revisedIntake.developerProfileSnapshot.capturedAt = "2026-09-01T10:00:00.000Z";
  revisedIntake.developerProfileSnapshot.capacity = {
    state: "known",
    value: "8 hours per week",
  };
  const result = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "reevaluate-capacity-challenge-1",
    command: "reevaluateCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      reevaluatedAt: "2026-09-01T10:01:00.000Z",
      operation: {
        id: "reevaluation-capacity-1",
        kind: "developer-challenge",
        reason: "The original weekly capacity was optimistic after delivery work began.",
        reasoningEntries: [],
        intakeRevision: {
          reason: "Reduce the confirmed weekly build capacity from fifteen to eight hours.",
          intake: revisedIntake,
        },
        decision: {
          type: "campaign-decision",
          id: "decision-reevaluate-capacity-1",
          kind: "campaign-re-evaluation",
          outcome: "resume",
          intakeVersion: 2,
          applicableRule: "Revise Campaign Intake explicitly and re-evaluate only dependent decisions.",
          triggerEntryIds: [],
          affectedOpportunityIds: [],
          supersededDecisionIds: [],
          rationale: "No Opportunity decision exists yet, so only the intake baseline changes.",
          confidence: {
            level: "high",
            limitingFactors: ["No downstream Opportunity decision exists yet."],
          },
          limitations: ["The revised capacity has not yet been tested in Campaign Research."],
          decidedAt: "2026-09-01T10:01:00.000Z",
        },
      },
    },
  });

  assert.equal(result.code, 0, `${result.stderr}\n${JSON.stringify(result.response)}`);
  assert.equal(result.response.result.recorded, true);
  assert.equal(result.response.result.campaign.id, "campaign-reevaluation");
  assert.equal(result.response.result.intake.version, 2);
  assert.equal(result.response.result.intakeRevision.reason.includes("fifteen"), true);
  assert.deepEqual(result.response.result.invalidatedDecisionIds, []);
  assert.deepEqual(result.response.result.supersededArtifactIds, []);
  assert.equal(result.response.result.workView.phase, "campaign-intake-confirmed");
  assert.deepEqual(result.response.result.workView.reevaluation, {
    id: "reevaluation-capacity-1",
    kind: "developer-challenge",
    intakeVersion: 2,
    affectedOpportunityIds: [],
    invalidatedDecisionIds: [],
    supersededArtifactIds: [],
  });

  const records = (await readFile(path.join(campaignPath, "records.jsonl"), "utf8"))
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
  const intakeRecords = records
    .filter((record) => record.intake !== undefined)
    .map((record) => ({ version: record.intake.version, capacity: record.intake.developerProfileSnapshot.capacity.value }));
  assert.deepEqual(intakeRecords, [
    { version: 1, capacity: "15 hours per week" },
    { version: 2, capacity: "8 hours per week" },
  ]);
});

test("a source challenge supersedes affected reasoning through stable links and retains both versions", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-correction-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "correction-campaign");
  const setup = [
    {
      envelopeVersion: "0.1.0",
      requestId: "create-correction-campaign-1",
      command: "createCampaign",
      payload: {
        campaignPath,
        campaignId: "campaign-correction",
        coordinatorId: "coordinator-primary",
        createdAt: "2026-09-01T09:00:00.000Z",
        leaseExpiresAt: "2099-09-01T09:30:00.000Z",
      },
    },
    { ...intake(campaignPath), requestId: "confirm-correction-intake-1" },
    {
      envelopeVersion: "0.1.0",
      requestId: "reserve-correction-source-1",
      command: "reservePublicResearch",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        reservedAt: "2026-09-01T09:11:00.000Z",
        reservation: {
          id: "reservation-correction-source-1",
          sourceUnits: 1,
          purpose: "Examine the claimed weekly administrative burden",
          retrievalRoute: "public-web-search",
        },
      },
    },
    {
      envelopeVersion: "0.1.0",
      requestId: "record-correction-source-1",
      command: "recordPublicResearchObservation",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        recordedAt: "2026-09-01T09:13:00.000Z",
        reservationId: "reservation-correction-source-1",
        source: {
          id: "source-admin-burden",
          retrievalMode: "public-web",
          url: "https://example.com/admin-burden",
          publisher: "Example Institute",
          originator: null,
          publishedAt: "2026-08-01",
          updatedAt: null,
          accessedAt: "2026-09-01T09:12:00.000Z",
          exactLocator: "Results, paragraph 3",
        },
        observation: {
          id: "observation-admin-burden",
          text: "The report describes recurring weekly administrative work.",
          sourceId: "source-admin-burden",
          exactLocator: "Results, paragraph 3",
        },
      },
    },
    {
      envelopeVersion: "0.1.0",
      requestId: "record-original-admin-inference-1",
      command: "recordEvidenceReasoning",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        recordedAt: "2026-09-01T09:14:00.000Z",
        entries: [
          {
            type: "inference",
            id: "inference-admin-burden-original",
            text: "The administrative burden is material every week.",
            scope: "campaign-correction",
            reasoning: "The report was initially read as applying to every respondent.",
            supportingEntryIds: ["observation-admin-burden"],
            challengingEntryIds: [],
            confidence: {
              level: "medium",
              limitingFactors: ["The sample scope needs clarification."],
            },
          },
        ],
      },
    },
  ];
  for (const command of setup) {
    const result = await runKernel(kernelPath, command);
    assert.equal(result.code, 0, `${result.stderr}\n${JSON.stringify(result.response)}`);
  }

  const corrected = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "reevaluate-admin-inference-1",
    command: "reevaluateCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      reevaluatedAt: "2026-09-01T09:20:00.000Z",
      operation: {
        id: "reevaluation-admin-inference-1",
        kind: "source-correction",
        reason: "The developer challenged whether the result applied to every respondent.",
        reasoningEntries: [
          {
            type: "inference",
            id: "inference-admin-burden-narrowed",
            text: "The report supports recurring administrative burden only for the surveyed subgroup.",
            scope: "campaign-correction",
            reasoning: "The exact locator limits the reported result to the surveyed subgroup.",
            supportingEntryIds: ["observation-admin-burden"],
            challengingEntryIds: [],
            confidence: {
              level: "medium",
              limitingFactors: ["The Source does not establish wider prevalence."],
            },
          },
          {
            type: "correction",
            id: "correction-admin-burden-scope",
            targetEntryId: "inference-admin-burden-original",
            action: "supersede",
            replacementEntryId: "inference-admin-burden-narrowed",
            rationale: "The original Inference overstated the Source population.",
          },
        ],
        intakeRevision: null,
        decision: {
          type: "campaign-decision",
          id: "decision-reevaluate-admin-inference-1",
          kind: "campaign-re-evaluation",
          outcome: "reaffirm",
          intakeVersion: 1,
          applicableRule: "Correct challenged evidence through stable append-only links.",
          triggerEntryIds: ["correction-admin-burden-scope"],
          affectedOpportunityIds: [],
          supersededDecisionIds: [],
          rationale: "The narrower Inference remains usable and no downstream Campaign Decision exists.",
          confidence: {
            level: "medium",
            limitingFactors: ["The underlying Source remains observational."],
          },
          limitations: ["No Opportunity decision has yet tested the narrower claim."],
          decidedAt: "2026-09-01T09:20:00.000Z",
        },
      },
    },
  });

  assert.equal(corrected.code, 0, `${corrected.stderr}\n${JSON.stringify(corrected.response)}`);
  assert.deepEqual(corrected.response.result.workView.reasoning.activeInferenceIds, [
    "inference-admin-burden-narrowed",
  ]);
  const ledger = JSON.parse(
    await readFile(path.join(campaignPath, "evidence-ledger.json"), "utf8"),
  );
  assert.deepEqual(
    ledger.inferences.map((/** @type {any} */ entry) => entry.id),
    ["inference-admin-burden-original", "inference-admin-burden-narrowed"],
  );
  assert.deepEqual(ledger.corrections, [
    {
      type: "correction",
      id: "correction-admin-burden-scope",
      targetEntryId: "inference-admin-burden-original",
      action: "supersede",
      replacementEntryId: "inference-admin-burden-narrowed",
      rationale: "The original Inference overstated the Source population.",
    },
  ]);
  assert.equal(
    ledger.campaignDecisions.at(-1).id,
    "decision-reevaluate-admin-inference-1",
  );

  const freshnessEntry = {
          type: "source-freshness",
          id: "freshness-admin-burden",
          sourceId: "source-admin-burden",
          observationId: "observation-admin-burden",
          intendedUse: "Assess the current weekly administrative burden.",
          assessment: "medium",
          timeSensitivity: "The operating process may change monthly.",
          rationale: "The Source is current for one month after assessment.",
          limitations: ["A later process change could alter the burden."],
          refreshAfter: "2026-09-02T00:00:00.000Z",
        };
  const freshnessDecision = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "reevaluate-admin-freshness-1",
    command: "reevaluateCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      reevaluatedAt: "2026-09-01T09:22:00.000Z",
      operation: {
        id: "reevaluation-admin-freshness-1",
        kind: "freshness-change",
        reason: "Record when the time-sensitive administrative claim needs review.",
        reasoningEntries: [freshnessEntry],
        intakeRevision: null,
        decision: {
          type: "campaign-decision",
          id: "decision-reevaluate-admin-freshness-1",
          kind: "campaign-re-evaluation",
          outcome: "reaffirm",
          intakeVersion: 1,
          applicableRule: "Refresh only stale evidence capable of changing an active decision.",
          triggerEntryIds: ["freshness-admin-burden"],
          affectedOpportunityIds: [],
          supersededDecisionIds: [],
          rationale: "The claim remains usable until its explicit refresh boundary.",
          confidence: {
            level: "medium",
            limitingFactors: ["The process can change after the review boundary."],
          },
          limitations: ["Resume must not refresh unrelated evidence."],
          decidedAt: "2026-09-01T09:22:00.000Z",
        },
      },
    },
  });
  assert.equal(freshnessDecision.code, 0, freshnessDecision.stderr);

  const prematureRefresh = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "resume-refresh-before-boundary-1",
    command: "reevaluateCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      reevaluatedAt: "2026-09-01T09:23:00.000Z",
      operation: {
        id: "reevaluation-premature-refresh-1",
        kind: "resume-refresh",
        reason: "Attempt to refresh the administrative claim before its review boundary.",
        reasoningEntries: [],
        intakeRevision: null,
        decision: {
          type: "campaign-decision",
          id: "decision-premature-refresh-1",
          kind: "campaign-re-evaluation",
          outcome: "resume",
          intakeVersion: 1,
          applicableRule: "Refresh only stale evidence capable of changing an active decision.",
          triggerEntryIds: ["freshness-admin-burden"],
          affectedOpportunityIds: [],
          supersededDecisionIds: ["decision-reevaluate-admin-freshness-1"],
          rationale: "The refresh would reconsider the active freshness decision.",
          confidence: {
            level: "medium",
            limitingFactors: ["The explicit refresh boundary has not arrived."],
          },
          limitations: ["Unrelated evidence must not be refreshed."],
          decidedAt: "2026-09-01T09:23:00.000Z",
        },
      },
    },
  });
  assert.equal(prematureRefresh.code, 3);
  assert.match(
    prematureRefresh.response.error.message,
    /refresh time has arrived/,
  );

  const resumed = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "resume-for-targeted-freshness-1",
    command: "resumeCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      resumedAt: "2026-09-03T09:00:00.000Z",
      leaseExpiresAt: "2099-09-03T09:30:00.000Z",
    },
  });
  assert.equal(resumed.code, 0, `${resumed.stderr}\n${JSON.stringify(resumed.response)}`);
  assert.deepEqual(resumed.response.result.workView.evidenceRefresh, {
    freshnessIds: ["freshness-admin-burden"],
    observationIds: ["observation-admin-burden"],
    affectedDecisionIds: ["decision-reevaluate-admin-freshness-1"],
  });
  assert.equal(
    resumed.response.result.workView.nextPermittedActions[0],
    "refresh-time-sensitive-evidence",
  );

  const refreshReevaluation = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "resume-refresh-after-boundary-1",
    command: "reevaluateCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      reevaluatedAt: "2026-09-03T09:01:00.000Z",
      operation: {
        id: "reevaluation-due-refresh-1",
        kind: "resume-refresh",
        reason: "The listed administrative evidence has reached its review boundary.",
        reasoningEntries: [],
        intakeRevision: null,
        decision: {
          type: "campaign-decision",
          id: "decision-due-refresh-1",
          kind: "campaign-re-evaluation",
          outcome: "resume",
          intakeVersion: 1,
          applicableRule: "Refresh only stale evidence listed as capable of changing an active decision.",
          triggerEntryIds: ["freshness-admin-burden"],
          affectedOpportunityIds: [],
          supersededDecisionIds: ["decision-reevaluate-admin-freshness-1"],
          rationale: "The refresh boundary has arrived for evidence linked to the active freshness decision.",
          confidence: {
            level: "medium",
            limitingFactors: ["Replacement evidence remains to be recorded."],
          },
          limitations: ["Only the listed administrative observation is in scope."],
          decidedAt: "2026-09-03T09:01:00.000Z",
        },
      },
    },
  });
  assert.equal(
    refreshReevaluation.code,
    0,
    `${refreshReevaluation.stderr}\n${JSON.stringify(refreshReevaluation.response)}`,
  );
  assert.deepEqual(refreshReevaluation.response.result.invalidatedDecisionIds, [
    "decision-reevaluate-admin-freshness-1",
  ]);
});
