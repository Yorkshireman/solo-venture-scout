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
 */
async function createCampaignWithObservation(kernelPath, campaignPath) {
  const commands = [
    {
      envelopeVersion: "0.1.0",
      requestId: "create-reasoning-campaign-1",
      command: "createCampaign",
      payload: {
        campaignPath,
        campaignId: "campaign-evidence-reasoning",
        coordinatorId: "coordinator-primary",
        createdAt: "2026-09-01T09:00:00.000Z",
        leaseExpiresAt: "2099-09-01T09:30:00.000Z",
      },
    },
    {
      envelopeVersion: "0.1.0",
      requestId: "confirm-reasoning-intake-1",
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
            boundaries: { state: "known", value: "Public sources only" },
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
    },
    publicResearchReservationCommand(campaignPath, {
      requestId: "reserve-reasoning-source-1",
      payload: { reservation: { id: "reasoning-source-reservation-1" } },
    }),
    {
      envelopeVersion: "0.1.0",
      requestId: "record-reasoning-observation-1",
      command: "recordPublicResearchObservation",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        recordedAt: "2026-09-01T09:15:00.000Z",
        reservationId: "reasoning-source-reservation-1",
        source: {
          id: "source-late-payments",
          retrievalMode: "public-web",
          url: "https://example.com/late-payments-report",
          publisher: "Example Research Institute",
          originator: null,
          publishedAt: "2026-06-01",
          updatedAt: null,
          accessedAt: "2026-09-01T09:14:00.000Z",
          exactLocator: "Results, paragraph 2",
        },
        observation: {
          id: "observation-follow-up-time",
          text: "Surveyed businesses reported staff time spent following up overdue invoices.",
          sourceId: "source-late-payments",
          exactLocator: "Results, paragraph 2",
        },
      },
    },
  ];

  for (const command of commands) {
    const result = await runKernel(kernelPath, command);
    assert.equal(result.code, 0, result.stderr);
  }
}

/**
 * @param {string} kernelPath
 * @param {string} campaignPath
 */
async function recordChallengingObservation(kernelPath, campaignPath) {
  const reserved = await runKernel(
    kernelPath,
    publicResearchReservationCommand(campaignPath, {
      requestId: "reserve-challenging-source-1",
      payload: {
        reservedAt: "2026-09-01T09:16:00.000Z",
        reservation: { id: "challenging-source-reservation-1" },
      },
    }),
  );
  assert.equal(reserved.code, 0, reserved.stderr);
  const recorded = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "record-challenging-observation-1",
    command: "recordPublicResearchObservation",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T09:18:00.000Z",
      reservationId: "challenging-source-reservation-1",
      source: {
        id: "source-accounting-survey",
        retrievalMode: "public-web",
        url: "https://example.org/accounting-survey",
        publisher: "Example Trade Association",
        originator: "Example Research Institute",
        publishedAt: "2024-02-01",
        updatedAt: null,
        accessedAt: "2026-09-01T09:17:00.000Z",
        exactLocator: "Table 4, row 7",
      },
      observation: {
        id: "observation-automated-follow-up",
        text: "Respondents using automated reminders reported little staff time spent on invoice follow-up.",
        sourceId: "source-accounting-survey",
        exactLocator: "Table 4, row 7",
      },
    },
  });
  assert.equal(recorded.code, 0, recorded.stderr);
}

test("an Inference preserves its scope, reasoning, material evidence links, and limited confidence", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-reasoning-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "evidence-reasoning");
  await createCampaignWithObservation(kernelPath, campaignPath);

  const inference = {
    type: "inference",
    id: "inference-late-payments-have-admin-cost",
    text: "Late-payment follow-up creates an administrative Costly Problem for some small businesses.",
    scope: "Small businesses represented by the cited survey.",
    reasoning: "Reported staff follow-up time is a material operational consequence, but the Source does not establish its size for all small businesses.",
    supportingEntryIds: ["observation-follow-up-time"],
    challengingEntryIds: [],
    confidence: {
      level: "medium",
      limitingFactors: ["Only one Source Lineage is represented."],
    },
  };
  const recorded = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "record-evidence-reasoning-1",
    command: "recordEvidenceReasoning",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T09:20:00.000Z",
      entries: [inference],
    },
  });

  assert.equal(recorded.code, 0, recorded.stderr);
  assert.equal(recorded.response.result.recorded, true);
  assert.deepEqual(recorded.response.result.evidenceLedger.inferences, [inference]);
  assert.equal(
    Object.hasOwn(recorded.response.result.evidenceLedger.observations[0], "confidence"),
    false,
  );
  assert.deepEqual(recorded.response.result.workView.reasoning, {
    evidenceLedgerPath: "evidence-ledger.json",
    activeInferenceIds: ["inference-late-payments-have-admin-cost"],
    openEvidenceGapIds: [],
    unresolvedContradictionIds: [],
    correctionIds: [],
  });
});

test("reasoning keeps unsupported premises, provenance assessments, and incompatible evidence inspectable", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-audit-reasoning-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "auditable-reasoning");
  await createCampaignWithObservation(kernelPath, campaignPath);
  await recordChallengingObservation(kernelPath, campaignPath);

  const entries = [
    {
      type: "source-lineage",
      id: "lineage-shared-research-institute",
      sourceIds: ["source-late-payments", "source-accounting-survey"],
      sharedOrigin: "The same research institute produced both underlying surveys.",
      relationship: "shared-authorship",
      independence: "dependent",
    },
    {
      type: "source-assessment",
      id: "assessment-follow-up-time-for-cost",
      sourceId: "source-late-payments",
      observationId: "observation-follow-up-time",
      use: "Assess whether late-payment follow-up is a current Costly Problem.",
      credibility: {
        level: "medium",
        rationale: "The survey directly asked businesses about the workflow.",
        limitations: ["The sampling method is not reported."],
      },
      freshness: {
        level: "high",
        timeSensitivity: "Invoice workflows may change as automation adoption changes.",
        rationale: "The survey predates this assessment by three months.",
        limitations: ["No update date is available."],
      },
    },
    {
      type: "evidence-gap",
      id: "gap-independent-admin-cost",
      question: "Does an independent Source quantify the administrative cost of invoice follow-up?",
      affectedDecisionIds: ["decision-form-late-payment-opportunity"],
      resolutionCriteria: "A methodologically described independent study quantifies staff time or expenditure.",
      resolutionMethod: "Find and examine an independent study of small-business invoice collection.",
      status: "open",
      resolution: null,
    },
    {
      type: "assumption",
      id: "assumption-follow-up-cost-is-material",
      text: "The reported follow-up time is financially material for the represented businesses.",
      scope: "Businesses represented by the late-payments survey.",
      evidenceGapId: "gap-independent-admin-cost",
    },
    {
      type: "inference",
      id: "inference-manual-follow-up-can-be-costly",
      text: "Manual invoice follow-up can create a Costly Problem where automation is absent.",
      scope: "Small businesses without automated invoice reminders.",
      reasoning: "One Observation reports staff effort while the challenging Observation narrows the claim to workflows without automation.",
      supportingEntryIds: ["observation-follow-up-time"],
      challengingEntryIds: ["observation-automated-follow-up"],
      confidence: {
        level: "low",
        limitingFactors: ["The Sources share authorship and are not independent."],
      },
    },
    {
      type: "contradiction",
      id: "contradiction-follow-up-time",
      entryIds: ["observation-follow-up-time", "observation-automated-follow-up"],
      disputedProposition: "Invoice follow-up consumes material staff time.",
      disputedScope: "Manual and automated reminder workflows may have different outcomes.",
      attemptedReconciliation: "Narrow the proposition by automation status; the Sources do not report comparable subgroups.",
      resolutionStatus: "unresolved",
      resolution: null,
    },
  ];
  const recorded = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "record-auditable-reasoning-1",
    command: "recordEvidenceReasoning",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T09:25:00.000Z",
      entries,
    },
  });

  assert.equal(recorded.code, 0, recorded.stderr);
  const ledger = recorded.response.result.evidenceLedger;
  assert.deepEqual(ledger.sourceLineages, [entries[0]]);
  assert.deepEqual(ledger.sourceAssessments, [entries[1]]);
  assert.deepEqual(ledger.evidenceGaps, [entries[2]]);
  assert.deepEqual(ledger.assumptions, [entries[3]]);
  assert.deepEqual(ledger.inferences, [entries[4]]);
  assert.deepEqual(ledger.contradictions, [entries[5]]);
  assert.equal(Object.hasOwn(ledger.assumptions[0], "confidence"), false);
  assert.equal(Object.hasOwn(ledger.assumptions[0], "supportingEntryIds"), false);
  assert.deepEqual(recorded.response.result.workView.reasoning, {
    evidenceLedgerPath: "evidence-ledger.json",
    activeInferenceIds: ["inference-manual-follow-up-can-be-costly"],
    openEvidenceGapIds: ["gap-independent-admin-cost"],
    unresolvedContradictionIds: ["contradiction-follow-up-time"],
    correctionIds: [],
  });
});

test("Corrections supersede and retract reasoning without deleting its historical basis", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-corrections-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "corrected-reasoning");
  await createCampaignWithObservation(kernelPath, campaignPath);

  const originalInference = {
    type: "inference",
    id: "inference-admin-cost-original",
    text: "Invoice follow-up is a Costly Problem for small businesses.",
    scope: "All small businesses.",
    reasoning: "The cited survey reports staff follow-up time.",
    supportingEntryIds: ["observation-follow-up-time"],
    challengingEntryIds: [],
    confidence: {
      level: "medium",
      limitingFactors: ["Only one survey is available."],
    },
  };
  const initial = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "record-original-inference-1",
    command: "recordEvidenceReasoning",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T09:20:00.000Z",
      entries: [originalInference],
    },
  });
  assert.equal(initial.code, 0, initial.stderr);

  const replacementInference = {
    ...originalInference,
    id: "inference-admin-cost-narrowed",
    text: "Invoice follow-up may be a Costly Problem for businesses represented by the survey.",
    scope: "Businesses represented by the cited survey.",
    confidence: {
      level: "low",
      limitingFactors: ["Material cost and broader applicability remain unmeasured."],
    },
  };
  const supersedingCorrection = {
    type: "correction",
    id: "correction-narrow-admin-cost",
    targetEntryId: "inference-admin-cost-original",
    action: "supersede",
    replacementEntryId: "inference-admin-cost-narrowed",
    rationale: "The original scope extended beyond the represented survey population.",
  };
  const superseded = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "supersede-original-inference-1",
    command: "recordEvidenceReasoning",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T09:25:00.000Z",
      entries: [replacementInference, supersedingCorrection],
    },
  });
  assert.equal(superseded.code, 0, superseded.stderr);
  assert.deepEqual(superseded.response.result.workView.reasoning.activeInferenceIds, [
    "inference-admin-cost-narrowed",
  ]);

  const retractingCorrection = {
    type: "correction",
    id: "correction-retract-admin-cost",
    targetEntryId: "inference-admin-cost-narrowed",
    action: "retract",
    replacementEntryId: null,
    rationale: "The survey reports staff time but does not establish a material financial consequence.",
  };
  const retracted = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "retract-narrowed-inference-1",
    command: "recordEvidenceReasoning",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T09:30:00.000Z",
      entries: [retractingCorrection],
    },
  });
  assert.equal(retracted.code, 0, retracted.stderr);

  const resumed = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "resume-corrected-reasoning-1",
    command: "resumeCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      resumedAt: "2026-09-01T10:00:00.000Z",
      leaseExpiresAt: "2099-09-01T10:30:00.000Z",
    },
  });
  assert.equal(resumed.code, 0, resumed.stderr);
  const inspected = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "inspect-corrected-reasoning-1",
    command: "inspectCampaign",
    payload: { campaignPath },
  });

  assert.equal(inspected.code, 0, inspected.stderr);
  assert.deepEqual(inspected.response.result.evidenceLedger.inferences, [
    originalInference,
    replacementInference,
  ]);
  assert.deepEqual(inspected.response.result.evidenceLedger.corrections, [
    supersedingCorrection,
    retractingCorrection,
  ]);
  assert.deepEqual(inspected.response.result.workView.reasoning, {
    evidenceLedgerPath: "evidence-ledger.json",
    activeInferenceIds: [],
    openEvidenceGapIds: [],
    unresolvedContradictionIds: [],
    correctionIds: [
      "correction-narrow-admin-cost",
      "correction-retract-admin-cost",
    ],
  });
});

test("retracted reasoning receives no evidential credit in a later Inference", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-retracted-evidence-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "retracted-evidence");
  await createCampaignWithObservation(kernelPath, campaignPath);

  const originalInference = {
    type: "inference",
    id: "inference-retracted-admin-cost",
    text: "Invoice follow-up is a material administrative cost.",
    scope: "Businesses represented by the cited survey.",
    reasoning: "The Observation reports staff time spent on follow-up.",
    supportingEntryIds: ["observation-follow-up-time"],
    challengingEntryIds: [],
    confidence: {
      level: "low",
      limitingFactors: ["The financial consequence is not quantified."],
    },
  };
  const seeded = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "seed-retracted-inference-1",
    command: "recordEvidenceReasoning",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T09:20:00.000Z",
      entries: [
        originalInference,
        {
          type: "correction",
          id: "correction-retract-unsupported-cost",
          targetEntryId: "inference-retracted-admin-cost",
          action: "retract",
          replacementEntryId: null,
          rationale: "The Observation does not quantify a material financial consequence.",
        },
      ],
    },
  });
  assert.equal(seeded.code, 0, seeded.stderr);
  const recordsBefore = await readFile(path.join(campaignPath, "records.jsonl"));

  const result = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "reuse-retracted-inference-1",
    command: "recordEvidenceReasoning",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T09:25:00.000Z",
      entries: [
        {
          ...originalInference,
          id: "inference-built-on-retracted-claim",
          text: "The reported administrative cost supports an Opportunity.",
          reasoning: "This would depend on the retracted cost Inference.",
          supportingEntryIds: ["inference-retracted-admin-cost"],
        },
      ],
    },
  });

  assert.equal(result.code, 3);
  assert.equal(result.response.error.code, "SVS-EVIDENCE-LINK-INVALID");
  assert.deepEqual(await readFile(path.join(campaignPath, "records.jsonl")), recordsBefore);
});

test("the reasoning contract rejects blended evidence types without mutation", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-reasoning-invalid-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "invalid-reasoning");
  await createCampaignWithObservation(kernelPath, campaignPath);
  const recordsBefore = await readFile(path.join(campaignPath, "records.jsonl"));

  const result = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "record-invalid-reasoning-1",
    command: "recordEvidenceReasoning",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T09:20:00.000Z",
      entries: [
        {
          type: "source-lineage",
          id: "lineage-falsely-independent",
          sourceIds: ["source-late-payments", "second-source-id"],
          sharedOrigin: "Both Sources reproduce the same dataset.",
          relationship: "shared-dataset",
          independence: "independent",
        },
        {
          type: "assumption",
          id: "assumption-with-evidential-credit",
          text: "Follow-up time is financially material.",
          scope: "All small businesses.",
          evidenceGapId: "missing-gap",
          confidence: { level: "high", limitingFactors: [] },
        },
        {
          type: "inference",
          id: "inference-with-invented-confidence",
          text: "Invoice follow-up is costly.",
          scope: "Surveyed businesses.",
          reasoning: "The Observation reports staff time.",
          supportingEntryIds: ["observation-follow-up-time"],
          challengingEntryIds: [],
          confidence: { level: "certain", limitingFactors: [] },
        },
      ],
    },
  });

  assert.equal(result.code, 3);
  assert.equal(result.response.error.code, "SVS-EVIDENCE-REASONING-INVALID");
  assert.match(result.response.error.details.join("\n"), /dependent/i);
  assert.match(result.response.error.details.join("\n"), /unsupported Assumption/i);
  assert.match(result.response.error.details.join("\n"), /unknown, low, medium, or high/i);
  assert.deepEqual(await readFile(path.join(campaignPath, "records.jsonl")), recordsBefore);
});
