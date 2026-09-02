import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
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
 * @param {Array<Record<string, unknown>>} [statements]
 */
async function createDiscoveryCampaign(kernelPath, campaignPath, statements = []) {
  const commands = [
    {
      envelopeVersion: "0.1.0",
      requestId: "create-discovery-campaign-1",
      command: "createCampaign",
      payload: {
        campaignPath,
        campaignId: "campaign-discovery",
        coordinatorId: "coordinator-primary",
        createdAt: "2026-09-01T09:00:00.000Z",
        leaseExpiresAt: "2099-09-01T10:00:00.000Z",
      },
    },
    {
      envelopeVersion: "0.1.0",
      requestId: "confirm-discovery-intake-1",
      command: "confirmCampaignIntake",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        confirmedAt: "2026-09-01T09:05:00.000Z",
        intake: {
          version: 1,
          explicitlyConfirmed: true,
          developerProfileSnapshot: {
            capturedAt: "2026-09-01T09:04:00.000Z",
            capacity: { state: "known", value: "15 hours per week" },
            capabilities: { state: "known", value: "TypeScript and operations software" },
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
          statements,
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
  ];

  for (const command of commands) {
    const result = await runKernel(kernelPath, command);
    assert.equal(result.code, 0, result.stderr);
  }

  const observations = [
    {
      reservationId: "reservation-occupation-map",
      sourceId: "source-occupation-map",
      observationId: "observation-coordination-workaround",
      url: "https://example.com/occupation-map",
      publisher: "Example Labour Institute",
      locator: "Occupation table, row 12",
      text: "Dispatch coordinators reported repeated manual reconciliation before assigning urgent work.",
    },
    {
      reservationId: "reservation-procurement-map",
      sourceId: "source-procurement-map",
      observationId: "observation-procurement-escalation",
      url: "https://example.org/procurement-map",
      publisher: "Example Procurement Authority",
      locator: "Award notices, sample 4",
      text: "Small suppliers recorded paid specialist review after tender documents were rejected.",
    },
  ];

  for (const [index, observation] of observations.entries()) {
    const reservedAt = `2026-09-01T09:${String(10 + index * 3).padStart(2, "0")}:00.000Z`;
    const reserved = await runKernel(
      kernelPath,
      publicResearchReservationCommand(campaignPath, {
        requestId: `reserve-discovery-source-${index + 1}`,
        payload: {
          reservedAt,
          reservation: {
            id: observation.reservationId,
            purpose: "Sample an external map of economic activity",
          },
        },
      }),
    );
    assert.equal(reserved.code, 0, reserved.stderr);

    const recorded = await runKernel(kernelPath, {
      envelopeVersion: "0.1.0",
      requestId: `record-discovery-source-${index + 1}`,
      command: "recordPublicResearchObservation",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        recordedAt: `2026-09-01T09:${String(12 + index * 3).padStart(2, "0")}:00.000Z`,
        reservationId: observation.reservationId,
        source: {
          id: observation.sourceId,
          retrievalMode: "public-web",
          url: observation.url,
          publisher: observation.publisher,
          originator: null,
          publishedAt: "2026-06-01",
          updatedAt: null,
          accessedAt: `2026-09-01T09:${String(11 + index * 3).padStart(2, "0")}:00.000Z`,
          exactLocator: observation.locator,
        },
        observation: {
          id: observation.observationId,
          text: observation.text,
          sourceId: observation.sourceId,
          exactLocator: observation.locator,
        },
      },
    });
    assert.equal(recorded.code, 0, recorded.stderr);
  }
}

/**
 * @param {{
 *   id: string;
 *   customerGroup: string;
 *   situation: string;
 *   problemFamily: string;
 *   sweepId: string;
 *   observationId: string;
 *   familiarDomain?: boolean;
 *   comparedWithThreadIds?: string[];
 * }} input
 */
const sourceLedThread = ({
  id,
  customerGroup,
  situation,
  problemFamily,
  sweepId,
  observationId,
  familiarDomain = false,
  comparedWithThreadIds = [],
}) => ({
  id,
  customerGroup,
  situation,
  problemFamily,
  familiarDomain,
  origin: {
    kind: "source-led",
    sweepId,
    observationIds: [observationId],
  },
  problemSignal: {
    materialConsequence: {
      kind: "wasted-skilled-time",
      description: "Skilled staff time is diverted from paid operational work.",
      observationIds: [observationId],
    },
    committedBehavior: {
      kind: "workaround-effort",
      description: "Operators repeatedly perform a manual reconciliation workaround.",
      observationIds: [observationId],
    },
  },
  noveltyCheck: {
    comparedWithThreadIds,
    result: "distinct",
    rationale: "The customer, workflow, and costly consequence form a distinct thread.",
  },
  disposition: {
    status: "retained",
    rationale: "The cited behavior warrants equal shallow research.",
  },
});

/**
 * @param {string} campaignPath
 * @returns {any}
 */
function discoveryTrancheCommand(campaignPath) {
  return {
    envelopeVersion: "0.1.0",
    requestId: "record-discovery-tranche-1",
    command: "recordDiscoveryTranche",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T09:20:00.000Z",
      tranche: {
        id: "discovery-tranche-1",
        ordinal: 1,
        threadSlots: 5,
        noveltyProbeSlots: 1,
        shallowResearchSourceUnitsPerRetainedThread: 1,
        familiarDomainException: null,
        sweeps: [
          {
            id: "sweep-occupation-map",
            sourceFamily: {
              id: "source-family-occupation-map",
              name: "Occupation and task maps",
              economicActivityMap: "Published occupation workflow taxonomy",
            },
            sourceIds: ["source-occupation-map"],
            sampling: {
              frameOrigin: "external-map",
              method: "systematic",
              frame: "Dispatch and coordination occupations in rows 1 through 40",
              selectionRule: "Inspect every fourth row from a fixed first row",
              sampleSize: 10,
              randomSeed: null,
            },
          },
          {
            id: "sweep-procurement-map",
            sourceFamily: {
              id: "source-family-procurement-map",
              name: "Procurement and spending maps",
              economicActivityMap: "Published public award notices",
            },
            sourceIds: ["source-procurement-map"],
            sampling: {
              frameOrigin: "external-map",
              method: "seeded-random",
              frame: "Service award notices published in the sampled month",
              selectionRule: "Sample notice identifiers using the recorded seed",
              sampleSize: 12,
              randomSeed: "discovery-tranche-1-procurement",
            },
          },
        ],
        threads: [
          sourceLedThread({
            id: "thread-dispatch-reconciliation",
            customerGroup: "Independent dispatch coordinators",
            situation: "Assigning urgent field work across changing schedules",
            problemFamily: "Repeated reconciliation of inconsistent availability data",
            sweepId: "sweep-occupation-map",
            observationId: "observation-coordination-workaround",
            familiarDomain: true,
          }),
          sourceLedThread({
            id: "thread-specialist-tender-review",
            customerGroup: "Small specialist suppliers",
            situation: "Submitting regulated public tenders",
            problemFamily: "Costly document rejection and specialist rework",
            sweepId: "sweep-procurement-map",
            observationId: "observation-procurement-escalation",
            comparedWithThreadIds: ["thread-dispatch-reconciliation"],
          }),
          sourceLedThread({
            id: "thread-subcontractor-evidence",
            customerGroup: "Small subcontractors",
            situation: "Supplying evidence for public award compliance",
            problemFamily: "Repeated evidence collation before deadlines",
            sweepId: "sweep-procurement-map",
            observationId: "observation-procurement-escalation",
            comparedWithThreadIds: ["thread-dispatch-reconciliation"],
          }),
          sourceLedThread({
            id: "thread-shift-handover",
            customerGroup: "Independent field-service operators",
            situation: "Handing urgent work between shifts",
            problemFamily: "Manual reconstruction of incomplete work context",
            sweepId: "sweep-occupation-map",
            observationId: "observation-coordination-workaround",
            comparedWithThreadIds: ["thread-dispatch-reconciliation"],
          }),
          {
            id: "thread-novelty-chain-of-custody",
            customerGroup: "Small equipment rental depots",
            situation: "Transferring returned equipment between contractors",
            problemFamily: "Unclear chain of custody during handoffs",
            familiarDomain: false,
            origin: {
              kind: "novelty-probe",
              method: "cross-domain-transfer",
              derivation: "Transfer exception-ledger practices from cold-chain logistics to equipment handoffs.",
              assumption: {
                type: "assumption",
                id: "assumption-rental-handoff-loss",
                text: "Equipment handoff ambiguity causes a material loss for small depots.",
                scope: "Small equipment rental depots using multiple contractors.",
                evidenceGapId: "gap-rental-handoff-loss",
              },
              evidenceGap: {
                type: "evidence-gap",
                id: "gap-rental-handoff-loss",
                question: "Does handoff ambiguity cause measurable loss or committed workaround effort?",
                affectedDecisionIds: ["decision-form-rental-handoff-opportunity"],
                resolutionCriteria: "Independent behavioral evidence identifies material loss or recurring workaround effort.",
                resolutionMethod: "Sample public operational reports and workflow evidence from rental depots.",
                status: "open",
                resolution: null,
              },
            },
            noveltyCheck: {
              comparedWithThreadIds: ["thread-dispatch-reconciliation"],
              result: "distinct",
              rationale: "The transferred workflow and customer group do not duplicate the source-led thread.",
            },
            disposition: {
              status: "retained",
              rationale: "Use the reserved probe slot without granting evidential credit.",
            },
          },
        ],
      },
    },
  };
}

test("a Discovery Tranche records diverse coverage and equal shallow allowances", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-discovery-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "discovery-campaign");
  await createDiscoveryCampaign(kernelPath, campaignPath);

  const result = await runKernel(kernelPath, discoveryTrancheCommand(campaignPath));

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.response.ok, true);
  assert.equal(result.response.result.recorded, true);
  assert.deepEqual(result.response.result.workView.discovery.coverage, {
    discoveryTranches: 1,
    discoverySweeps: 2,
    discoverySweepCap: 4,
    sourceFamilies: [
      "source-family-occupation-map",
      "source-family-procurement-map",
    ],
    sourceFamilyMinimum: 3,
  });
  assert.deepEqual(result.response.result.workView.discovery.allowances, {
    threadSlots: 5,
    noveltyProbeSlots: 1,
    noveltyProbeShare: 0.2,
    shallowResearchSourceUnitsPerRetainedThread: 1,
  });
  assert.equal(result.response.result.workView.discovery.retainedThreads.length, 5);
  assert.equal(result.response.result.workView.discovery.droppedThreads.length, 0);
  const retainedThreads = /** @type {any[]} */ (
    result.response.result.workView.discovery.retainedThreads
  );
  assert.deepEqual(
    retainedThreads.map((thread) => ({
      id: thread.id,
      allowance: thread.shallowResearchSourceUnits,
      evidenceCredit: thread.evidenceCredit,
      comparisonBonus: thread.comparisonBonus,
    })),
    [
      {
        id: "thread-dispatch-reconciliation",
        allowance: 1,
        evidenceCredit: "source-led",
        comparisonBonus: "none",
      },
      {
        id: "thread-specialist-tender-review",
        allowance: 1,
        evidenceCredit: "source-led",
        comparisonBonus: "none",
      },
      {
        id: "thread-subcontractor-evidence",
        allowance: 1,
        evidenceCredit: "source-led",
        comparisonBonus: "none",
      },
      {
        id: "thread-shift-handover",
        allowance: 1,
        evidenceCredit: "source-led",
        comparisonBonus: "none",
      },
      {
        id: "thread-novelty-chain-of-custody",
        allowance: 1,
        evidenceCredit: "none",
        comparisonBonus: "none",
      },
    ],
  );

  const inspected = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "inspect-discovery-campaign-1",
    command: "inspectCampaign",
    payload: { campaignPath },
  });
  assert.equal(inspected.code, 0, inspected.stderr);
  const noveltyOrigin = /** @type {any} */ (
    discoveryTrancheCommand(campaignPath).payload.tranche.threads[4].origin
  );
  assert.deepEqual(inspected.response.result.evidenceLedger.assumptions, [
    noveltyOrigin.assumption,
  ]);
  assert.deepEqual(inspected.response.result.evidenceLedger.evidenceGaps, [
    noveltyOrigin.evidenceGap,
  ]);
});

test("Discovery Tranches enforce source-led, novelty, and familiar-domain boundaries", async (t) => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-discovery-guards-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "guarded-discovery");
  await createDiscoveryCampaign(kernelPath, campaignPath);

  /** @type {Array<{name: string, mutate: (command: any) => void, code: string}>} */
  const invalidCases = [
    {
      name: "reserves exactly twenty percent for Novelty Probes",
      mutate(command) {
        command.payload.tranche.noveltyProbeSlots = 2;
      },
      code: "SVS-DISCOVERY-INVALID",
    },
    {
      name: "does not consume a reserved Novelty Probe slot with an ordinary thread",
      mutate(command) {
        command.payload.tranche.threads[4] = structuredClone(
          command.payload.tranche.threads[0],
        );
        command.payload.tranche.threads[4].id = "thread-ordinary-in-probe-slot";
        command.payload.tranche.threads[4].familiarDomain = false;
      },
      code: "SVS-DISCOVERY-INVALID",
    },
    {
      name: "cannot smuggle a proposed product into an Exploration Thread",
      mutate(command) {
        command.payload.tranche.threads[0].proposedProduct = "dispatch dashboard";
      },
      code: "SVS-DISCOVERY-INVALID",
    },
    {
      name: "does not treat a complaint as committed behavior",
      mutate(command) {
        command.payload.tranche.threads[0].problemSignal.committedBehavior.kind =
          "complaint";
      },
      code: "SVS-DISCOVERY-INVALID",
    },
    {
      name: "links source-led signals to sampled Observations",
      mutate(command) {
        command.payload.tranche.threads[0].origin.observationIds = [
          "observation-not-sampled",
        ];
      },
      code: "SVS-DISCOVERY-INVARIANT-VIOLATION",
    },
    {
      name: "checks every later first-tranche thread against an earlier thread",
      mutate(command) {
        command.payload.tranche.threads[1].noveltyCheck.comparedWithThreadIds = [];
      },
      code: "SVS-DISCOVERY-INVARIANT-VIOLATION",
    },
    {
      name: "caps familiar-domain retention at one third",
      mutate(command) {
        command.payload.tranche.threads[1].familiarDomain = true;
      },
      code: "SVS-DISCOVERY-INVARIANT-VIOLATION",
    },
    {
      name: "counts dropped initial threads in the familiar-domain cap",
      mutate(command) {
        for (const index of [1, 2]) {
          command.payload.tranche.threads[index].familiarDomain = true;
          command.payload.tranche.threads[index].noveltyCheck = {
            comparedWithThreadIds: ["thread-dispatch-reconciliation"],
            result: "overlaps-existing",
            rationale: "The familiar-domain thread overlaps the first thread.",
          };
          command.payload.tranche.threads[index].disposition = {
            status: "dropped",
            rationale: "Drop the overlap after counting initial discovery coverage.",
          };
        }
      },
      code: "SVS-DISCOVERY-INVARIANT-VIOLATION",
    },
  ];

  for (const [index, invalidCase] of invalidCases.entries()) {
    await t.test(invalidCase.name, async () => {
      const command = structuredClone(discoveryTrancheCommand(campaignPath));
      command.requestId = `invalid-discovery-${index + 1}`;
      invalidCase.mutate(command);

      const result = await runKernel(kernelPath, command);

      assert.equal(result.code, 3);
      assert.equal(result.response.ok, false);
      assert.equal(result.response.error.code, invalidCase.code);
    });
  }

  await t.test("records a Campaign Intake-driven familiar-domain exception", async () => {
    const exceptionCampaignPath = path.join(storagePath, "exception-discovery");
    await createDiscoveryCampaign(kernelPath, exceptionCampaignPath, [
      {
        id: "preference-familiar-operations",
        text: "Prefer extra coverage of familiar operations workflows",
        classification: "preference",
        importance: "important",
      },
    ]);
    const command = discoveryTrancheCommand(exceptionCampaignPath);
    command.requestId = "record-discovery-with-familiar-exception";
    command.payload.tranche.threads[1].familiarDomain = true;
    command.payload.tranche.familiarDomainException = {
      intakeStatementId: "preference-familiar-operations",
      rationale: "The confirmed preference warrants extra familiar-domain coverage.",
    };

    const result = await runKernel(kernelPath, command);

    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(result.response.result.workView.discovery.familiarDomain, {
      familiarThreads: 2,
      totalInitialThreads: 5,
      maximumWithoutException: 1,
      exception: command.payload.tranche.familiarDomainException,
    });
  });

  await t.test("shows dropped overlaps separately from retained threads", async () => {
    const droppedCampaignPath = path.join(storagePath, "dropped-discovery");
    await createDiscoveryCampaign(kernelPath, droppedCampaignPath);
    const command = discoveryTrancheCommand(droppedCampaignPath);
    command.requestId = "record-discovery-with-dropped-overlap";
    command.payload.tranche.threads[3].noveltyCheck = {
      comparedWithThreadIds: ["thread-dispatch-reconciliation"],
      result: "overlaps-existing",
      rationale: "The customer, workflow, and consequence duplicate the earlier thread.",
    };
    command.payload.tranche.threads[3].disposition = {
      status: "dropped",
      rationale: "Drop the overlapping Exploration Thread after the novelty check.",
    };

    const result = await runKernel(kernelPath, command);

    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.response.result.workView.discovery.retainedThreads.length, 4);
    assert.deepEqual(result.response.result.workView.discovery.droppedThreads, [
      {
        id: "thread-shift-handover",
        customerGroup: "Independent field-service operators",
        situation: "Handing urgent work between shifts",
        problemFamily: "Manual reconstruction of incomplete work context",
        origin: "source-led",
        familiarDomain: false,
        rationale: "Drop the overlapping Exploration Thread after the novelty check.",
      },
    ]);
  });
});

test("Discovery Tranches are sequential, idempotent, and bounded by the sweep cap", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-discovery-sequence-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "sequential-discovery");
  await createDiscoveryCampaign(kernelPath, campaignPath);

  const first = discoveryTrancheCommand(campaignPath);
  const firstResult = await runKernel(kernelPath, first);
  assert.equal(firstResult.code, 0, firstResult.stderr);

  const unequalAllowance = structuredClone(first);
  unequalAllowance.requestId = "record-discovery-tranche-unequal-allowance";
  unequalAllowance.payload.tranche.id = "discovery-tranche-2-unequal";
  unequalAllowance.payload.tranche.ordinal = 2;
  unequalAllowance.payload.tranche.shallowResearchSourceUnitsPerRetainedThread = 2;
  unequalAllowance.payload.tranche.sweeps[0].id = "sweep-occupation-map-unequal";
  unequalAllowance.payload.tranche.sweeps[1].id = "sweep-procurement-map-unequal";
  const unequalResult = await runKernel(kernelPath, unequalAllowance);
  assert.equal(unequalResult.code, 3);
  assert.equal(
    unequalResult.response.error.code,
    "SVS-DISCOVERY-INVARIANT-VIOLATION",
  );

  const second = structuredClone(first);
  second.requestId = "record-discovery-tranche-2";
  second.payload.tranche.id = "discovery-tranche-2";
  second.payload.tranche.ordinal = 2;
  for (const [index, sweep] of second.payload.tranche.sweeps.entries()) {
    const oldSweepId = sweep.id;
    sweep.id = `${oldSweepId}-second`;
    sweep.sourceFamily.id = `${sweep.sourceFamily.id}-second`;
    for (const thread of second.payload.tranche.threads) {
      if (thread.origin.kind === "source-led" && thread.origin.sweepId === oldSweepId) {
        thread.origin.sweepId = sweep.id;
      }
    }
  }
  for (const thread of second.payload.tranche.threads) {
    thread.id = `${thread.id}-second`;
    thread.familiarDomain = false;
    thread.noveltyCheck.comparedWithThreadIds = [
      "thread-dispatch-reconciliation",
    ];
    if (thread.origin.kind === "novelty-probe") {
      thread.origin.assumption.id = "assumption-rental-handoff-loss-second";
      thread.origin.assumption.evidenceGapId = "gap-rental-handoff-loss-second";
      thread.origin.evidenceGap.id = "gap-rental-handoff-loss-second";
      thread.origin.evidenceGap.affectedDecisionIds = [
        "decision-form-rental-handoff-opportunity-second",
      ];
    }
  }

  const uncheckedSecond = structuredClone(second);
  uncheckedSecond.requestId = "record-discovery-tranche-2-without-comparison";
  for (const thread of uncheckedSecond.payload.tranche.threads) {
    thread.noveltyCheck.comparedWithThreadIds = [];
  }
  const uncheckedResult = await runKernel(kernelPath, uncheckedSecond);
  assert.equal(uncheckedResult.code, 3);
  assert.equal(
    uncheckedResult.response.error.code,
    "SVS-DISCOVERY-INVARIANT-VIOLATION",
  );

  const renamedFamilies = structuredClone(second);
  renamedFamilies.requestId = "record-discovery-tranche-2-renamed-families";
  const renamedFamilyResult = await runKernel(kernelPath, renamedFamilies);
  assert.equal(renamedFamilyResult.code, 3);
  assert.equal(
    renamedFamilyResult.response.error.code,
    "SVS-DISCOVERY-INVARIANT-VIOLATION",
  );

  second.payload.tranche.sweeps[0].sourceFamily.name =
    "Regulatory and compliance maps";
  second.payload.tranche.sweeps[0].sourceFamily.economicActivityMap =
    "Published regulatory obligation taxonomy";
  second.payload.tranche.sweeps[1].sourceFamily.name =
    "Failure and incident maps";
  second.payload.tranche.sweeps[1].sourceFamily.economicActivityMap =
    "Published operational incident classifications";

  const secondResult = await runKernel(kernelPath, second);
  assert.equal(secondResult.code, 0, secondResult.stderr);
  assert.deepEqual(secondResult.response.result.workView.discovery.coverage, {
    discoveryTranches: 2,
    discoverySweeps: 4,
    discoverySweepCap: 4,
    sourceFamilies: [
      "source-family-occupation-map",
      "source-family-procurement-map",
      "source-family-occupation-map-second",
      "source-family-procurement-map-second",
    ],
    sourceFamilyMinimum: 3,
  });
  assert.deepEqual(secondResult.response.result.workView.discovery.allowances, {
    threadSlots: 10,
    noveltyProbeSlots: 2,
    noveltyProbeShare: 0.2,
    shallowResearchSourceUnitsPerRetainedThread: 1,
  });

  const replay = await runKernel(kernelPath, second);
  assert.equal(replay.code, 0, replay.stderr);
  assert.equal(replay.response.result.recorded, false);
  assert.equal(replay.response.result.workView.recordSequence, 16);

  const overCap = structuredClone(second);
  overCap.requestId = "record-discovery-tranche-3-over-cap";
  overCap.payload.tranche.id = "discovery-tranche-3";
  overCap.payload.tranche.ordinal = 3;
  for (const sweep of overCap.payload.tranche.sweeps) {
    sweep.id = `${sweep.id}-third`;
  }
  for (const thread of overCap.payload.tranche.threads) {
    thread.id = `${thread.id}-third`;
    if (thread.origin.kind === "source-led") {
      thread.origin.sweepId = `${thread.origin.sweepId}-third`;
    } else {
      thread.origin.assumption.id = "assumption-rental-handoff-loss-third";
      thread.origin.assumption.evidenceGapId = "gap-rental-handoff-loss-third";
      thread.origin.evidenceGap.id = "gap-rental-handoff-loss-third";
    }
  }
  const overCapResult = await runKernel(kernelPath, overCap);
  assert.equal(overCapResult.code, 3);
  assert.equal(
    overCapResult.response.error.code,
    "SVS-DISCOVERY-INVARIANT-VIOLATION",
  );
});
