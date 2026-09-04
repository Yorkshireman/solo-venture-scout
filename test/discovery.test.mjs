import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { publicResearchReservationCommand } from "./support/campaign-commands.mjs";
import {
  buildPackagedScout,
  runKernel,
  runProcess,
} from "./support/packaged-scout.mjs";

/**
 * @param {string} kernelPath
 * @param {Record<string, unknown>} command
 * @param {string} now
 */
async function runKernelAt(kernelPath, command, now) {
  const script = `
    import { executeCommand } from ${JSON.stringify(pathToFileURL(kernelPath).href)};
    const response = await executeCommand(${JSON.stringify(command)}, {
      nodeVersion: process.versions.node,
      probeWritableStorage: async () => true,
      now: () => ${JSON.stringify(now)}
    });
    process.stdout.write(JSON.stringify(response));
    if (!response.ok) process.exitCode = 3;
  `;
  const result = await runProcess(
    process.execPath,
    ["--input-type=module", "--eval", script],
  );
  return { ...result, response: JSON.parse(result.stdout) };
}

/**
 * @param {string} kernelPath
 * @param {string} campaignPath
 * @param {Array<Record<string, unknown>>} [statements]
 * @param {boolean} [includeFormationEvidence]
 * @param {Record<string, string>} [observationTextOverrides]
 * @param {Record<string, unknown> | undefined} [campaignIntake]
 */
export async function createDiscoveryCampaign(
  kernelPath,
  campaignPath,
  statements = [],
  includeFormationEvidence = false,
  observationTextOverrides = {},
  campaignIntake,
) {
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
        intake: campaignIntake ?? {
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
    {
      reservationId: "reservation-regulatory-map",
      sourceId: "source-regulatory-map",
      observationId: "observation-regulatory-rework",
      url: "https://example.net/regulatory-map",
      publisher: "Example Regulation Institute",
      locator: "Compliance workflow, row 8",
      text: "Small operators documented recurring evidence rework before compliance deadlines.",
    },
    {
      reservationId: "reservation-incident-map",
      sourceId: "source-incident-map",
      observationId: "observation-incident-escalation",
      url: "https://example.edu/incident-map",
      publisher: "Example Safety Observatory",
      locator: "Incident summary, section 3",
      text: "Field-service operators escalated incomplete handovers after work had to be repeated.",
    },
    {
      reservationId: "reservation-dispatch-study",
      sourceId: "source-dispatch-study",
      observationId: "observation-dispatch-time-loss",
      url: "https://research.example.com/dispatch-study",
      publisher: "Independent Operations Research Group",
      locator: "Time study, table 2",
      text: "Independent dispatch coordinators spent paid hours reconciling availability records each week.",
    },
    {
      reservationId: "reservation-supplier-study",
      sourceId: "source-supplier-study",
      observationId: "observation-supplier-review-spend",
      url: "https://research.example.org/supplier-study",
      publisher: "Independent Small Business Lab",
      locator: "Supplier interviews, finding 5",
      text: "Small specialist suppliers repeatedly paid external reviewers after tender rejections.",
    },
    {
      reservationId: "reservation-shallow-control-1",
      sourceId: "source-shallow-control-1",
      observationId: "observation-shallow-control-1",
      url: "https://data.example.com/shallow-control-1",
      publisher: "Independent Workflow Archive",
      locator: "Workflow sample, item 11",
      text: "The sampled workflow described a manual exception-handling step.",
    },
    {
      reservationId: "reservation-shallow-control-2",
      sourceId: "source-shallow-control-2",
      observationId: "observation-shallow-control-2",
      url: "https://data.example.org/shallow-control-2",
      publisher: "Independent Process Archive",
      locator: "Process sample, item 7",
      text: "The sampled process described recurring document checks before submission.",
    },
  ].slice(0, includeFormationEvidence ? undefined : 2);

  for (const observation of observations) {
    if (observation.observationId in observationTextOverrides) {
      observation.text = observationTextOverrides[observation.observationId];
    }
  }

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
            purpose:
              index < 4
                ? "Sample an external map of economic activity"
                : "Shallowly mine one retained Exploration Thread",
          },
        },
      }),
    );
    assert.equal(
      reserved.code,
      0,
      `${reserved.stderr}\n${JSON.stringify(reserved.response)}`,
    );

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

  if (includeFormationEvidence) {
    const classified = await runKernel(kernelPath, {
      envelopeVersion: "0.1.0",
      requestId: "record-opportunity-market-classification-inferences",
      command: "recordEvidenceReasoning",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        recordedAt: "2026-09-01T09:36:00.000Z",
        entries: [
          {
            type: "inference",
            id: "inference-dispatch-market-classification",
            text:
              observationTextOverrides["observation-shallow-control-1"] ??
              "The dispatch Opportunity's intended activity is an ordinary operational workflow.",
            scope: "opportunity-dispatch-reconciliation",
            reasoning:
              "The cited shallow classification evidence describes the intended activity for this Opportunity.",
            supportingEntryIds: ["observation-shallow-control-1"],
            challengingEntryIds: [],
            confidence: {
              level: "medium",
              limitingFactors: ["The classification evidence is bounded."],
            },
          },
          {
            type: "inference",
            id: "inference-tender-market-classification",
            text:
              "The tender-review Opportunity's intended activity is an ordinary operational workflow.",
            scope: "opportunity-specialist-tender-review",
            reasoning:
              "The cited shallow classification evidence describes the intended activity for this Opportunity.",
            supportingEntryIds: ["observation-shallow-control-2"],
            challengingEntryIds: [],
            confidence: {
              level: "medium",
              limitingFactors: ["The classification evidence is bounded."],
            },
          },
        ],
      },
    });
    assert.equal(classified.code, 0, classified.stderr);
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

/** @param {string} campaignPath */
function secondDiscoveryTrancheCommand(campaignPath) {
  const command = structuredClone(discoveryTrancheCommand(campaignPath));
  command.requestId = "record-discovery-tranche-2";
  command.payload.recordedAt = "2026-09-01T09:40:00.000Z";
  command.payload.tranche.id = "discovery-tranche-2";
  command.payload.tranche.ordinal = 2;
  command.payload.tranche.sweeps = [
    {
      id: "sweep-regulatory-map",
      sourceFamily: {
        id: "source-family-regulatory-map",
        name: "Regulatory and compliance maps",
        economicActivityMap: "Published regulatory obligation taxonomy",
      },
      sourceIds: ["source-regulatory-map"],
      sampling: {
        frameOrigin: "external-map",
        method: "stratified",
        frame: "Compliance workflows grouped by operator size",
        selectionRule: "Sample two workflows from each published size band",
        sampleSize: 8,
        randomSeed: null,
      },
    },
    {
      id: "sweep-incident-map",
      sourceFamily: {
        id: "source-family-incident-map",
        name: "Failure and incident maps",
        economicActivityMap: "Published operational incident summaries",
      },
      sourceIds: ["source-incident-map"],
      sampling: {
        frameOrigin: "external-map",
        method: "bounded-enumeration",
        frame: "Field-service incident summaries in the sampled quarter",
        selectionRule: "Inspect every incident in the bounded quarter",
        sampleSize: 10,
        randomSeed: null,
      },
    },
  ];
  command.payload.tranche.threads = [
    sourceLedThread({
      id: "thread-compliance-evidence-rework",
      customerGroup: "Small regulated operators",
      situation: "Preparing evidence before compliance deadlines",
      problemFamily: "Recurring evidence rework",
      sweepId: "sweep-regulatory-map",
      observationId: "observation-regulatory-rework",
      comparedWithThreadIds: ["thread-dispatch-reconciliation"],
    }),
    sourceLedThread({
      id: "thread-field-handover-repeat-work",
      customerGroup: "Independent field-service operators",
      situation: "Handing urgent work between shifts",
      problemFamily: "Repeated work after incomplete handovers",
      sweepId: "sweep-incident-map",
      observationId: "observation-incident-escalation",
      comparedWithThreadIds: ["thread-shift-handover"],
    }),
    sourceLedThread({
      id: "thread-compliance-deadline-checks",
      customerGroup: "Small regulated operators",
      situation: "Checking submissions before compliance deadlines",
      problemFamily: "Repeated manual document checks",
      sweepId: "sweep-regulatory-map",
      observationId: "observation-regulatory-rework",
      comparedWithThreadIds: ["thread-specialist-tender-review"],
    }),
    sourceLedThread({
      id: "thread-incident-context-rebuild",
      customerGroup: "Independent maintenance operators",
      situation: "Reconstructing context after an incident",
      problemFamily: "Manual reconstruction of incomplete work records",
      sweepId: "sweep-incident-map",
      observationId: "observation-incident-escalation",
      comparedWithThreadIds: ["thread-shift-handover"],
    }),
    {
      ...structuredClone(command.payload.tranche.threads[4]),
      id: "thread-novelty-regulatory-handoff",
      familiarDomain: false,
      noveltyCheck: {
        comparedWithThreadIds: ["thread-novelty-chain-of-custody"],
        result: "distinct",
        rationale: "The regulatory handoff context differs from the earlier rental probe.",
      },
      origin: {
        ...structuredClone(command.payload.tranche.threads[4].origin),
        assumption: {
          ...structuredClone(command.payload.tranche.threads[4].origin.assumption),
          id: "assumption-regulatory-handoff-loss",
          evidenceGapId: "gap-regulatory-handoff-loss",
        },
        evidenceGap: {
          ...structuredClone(command.payload.tranche.threads[4].origin.evidenceGap),
          id: "gap-regulatory-handoff-loss",
          affectedDecisionIds: ["decision-form-regulatory-handoff-opportunity"],
        },
      },
    },
  ];
  return command;
}

/**
 * @param {string} campaignPath
 * @returns {any}
 */
function opportunityFormationCommand(campaignPath) {
  /**
   * @param {string} id
   * @param {"formed" | "insufficient-evidence"} outcome
   * @param {string[]} evidenceEntryIds
   */
  const formationDecision = (id, outcome, evidenceEntryIds) => ({
    type: "campaign-decision",
    id,
    kind: "opportunity-formation",
    outcome,
    intakeVersion: 1,
    applicableRule:
      "Require a specific customer, situation, Costly Problem, behavioral Problem Signal, and two independent Source Lineages.",
    evidenceEntryIds,
    rationale:
      outcome === "formed"
        ? "Independent behavioral evidence supports the complete formation rule."
        : "The complete formation rule is not yet supported.",
    confidence: {
      level: outcome === "formed" ? "medium" : "low",
      limitingFactors: ["Public research does not establish validated demand."],
    },
    limitations: ["Buyer economics remain untested."],
    decidedAt: "2026-09-01T09:45:00.000Z",
  });
  /**
   * @param {{threadId: string, customer: string, situation: string, problem: string, observationId?: string, sourceId?: string}} input
   */
  const unsupportedAssessment = ({
    threadId,
    customer,
    situation,
    problem,
    observationId,
    sourceId,
  }) => {
    const decisionId = `decision-retain-${threadId}`;
    const observationIds = observationId === undefined ? [] : [observationId];
    return {
      id: `assessment-${threadId}`,
      explorationThreadIds: [threadId],
      customer,
      situation,
      costlyProblem: {
        description: problem,
        materialConsequence: "wasted-skilled-time",
        observationIds,
      },
      clusterBasis: {
        sharedCustomer: `The available evidence is scoped to ${customer}.`,
        sharedWorkflow: `The available evidence is scoped to ${situation}.`,
        sharedCostlyConsequence:
          "A material consequence remains insufficiently supported.",
      },
      supportingObservationIds: observationIds,
      behavioralProblemSignalObservationIds: observationIds,
      independentSourceLineages:
        sourceId === undefined
          ? []
          : [
              {
                id: `lineage-${threadId}`,
                sourceIds: [sourceId],
                rationale: "Only one assessed Source Lineage currently supports this thread.",
              },
            ],
      result: {
        kind: "exploration-thread",
        evidenceGaps: [
          {
            type: "evidence-gap",
            id: `gap-${threadId}-formation`,
            question: `Does independent behavioral evidence establish the Costly Problem for ${customer}?`,
            affectedDecisionIds: [decisionId],
            resolutionCriteria:
              "Two independent Source Lineages support committed behavior and a material consequence.",
            resolutionMethod:
              "Sample another public workflow Source from an independent origin.",
            status: "open",
            resolution: null,
          },
        ],
      },
      decision: formationDecision(
        decisionId,
        "insufficient-evidence",
        observationIds,
      ),
    };
  };
  return {
    envelopeVersion: "0.1.0",
    requestId: "record-opportunity-formation-1",
    command: "recordOpportunityFormation",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T09:45:00.000Z",
      allocation: {
        discoveryReservationIds: [
          "reservation-occupation-map",
          "reservation-procurement-map",
          "reservation-regulatory-map",
          "reservation-incident-map",
        ],
        shallowProblemMiningReservationIds: [
          "reservation-dispatch-study",
          "reservation-supplier-study",
          "reservation-shallow-control-1",
          "reservation-shallow-control-2",
        ],
      },
      assessments: [
        {
          id: "assessment-dispatch-reconciliation",
          explorationThreadIds: ["thread-dispatch-reconciliation"],
          customer: "Independent dispatch coordinators",
          situation: "Assigning urgent field work across changing schedules",
          costlyProblem: {
            description:
              "Repeated reconciliation diverts paid skilled time from operational work.",
            materialConsequence: "wasted-skilled-time",
            observationIds: [
              "observation-coordination-workaround",
              "observation-dispatch-time-loss",
            ],
          },
          clusterBasis: {
            sharedCustomer: "Both Sources concern independent dispatch coordinators.",
            sharedWorkflow: "Both Sources concern reconciling availability before dispatch.",
            sharedCostlyConsequence: "Both Sources report recurring paid skilled-time loss.",
          },
          supportingObservationIds: [
            "observation-coordination-workaround",
            "observation-dispatch-time-loss",
          ],
          behavioralProblemSignalObservationIds: [
            "observation-coordination-workaround",
            "observation-dispatch-time-loss",
          ],
          independentSourceLineages: [
            {
              id: "lineage-occupation-map",
              sourceIds: ["source-occupation-map"],
              rationale: "The labour institute is the origin of this workflow map.",
            },
            {
              id: "lineage-dispatch-study",
              sourceIds: ["source-dispatch-study"],
              rationale: "The independent research group conducted the separate time study.",
            },
          ],
          result: {
            kind: "opportunity",
            opportunityId: "opportunity-dispatch-reconciliation",
          },
          decision: formationDecision("decision-form-dispatch", "formed", [
            "observation-coordination-workaround",
            "observation-dispatch-time-loss",
          ]),
        },
        {
          id: "assessment-specialist-tender-review",
          explorationThreadIds: ["thread-specialist-tender-review"],
          customer: "Small specialist suppliers",
          situation: "Submitting regulated public tenders",
          costlyProblem: {
            description:
              "Tender rejection causes recurring paid specialist review and rework.",
            materialConsequence: "workaround-expenditure",
            observationIds: [
              "observation-procurement-escalation",
              "observation-supplier-review-spend",
            ],
          },
          clusterBasis: {
            sharedCustomer: "Both Sources concern small specialist suppliers.",
            sharedWorkflow: "Both Sources concern tender review after rejection.",
            sharedCostlyConsequence: "Both Sources report recurring review expenditure.",
          },
          supportingObservationIds: [
            "observation-procurement-escalation",
            "observation-supplier-review-spend",
          ],
          behavioralProblemSignalObservationIds: [
            "observation-procurement-escalation",
            "observation-supplier-review-spend",
          ],
          independentSourceLineages: [
            {
              id: "lineage-procurement-map",
              sourceIds: ["source-procurement-map"],
              rationale: "The procurement authority originated the award evidence.",
            },
            {
              id: "lineage-supplier-study",
              sourceIds: ["source-supplier-study"],
              rationale: "The independent lab conducted the separate supplier study.",
            },
          ],
          result: {
            kind: "opportunity",
            opportunityId: "opportunity-specialist-tender-review",
          },
          decision: formationDecision("decision-form-tender-review", "formed", [
            "observation-procurement-escalation",
            "observation-supplier-review-spend",
          ]),
        },
        {
          id: "assessment-subcontractor-evidence",
          explorationThreadIds: ["thread-subcontractor-evidence"],
          customer: "Small subcontractors",
          situation: "Supplying evidence for public award compliance",
          costlyProblem: {
            description: "Evidence collation may consume skilled time before deadlines.",
            materialConsequence: "wasted-skilled-time",
            observationIds: ["observation-procurement-escalation"],
          },
          clusterBasis: {
            sharedCustomer: "The available Source only partially identifies subcontractors.",
            sharedWorkflow: "The available Source concerns public award submissions.",
            sharedCostlyConsequence: "The size of any skilled-time loss is unresolved.",
          },
          supportingObservationIds: ["observation-procurement-escalation"],
          behavioralProblemSignalObservationIds: [
            "observation-procurement-escalation",
          ],
          independentSourceLineages: [
            {
              id: "lineage-subcontractor-procurement-map",
              sourceIds: ["source-procurement-map"],
              rationale: "Only the procurement authority lineage currently supports this thread.",
            },
          ],
          result: {
            kind: "exploration-thread",
            evidenceGaps: [
              {
                type: "evidence-gap",
                id: "gap-subcontractor-independent-support",
                question:
                  "Does an independent Source Lineage show recurring skilled-time loss for subcontractors?",
                affectedDecisionIds: ["decision-form-subcontractor-evidence"],
                resolutionCriteria:
                  "A second independent Source documents committed behavior and material loss.",
                resolutionMethod:
                  "Sample public subcontractor workflow evidence from an independent origin.",
                status: "open",
                resolution: null,
              },
            ],
          },
          decision: formationDecision(
            "decision-form-subcontractor-evidence",
            "insufficient-evidence",
            ["observation-procurement-escalation"],
          ),
        },
        unsupportedAssessment({
          threadId: "thread-shift-handover",
          customer: "Independent field-service operators",
          situation: "Handing urgent work between shifts",
          problem: "Incomplete handovers may cause repeated skilled work.",
          observationId: "observation-coordination-workaround",
          sourceId: "source-occupation-map",
        }),
        unsupportedAssessment({
          threadId: "thread-novelty-chain-of-custody",
          customer: "Small equipment rental depots",
          situation: "Transferring returned equipment between contractors",
          problem: "Unclear custody may create operational loss.",
        }),
        unsupportedAssessment({
          threadId: "thread-compliance-evidence-rework",
          customer: "Small regulated operators",
          situation: "Preparing evidence before compliance deadlines",
          problem: "Evidence rework may consume recurring skilled time.",
          observationId: "observation-regulatory-rework",
          sourceId: "source-regulatory-map",
        }),
        unsupportedAssessment({
          threadId: "thread-field-handover-repeat-work",
          customer: "Independent field-service operators",
          situation: "Handing urgent work between shifts",
          problem: "Incomplete handovers may cause repeated work.",
          observationId: "observation-incident-escalation",
          sourceId: "source-incident-map",
        }),
        unsupportedAssessment({
          threadId: "thread-compliance-deadline-checks",
          customer: "Small regulated operators",
          situation: "Checking submissions before compliance deadlines",
          problem: "Repeated checks may consume skilled time.",
          observationId: "observation-regulatory-rework",
          sourceId: "source-regulatory-map",
        }),
        unsupportedAssessment({
          threadId: "thread-incident-context-rebuild",
          customer: "Independent maintenance operators",
          situation: "Reconstructing context after an incident",
          problem: "Context reconstruction may consume skilled time.",
          observationId: "observation-incident-escalation",
          sourceId: "source-incident-map",
        }),
        unsupportedAssessment({
          threadId: "thread-novelty-regulatory-handoff",
          customer: "Small regulated operators",
          situation: "Transferring compliance evidence between contractors",
          problem: "Ambiguous handoffs may create operational loss.",
        }),
      ],
    },
  };
}

/** @param {string} campaignPath */
function passBreadthGateCommand(campaignPath) {
  return {
    envelopeVersion: "0.1.0",
    requestId: "pass-breadth-gate-1",
    command: "passBreadthGate",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T09:50:00.000Z",
      gate: {
        id: "breadth-gate-1",
        comparisonOpportunityIds: [
          "opportunity-dispatch-reconciliation",
          "opportunity-specialist-tender-review",
        ],
        diminishingReturns: [
          {
            trancheId: "discovery-tranche-1",
            newOpportunityIds: [
              "opportunity-dispatch-reconciliation",
              "opportunity-specialist-tender-review",
            ],
            rationale: "The first tranche formed two Opportunities.",
          },
          {
            trancheId: "discovery-tranche-2",
            newOpportunityIds: [],
            rationale: "The later tranche formed no additional Opportunity.",
          },
        ],
        decisionValuePriorities: [
          {
            id: "priority-buyer-economics",
            researchQuestion:
              "Can buyer economics change the next qualification gate?",
            target: { kind: "gate", id: "buyer-economics" },
            rationale: "The answer can change Opportunity eligibility.",
          },
          {
            id: "priority-open-comparison",
            researchQuestion:
              "Can a new material consequence change the comparison set?",
            target: { kind: "comparison", id: "breadth-gate-1" },
            rationale: "The answer can displace or add a comparison Opportunity.",
          },
        ],
        decision: {
          type: "campaign-decision",
          id: "decision-pass-breadth-gate",
          kind: "breadth-gate",
          outcome: "passed",
          intakeVersion: 1,
          applicableRule:
            "Require diversity, comparison, diminishing returns, familiarity compliance, and remaining budget.",
          evidenceEntryIds: [
            "decision-form-dispatch",
            "decision-form-tender-review",
          ],
          rationale: "The complete Breadth Gate is satisfied.",
          confidence: {
            level: "medium",
            limitingFactors: ["Open-world discovery remains incomplete."],
          },
          limitations: ["Passing does not imply market exhaustion."],
          decidedAt: "2026-09-01T09:50:00.000Z",
        },
      },
    },
  };
}

/**
 * @param {string} campaignPath
 * @param {{
 *   dispatchClassification?: "ordinary" | "elevated-risk" | "excluded-market" | "unresolved";
 *   dispatchEvidenceEntryIds?: string[];
 * }} [options]
 * @returns {any}
 */
function opportunityExclusionGatesCommand(campaignPath, options = {}) {
  const {
    dispatchClassification = "ordinary",
    dispatchEvidenceEntryIds = ["inference-dispatch-market-classification"],
  } = options;
  const recordedAt = "2026-09-01T09:55:00.000Z";
  /**
   * @param {{
   *   opportunityId: string;
   *   classification: "ordinary" | "elevated-risk" | "excluded-market" | "unresolved";
   *   evidenceEntryIds: string[];
   * }} input
   */
  const marketSafety = ({
    opportunityId,
    classification,
    evidenceEntryIds,
  }) => {
    const excluded = classification === "excluded-market";
    return {
      classification,
      intendedActivity: excluded
        ? "Automate credential theft for unauthorized account access"
        : "Help operators reconcile workflow records",
      excludedCategory: excluded ? "credential-theft-enablement" : null,
      directlyServesExcludedActivity: excluded,
      gate: {
        id: `gate-market-safety-${opportunityId}`,
        state: excluded ? "failed" : "passed",
        decision: {
          type: "campaign-decision",
          id: `decision-market-safety-${opportunityId}`,
          kind: "exclusion-gate",
          outcome: excluded ? "failed" : "passed",
          opportunityId,
          intakeVersion: 1,
          applicableRule:
            "Reject only intended activity that directly serves a non-overridable excluded category.",
          supportingEvidenceEntryIds: evidenceEntryIds,
          challengingEvidenceEntryIds: [],
          evidenceGapIds: [],
          contradictionIds: [],
          rationale: excluded
            ? "Affirmative evidence establishes that the intended activity directly enables credential theft."
            : "Affirmative evidence establishes an ordinary operational workflow with no direct excluded activity.",
          confidence: {
            level: "medium",
            limitingFactors: ["The classification relies on bounded public evidence."],
          },
          limitations: ["The assessment covers the stated intended activity only."],
          decidedAt: recordedAt,
        },
      },
    };
  };
  return {
    envelopeVersion: "0.1.0",
    requestId: "record-opportunity-exclusion-gates-1",
    command: "recordOpportunityExclusionGates",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt,
      assessments: [
        {
          id: "assessment-exclusions-dispatch",
          opportunityId: "opportunity-dispatch-reconciliation",
          marketSafety: marketSafety({
            opportunityId: "opportunity-dispatch-reconciliation",
            classification: dispatchClassification,
            evidenceEntryIds: dispatchEvidenceEntryIds,
          }),
          hardConstraints: [],
        },
        {
          id: "assessment-exclusions-tender",
          opportunityId: "opportunity-specialist-tender-review",
          marketSafety: marketSafety({
            opportunityId: "opportunity-specialist-tender-review",
            classification: "ordinary",
            evidenceEntryIds: ["inference-tender-market-classification"],
          }),
          hardConstraints: [],
        },
      ],
    },
  };
}

const qualificationGateKinds = [
  "costly-problem",
  "buyer-economics",
  "customer-access",
  "value-feasibility",
  "solo-feasibility",
  "competitive-viability",
  "legal-operational-feasibility",
  "commercial-plausibility",
];

/**
 * @param {string} campaignPath
 * @returns {any}
 */
function opportunityQualificationGatesCommand(campaignPath) {
  const recordedAt = "2026-09-01T10:00:00.000Z";
  const assessments = [
    "opportunity-dispatch-reconciliation",
    "opportunity-specialist-tender-review",
  ].map((opportunityId) => ({
    id: `assessment-qualification-${opportunityId}`,
    opportunityId,
    gates: qualificationGateKinds.map((kind) => {
      const decisionId = `decision-qualification-${kind}-${opportunityId}`;
      return {
        id: `gate-qualification-${kind}-${opportunityId}`,
        kind,
        state: "unresolved",
        evidenceBasis: {
          behavioralEvidenceEntryIds: [],
          independentSourceLineages: [],
          sourceFreshnessIds: [],
        },
        ...(kind === "commercial-plausibility"
          ? { commercialRanges: null }
          : {}),
        decision: {
          type: "campaign-decision",
          id: decisionId,
          kind: "qualification-gate",
          outcome: "unresolved",
          opportunityId,
          intakeVersion: 1,
          applicableRule: `Require affirmative evidence for ${kind}.`,
          supportingEvidenceEntryIds: [],
          challengingEvidenceEntryIds: [],
          evidenceGapIds: [`gap-qualification-${kind}-${opportunityId}`],
          contradictionIds: [],
          rationale: `The ${kind} requirement remains unsupported.`,
          confidence: {
            level: "low",
            limitingFactors: ["Affirmative evidence is missing."],
          },
          limitations: ["The open Evidence Gap may change this gate."],
          decidedAt: recordedAt,
        },
      };
    }),
  }));
  return {
    envelopeVersion: "0.1.0",
    requestId: "record-opportunity-qualification-gates-1",
    command: "recordOpportunityQualificationGates",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt,
      evaluation: {
        id: "qualification-evaluation-1",
        assessments,
        researchDecision: {
          type: "campaign-decision",
          id: "decision-continue-qualification-research-1",
          kind: "qualification-research",
          outcome: "continue",
          intakeVersion: 1,
          applicableRule:
            "Continue only while budget remains and a permitted action has positive Decision Value.",
          evidenceEntryIds: [
            `gap-qualification-buyer-economics-opportunity-dispatch-reconciliation`,
          ],
          decisionValuePriorities: [
            {
              id: "priority-qualification-buyer-economics",
              researchQuestion:
                "Can independent buyer behavior establish viable buyer economics?",
              target: {
                kind: "gate",
                id: "gate-qualification-buyer-economics-opportunity-dispatch-reconciliation",
              },
              permittedAction: {
                purpose: "Research buyer economics",
                retrievalRoute: "public-web-search",
                researchClass: "deepening",
                opportunityId: "opportunity-dispatch-reconciliation",
              },
              rationale:
                "The answer can resolve an Opportunity's buyer-economics gate.",
            },
          ],
          stopReason: null,
          rationale:
            "Ordinary research capacity remains and one permitted question can change eligibility.",
          confidence: {
            level: "medium",
            limitingFactors: ["Only the highest-value next question is prioritized."],
          },
          limitations: ["Research must remain within the recorded budget."],
          decidedAt: recordedAt,
        },
      },
    },
  };
}

/** @param {string} campaignPath */
function passingOpportunityQualificationGatesCommand(campaignPath) {
  const command = opportunityQualificationGatesCommand(campaignPath);
  command.requestId = "record-passing-opportunity-qualification-gates-1";
  command.payload.evaluation.id = "qualification-evaluation-passing-1";
  const marketAndCommercialKinds = new Set([
    "costly-problem",
    "buyer-economics",
    "customer-access",
    "competitive-viability",
    "commercial-plausibility",
  ]);
  const timeSensitiveKinds = new Set([
    "costly-problem",
    "buyer-economics",
    "customer-access",
    "competitive-viability",
    "legal-operational-feasibility",
    "commercial-plausibility",
  ]);
  for (const assessment of command.payload.evaluation.assessments) {
    const dispatch = assessment.opportunityId.includes("dispatch");
    const inferenceId = dispatch
      ? "inference-dispatch-qualification-evidence"
      : "inference-tender-qualification-evidence";
    const sourceIds = dispatch
      ? ["source-occupation-map", "source-dispatch-study"]
      : ["source-procurement-map", "source-supplier-study"];
    const freshnessIds = dispatch
      ? ["freshness-dispatch-occupation", "freshness-dispatch-study"]
      : ["freshness-tender-procurement", "freshness-tender-study"];
    for (const gate of assessment.gates) {
      gate.state = "passed";
      gate.decision.outcome = "passed";
      gate.decision.supportingEvidenceEntryIds = [inferenceId];
      gate.decision.evidenceGapIds = [];
      gate.decision.rationale =
        `Affirmative evidence establishes ${gate.kind} for this Opportunity.`;
      gate.decision.confidence = {
        level: "medium",
        limitingFactors: ["The evidence supports a bounded range."],
      };
      gate.evidenceBasis = {
        behavioralEvidenceEntryIds: marketAndCommercialKinds.has(gate.kind)
          ? [inferenceId]
          : [],
        independentSourceLineages: marketAndCommercialKinds.has(gate.kind)
          ? sourceIds.map((sourceId) => ({
              sourceIds: [sourceId],
              rationale: "This Source has a distinct origin in the public sample.",
            }))
          : [],
        sourceFreshnessIds: timeSensitiveKinds.has(gate.kind)
          ? freshnessIds
          : [],
      };
      if (gate.kind === "commercial-plausibility") {
        gate.commercialRanges = Object.fromEntries(
          [
            ["price", 75, 150, "GBP per customer per month"],
            ["customerVolume", 70, 160, "paying customers"],
            ["costs", 500, 2500, "GBP per month"],
            ["acquisition", 20, 80, "GBP per acquired customer"],
            ["capacity", 80, 200, "customers per solo operator"],
            ["timing", 6, 18, "months to target"],
          ].map(([name, low, high, unit]) => [
            name,
            { low, high, unit, evidenceEntryIds: [inferenceId] },
          ]),
        );
      }
    }
  }
  command.payload.evaluation.researchDecision = {
    type: "campaign-decision",
    id: "decision-qualification-complete-1",
    kind: "qualification-research",
    outcome: "stop",
    intakeVersion: 1,
    applicableRule:
      "Continue only while budget remains and a permitted action has positive Decision Value.",
    evidenceEntryIds: [
      "inference-dispatch-qualification-evidence",
      "inference-tender-qualification-evidence",
    ],
    decisionValuePriorities: [],
    stopReason: "qualification-complete",
    rationale:
      "Every surviving Opportunity has a complete terminal Qualification Gate evaluation.",
    confidence: {
      level: "medium",
      limitingFactors: ["Later market changes may reopen a gate."],
    },
    limitations: ["Commercial ranges remain uncertain rather than forecasts."],
    decidedAt: command.payload.recordedAt,
  };
  return command;
}

/**
 * @param {string} kernelPath
 * @param {string} campaignPath
 */
async function recordPassingQualificationEvidence(kernelPath, campaignPath) {
  const result = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "record-passing-qualification-evidence",
    command: "recordEvidenceReasoning",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T09:58:00.000Z",
      entries: [
        ...[
          [
            "freshness-dispatch-occupation",
            "source-occupation-map",
            "observation-coordination-workaround",
          ],
          [
            "freshness-dispatch-study",
            "source-dispatch-study",
            "observation-dispatch-time-loss",
          ],
          [
            "freshness-tender-procurement",
            "source-procurement-map",
            "observation-procurement-escalation",
          ],
          [
            "freshness-tender-study",
            "source-supplier-study",
            "observation-supplier-review-spend",
          ],
        ].map(([id, sourceId, observationId]) => ({
          type: "source-freshness",
          id,
          sourceId,
          observationId,
          intendedUse: "Assess a current time-sensitive Qualification Gate claim.",
          assessment: "high",
          timeSensitivity:
            "Buyer behavior, market conditions, and feasibility may change.",
          rationale: "The evidence was published within the current quarter.",
          limitations: ["The next material market change requires reassessment."],
        })),
        {
          type: "inference",
          id: "inference-dispatch-qualification-evidence",
          text:
            "Independent current behavior evidence supports the dispatch Opportunity's qualification requirements and bounded commercial ranges.",
          scope: "opportunity-dispatch-reconciliation",
          reasoning:
            "Two independently originated Sources report committed behavior and material consequences in the current workflow.",
          supportingEntryIds: [
            "observation-coordination-workaround",
            "observation-dispatch-time-loss",
          ],
          challengingEntryIds: [],
          confidence: {
            level: "medium",
            limitingFactors: ["The sample is bounded."],
          },
        },
        {
          type: "inference",
          id: "inference-tender-qualification-evidence",
          text:
            "Independent current behavior evidence supports the tender Opportunity's qualification requirements and bounded commercial ranges.",
          scope: "opportunity-specialist-tender-review",
          reasoning:
            "Two independently originated Sources report committed buyer expenditure and consequences in the current workflow.",
          supportingEntryIds: [
            "observation-procurement-escalation",
            "observation-supplier-review-spend",
          ],
          challengingEntryIds: [],
          confidence: {
            level: "medium",
            limitingFactors: ["The sample is bounded."],
          },
        },
      ],
    },
  });
  assert.equal(result.code, 0, result.stderr);
}

/**
 * @param {string} kernelPath
 * @param {string} campaignPath
 * @param {Array<Record<string, unknown>>} [statements]
 * @param {Record<string, unknown> | undefined} [campaignIntake]
 */
export async function prepareEligibleCampaign(
  kernelPath,
  campaignPath,
  statements = [],
  campaignIntake,
) {
  await createDiscoveryCampaign(
    kernelPath,
    campaignPath,
    statements,
    true,
    {},
    campaignIntake,
  );
  for (const command of [
    discoveryTrancheCommand(campaignPath),
    secondDiscoveryTrancheCommand(campaignPath),
    opportunityFormationCommand(campaignPath),
    passBreadthGateCommand(campaignPath),
    opportunityExclusionGatesCommand(campaignPath),
  ]) {
    const result = await runKernel(kernelPath, command);
    assert.equal(result.code, 0, result.stderr);
  }
  await recordPassingQualificationEvidence(kernelPath, campaignPath);
  const qualification = await runKernel(
    kernelPath,
    passingOpportunityQualificationGatesCommand(campaignPath),
  );
  assert.equal(qualification.code, 0, qualification.stderr);
}

/**
 * @param {string} kernelPath
 * @param {string} campaignPath
 */
export async function completeAdversarialResearch(kernelPath, campaignPath) {
  for (let index = 1; index <= 6; index += 1) {
    const reservationId = `reservation-adversarial-${index}`;
    const sourceId = `source-adversarial-${index}`;
    const observationId = `observation-adversarial-${index}`;
    const reservation = await runKernel(
      kernelPath,
      publicResearchReservationCommand(campaignPath, {
        requestId: `reserve-adversarial-source-${index}`,
        payload: {
          reservedAt: `2026-09-01T10:${String(index).padStart(2, "0")}:00.000Z`,
          reservation: {
            id: reservationId,
            purpose:
              "Challenge the apparent leader for decision-changing gaps, contradictions, or contenders",
            researchClass: "adversarial",
            opportunityId: "opportunity-dispatch-reconciliation",
          },
        },
      }),
    );
    assert.equal(reservation.code, 0, reservation.stderr);
    const observation = await runKernel(kernelPath, {
      envelopeVersion: "0.1.0",
      requestId: `record-adversarial-source-${index}`,
      command: "recordPublicResearchObservation",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        recordedAt: `2026-09-01T10:${String(index + 10).padStart(2, "0")}:00.000Z`,
        reservationId,
        source: {
          id: sourceId,
          retrievalMode: "public-web",
          url: `https://challenge.example.com/source-${index}`,
          publisher: `Independent Challenge Publisher ${index}`,
          originator: null,
          publishedAt: "2026-08-15",
          updatedAt: null,
          accessedAt: `2026-09-01T10:${String(index + 5).padStart(2, "0")}:00.000Z`,
          exactLocator: `Challenge finding ${index}`,
        },
        observation: {
          id: observationId,
          text:
            "The adversarial review found no decision-changing contradiction, eligibility failure, or stronger contender in its bounded sample.",
          sourceId,
          exactLocator: `Challenge finding ${index}`,
        },
      },
    });
    assert.equal(observation.code, 0, observation.stderr);
  }
  const reasoning = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "record-adversarial-conclusion",
    command: "recordEvidenceReasoning",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T10:20:00.000Z",
      entries: [
        {
          type: "inference",
          id: "inference-adversarial-leader-survives",
          text:
            "The reserved adversarial challenge found no decision-changing gap, contradiction, eligibility failure, or stronger contender.",
          scope: "opportunity-dispatch-reconciliation",
          reasoning:
            "Six protected Source examinations challenged the apparent leader across eligibility and comparison dimensions without finding a decision-changing result.",
          supportingEntryIds: Array.from(
            { length: 6 },
            (_, index) => `observation-adversarial-${index + 1}`,
          ),
          challengingEntryIds: [],
          confidence: {
            level: "medium",
            limitingFactors: ["The challenge remains bounded by the quick profile."],
          },
        },
      ],
    },
  });
  assert.equal(reasoning.code, 0, reasoning.stderr);
}

/** @param {string} summary @param {string} evidenceEntryId */
function comparisonDimension(summary, evidenceEntryId) {
  return {
    summary,
    evidenceEntryIds: [evidenceEntryId],
    confidence: {
      level: "medium",
      limitingFactors: ["The evidence supports a bounded qualitative comparison."],
    },
  };
}

/** @param {string} evidenceEntryId @param {string} label */
function inconclusiveComparisonProfile(evidenceEntryId, label) {
  return {
    requiredInput: Object.fromEntries(
      [
        "validation",
        "initialDelivery",
        "acquisition",
        "operations",
        "time",
        "cash",
        "irreversibleDownside",
        "opportunityCost",
      ].map((dimension) => [
        dimension,
        comparisonDimension(`${label} has a distinct ${dimension} trade-off.`, evidenceEntryId),
      ]),
    ),
    potentialOutput: Object.fromEntries(
      ["commercialHeadroom", "scale", "durability", "strategicLeverage"].map(
        (dimension) => [
          dimension,
          comparisonDimension(`${label} has a distinct ${dimension} trade-off.`, evidenceEntryId),
        ],
      ),
    ),
    outcomeUncertainty: comparisonDimension(
      `${label} retains material outcome uncertainty.`,
      evidenceEntryId,
    ),
    inputOutputAsymmetry: comparisonDimension(
      `${label} preserves a credible but different input-output asymmetry.`,
      evidenceEntryId,
    ),
    riskToleranceFit: {
      fit: "within",
      ...comparisonDimension(
        `${label} remains within the declared risk tolerance.`,
        evidenceEntryId,
      ),
    },
    preferences: [],
    advantages: [],
  };
}

/** @param {string} campaignPath */
export function concludeInconclusiveComparisonCommand(campaignPath) {
  return {
    envelopeVersion: "0.1.0",
    requestId: "conclude-inconclusive-comparison-1",
    command: "concludeInconclusiveComparison",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      concludedAt: "2026-09-01T10:31:00.000Z",
      reportId: "inconclusive-comparison-report-1",
      comparison: {
        id: "comparison-inconclusive-1",
        profiles: [
          {
            opportunityId: "opportunity-dispatch-reconciliation",
            ...inconclusiveComparisonProfile(
              "inference-dispatch-qualification-evidence",
              "Dispatch reconciliation",
            ),
          },
          {
            opportunityId: "opportunity-specialist-tender-review",
            ...inconclusiveComparisonProfile(
              "inference-tender-qualification-evidence",
              "Specialist tender review",
            ),
          },
        ],
        dominanceAssessments: [
          {
            challengerOpportunityId: "opportunity-dispatch-reconciliation",
            alternativeOpportunityId: "opportunity-specialist-tender-review",
            outcome: "does-not-dominate",
            criteria: {
              requiresNoMoreMaterialInput: true,
              offersNoLessCredibleOutput: false,
              fitsDeveloperProfileAtLeastAsWell: true,
              materiallyBetterOn: ["input-output-asymmetry"],
            },
            rationale: "Tender durability prevents dispatch reconciliation from dominating.",
            evidenceEntryIds: [
              "inference-dispatch-qualification-evidence",
              "inference-tender-qualification-evidence",
            ],
            confidence: { level: "medium", limitingFactors: ["Output ranges overlap."] },
          },
          {
            challengerOpportunityId: "opportunity-specialist-tender-review",
            alternativeOpportunityId: "opportunity-dispatch-reconciliation",
            outcome: "does-not-dominate",
            criteria: {
              requiresNoMoreMaterialInput: false,
              offersNoLessCredibleOutput: true,
              fitsDeveloperProfileAtLeastAsWell: true,
              materiallyBetterOn: ["durability"],
            },
            rationale: "Higher tender input prevents specialist tender review from dominating.",
            evidenceEntryIds: [
              "inference-dispatch-qualification-evidence",
              "inference-tender-qualification-evidence",
            ],
            confidence: { level: "medium", limitingFactors: ["Input ranges overlap."] },
          },
        ],
        nonDominatedOpportunityIds: [
          "opportunity-dispatch-reconciliation",
          "opportunity-specialist-tender-review",
        ],
        decisiveTradeOffs: [
          {
            opportunityIds: [
              "opportunity-dispatch-reconciliation",
              "opportunity-specialist-tender-review",
            ],
            summary:
              "Dispatch reconciliation needs less operating input; tender review has stronger specialist durability.",
            evidenceEntryIds: [
              "inference-dispatch-qualification-evidence",
              "inference-tender-qualification-evidence",
            ],
            confidence: { level: "medium", limitingFactors: ["The ranges overlap."] },
          },
        ],
        apparentLeaderOpportunityId: "opportunity-dispatch-reconciliation",
        blockers: [
          {
            contenderOpportunityId: "opportunity-specialist-tender-review",
            couldDisplaceOpportunityIds: ["opportunity-dispatch-reconciliation"],
            summary:
              "The unresolved durability boundary could make tender review preferable.",
            evidenceGapIds: ["gap-tender-durability-boundary"],
            contradictionIds: [],
            evidenceEntryIds: [
              "inference-dispatch-qualification-evidence",
              "inference-tender-qualification-evidence",
            ],
          },
        ],
        decision: {
          type: "campaign-decision",
          id: "decision-inconclusive-comparison-1",
          kind: "opportunity-comparison",
          outcome: "inconclusive-comparison",
          leaderOpportunityId: null,
          intakeVersion: 1,
          applicableRule: "Do not force a leader when material trade-offs remain unresolved.",
          evidenceEntryIds: [
            "inference-dispatch-qualification-evidence",
            "inference-tender-qualification-evidence",
          ],
          rationale: "Neither Eligible Non-Dominated Opportunity is defensibly strongest.",
          confidence: { level: "medium", limitingFactors: ["One boundary remains open."] },
          limitations: ["Public Research is not market validation."],
          decidedAt: "2026-09-01T10:31:00.000Z",
        },
      },
    },
  };
}

/**
 * @param {string} kernelPath
 * @param {string} campaignPath
 * @param {NodeJS.ProcessEnv} [environment]
 * @param {Record<string, unknown> | undefined} [campaignIntake]
 */
export async function enterInconclusiveComparison(
  kernelPath,
  campaignPath,
  environment,
  campaignIntake,
) {
  await prepareEligibleCampaign(kernelPath, campaignPath, [], campaignIntake);
  await completeAdversarialResearch(kernelPath, campaignPath);
  const gap = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "record-shared-inconclusive-gap",
    command: "recordEvidenceReasoning",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T10:30:30.000Z",
      entries: [
        {
          type: "evidence-gap",
          id: "gap-tender-durability-boundary",
          question: "Does specialist durability outweigh the higher operating input?",
          affectedDecisionIds: ["decision-inconclusive-comparison-1"],
          resolutionCriteria: "Independent evidence separates the overlapping ranges.",
          resolutionMethod: "Run one targeted comparison research extension.",
          status: "open",
          resolution: null,
        },
      ],
    },
  });
  assert.equal(gap.code, 0, gap.stderr);
  const concluded = await runKernel(
    kernelPath,
    concludeInconclusiveComparisonCommand(campaignPath),
    environment,
  );
  if (environment === undefined) {
    assert.equal(
      concluded.code,
      0,
      `${concluded.stderr}\n${JSON.stringify(concluded.response)}`,
    );
  }
  return concluded;
}

/** @param {string} opportunityId */
export function developerSelection(opportunityId) {
  const dispatch = opportunityId === "opportunity-dispatch-reconciliation";
  const evidenceEntryId = dispatch
    ? "inference-dispatch-qualification-evidence"
    : "inference-tender-qualification-evidence";
  return {
    opportunityId,
    rationale: dispatch
      ? "I prefer the lower operating input despite unresolved durability trade-offs."
      : "I prefer the specialist durability despite the higher operating input.",
    brief: {
      id: dispatch
        ? "opportunity-brief-developer-dispatch"
        : "opportunity-brief-developer-tender",
      buyerEconomics: comparisonDimension(
        "The evidence supports a buyer with a costly recurring problem.",
        evidenceEntryId,
      ),
      customerAccess: comparisonDimension(
        "The evidence supports a plausible bounded route to customers.",
        evidenceEntryId,
      ),
      alternatives: comparisonDimension(
        "Manual work and general tools remain the current alternatives.",
        evidenceEntryId,
      ),
      risks: [
        comparisonDimension(
          "The unresolved comparison boundary remains a material risk.",
          evidenceEntryId,
        ),
      ],
      valueHypothesis: {
        status: "provisional-not-a-product-specification",
        customer: dispatch
          ? "Independent dispatch coordinators"
          : "Small specialist suppliers",
        situation: dispatch
          ? "Assigning urgent field work across changing schedules"
          : "Submitting regulated public tenders",
        smallestDesiredCustomerOutcome: dispatch
          ? "Reduce paid reconciliation effort while preserving assignment accuracy."
          : "Reduce paid specialist review and rework before tender submission.",
        supportedReason:
          "Current behavior evidence supports testing this smallest customer outcome separately.",
        confidence: {
          level: "medium",
          limitingFactors: ["No External Validation Action has occurred."],
        },
        supportingEvidenceEntryIds: [evidenceEntryId],
        challengingEvidenceEntryIds: [],
        assumptionIds: [],
        evidenceGapIds: ["gap-tender-durability-boundary"],
        disconfirmationConditions: [
          "A separately approved validation effort does not reduce the recorded costly consequence.",
        ],
      },
    },
  };
}

/**
 * Builds the deterministic terminal fixture used to test post-brief behavior.
 * The model under test receives a copy, so this setup is not counted as a model decision.
 *
 * @param {string} kernelPath
 * @param {string} campaignPath
 * @param {Record<string, unknown> | undefined} [campaignIntake]
 */
export async function prepareDeveloperSelectedCampaign(
  kernelPath,
  campaignPath,
  campaignIntake,
) {
  await enterInconclusiveComparison(kernelPath, campaignPath, undefined, campaignIntake);
  const selected = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "select-inconclusive-opportunities-1",
    command: "respondInconclusiveComparison",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      respondedAt: "2026-09-01T10:32:00.000Z",
      reportId: "inconclusive-comparison-report-1",
      response: {
        kind: "select",
        selections: [
          developerSelection("opportunity-dispatch-reconciliation"),
          developerSelection("opportunity-specialist-tender-review"),
        ],
      },
    },
  });
  assert.equal(selected.code, 0, `${selected.stderr}\n${JSON.stringify(selected.response)}`);
}

/**
 * Builds the deterministic pre-terminal fixture for the No Qualifying Opportunity
 * scenario: one rejected Opportunity, one unresolved Opportunity, and no permitted
 * research with positive Decision Value.
 *
 * @param {string} kernelPath
 * @param {string} campaignPath
 * @param {Record<string, unknown> | undefined} [campaignIntake]
 */
export async function prepareNoQualifyingOpportunityCampaign(
  kernelPath,
  campaignPath,
  campaignIntake,
) {
  await createDiscoveryCampaign(kernelPath, campaignPath, [], true, {}, campaignIntake);
  for (const command of [
    discoveryTrancheCommand(campaignPath),
    secondDiscoveryTrancheCommand(campaignPath),
    opportunityFormationCommand(campaignPath),
    passBreadthGateCommand(campaignPath),
    opportunityExclusionGatesCommand(campaignPath),
  ]) {
    const response = await runKernel(kernelPath, command);
    assert.equal(response.code, 0, response.stderr);
  }

  const freshness = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "record-no-qualifying-opportunity-source-freshness",
    command: "recordEvidenceReasoning",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T09:58:00.000Z",
      entries: [
        {
          type: "source-freshness",
          id: "freshness-dispatch-study",
          sourceId: "source-dispatch-study",
          observationId: "observation-dispatch-time-loss",
          intendedUse: "Assess a current time-sensitive qualification claim.",
          assessment: "high",
          timeSensitivity: "Buyer behavior and operating conditions may change.",
          rationale: "The evidence was published within the current quarter.",
          limitations: ["The next material market change requires reassessment."],
        },
      ],
    },
  });
  assert.equal(freshness.code, 0, freshness.stderr);

  const capacityEvidence = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "record-solo-capacity-inference-1",
    command: "recordEvidenceReasoning",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T09:59:00.000Z",
      entries: [{
        type: "inference",
        id: "inference-dispatch-solo-capacity",
        text: "The current operating burden exceeds the developer's solo capacity.",
        scope: "opportunity-dispatch-reconciliation",
        reasoning: "The bounded workflow evidence implies more ongoing work than the confirmed capacity permits.",
        supportingEntryIds: ["inference-dispatch-market-classification"],
        challengingEntryIds: [],
        confidence: {
          level: "medium",
          limitingFactors: ["Automation could change the operating burden."],
        },
      }],
    },
  });
  assert.equal(capacityEvidence.code, 0, capacityEvidence.stderr);

  const qualification = opportunityQualificationGatesCommand(campaignPath);
  qualification.requestId = "record-terminal-qualification-gates";
  qualification.payload.evaluation.id = "qualification-evaluation-terminal";
  const rejectedGate = qualification.payload.evaluation.assessments[0].gates.find(
    (/** @type {any} */ gate) => gate.kind === "solo-feasibility",
  );
  rejectedGate.state = "failed";
  rejectedGate.decision.outcome = "failed";
  rejectedGate.decision.supportingEvidenceEntryIds = [
    "inference-dispatch-solo-capacity",
  ];
  rejectedGate.decision.evidenceGapIds = [];
  rejectedGate.decision.rationale =
    "Affirmative evidence establishes that the required operation exceeds the Solo Developer's capacity.";
  rejectedGate.decision.confidence = {
    level: "medium",
    limitingFactors: ["The assessment uses the confirmed capacity snapshot."],
  };
  const gapEntries = qualification.payload.evaluation.assessments.flatMap(
    (/** @type {any} */ assessment) =>
      assessment.gates
        .filter((/** @type {any} */ gate) => gate !== rejectedGate)
        .map((/** @type {any} */ gate) => ({
          type: "evidence-gap",
          id: gate.decision.evidenceGapIds[0],
          question: `What affirmative evidence resolves ${gate.kind} for ${assessment.opportunityId}?`,
          affectedDecisionIds: [gate.decision.id],
          resolutionCriteria:
            "Current independent evidence establishes the required condition.",
          resolutionMethod:
            "Reopen only if a permitted public Source has positive Decision Value.",
          status: "open",
          resolution: null,
        })),
  );
  qualification.payload.evaluation.researchDecision = {
    type: "campaign-decision",
    id: "decision-stop-qualification-research",
    kind: "qualification-research",
    outcome: "stop",
    intakeVersion: 1,
    applicableRule:
      "Continue only while budget remains and a permitted action has positive Decision Value.",
    evidenceEntryIds: [
      "gap-qualification-costly-problem-opportunity-specialist-tender-review",
    ],
    decisionValuePriorities: [],
    stopReason: "no-permitted-positive-decision-value",
    rationale:
      "No remaining lawful Public Research action has positive Decision Value for an unresolved gate.",
    confidence: {
      level: "medium",
      limitingFactors: ["External Validation Actions remain outside Campaign Research."],
    },
    limitations: ["Several Qualification Gates remain unresolved."],
    decidedAt: qualification.payload.recordedAt,
  };
  const gaps = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "record-terminal-qualification-gaps",
    command: "recordEvidenceReasoning",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T09:58:00.000Z",
      entries: gapEntries,
    },
  });
  assert.equal(gaps.code, 0, gaps.stderr);
  const evaluated = await runKernel(kernelPath, qualification);
  assert.equal(evaluated.code, 0, evaluated.stderr);
  return { qualification, rejectedGate };
}

/**
 * @param {Partial<Record<string, unknown>>} [overrides]
 * @returns {any}
 */
function elevatedRiskApprovalScope(overrides = {}) {
  return {
    id: "approval-decision-elevated-dispatch",
    access: "elevated-risk",
    action: "read-source",
    opportunityId: "opportunity-dispatch-reconciliation",
    researchDepth: "deep",
    purpose: "Deepen the elevated-risk dispatch Opportunity",
    source: {
      id: "source-elevated-dispatch-deepening",
      description: "Public regulatory analysis of dispatch automation risks",
      url: "https://example.com/elevated-dispatch-analysis",
    },
    accessMethod: "public-read-only",
    data: {
      accessed: ["Published regulatory analysis"],
      retained: ["Source metadata and one atomic Observation"],
    },
    externalEffects: [],
    maximumCost: { amount: 0, currency: "GBP" },
    risks: ["The market has material legal and safety risk."],
    duration: {
      startsAt: "2026-09-01T09:56:00.000Z",
      expiresAt: "2099-09-01T10:30:00.000Z",
    },
    alternatives: ["Leave the Opportunity unresolved without deep research."],
    lawfulActivity: true,
    externalValidationAction: false,
    ...overrides,
  };
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
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

test("supported evidence forms Opportunities and the complete Breadth Gate changes research allocation", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-opportunities-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "opportunity-campaign");
  await createDiscoveryCampaign(kernelPath, campaignPath, [], true);

  for (const command of [
    discoveryTrancheCommand(campaignPath),
    secondDiscoveryTrancheCommand(campaignPath),
  ]) {
    const result = await runKernel(kernelPath, command);
    assert.equal(result.code, 0, result.stderr);
  }

  const formation = await runKernel(
    kernelPath,
    opportunityFormationCommand(campaignPath),
  );

  assert.equal(formation.code, 0, formation.stderr);
  assert.equal(formation.response.result.recorded, true);
  assert.equal(formation.response.result.workView.phase, "opportunity-formation");
  assert.deepEqual(
    formation.response.result.workView.opportunities.map((/** @type {any} */ opportunity) => ({
      id: opportunity.id,
      independentSourceLineageCount: opportunity.independentSourceLineages.length,
    })),
    [
      {
        id: "opportunity-dispatch-reconciliation",
        independentSourceLineageCount: 2,
      },
      {
        id: "opportunity-specialist-tender-review",
        independentSourceLineageCount: 2,
      },
    ],
  );
  assert.deepEqual(formation.response.result.workView.researchAllocation, {
    phase: "pre-breadth-gate",
    discoveryShare: 0.5,
    shallowProblemMiningShare: 0.5,
    adversarialSourceUnitsReserved: 6,
  });
  assert.deepEqual(
    formation.response.result.workView.discovery.retainedThreads.find(
      (/** @type {any} */ thread) => thread.id === "thread-subcontractor-evidence",
    ).evidenceGapIds,
    ["gap-subcontractor-independent-support"],
  );

  const gate = await runKernel(kernelPath, passBreadthGateCommand(campaignPath));

  assert.equal(gate.code, 0, gate.stderr);
  assert.equal(gate.response.result.passed, true);
  assert.equal(gate.response.result.workView.phase, "opportunity-deepening");
  assert.deepEqual(gate.response.result.workView.researchAllocation, {
    phase: "post-breadth-gate",
    deepeningShare: 0.8,
    openWorldDiscoveryShare: 0.2,
    adversarialSourceUnitsReserved: 6,
  });
  assert.deepEqual(gate.response.result.workView.breadthGate, {
    id: "breadth-gate-1",
    status: "passed",
    sourceFamilyCount: 4,
    sourceFamilyMinimum: 3,
    comparisonOpportunityIds: [
      "opportunity-dispatch-reconciliation",
      "opportunity-specialist-tender-review",
    ],
    diminishingReturnTrancheIds: [
      "discovery-tranche-1",
      "discovery-tranche-2",
    ],
    remainingOrdinarySourceUnits: 16,
    decisionValuePriorities: passBreadthGateCommand(campaignPath).payload.gate
      .decisionValuePriorities,
    decisionId: "decision-pass-breadth-gate",
  });
  assert.deepEqual(
    gate.response.result.evidenceLedger.campaignDecisions.map(
      (/** @type {any} */ decision) => decision.id,
    ),
    [
      "decision-form-dispatch",
      "decision-form-tender-review",
      "decision-form-subcontractor-evidence",
      "decision-retain-thread-shift-handover",
      "decision-retain-thread-novelty-chain-of-custody",
      "decision-retain-thread-compliance-evidence-rework",
      "decision-retain-thread-field-handover-repeat-work",
      "decision-retain-thread-compliance-deadline-checks",
      "decision-retain-thread-incident-context-rebuild",
      "decision-retain-thread-novelty-regulatory-handoff",
      "decision-pass-breadth-gate",
    ],
  );

  const replayed = await runKernel(
    kernelPath,
    passBreadthGateCommand(campaignPath),
  );
  assert.equal(replayed.code, 0, replayed.stderr);
  assert.equal(replayed.response.result.passed, false);
  assert.equal(
    replayed.response.result.evidenceLedger.campaignDecisions.length,
    11,
  );

  const prematureDeepening = await runKernel(
    kernelPath,
    publicResearchReservationCommand(campaignPath, {
      requestId: "reserve-deepening-before-exclusion-gates",
      payload: {
        reservedAt: "2026-09-01T09:54:00.000Z",
        reservation: {
          id: "reservation-deepening-before-exclusion-gates",
          purpose: "Attempt deep research before Opportunity Exclusion Gates",
          researchClass: "deepening",
          opportunityId: "opportunity-dispatch-reconciliation",
        },
      },
    }),
  );
  assert.equal(prematureDeepening.code, 3);
  assert.equal(
    prematureDeepening.response.error.code,
    "SVS-OPPORTUNITY-EXCLUSION-GATES-REQUIRED",
  );

  const exclusions = await runKernel(
    kernelPath,
    opportunityExclusionGatesCommand(campaignPath),
  );
  assert.equal(exclusions.code, 0, exclusions.stderr);

  const unclassified = await runKernel(
    kernelPath,
    publicResearchReservationCommand(campaignPath, {
      requestId: "reserve-unclassified-post-gate-source",
      payload: {
        reservedAt: "2026-09-01T10:00:00.000Z",
        reservation: {
          id: "reservation-unclassified-post-gate",
          purpose: "Attempt post-gate research without an allocation",
        },
      },
    }),
  );
  assert.equal(unclassified.code, 3);
  assert.equal(
    unclassified.response.error.code,
    "SVS-RESEARCH-ALLOCATION-REQUIRED",
  );

  for (let index = 0; index < 4; index += 1) {
    const deepening = await runKernel(
      kernelPath,
      publicResearchReservationCommand(campaignPath, {
        requestId: `reserve-deepening-source-${index + 1}`,
        payload: {
          reservedAt: `2026-09-01T10:0${index + 1}:00.000Z`,
          reservation: {
            id: `reservation-deepening-${index + 1}`,
            purpose: "Deepen a comparison Opportunity",
            researchClass: "deepening",
            opportunityId: "opportunity-dispatch-reconciliation",
          },
        },
      }),
    );
    assert.equal(deepening.code, 0, deepening.stderr);
  }
  const excessDeepening = await runKernel(
    kernelPath,
    publicResearchReservationCommand(campaignPath, {
      requestId: "reserve-fifth-deepening-source",
      payload: {
        reservedAt: "2026-09-01T10:05:00.000Z",
        reservation: {
          id: "reservation-deepening-5",
          purpose: "Attempt to consume the open-world discovery share",
          researchClass: "deepening",
          opportunityId: "opportunity-dispatch-reconciliation",
        },
      },
    }),
  );
  assert.equal(excessDeepening.code, 3);
  assert.equal(
    excessDeepening.response.error.code,
    "SVS-RESEARCH-ALLOCATION-IMBALANCED",
  );
  const openWorld = await runKernel(
    kernelPath,
    publicResearchReservationCommand(campaignPath, {
      requestId: "reserve-open-world-source-1",
      payload: {
        reservedAt: "2026-09-01T10:06:00.000Z",
        reservation: {
          id: "reservation-open-world-1",
          purpose: "Continue bounded open-world discovery",
          researchClass: "open-world-discovery",
        },
      },
    }),
  );
  assert.equal(openWorld.code, 0, openWorld.stderr);
  assert.equal(
    openWorld.response.result.workView.researchAllocation.deepeningSourceUnits,
    4,
  );
  assert.equal(
    openWorld.response.result.workView.researchAllocation
      .openWorldDiscoverySourceUnits,
    1,
  );
});

test("affirmative direct-service evidence rejects an Excluded Market with traceable gate history", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-excluded-market-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "excluded-market-campaign");
  await createDiscoveryCampaign(kernelPath, campaignPath, [], true, {
    "observation-shallow-control-1":
      "The service is sold specifically to automate credential theft for unauthorized account access.",
  });
  for (const command of [
    discoveryTrancheCommand(campaignPath),
    secondDiscoveryTrancheCommand(campaignPath),
    opportunityFormationCommand(campaignPath),
    passBreadthGateCommand(campaignPath),
  ]) {
    const response = await runKernel(kernelPath, command);
    assert.equal(response.code, 0, response.stderr);
  }

  const unsupportedRejection = opportunityExclusionGatesCommand(campaignPath, {
    dispatchClassification: "excluded-market",
    dispatchEvidenceEntryIds: ["gap-rental-handoff-loss"],
  });
  unsupportedRejection.requestId = "reject-gap-as-affirmative-gate-support";
  const unsupportedResult = await runKernel(kernelPath, unsupportedRejection);
  assert.equal(unsupportedResult.code, 3);
  assert.equal(
    unsupportedResult.response.error.code,
    "SVS-OPPORTUNITY-EXCLUSION-GATE-INVARIANT-VIOLATION",
  );
  assert.match(
    unsupportedResult.response.error.message,
    /links unavailable affirmative evidence gap-rental-handoff-loss/,
  );

  const rawObservationRejection = opportunityExclusionGatesCommand(campaignPath, {
    dispatchClassification: "excluded-market",
    dispatchEvidenceEntryIds: ["observation-shallow-control-1"],
  });
  rawObservationRejection.requestId =
    "reject-raw-observation-without-opportunity-inference";
  const rawObservationResult = await runKernel(
    kernelPath,
    rawObservationRejection,
  );
  assert.equal(rawObservationResult.code, 3);
  assert.equal(
    rawObservationResult.response.error.code,
    "SVS-OPPORTUNITY-EXCLUSION-GATE-INVARIANT-VIOLATION",
  );
  assert.match(
    rawObservationResult.response.error.message,
    /must cite Opportunity-scoped Inferences/,
  );

  const hypotheticalMisuse = opportunityExclusionGatesCommand(campaignPath, {
    dispatchClassification: "excluded-market",
    dispatchEvidenceEntryIds: ["observation-shallow-control-1"],
  });
  hypotheticalMisuse.requestId = "reject-hypothetical-misuse-classification";
  hypotheticalMisuse.payload.assessments[0].marketSafety.intendedActivity =
    "Help authorized administrators reconcile their own account records; misuse is only hypothetical";
  hypotheticalMisuse.payload.assessments[0].marketSafety.directlyServesExcludedActivity =
    false;
  const misuseRejected = await runKernel(kernelPath, hypotheticalMisuse);
  assert.equal(misuseRejected.code, 3);
  assert.equal(
    misuseRejected.response.error.code,
    "SVS-OPPORTUNITY-EXCLUSION-GATES-INVALID",
  );
  assert.match(
    misuseRejected.response.error.details.join(" "),
    /may fail only for affirmative direct service/,
  );

  const command = opportunityExclusionGatesCommand(campaignPath, {
    dispatchClassification: "excluded-market",
    dispatchEvidenceEntryIds: ["inference-dispatch-market-classification"],
  });
  const recorded = await runKernel(kernelPath, command);

  assert.equal(
    recorded.code,
    0,
    `${recorded.stderr}\n${JSON.stringify(recorded.response)}`,
  );
  assert.equal(recorded.response.result.recorded, true);
  const excluded = recorded.response.result.workView.opportunities.find(
    (/** @type {any} */ opportunity) =>
      opportunity.id === "opportunity-dispatch-reconciliation",
  );
  assert.deepEqual(excluded.exclusionGates, [
    {
      id: "gate-market-safety-opportunity-dispatch-reconciliation",
      kind: "market-safety",
      state: "failed",
      applicableRule:
        "Reject only intended activity that directly serves a non-overridable excluded category.",
      decisionId:
        "decision-market-safety-opportunity-dispatch-reconciliation",
    },
  ]);
  assert.deepEqual(excluded.marketSafety, {
    classification: "excluded-market",
    intendedActivity: "Automate credential theft for unauthorized account access",
    excludedCategory: "credential-theft-enablement",
    directlyServesExcludedActivity: true,
  });
  assert.deepEqual(excluded.disposition, {
    status: "rejected",
    decisionIds: [
      "decision-market-safety-opportunity-dispatch-reconciliation",
    ],
  });
  assert.equal(excluded.eligibility, "ineligible");
  assert.equal(excluded.terminalRole, null);
  assert.deepEqual(
    recorded.response.result.evidenceLedger.campaignDecisions.at(-2),
    command.payload.assessments[0].marketSafety.gate.decision,
  );

  const inspected = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "inspect-excluded-market-1",
    command: "inspectCampaign",
    payload: { campaignPath },
  });
  assert.equal(inspected.code, 0, inspected.stderr);
  assert.deepEqual(
    inspected.response.result.workView.opportunities.find(
      (/** @type {any} */ opportunity) =>
        opportunity.id === "opportunity-dispatch-reconciliation",
    ).disposition,
    excluded.disposition,
  );
});

test("an Exclusion Gate cannot omit an unresolved Contradiction involving its evidence", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-gate-contradiction-",
  );
  const storagePath = await mkdtemp(
    path.join(tmpdir(), "solo-venture-scout-storage-"),
  );
  const campaignPath = path.join(storagePath, "gate-contradiction-campaign");
  await createDiscoveryCampaign(kernelPath, campaignPath, [], true);
  for (const command of [
    discoveryTrancheCommand(campaignPath),
    secondDiscoveryTrancheCommand(campaignPath),
    opportunityFormationCommand(campaignPath),
    passBreadthGateCommand(campaignPath),
  ]) {
    const response = await runKernel(kernelPath, command);
    assert.equal(response.code, 0, response.stderr);
  }

  const contradiction = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "record-dispatch-market-contradiction",
    command: "recordEvidenceReasoning",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T09:54:00.000Z",
      entries: [
        {
          type: "contradiction",
          id: "contradiction-dispatch-market-classification",
          entryIds: [
            "inference-dispatch-market-classification",
            "observation-regulatory-rework",
          ],
          disputedProposition:
            "The dispatch Opportunity's intended activity is an ordinary operational workflow.",
          disputedScope: "opportunity-dispatch-reconciliation",
          attemptedReconciliation:
            "The available shallow evidence does not yet reconcile the regulatory challenge.",
          resolutionStatus: "unresolved",
          resolution: null,
        },
      ],
    },
  });
  assert.equal(contradiction.code, 0, contradiction.stderr);

  const omitted = opportunityExclusionGatesCommand(campaignPath);
  omitted.requestId = "record-gates-omitting-known-contradiction";
  const result = await runKernel(kernelPath, omitted);

  assert.equal(result.code, 3);
  assert.equal(
    result.response.error.code,
    "SVS-OPPORTUNITY-EXCLUSION-GATE-INVARIANT-VIOLATION",
  );
  assert.match(
    result.response.error.message,
    /must record every unresolved Contradiction involving its evidence/,
  );
});

test("Hard Constraint violations reject while missing exclusion evidence remains unresolved", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-hard-constraints-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "hard-constraint-campaign");
  await createDiscoveryCampaign(
    kernelPath,
    campaignPath,
    [
      {
        id: "constraint-no-enterprise-sales",
        text: "Do not pursue Opportunities requiring enterprise sales.",
        classification: "hard-constraint",
      },
    ],
    true,
    {
      "observation-shallow-control-1":
        "The dispatch software is sold through mandatory negotiated enterprise contracts.",
      "observation-shallow-control-2":
        "The tender-review service is purchased through a self-service monthly subscription.",
    },
  );
  for (const command of [
    discoveryTrancheCommand(campaignPath),
    secondDiscoveryTrancheCommand(campaignPath),
    opportunityFormationCommand(campaignPath),
    passBreadthGateCommand(campaignPath),
  ]) {
    const response = await runKernel(kernelPath, command);
    assert.equal(response.code, 0, response.stderr);
  }
  const gap = {
    type: "evidence-gap",
    id: "gap-tender-market-safety",
    question:
      "Does the intended tender-review activity directly serve an excluded category?",
    affectedDecisionIds: [
      "decision-market-safety-opportunity-specialist-tender-review",
    ],
    resolutionCriteria:
      "Public evidence identifies the intended activity and whether it directly serves a non-overridable excluded category.",
    resolutionMethod: "Perform bounded shallow market-classification research.",
    status: "open",
    resolution: null,
  };
  const gapResult = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "record-gate-gap-1",
    command: "recordEvidenceReasoning",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T09:52:00.000Z",
      entries: [gap],
    },
  });
  assert.equal(gapResult.code, 0, gapResult.stderr);

  const constraintInferences = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "record-hard-constraint-inferences",
    command: "recordEvidenceReasoning",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T09:53:00.000Z",
      entries: [
        {
          type: "inference",
          id: "inference-dispatch-requires-enterprise-sales",
          text:
            "The dispatch Opportunity requires enterprise sales and violates the confirmed Hard Constraint.",
          scope: "opportunity-dispatch-reconciliation",
          reasoning:
            "The cited route-to-market evidence requires a negotiated enterprise contract.",
          supportingEntryIds: ["observation-shallow-control-1"],
          challengingEntryIds: [],
          confidence: {
            level: "medium",
            limitingFactors: ["The route-to-market evidence is bounded."],
          },
        },
        {
          type: "inference",
          id: "inference-tender-avoids-enterprise-sales",
          text:
            "The tender-review Opportunity has a self-service route and does not violate the confirmed Hard Constraint.",
          scope: "opportunity-specialist-tender-review",
          reasoning:
            "The cited route-to-market evidence describes self-service purchasing.",
          supportingEntryIds: ["observation-shallow-control-2"],
          challengingEntryIds: [],
          confidence: {
            level: "medium",
            limitingFactors: ["The route-to-market evidence is bounded."],
          },
        },
      ],
    },
  });
  assert.equal(constraintInferences.code, 0, constraintInferences.stderr);

  const command = opportunityExclusionGatesCommand(campaignPath);
  /**
   * @param {string} opportunityId
   * @param {"passed" | "failed"} state
   * @param {string} evidenceEntryId
   */
  const hardConstraintGate = (opportunityId, state, evidenceEntryId) => ({
    hardConstraintId: "constraint-no-enterprise-sales",
    gate: {
      id: `gate-hard-constraint-${opportunityId}`,
      state,
      decision: {
        type: "campaign-decision",
        id: `decision-hard-constraint-${opportunityId}`,
        kind: "exclusion-gate",
        outcome: state,
        opportunityId,
        intakeVersion: 1,
        applicableRule: "Do not pursue Opportunities requiring enterprise sales.",
        supportingEvidenceEntryIds: [evidenceEntryId],
        challengingEvidenceEntryIds: [],
        evidenceGapIds: [],
        contradictionIds: [],
        rationale:
          state === "failed"
            ? "Affirmative evidence shows that this Opportunity requires enterprise sales."
            : "Affirmative evidence shows a self-service route that does not require enterprise sales.",
        confidence: {
          level: "medium",
          limitingFactors: ["The route-to-market evidence is bounded."],
        },
        limitations: ["Later route-to-market changes require reassessment."],
        decidedAt: command.payload.recordedAt,
      },
    },
  });
  command.payload.assessments[0].hardConstraints = [
    hardConstraintGate(
      "opportunity-dispatch-reconciliation",
      "failed",
      "inference-dispatch-requires-enterprise-sales",
    ),
  ];
  command.payload.assessments[0].marketSafety.classification = "elevated-risk";
  command.payload.assessments[1].hardConstraints = [
    hardConstraintGate(
      "opportunity-specialist-tender-review",
      "passed",
      "inference-tender-avoids-enterprise-sales",
    ),
  ];
  const unresolvedMarket = command.payload.assessments[1].marketSafety;
  unresolvedMarket.classification = "unresolved";
  unresolvedMarket.intendedActivity =
    "The intended activity remains insufficiently described for market-safety classification";
  unresolvedMarket.excludedCategory = null;
  unresolvedMarket.directlyServesExcludedActivity = null;
  unresolvedMarket.gate.state = "unresolved";
  unresolvedMarket.gate.decision.outcome = "unresolved";
  unresolvedMarket.gate.decision.supportingEvidenceEntryIds = [];
  unresolvedMarket.gate.decision.evidenceGapIds = [gap.id];
  unresolvedMarket.gate.decision.rationale =
    "Missing intended-activity evidence prevents a passed or failed Exclusion Gate.";
  unresolvedMarket.gate.decision.confidence = {
    level: "low",
    limitingFactors: ["The intended activity is not established."],
  };

  const wrongConstraintRule = structuredClone(command);
  wrongConstraintRule.requestId = "record-wrong-hard-constraint-rule";
  wrongConstraintRule.payload.assessments[0].hardConstraints[0].gate.decision.applicableRule =
    "A rule that was not confirmed in Campaign Intake.";
  const wrongRuleResult = await runKernel(kernelPath, wrongConstraintRule);
  assert.equal(wrongRuleResult.code, 3);
  assert.equal(
    wrongRuleResult.response.error.code,
    "SVS-OPPORTUNITY-EXCLUSION-GATE-INVARIANT-VIOLATION",
  );
  assert.match(
    wrongRuleResult.response.error.message,
    /must use the exact confirmed Hard Constraint text/,
  );

  const omittedKnownGap = structuredClone(command);
  omittedKnownGap.requestId = "record-terminal-gate-omitting-known-gap";
  const omittedGapMarket = omittedKnownGap.payload.assessments[1].marketSafety;
  omittedGapMarket.classification = "ordinary";
  omittedGapMarket.intendedActivity =
    "Help procurement teams review tender requirements";
  omittedGapMarket.excludedCategory = null;
  omittedGapMarket.directlyServesExcludedActivity = false;
  omittedGapMarket.gate.state = "passed";
  omittedGapMarket.gate.decision.outcome = "passed";
  omittedGapMarket.gate.decision.supportingEvidenceEntryIds = [
    "inference-tender-market-classification",
  ];
  omittedGapMarket.gate.decision.evidenceGapIds = [];
  omittedGapMarket.gate.decision.rationale =
    "The gate attempts to pass without recording its known material Evidence Gap.";
  omittedGapMarket.gate.decision.confidence = {
    level: "medium",
    limitingFactors: ["The intended activity evidence is bounded."],
  };
  const omittedGapResult = await runKernel(kernelPath, omittedKnownGap);
  assert.equal(omittedGapResult.code, 3);
  assert.equal(
    omittedGapResult.response.error.code,
    "SVS-OPPORTUNITY-EXCLUSION-GATE-INVARIANT-VIOLATION",
  );
  assert.match(
    omittedGapResult.response.error.message,
    /must record every open Evidence Gap that affects it/,
  );

  const recorded = await runKernel(kernelPath, command);

  assert.equal(
    recorded.code,
    0,
    `${recorded.stderr}\n${JSON.stringify(recorded.response)}`,
  );
  const [rejected, unresolved] = recorded.response.result.workView.opportunities;
  assert.deepEqual(rejected.disposition, {
    status: "rejected",
    decisionIds: [
      "decision-hard-constraint-opportunity-dispatch-reconciliation",
    ],
  });
  assert.equal(
    rejected.exclusionGates.find(
      (/** @type {any} */ gate) => gate.kind === "hard-constraint",
    ).state,
    "failed",
  );
  assert.equal(
    recorded.response.result.workView.nextPermittedActions.includes(
      "request-elevated-risk-research-approval",
    ),
    false,
  );
  assert.deepEqual(unresolved.disposition, {
    status: "unresolved",
    decisionIds: [
      "decision-market-safety-opportunity-specialist-tender-review",
    ],
  });
  assert.equal(unresolved.exclusionGates[0].state, "unresolved");
  assert.equal(unresolved.eligibility, "ineligible");
  assert.equal(unresolved.terminalRole, null);
  assert.deepEqual(
    recorded.response.result.evidenceLedger.campaignDecisions.slice(-4),
    command.payload.assessments.flatMap((/** @type {any} */ assessment) => [
      assessment.marketSafety.gate.decision,
      ...assessment.hardConstraints.map((/** @type {any} */ constraint) =>
        constraint.gate.decision,
      ),
    ]),
  );

  const rejectedDeepening = await runKernel(
    kernelPath,
    publicResearchReservationCommand(campaignPath, {
      requestId: "reserve-rejected-opportunity-deepening",
      payload: {
        reservedAt: "2026-09-01T09:56:00.000Z",
        reservation: {
          id: "reservation-rejected-opportunity-deepening",
          purpose: "Attempt to deepen a rejected Opportunity",
          researchClass: "deepening",
          opportunityId: "opportunity-dispatch-reconciliation",
        },
      },
    }),
  );
  assert.equal(rejectedDeepening.code, 3);
  assert.equal(
    rejectedDeepening.response.error.code,
    "SVS-OPPORTUNITY-INELIGIBLE",
  );
});

test("an Elevated-Risk Market stays unresolved and ineligible without Opportunity-specific approval", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-elevated-risk-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "elevated-risk-campaign");
  await createDiscoveryCampaign(kernelPath, campaignPath, [], true);
  for (const command of [
    discoveryTrancheCommand(campaignPath),
    secondDiscoveryTrancheCommand(campaignPath),
    opportunityFormationCommand(campaignPath),
    passBreadthGateCommand(campaignPath),
  ]) {
    const response = await runKernel(kernelPath, command);
    assert.equal(response.code, 0, response.stderr);
  }

  const command = opportunityExclusionGatesCommand(campaignPath, {
    dispatchClassification: "elevated-risk",
  });
  const recorded = await runKernel(kernelPath, command);

  assert.equal(
    recorded.code,
    0,
    `${recorded.stderr}\n${JSON.stringify(recorded.response)}`,
  );
  const [elevated, ordinary] = recorded.response.result.workView.opportunities;
  assert.equal(elevated.marketSafety.classification, "elevated-risk");
  assert.equal(elevated.exclusionGates[0].state, "passed");
  assert.deepEqual(elevated.disposition, {
    status: "unresolved",
    decisionIds: [
      "decision-market-safety-opportunity-dispatch-reconciliation",
    ],
  });
  assert.equal(elevated.eligibility, "ineligible");
  assert.equal(elevated.terminalRole, null);
  assert.deepEqual(ordinary.disposition, {
    status: "active",
    decisionIds: [
      "decision-market-safety-opportunity-specialist-tender-review",
    ],
  });
  assert.ok(
    recorded.response.result.workView.nextPermittedActions.includes(
      "request-elevated-risk-research-approval",
    ),
  );

  const blockedDeepening = await runKernel(
    kernelPath,
    publicResearchReservationCommand(campaignPath, {
      requestId: "reserve-unapproved-elevated-risk-deepening",
      payload: {
        reservedAt: "2026-09-01T09:56:00.000Z",
        reservation: {
          id: "reservation-unapproved-elevated-risk-deepening",
          purpose: "Deepen the elevated-risk dispatch Opportunity",
          researchClass: "deepening",
          opportunityId: "opportunity-dispatch-reconciliation",
        },
      },
    }),
  );
  assert.equal(blockedDeepening.code, 3);
  assert.equal(
    blockedDeepening.response.error.code,
    "SVS-ELEVATED-RISK-APPROVAL-REQUIRED",
  );

  const scope = elevatedRiskApprovalScope({
    id: "approval-decision-refused-elevated-dispatch",
  });
  const requested = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "request-refused-elevated-dispatch-approval",
    command: "requestResearchApproval",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      requestedAt: "2026-09-01T09:56:00.000Z",
      request: scope,
    },
  });
  assert.equal(requested.code, 0, requested.stderr);
  const refused = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "refuse-elevated-dispatch-approval",
    command: "respondResearchApproval",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      respondedAt: "2026-09-01T09:57:00.000Z",
      decisionId: scope.id,
      response: {
        kind: "refuse",
        refusal: {
          id: "refusal-elevated-dispatch",
          explicitlyRefused: true,
          rationale: "The developer will not approve deeper research in this market.",
          evidenceGap: {
            type: "evidence-gap",
            id: "gap-refused-elevated-dispatch-research",
            question:
              "Would approved deep research resolve the Elevated-Risk Opportunity?",
            affectedDecisionIds: [scope.id],
            resolutionCriteria:
              "The developer grants a new Opportunity-specific approval and the scoped research is completed.",
            resolutionMethod:
              "Request new explicit approval only if the developer chooses to revisit the Opportunity.",
            status: "open",
            resolution: null,
          },
        },
      },
    },
  });
  assert.equal(
    refused.code,
    0,
    `${refused.stderr}\n${JSON.stringify(refused.response)}`,
  );
  const refusedOpportunity = refused.response.result.workView.opportunities[0];
  assert.equal(refusedOpportunity.disposition.status, "unresolved");
  assert.equal(refusedOpportunity.eligibility, "ineligible");
  assert.notEqual(refusedOpportunity.disposition.status, "rejected");
  assert.ok(
    refused.response.result.workView.reasoning.openEvidenceGapIds.includes(
      "gap-refused-elevated-dispatch-research",
    ),
  );
});

test("Opportunity-specific approval permits only its scoped Elevated-Risk deep research", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-elevated-approval-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "elevated-approval-campaign");
  await createDiscoveryCampaign(kernelPath, campaignPath, [], true);
  for (const command of [
    discoveryTrancheCommand(campaignPath),
    secondDiscoveryTrancheCommand(campaignPath),
    opportunityFormationCommand(campaignPath),
    passBreadthGateCommand(campaignPath),
    opportunityExclusionGatesCommand(campaignPath, {
      dispatchClassification: "elevated-risk",
    }),
  ]) {
    const response = await runKernel(kernelPath, command);
    assert.equal(
      response.code,
      0,
      `${response.stderr}\n${JSON.stringify(response.response)}`,
    );
  }

  const scope = elevatedRiskApprovalScope();
  const requested = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "request-elevated-dispatch-approval",
    command: "requestResearchApproval",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      requestedAt: "2026-09-01T09:56:00.000Z",
      request: scope,
    },
  });
  assert.equal(
    requested.code,
    0,
    `${requested.stderr}\n${JSON.stringify(requested.response)}`,
  );
  assert.equal(requested.response.result.pendingDecision.id, scope.id);

  const approved = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "approve-elevated-dispatch-research",
    command: "respondResearchApproval",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      respondedAt: "2026-09-01T09:57:00.000Z",
      decisionId: scope.id,
      response: {
        kind: "approve",
        approval: {
          id: "approval-elevated-dispatch",
          explicitlyApproved: true,
          scope,
        },
      },
    },
  });
  assert.equal(
    approved.code,
    0,
    `${approved.stderr}\n${JSON.stringify(approved.response)}`,
  );
  const elevated = approved.response.result.workView.opportunities[0];
  assert.equal(elevated.disposition.status, "active");
  assert.equal(elevated.eligibility, "pending-qualification");

  const permitted = await runKernel(
    kernelPath,
    publicResearchReservationCommand(campaignPath, {
      requestId: "reserve-approved-elevated-risk-deepening",
      payload: {
        reservedAt: "2026-09-01T09:58:00.000Z",
        reservation: {
          id: "reservation-approved-elevated-risk-deepening",
          purpose: scope.purpose,
          retrievalRoute: scope.accessMethod,
          researchClass: "deepening",
          opportunityId: scope.opportunityId,
          approvalId: "approval-elevated-dispatch",
        },
      },
    }),
  );
  assert.equal(
    permitted.code,
    0,
    `${permitted.stderr}\n${JSON.stringify(permitted.response)}`,
  );
  assert.equal(permitted.response.result.reserved, true);

  const changedSource = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "record-changed-elevated-risk-source",
    command: "recordPublicResearchObservation",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T10:01:00.000Z",
      reservationId: "reservation-approved-elevated-risk-deepening",
      source: {
        id: "source-outside-elevated-risk-approval",
        retrievalMode: "public-web",
        url: "https://example.org/outside-approved-scope",
        publisher: "Different Publisher",
        originator: null,
        publishedAt: "2026-08-01",
        updatedAt: null,
        accessedAt: "2026-09-01T10:00:00.000Z",
        exactLocator: "Section 2",
      },
      observation: {
        id: "observation-outside-elevated-risk-approval",
        text: "A different public source reports a separate regulatory concern.",
        sourceId: "source-outside-elevated-risk-approval",
        exactLocator: "Section 2",
      },
    },
  });
  assert.equal(changedSource.code, 3);
  assert.equal(
    changedSource.response.error.code,
    "SVS-ELEVATED-RISK-APPROVAL-SCOPE-MISMATCH",
  );

  const recordedApprovedSource = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "record-approved-elevated-risk-source",
    command: "recordPublicResearchObservation",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T10:01:00.000Z",
      reservationId: "reservation-approved-elevated-risk-deepening",
      source: {
        id: scope.source.id,
        retrievalMode: "public-web",
        url: scope.source.url,
        publisher: "Regulatory Analysis Publisher",
        originator: null,
        publishedAt: "2026-08-01",
        updatedAt: null,
        accessedAt: "2026-09-01T10:00:00.000Z",
        exactLocator: "Section 4",
      },
      observation: {
        id: "observation-approved-elevated-risk-source",
        text: "The regulatory analysis reports a bounded legal risk for this workflow.",
        sourceId: scope.source.id,
        exactLocator: "Section 4",
      },
    },
  });
  assert.equal(
    recordedApprovedSource.code,
    0,
    `${recordedApprovedSource.stderr}\n${JSON.stringify(recordedApprovedSource.response)}`,
  );

  const wrongOpportunity = await runKernel(
    kernelPath,
    publicResearchReservationCommand(campaignPath, {
      requestId: "reserve-wrong-opportunity-with-elevated-approval",
      payload: {
        reservedAt: "2026-09-01T09:59:00.000Z",
        reservation: {
          id: "reservation-wrong-opportunity-with-elevated-approval",
          purpose: scope.purpose,
          retrievalRoute: scope.accessMethod,
          researchClass: "deepening",
          opportunityId: "opportunity-specialist-tender-review",
          approvalId: "approval-elevated-dispatch",
        },
      },
    }),
  );
  assert.equal(wrongOpportunity.code, 3);
  assert.equal(
    wrongOpportunity.response.error.code,
    "SVS-ELEVATED-RISK-APPROVAL-SCOPE-MISMATCH",
  );

  const pendingRestrictedScope = {
    ...scope,
    id: "approval-decision-pending-restricted-source",
    access: "restricted",
    opportunityId: undefined,
    researchDepth: undefined,
    purpose: "Inspect a restricted source while preserving the active decision",
    source: {
      id: "source-pending-restricted",
      description: "Restricted read-only industry report",
      url: "https://example.com/restricted-industry-report",
    },
    accessMethod: "developer-controlled-authenticated-read-only",
    risks: ["The source requires developer-controlled authenticated access."],
    duration: {
      startsAt: "2026-09-01T10:02:00.000Z",
      expiresAt: "2101-09-01T10:30:00.000Z",
    },
  };
  delete pendingRestrictedScope.opportunityId;
  delete pendingRestrictedScope.researchDepth;
  const pendingRestricted = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "request-pending-restricted-source",
    command: "requestResearchApproval",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      requestedAt: "2026-09-01T10:02:00.000Z",
      request: pendingRestrictedScope,
    },
  });
  assert.equal(pendingRestricted.code, 0, pendingRestricted.stderr);

  const afterExpiry = await runKernelAt(
    kernelPath,
    {
      envelopeVersion: "0.1.0",
      requestId: "inspect-after-elevated-approval-expiry",
      command: "inspectCampaign",
      payload: {
        campaignPath,
      },
    },
    "2100-09-01T10:00:00.000Z",
  );
  assert.equal(afterExpiry.code, 0, afterExpiry.stderr);
  const expiredOpportunity = afterExpiry.response.result.workView.opportunities[0];
  assert.equal(expiredOpportunity.disposition.status, "unresolved");
  assert.equal(expiredOpportunity.eligibility, "ineligible");
  assert.ok(
    afterExpiry.response.result.workView.nextPermittedActions.includes(
      "respond-research-approval",
    ),
  );
  assert.equal(
    afterExpiry.response.result.workView.nextPermittedActions.includes(
      "request-elevated-risk-research-approval",
    ),
    false,
  );
});

test("dependent Sources cannot satisfy the two-lineage Opportunity formation rule", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-lineage-guard-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "dependent-lineage-campaign");
  await createDiscoveryCampaign(kernelPath, campaignPath, [], true);
  for (const command of [
    discoveryTrancheCommand(campaignPath),
    secondDiscoveryTrancheCommand(campaignPath),
    {
      envelopeVersion: "0.1.0",
      requestId: "record-dependent-dispatch-lineage",
      command: "recordEvidenceReasoning",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-primary",
        recordedAt: "2026-09-01T09:42:00.000Z",
        entries: [
          {
            type: "source-lineage",
            id: "lineage-dispatch-shared-dataset",
            sourceIds: ["source-occupation-map", "source-dispatch-study"],
            sharedOrigin: "Both Sources reproduce the same dispatch time study.",
            relationship: "shared-dataset",
            independence: "dependent",
          },
        ],
      },
    },
  ]) {
    const result = await runKernel(kernelPath, command);
    assert.equal(result.code, 0, result.stderr);
  }

  const result = await runKernel(
    kernelPath,
    opportunityFormationCommand(campaignPath),
  );

  assert.equal(result.code, 3);
  assert.equal(
    result.response.error.code,
    "SVS-OPPORTUNITY-FORMATION-INVARIANT-VIOLATION",
  );
  assert.match(result.response.error.message, /two independent Source Lineages/i);
});

test("Opportunity formation preserves unsupported threads and the equal pre-gate allocation", async (t) => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-formation-guards-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "formation-guard-campaign");
  await createDiscoveryCampaign(kernelPath, campaignPath, [], true);
  for (const command of [
    discoveryTrancheCommand(campaignPath),
    secondDiscoveryTrancheCommand(campaignPath),
  ]) {
    const result = await runKernel(kernelPath, command);
    assert.equal(result.code, 0, result.stderr);
  }

  /** @type {Array<{name: string, expectedCode: string, mutate: (command: any) => void}>} */
  const invalidCases = [
    {
      name: "assesses every retained Exploration Thread",
      expectedCode: "SVS-OPPORTUNITY-FORMATION-INVARIANT-VIOLATION",
      mutate(command) {
        command.payload.assessments.pop();
      },
    },
    {
      name: "rejects an uneven discovery and shallow problem-mining split",
      expectedCode: "SVS-OPPORTUNITY-FORMATION-INVARIANT-VIOLATION",
      mutate(command) {
        command.payload.allocation.shallowProblemMiningReservationIds.pop();
      },
    },
    {
      name: "rejects solution-led clustering fields",
      expectedCode: "SVS-OPPORTUNITY-FORMATION-INVALID",
      mutate(command) {
        command.payload.assessments[0].proposedSolution = "A dispatch dashboard";
      },
    },
    {
      name: "requires explicit Evidence Gaps for an unsupported Exploration Thread",
      expectedCode: "SVS-OPPORTUNITY-FORMATION-INVALID",
      mutate(command) {
        command.payload.assessments[2].result.evidenceGaps = [];
      },
    },
    {
      name: "does not form an Opportunity from one Source Lineage",
      expectedCode: "SVS-OPPORTUNITY-FORMATION-INVARIANT-VIOLATION",
      mutate(command) {
        command.payload.assessments[0].supportingObservationIds = [
          "observation-coordination-workaround",
        ];
        command.payload.assessments[0].costlyProblem.observationIds = [
          "observation-coordination-workaround",
        ];
        command.payload.assessments[0].behavioralProblemSignalObservationIds = [
          "observation-coordination-workaround",
        ];
        command.payload.assessments[0].decision.evidenceEntryIds = [
          "observation-coordination-workaround",
        ];
      },
    },
    {
      name: "forms an Opportunity when all formation evidence is present",
      expectedCode: "SVS-OPPORTUNITY-FORMATION-INVARIANT-VIOLATION",
      mutate(command) {
        const assessment = command.payload.assessments[0];
        assessment.result = {
          kind: "exploration-thread",
          evidenceGaps: [
            {
              type: "evidence-gap",
              id: "gap-dispatch-already-supported",
              question: "Is more support needed?",
              affectedDecisionIds: [assessment.decision.id],
              resolutionCriteria: "Find more support.",
              resolutionMethod: "Review another public Source.",
              status: "open",
              resolution: null,
            },
          ],
        };
        assessment.decision.outcome = "insufficient-evidence";
      },
    },
  ];

  for (const [index, invalidCase] of invalidCases.entries()) {
    await t.test(invalidCase.name, async () => {
      const command = opportunityFormationCommand(campaignPath);
      command.requestId = `invalid-formation-${index + 1}`;
      invalidCase.mutate(command);

      const result = await runKernel(kernelPath, command);

      assert.equal(result.code, 3);
      assert.equal(result.response.error.code, invalidCase.expectedCode);
    });
  }
});

test("the Breadth Gate fails closed until every narrowing condition is satisfied", async (t) => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-breadth-guards-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "breadth-guard-campaign");
  await createDiscoveryCampaign(kernelPath, campaignPath, [], true);
  for (const command of [
    discoveryTrancheCommand(campaignPath),
    secondDiscoveryTrancheCommand(campaignPath),
    opportunityFormationCommand(campaignPath),
  ]) {
    const result = await runKernel(kernelPath, command);
    assert.equal(result.code, 0, result.stderr);
  }

  /** @type {Array<{name: string, expectedCode: string, mutate: (command: any) => void}>} */
  const invalidCases = [
    {
      name: "requires the minimum comparison set",
      expectedCode: "SVS-BREADTH-GATE-INVARIANT-VIOLATION",
      mutate(command) {
        command.payload.gate.comparisonOpportunityIds.pop();
      },
    },
    {
      name: "requires two genuinely diminishing-return tranches",
      expectedCode: "SVS-BREADTH-GATE-INVARIANT-VIOLATION",
      mutate(command) {
        command.payload.gate.diminishingReturns[0].newOpportunityIds = [
          "opportunity-dispatch-reconciliation",
        ];
        command.payload.gate.diminishingReturns[1].newOpportunityIds = [
          "opportunity-specialist-tender-review",
        ];
      },
    },
    {
      name: "accepts only qualitative priorities that can change a named decision",
      expectedCode: "SVS-BREADTH-GATE-INVALID",
      mutate(command) {
        command.payload.gate.decisionValuePriorities[0].target.kind =
          "interestingness";
      },
    },
  ];
  for (const [index, invalidCase] of invalidCases.entries()) {
    await t.test(invalidCase.name, async () => {
      const command = passBreadthGateCommand(campaignPath);
      command.requestId = `invalid-breadth-${index + 1}`;
      invalidCase.mutate(command);

      const result = await runKernel(kernelPath, command);

      assert.equal(result.code, 3);
      assert.equal(result.response.error.code, invalidCase.expectedCode);
    });
  }

  await t.test("requires enough ordinary budget to deepen and challenge the comparison set", async () => {
    const budgetCampaignPath = path.join(storagePath, "breadth-budget-campaign");
    await createDiscoveryCampaign(kernelPath, budgetCampaignPath, [], true);
    for (const discoveryCommand of [
      discoveryTrancheCommand(budgetCampaignPath),
      secondDiscoveryTrancheCommand(budgetCampaignPath),
    ]) {
      const recorded = await runKernel(kernelPath, discoveryCommand);
      assert.equal(recorded.code, 0, recorded.stderr);
    }
    for (let index = 0; index < 14; index += 1) {
      const reservationId = `reservation-budget-pressure-${index + 1}`;
      const reservation = await runKernel(
        kernelPath,
        publicResearchReservationCommand(budgetCampaignPath, {
          requestId: `reserve-budget-pressure-source-${index + 1}`,
          payload: {
            reservedAt: `2026-09-01T10:${String(index).padStart(2, "0")}:00.000Z`,
            reservation: {
              id: reservationId,
              purpose: "Complete balanced shallow pre-gate research",
            },
          },
        }),
      );
      assert.equal(reservation.code, 0, reservation.stderr);
      const recorded = await runKernel(kernelPath, {
        envelopeVersion: "0.1.0",
        requestId: `record-budget-pressure-source-${index + 1}`,
        command: "recordPublicResearchObservation",
        payload: {
          campaignPath: budgetCampaignPath,
          coordinatorId: "coordinator-primary",
          recordedAt: `2026-09-01T10:${String(20 + index).padStart(2, "0")}:00.000Z`,
          reservationId,
          source: {
            id: `source-budget-pressure-${index + 1}`,
            retrievalMode: "public-web",
            url: `https://budget.example.com/source-${index + 1}`,
            publisher: "Budget Pressure Fixture",
            originator: null,
            publishedAt: "2026-06-01",
            updatedAt: null,
            accessedAt: `2026-09-01T10:${String(19 + index).padStart(2, "0")}:00.000Z`,
            exactLocator: `Fixture item ${index + 1}`,
          },
          observation: {
            id: `observation-budget-pressure-${index + 1}`,
            text: "The bounded fixture records one additional pre-gate workflow observation.",
            sourceId: `source-budget-pressure-${index + 1}`,
            exactLocator: `Fixture item ${index + 1}`,
          },
        },
      });
      assert.equal(recorded.code, 0, recorded.stderr);
    }
    const formationCommand = opportunityFormationCommand(budgetCampaignPath);
    formationCommand.requestId = "record-budget-pressure-formation";
    formationCommand.payload.recordedAt = "2026-09-01T11:00:00.000Z";
    for (const assessment of formationCommand.payload.assessments) {
      assessment.decision.decidedAt = formationCommand.payload.recordedAt;
    }
    for (let index = 0; index < 14; index += 1) {
      formationCommand.payload.allocation[
        index % 2 === 0
          ? "discoveryReservationIds"
          : "shallowProblemMiningReservationIds"
      ].push(`reservation-budget-pressure-${index + 1}`);
    }
    const formationResult = await runKernel(kernelPath, formationCommand);
    assert.equal(formationResult.code, 0, formationResult.stderr);

    const command = passBreadthGateCommand(budgetCampaignPath);
    command.requestId = "invalid-breadth-insufficient-budget";
    command.payload.recordedAt = "2026-09-01T11:05:00.000Z";
    command.payload.gate.decision.decidedAt = "2026-09-01T11:05:00.000Z";

    const result = await runKernel(kernelPath, command);

    assert.equal(result.code, 3);
    assert.equal(
      result.response.error.code,
      "SVS-BREADTH-GATE-INVARIANT-VIOLATION",
    );
    assert.match(result.response.error.message, /remaining ordinary budget/i);
  });
});

test("the Breadth Gate requires the Campaign Intake Source Family coverage", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-breadth-diversity-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "breadth-diversity-campaign");
  await createDiscoveryCampaign(kernelPath, campaignPath, [], true);
  const second = secondDiscoveryTrancheCommand(campaignPath);
  second.payload.tranche.sweeps[0].sourceFamily = structuredClone(
    discoveryTrancheCommand(campaignPath).payload.tranche.sweeps[0].sourceFamily,
  );
  second.payload.tranche.sweeps[1].sourceFamily = structuredClone(
    discoveryTrancheCommand(campaignPath).payload.tranche.sweeps[1].sourceFamily,
  );
  for (const command of [
    discoveryTrancheCommand(campaignPath),
    second,
    opportunityFormationCommand(campaignPath),
  ]) {
    const result = await runKernel(kernelPath, command);
    assert.equal(result.code, 0, result.stderr);
  }

  const result = await runKernel(
    kernelPath,
    passBreadthGateCommand(campaignPath),
  );

  assert.equal(result.code, 3);
  assert.equal(
    result.response.error.code,
    "SVS-BREADTH-GATE-INVARIANT-VIOLATION",
  );
  assert.match(result.response.error.message, /Source Family diversity/i);
});

test("every surviving Opportunity receives the complete Qualification Gate contract", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-qualification-gates-",
  );
  const storagePath = await mkdtemp(
    path.join(tmpdir(), "solo-venture-scout-storage-"),
  );
  const campaignPath = path.join(storagePath, "qualification-gates-campaign");
  await createDiscoveryCampaign(kernelPath, campaignPath, [], true);
  for (const command of [
    discoveryTrancheCommand(campaignPath),
    secondDiscoveryTrancheCommand(campaignPath),
    opportunityFormationCommand(campaignPath),
    passBreadthGateCommand(campaignPath),
    opportunityExclusionGatesCommand(campaignPath),
  ]) {
    const response = await runKernel(kernelPath, command);
    assert.equal(response.code, 0, response.stderr);
  }

  const command = opportunityQualificationGatesCommand(campaignPath);
  const gapEntries = command.payload.evaluation.assessments.flatMap(
    (/** @type {any} */ assessment) =>
      assessment.gates.map((/** @type {any} */ gate) => ({
        type: "evidence-gap",
        id: gate.decision.evidenceGapIds[0],
        question: `What affirmative evidence resolves ${gate.kind} for ${assessment.opportunityId}?`,
        affectedDecisionIds: [gate.decision.id],
        resolutionCriteria:
          "Current, independent evidence establishes the required condition.",
        resolutionMethod: "Perform one bounded public research action.",
        status: "open",
        resolution: null,
      })),
  );
  const gaps = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "record-qualification-gaps-1",
    command: "recordEvidenceReasoning",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T09:58:00.000Z",
      entries: gapEntries,
    },
  });
  assert.equal(gaps.code, 0, gaps.stderr);

  const invalidTarget = structuredClone(command);
  invalidTarget.requestId = "reject-non-gate-qualification-priority";
  invalidTarget.payload.evaluation.id = "qualification-evaluation-invalid-target";
  invalidTarget.payload.evaluation.researchDecision.id =
    "decision-qualification-invalid-target";
  invalidTarget.payload.evaluation.researchDecision.decisionValuePriorities[0].target = {
    kind: "comparison",
    id: "breadth-gate-1",
  };
  const invalidTargetResult = await runKernel(kernelPath, invalidTarget);
  assert.equal(invalidTargetResult.code, 3);
  assert.equal(
    invalidTargetResult.response.error.code,
    "SVS-OPPORTUNITY-QUALIFICATION-GATE-INVARIANT-VIOLATION",
  );

  const recorded = await runKernel(kernelPath, command);

  assert.equal(recorded.code, 0, recorded.stderr);
  assert.equal(recorded.response.result.recorded, true);
  assert.equal(recorded.response.result.evaluation.id, "qualification-evaluation-1");
  for (const opportunity of recorded.response.result.workView.opportunities) {
    assert.deepEqual(
      opportunity.qualificationGates.map(
        (/** @type {any} */ gate) => gate.kind,
      ),
      qualificationGateKinds,
    );
    assert.ok(
      opportunity.qualificationGates.every(
        (/** @type {any} */ gate) => gate.state === "unresolved",
      ),
    );
    assert.equal(opportunity.disposition.status, "unresolved");
    assert.equal(opportunity.eligibility, "ineligible");
    assert.equal(opportunity.terminalRole, null);
  }
  assert.deepEqual(recorded.response.result.workView.qualificationResearch, {
    state: "continue",
    decisionValuePriorities:
      command.payload.evaluation.researchDecision.decisionValuePriorities,
    stopReason: null,
    decisionId: command.payload.evaluation.researchDecision.id,
  });
  assert.ok(
    recorded.response.result.workView.nextPermittedActions.includes(
      "reserve-public-research",
    ),
  );

  const inspected = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "inspect-qualification-gates-1",
    command: "inspectCampaign",
    payload: { campaignPath },
  });
  assert.equal(inspected.code, 0, inspected.stderr);
  assert.deepEqual(
    inspected.response.result.workView,
    recorded.response.result.workView,
  );

  const withoutDecisionValue = await runKernel(
    kernelPath,
    publicResearchReservationCommand(campaignPath, {
      requestId: "reserve-qualification-research-without-decision-value",
      payload: {
        reservedAt: "2026-09-01T10:01:00.000Z",
        reservation: {
          id: "reservation-qualification-without-decision-value",
          purpose: "Research buyer economics",
          researchClass: "deepening",
          opportunityId: "opportunity-dispatch-reconciliation",
        },
      },
    }),
  );
  assert.equal(withoutDecisionValue.code, 3);
  assert.equal(
    withoutDecisionValue.response.error.code,
    "SVS-RESEARCH-DECISION-VALUE-REQUIRED",
  );

  const mismatchedAction = await runKernel(
    kernelPath,
    publicResearchReservationCommand(campaignPath, {
      requestId: "reserve-qualification-research-with-mismatched-action",
      payload: {
        reservedAt: "2026-09-01T10:03:00.000Z",
        reservation: {
          id: "reservation-qualification-mismatched-action",
          purpose: "Unrelated market scan",
          retrievalRoute: "unplanned-route",
          researchClass: "deepening",
          opportunityId: "opportunity-dispatch-reconciliation",
          decisionValuePriorityId: "priority-qualification-buyer-economics",
        },
      },
    }),
  );
  assert.equal(mismatchedAction.code, 3);
  assert.equal(
    mismatchedAction.response.error.code,
    "SVS-RESEARCH-DECISION-VALUE-SCOPE-MISMATCH",
  );

  const withDecisionValue = await runKernel(
    kernelPath,
    publicResearchReservationCommand(campaignPath, {
      requestId: "reserve-qualification-research-with-decision-value",
      payload: {
        reservedAt: "2026-09-01T10:04:00.000Z",
        reservation: {
          id: "reservation-qualification-with-decision-value",
          purpose: "Research buyer economics",
          researchClass: "deepening",
          opportunityId: "opportunity-dispatch-reconciliation",
          decisionValuePriorityId: "priority-qualification-buyer-economics",
        },
      },
    }),
  );
  assert.equal(withDecisionValue.code, 0, withDecisionValue.stderr);
});

test("a terminal Qualification Gate requires affirmative medium-confidence evidence", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-qualification-confidence-",
  );
  const command = opportunityQualificationGatesCommand("/unused-campaign");
  const gate = command.payload.evaluation.assessments[0].gates[0];
  gate.state = "passed";
  gate.decision.outcome = "passed";
  gate.decision.evidenceGapIds = [];

  const result = await runKernel(kernelPath, command);

  assert.equal(result.code, 3);
  assert.equal(
    result.response.error.code,
    "SVS-OPPORTUNITY-QUALIFICATION-GATES-INVALID",
  );
  assert.match(
    result.response.error.details.join(" "),
    /supportingEvidenceEntryIds.+non-empty.+medium or high Evidence Confidence/is,
  );
});

test("affirmative Qualification Gate evidence must be an Opportunity-scoped Inference", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-qualification-scoped-evidence-",
  );
  const storagePath = await mkdtemp(
    path.join(tmpdir(), "solo-venture-scout-storage-"),
  );
  const campaignPath = path.join(
    storagePath,
    "qualification-scoped-evidence-campaign",
  );
  await createDiscoveryCampaign(kernelPath, campaignPath, [], true);
  for (const command of [
    discoveryTrancheCommand(campaignPath),
    secondDiscoveryTrancheCommand(campaignPath),
    opportunityFormationCommand(campaignPath),
    passBreadthGateCommand(campaignPath),
    opportunityExclusionGatesCommand(campaignPath),
  ]) {
    const response = await runKernel(kernelPath, command);
    assert.equal(response.code, 0, response.stderr);
  }

  const command = opportunityQualificationGatesCommand(campaignPath);
  const gate = command.payload.evaluation.assessments[0].gates[0];
  gate.state = "passed";
  gate.decision.outcome = "passed";
  gate.decision.supportingEvidenceEntryIds = [
    "observation-coordination-workaround",
  ];
  gate.decision.evidenceGapIds = [];
  gate.decision.confidence = {
    level: "medium",
    limitingFactors: ["The public sample is bounded."],
  };
  gate.evidenceBasis.behavioralEvidenceEntryIds = [
    "observation-coordination-workaround",
  ];
  const gapEntries = command.payload.evaluation.assessments.flatMap(
    (/** @type {any} */ assessment) =>
      assessment.gates
        .filter((/** @type {any} */ candidate) => candidate !== gate)
        .map((/** @type {any} */ candidate) => ({
          type: "evidence-gap",
          id: candidate.decision.evidenceGapIds[0],
          question: `What evidence resolves ${candidate.kind}?`,
          affectedDecisionIds: [candidate.decision.id],
          resolutionCriteria: "Affirmative evidence establishes the condition.",
          resolutionMethod: "Perform bounded Public Research.",
          status: "open",
          resolution: null,
        })),
  );
  assert.equal(
    (
      await runKernel(kernelPath, {
        envelopeVersion: "0.1.0",
        requestId: "record-qualification-scoped-evidence-gaps",
        command: "recordEvidenceReasoning",
        payload: {
          campaignPath,
          coordinatorId: "coordinator-primary",
          recordedAt: "2026-09-01T09:58:00.000Z",
          entries: gapEntries,
        },
      })
    ).code,
    0,
  );

  const result = await runKernel(kernelPath, command);

  assert.equal(result.code, 3);
  assert.equal(
    result.response.error.code,
    "SVS-OPPORTUNITY-QUALIFICATION-GATE-INVARIANT-VIOLATION",
  );
  assert.match(result.response.error.message, /Opportunity-scoped Inferences/);
});

test("market Qualification Gates require independent behavior evidence, current evidence, and traceable ranges", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-qualification-evidence-quality-",
  );
  const storagePath = await mkdtemp(
    path.join(tmpdir(), "solo-venture-scout-storage-"),
  );
  const campaignPath = path.join(
    storagePath,
    "qualification-evidence-quality-campaign",
  );
  await createDiscoveryCampaign(kernelPath, campaignPath, [], true);
  for (const command of [
    discoveryTrancheCommand(campaignPath),
    secondDiscoveryTrancheCommand(campaignPath),
    opportunityFormationCommand(campaignPath),
    passBreadthGateCommand(campaignPath),
    opportunityExclusionGatesCommand(campaignPath, {
      dispatchClassification: "elevated-risk",
    }),
  ]) {
    const response = await runKernel(kernelPath, command);
    assert.equal(response.code, 0, response.stderr);
  }
  const reasoning = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "record-qualification-evidence-quality",
    command: "recordEvidenceReasoning",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T09:58:00.000Z",
      entries: [
        ...[
          [
            "freshness-dispatch-occupation",
            "source-occupation-map",
            "observation-coordination-workaround",
          ],
          [
            "freshness-dispatch-study",
            "source-dispatch-study",
            "observation-dispatch-time-loss",
          ],
          [
            "freshness-tender-procurement",
            "source-procurement-map",
            "observation-procurement-escalation",
          ],
          [
            "freshness-tender-study",
            "source-supplier-study",
            "observation-supplier-review-spend",
          ],
        ].map(([id, sourceId, observationId]) => ({
          type: "source-freshness",
          id,
          sourceId,
          observationId,
          intendedUse:
            "Assess a current time-sensitive Qualification Gate claim.",
          assessment: "high",
          timeSensitivity:
            "Buyer behavior, market conditions, and feasibility may change.",
          rationale: "The evidence was published within the current quarter.",
          limitations: ["The next material market change requires reassessment."],
        })),
        {
          type: "inference",
          id: "inference-dispatch-qualification-evidence",
          text:
            "Independent current behavior evidence supports the dispatch Opportunity's qualification requirements and bounded commercial ranges.",
          scope: "opportunity-dispatch-reconciliation",
          reasoning:
            "Two independently originated Sources report committed behavior and material consequences in the current workflow.",
          supportingEntryIds: [
            "observation-coordination-workaround",
            "observation-dispatch-time-loss",
          ],
          challengingEntryIds: [],
          confidence: { level: "medium", limitingFactors: ["The sample is bounded."] },
        },
        {
          type: "inference",
          id: "inference-tender-qualification-evidence",
          text:
            "Independent current behavior evidence supports the tender Opportunity's qualification requirements and bounded commercial ranges.",
          scope: "opportunity-specialist-tender-review",
          reasoning:
            "Two independently originated Sources report committed buyer expenditure and consequences in the current workflow.",
          supportingEntryIds: [
            "observation-procurement-escalation",
            "observation-supplier-review-spend",
          ],
          challengingEntryIds: [],
          confidence: { level: "medium", limitingFactors: ["The sample is bounded."] },
        },
      ],
    },
  });
  assert.equal(reasoning.code, 0, reasoning.stderr);

  const command = passingOpportunityQualificationGatesCommand(campaignPath);
  const dependent = structuredClone(command);
  dependent.requestId = "reject-one-qualification-source-lineage";
  dependent.payload.evaluation.assessments[0].gates[0]
    .evidenceBasis.independentSourceLineages.pop();
  const dependentResult = await runKernel(kernelPath, dependent);
  assert.equal(dependentResult.code, 3, JSON.stringify(dependentResult.response));
  assert.equal(
    dependentResult.response.error.code,
    "SVS-OPPORTUNITY-QUALIFICATION-GATE-INVARIANT-VIOLATION",
    JSON.stringify(dependentResult.response),
  );
  assert.match(dependentResult.response.error.message, /independent behavior evidence/i);

  const stale = structuredClone(command);
  stale.requestId = "reject-qualification-without-current-evidence";
  stale.payload.evaluation.assessments[0].gates.find(
    (/** @type {any} */ gate) =>
      gate.kind === "legal-operational-feasibility",
  ).evidenceBasis.sourceFreshnessIds = [];
  const staleResult = await runKernel(kernelPath, stale);
  assert.equal(staleResult.code, 3);
  assert.equal(
    staleResult.response.error.code,
    "SVS-OPPORTUNITY-QUALIFICATION-GATE-INVARIANT-VIOLATION",
  );
  assert.match(staleResult.response.error.message, /current evidence/i);

  const pointForecast = structuredClone(command);
  pointForecast.requestId = "reject-point-commercial-forecast";
  const commercialGate = pointForecast.payload.evaluation.assessments[0].gates.find(
    (/** @type {any} */ gate) => gate.kind === "commercial-plausibility",
  );
  commercialGate.commercialRanges.price.high =
    commercialGate.commercialRanges.price.low;
  const pointResult = await runKernel(kernelPath, pointForecast);
  assert.equal(pointResult.code, 3);
  assert.equal(
    pointResult.response.error.code,
    "SVS-OPPORTUNITY-QUALIFICATION-GATES-INVALID",
  );
  assert.match(pointResult.response.error.details.join(" "), /low less than high/i);

  const recorded = await runKernel(kernelPath, command);
  assert.equal(recorded.code, 0, recorded.stderr);
  assert.deepEqual(
    recorded.response.result.workView.opportunities.map(
      (/** @type {any} */ opportunity) => ({
        disposition: opportunity.disposition.status,
        eligibility: opportunity.eligibility,
      }),
    ),
    [
      { disposition: "unresolved", eligibility: "ineligible" },
      { disposition: "active", eligibility: "eligible" },
    ],
  );
  assert.deepEqual(recorded.response.result.workView.nextPermittedActions, [
    "compare-eligible-opportunities",
  ]);
});

test("the protected adversarial reserve can challenge an apparent leader after qualification", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-adversarial-research-",
  );
  const storagePath = await mkdtemp(
    path.join(tmpdir(), "solo-venture-scout-storage-"),
  );
  const campaignPath = path.join(storagePath, "adversarial-research-campaign");
  await prepareEligibleCampaign(kernelPath, campaignPath);

  for (let index = 1; index <= 6; index += 1) {
    const reservation = await runKernel(
      kernelPath,
      publicResearchReservationCommand(campaignPath, {
        requestId: `reserve-adversarial-source-${index}`,
        payload: {
          reservedAt: `2026-09-01T10:${String(index).padStart(2, "0")}:00.000Z`,
          reservation: {
            id: `reservation-adversarial-${index}`,
            purpose:
              "Challenge the apparent leader for decision-changing gaps, contradictions, or contenders",
            researchClass: "adversarial",
            opportunityId: "opportunity-dispatch-reconciliation",
          },
        },
      }),
    );
    assert.equal(
      reservation.code,
      0,
      `${reservation.stderr}\n${JSON.stringify(reservation.response)}`,
    );
    assert.equal(
      reservation.response.result.researchBudget.remainingAdversarialSourceUnits,
      6 - index,
    );
  }

  const exhausted = await runKernel(
    kernelPath,
    publicResearchReservationCommand(campaignPath, {
      requestId: "reserve-adversarial-source-over-cap",
      payload: {
        reservedAt: "2026-09-01T10:07:00.000Z",
        reservation: {
          id: "reservation-adversarial-over-cap",
          purpose: "Attempt to exceed the adversarial reserve",
          researchClass: "adversarial",
          opportunityId: "opportunity-dispatch-reconciliation",
        },
      },
    }),
  );
  assert.equal(exhausted.code, 3);
  assert.equal(exhausted.response.error.code, "SVS-ADVERSARIAL-RESEARCH-BUDGET-EXHAUSTED");
});

test("a genuine tie produces an immutable unscored Inconclusive Comparison Report", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-inconclusive-comparison-",
  );
  const storagePath = await mkdtemp(
    path.join(tmpdir(), "solo-venture-scout-storage-"),
  );
  const campaignPath = path.join(storagePath, "inconclusive-comparison-campaign");
  await prepareEligibleCampaign(kernelPath, campaignPath);
  await completeAdversarialResearch(kernelPath, campaignPath);
  const gap = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "record-inconclusive-comparison-gap",
    command: "recordEvidenceReasoning",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T10:30:30.000Z",
      entries: [
        {
          type: "evidence-gap",
          id: "gap-tender-durability-boundary",
          question: "Does specialist durability outweigh the higher operating input?",
          affectedDecisionIds: ["decision-inconclusive-comparison-1"],
          resolutionCriteria: "Independent evidence separates the overlapping ranges.",
          resolutionMethod: "Run one targeted comparison research extension.",
          status: "open",
          resolution: null,
        },
      ],
    },
  });
  assert.equal(gap.code, 0, gap.stderr);

  const completed = await runKernel(
    kernelPath,
    concludeInconclusiveComparisonCommand(campaignPath),
  );

  assert.equal(completed.code, 0, `${completed.stderr}\n${JSON.stringify(completed.response)}`);
  assert.equal(completed.response.result.outcome, "inconclusive-comparison");
  assert.deepEqual(
    completed.response.result.report.comparison.nonDominatedOpportunityIds,
    [
      "opportunity-dispatch-reconciliation",
      "opportunity-specialist-tender-review",
    ],
  );
  assert.deepEqual(completed.response.result.report.availableActions, [
    "stop",
    "extend",
    "select",
  ]);
  assert.deepEqual(completed.response.result.workView.nextPermittedActions, [
    "stop-inconclusive-comparison",
    "extend-targeted-research",
    "select-non-dominated-opportunities",
  ]);
  assert.equal(completed.response.result.workView.terminal, undefined);
  assert.equal(completed.response.result.opportunityBriefs, undefined);
  assert.deepEqual(completed.response.result.artifact, {
    path: path.join(campaignPath, "inconclusive-comparison-report.md"),
    format: "markdown",
    immutable: true,
  });
  const artifact = await readFile(
    path.join(campaignPath, "inconclusive-comparison-report.md"),
    "utf8",
  );
  assert.match(artifact, /^# Inconclusive Comparison Report/m);
  assert.match(
    artifact,
    /Unscored side-by-side comparison[\s\S]+opportunity-dispatch-reconciliation[\s\S]+opportunity-specialist-tender-review/i,
  );
  assert.match(artifact, /Decisive trade-offs/i);
  assert.match(
    artifact,
    /Explicit blocker[\s\S]+opportunity-specialist-tender-review[\s\S]+gap-tender-durability-boundary/i,
  );
  assert.doesNotMatch(artifact, /\d+% chance/i);
  assert.equal(
    (await stat(path.join(campaignPath, "inconclusive-comparison-report.md"))).mode &
      0o777,
    0o600,
  );
});

test("replaying a terminal operation regenerates an interrupted deterministic rendering", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-render-recovery-",
  );
  const storagePath = await mkdtemp(
    path.join(tmpdir(), "solo-venture-scout-storage-"),
  );
  const campaignPath = path.join(storagePath, "render-recovery-campaign");
  const interrupted = await enterInconclusiveComparison(
    kernelPath,
    campaignPath,
    {
      ...process.env,
      NODE_ENV: "test",
      SVS_FAULT_INJECTION: "during-terminal-rendering",
    },
  );

  assert.equal(interrupted.code, 3);

  const replayed = await runKernel(
    kernelPath,
    concludeInconclusiveComparisonCommand(campaignPath),
  );

  assert.equal(
    replayed.code,
    0,
    `${replayed.stderr}\n${JSON.stringify(replayed.response)}`,
  );
  assert.equal(replayed.response.result.completed, false);
  const reportPath = path.join(
    campaignPath,
    "inconclusive-comparison-report.md",
  );
  const renderedOnce = await readFile(reportPath, "utf8");
  assert.match(renderedOnce, /^# Inconclusive Comparison Report/m);
  const replayedAgain = await runKernel(
    kernelPath,
    concludeInconclusiveComparisonCommand(campaignPath),
  );
  assert.equal(replayedAgain.code, 0, replayedAgain.stderr);
  assert.equal(replayedAgain.response.result.completed, false);
  assert.equal(await readFile(reportPath, "utf8"), renderedOnce);
});

test("an evidence-complete tie without an apparent leader needs no artificial blocker", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-settled-inconclusive-tie-",
  );
  const storagePath = await mkdtemp(
    path.join(tmpdir(), "solo-venture-scout-storage-"),
  );
  const campaignPath = path.join(storagePath, "settled-inconclusive-tie-campaign");
  await prepareEligibleCampaign(kernelPath, campaignPath);
  await completeAdversarialResearch(kernelPath, campaignPath);
  const command = concludeInconclusiveComparisonCommand(campaignPath);
  command.requestId = "conclude-settled-inconclusive-tie-1";
  command.payload.reportId = "settled-inconclusive-tie-report-1";
  command.payload.comparison.id = "settled-inconclusive-tie-comparison-1";
  command.payload.comparison.apparentLeaderOpportunityId = /** @type {any} */ (null);
  command.payload.comparison.blockers = [];
  command.payload.comparison.decision.id = "settled-inconclusive-tie-decision-1";
  command.payload.comparison.decision.rationale =
    "The evidence establishes a genuine trade-off but does not establish a defensible leader.";

  const completed = await runKernel(kernelPath, command);

  assert.equal(
    completed.code,
    0,
    `${completed.stderr}\n${JSON.stringify(completed.response)}`,
  );
  const artifact = await readFile(
    path.join(campaignPath, "inconclusive-comparison-report.md"),
    "utf8",
  );
  assert.match(artifact, /Explicit blockers[\s\S]+None\./i);
});

test("one apparent leader remains inconclusive when an unresolved contender could displace it", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-unresolved-contender-",
  );
  const storagePath = await mkdtemp(
    path.join(tmpdir(), "solo-venture-scout-storage-"),
  );
  const campaignPath = path.join(storagePath, "unresolved-contender-campaign");
  await createDiscoveryCampaign(kernelPath, campaignPath, [], true);
  for (const command of [
    discoveryTrancheCommand(campaignPath),
    secondDiscoveryTrancheCommand(campaignPath),
    opportunityFormationCommand(campaignPath),
    passBreadthGateCommand(campaignPath),
  ]) {
    const result = await runKernel(kernelPath, command);
    assert.equal(result.code, 0, result.stderr);
  }
  const exclusions = opportunityExclusionGatesCommand(campaignPath);
  exclusions.payload.assessments[1].marketSafety.classification = "elevated-risk";
  const excluded = await runKernel(kernelPath, exclusions);
  assert.equal(excluded.code, 0, excluded.stderr);
  await recordPassingQualificationEvidence(kernelPath, campaignPath);
  const qualification = await runKernel(
    kernelPath,
    passingOpportunityQualificationGatesCommand(campaignPath),
  );
  assert.equal(qualification.code, 0, qualification.stderr);
  await completeAdversarialResearch(kernelPath, campaignPath);
  const gap = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "record-unresolved-contender-gap",
    command: "recordEvidenceReasoning",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T10:30:30.000Z",
      entries: [
        {
          type: "evidence-gap",
          id: "gap-unresolved-tender-approval",
          question: "Would approved deep research leave tender review able to displace dispatch reconciliation?",
          affectedDecisionIds: ["decision-inconclusive-comparison-1"],
          resolutionCriteria: "Approved evidence resolves the contender boundary.",
          resolutionMethod: "Request scoped approval and deepen only the tender Opportunity.",
          status: "open",
          resolution: null,
        },
      ],
    },
  });
  assert.equal(gap.code, 0, gap.stderr);
  const command = concludeInconclusiveComparisonCommand(campaignPath);
  command.requestId = "conclude-unresolved-contender-1";
  command.payload.reportId = "unresolved-contender-report-1";
  command.payload.comparison.id = "unresolved-contender-comparison-1";
  command.payload.comparison.profiles = [command.payload.comparison.profiles[0]];
  command.payload.comparison.dominanceAssessments = [];
  command.payload.comparison.nonDominatedOpportunityIds = [
    "opportunity-dispatch-reconciliation",
  ];
  command.payload.comparison.decisiveTradeOffs[0].summary =
    "Dispatch is currently eligible, while unresolved tender durability could still displace it after approved research.";
  command.payload.comparison.blockers[0].evidenceGapIds = [
    "gap-unresolved-tender-approval",
  ];
  command.payload.comparison.decision.evidenceEntryIds = [
    "inference-dispatch-qualification-evidence",
  ];

  const completed = await runKernel(kernelPath, command);

  assert.equal(
    completed.code,
    0,
    `${completed.stderr}\n${JSON.stringify(completed.response)}`,
  );
  const artifact = await readFile(
    path.join(campaignPath, "inconclusive-comparison-report.md"),
    "utf8",
  );
  assert.match(
    artifact,
    /Explicit blockers[\s\S]+opportunity-specialist-tender-review.+could displace.+opportunity-dispatch-reconciliation/i,
  );
});

test("stopping an inconclusive comparison preserves its report and creates no Opportunity Brief", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-stop-inconclusive-",
  );
  const storagePath = await mkdtemp(
    path.join(tmpdir(), "solo-venture-scout-storage-"),
  );
  const campaignPath = path.join(storagePath, "stop-inconclusive-campaign");
  await prepareEligibleCampaign(kernelPath, campaignPath);
  await completeAdversarialResearch(kernelPath, campaignPath);
  assert.equal(
    (
      await runKernel(kernelPath, {
        envelopeVersion: "0.1.0",
        requestId: "record-stop-inconclusive-gap",
        command: "recordEvidenceReasoning",
        payload: {
          campaignPath,
          coordinatorId: "coordinator-primary",
          recordedAt: "2026-09-01T10:30:30.000Z",
          entries: [
            {
              type: "evidence-gap",
              id: "gap-tender-durability-boundary",
              question: "Does specialist durability outweigh the higher operating input?",
              affectedDecisionIds: ["decision-inconclusive-comparison-1"],
              resolutionCriteria: "Independent evidence separates the overlapping ranges.",
              resolutionMethod: "Run one targeted comparison research extension.",
              status: "open",
              resolution: null,
            },
          ],
        },
      })
    ).code,
    0,
  );
  assert.equal(
    (
      await runKernel(
        kernelPath,
        concludeInconclusiveComparisonCommand(campaignPath),
      )
    ).code,
    0,
  );
  const reportPath = path.join(campaignPath, "inconclusive-comparison-report.md");
  const originalReport = await readFile(reportPath, "utf8");

  const stopped = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "stop-inconclusive-comparison-1",
    command: "respondInconclusiveComparison",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      respondedAt: "2026-09-01T10:32:00.000Z",
      reportId: "inconclusive-comparison-report-1",
      response: {
        kind: "stop",
        rationale: "The current report is sufficient; do not spend more research effort.",
      },
    },
  });

  assert.equal(stopped.code, 0, `${stopped.stderr}\n${JSON.stringify(stopped.response)}`);
  assert.equal(stopped.response.result.action, "stop");
  assert.deepEqual(stopped.response.result.workView.terminal, {
    outcome: "inconclusive-comparison",
    reportId: "inconclusive-comparison-report-1",
    artifactPath: "inconclusive-comparison-report.md",
    action: "stopped",
    immutable: true,
    concludedAt: "2026-09-01T10:32:00.000Z",
  });
  assert.equal(stopped.response.result.opportunityBriefs, undefined);
  assert.equal(await readFile(reportPath, "utf8"), originalReport);
  assert.equal(
    await stat(path.join(campaignPath, "opportunity-brief.md")).then(
      () => true,
      () => false,
    ),
    false,
  );

  const research = await runKernel(
    kernelPath,
    publicResearchReservationCommand(campaignPath, {
      requestId: "research-after-inconclusive-stop",
      payload: {
        reservedAt: "2026-09-01T10:33:00.000Z",
        reservation: {
          id: "reservation-after-inconclusive-stop",
          purpose: "Attempt to mutate a stopped Campaign",
          researchClass: "adversarial",
          opportunityId: "opportunity-dispatch-reconciliation",
        },
      },
    }),
  );
  assert.equal(research.code, 3);
  assert.equal(research.response.error.code, "SVS-CAMPAIGN-TERMINAL");
  assert.equal(await readFile(reportPath, "utf8"), originalReport);
});

test("extending an inconclusive comparison versions intake and resumes only targeted Evidence Gaps", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-extend-inconclusive-",
  );
  const storagePath = await mkdtemp(
    path.join(tmpdir(), "solo-venture-scout-storage-"),
  );
  const campaignPath = path.join(storagePath, "extend-inconclusive-campaign");
  await enterInconclusiveComparison(kernelPath, campaignPath);
  const reportPath = path.join(campaignPath, "inconclusive-comparison-report.md");
  const originalReport = await readFile(reportPath, "utf8");
  const researchBudget = {
    profile: "custom",
    sourceCap: 5,
    discoverySweepCap: 1,
    sourceFamilyMinimum: 1,
    deepenedOpportunityCap: 2,
    minimumComparisonSet: 2,
    adversarialSourceReserve: 1,
    paidSpendCap: { amount: 0, currency: "GBP" },
  };

  const extended = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "extend-inconclusive-comparison-1",
    command: "respondInconclusiveComparison",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      respondedAt: "2026-09-01T10:32:00.000Z",
      reportId: "inconclusive-comparison-report-1",
      response: {
        kind: "extend",
        rationale: "Resolve only the durability boundary that blocks comparison.",
        targetedEvidenceGapIds: ["gap-tender-durability-boundary"],
        affectedOpportunityIds: [
          "opportunity-dispatch-reconciliation",
          "opportunity-specialist-tender-review",
        ],
        researchBudget,
      },
    },
  });

  assert.equal(extended.code, 0, `${extended.stderr}\n${JSON.stringify(extended.response)}`);
  assert.equal(extended.response.result.action, "extend");
  assert.equal(extended.response.result.intake.version, 2);
  assert.equal(
    extended.response.result.intake.confirmedAt,
    "2026-09-01T10:32:00.000Z",
  );
  assert.deepEqual(extended.response.result.intake.researchBudget, researchBudget);
  assert.deepEqual(extended.response.result.researchBudget, {
    sourceCap: 5,
    adversarialSourceReserve: 1,
    ordinarySourceCap: 4,
    reservedSourceUnits: 0,
    settledSourceUnits: 0,
    remainingOrdinarySourceUnits: 4,
    remainingAdversarialSourceUnits: 1,
  });
  assert.equal(extended.response.result.workView.phase, "opportunity-deepening");
  assert.equal(extended.response.result.workView.publicResearchAvailable, true);
  assert.deepEqual(extended.response.result.workView.researchExtension, {
    reportId: "inconclusive-comparison-report-1",
    intakeVersion: 2,
    targetedEvidenceGapIds: ["gap-tender-durability-boundary"],
    affectedOpportunityIds: [
      "opportunity-dispatch-reconciliation",
      "opportunity-specialist-tender-review",
    ],
  });
  assert.equal(await readFile(reportPath, "utf8"), originalReport);

  const unrelated = await runKernel(
    kernelPath,
    publicResearchReservationCommand(campaignPath, {
      requestId: "reserve-untargeted-extension-research",
      payload: {
        reservedAt: "2026-09-01T10:33:00.000Z",
        reservation: {
          id: "reservation-untargeted-extension",
          purpose: "Research an unrelated question",
          researchClass: "deepening",
          opportunityId: "opportunity-dispatch-reconciliation",
          evidenceGapId: "gap-unrelated",
        },
      },
    }),
  );
  assert.equal(unrelated.code, 3);
  assert.equal(unrelated.response.error.code, "SVS-RESEARCH-EXTENSION-SCOPE-MISMATCH");

  const unrelatedReasoning = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "record-untargeted-extension-reasoning",
    command: "recordEvidenceReasoning",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T10:33:30.000Z",
      entries: [
        {
          type: "evidence-gap",
          id: "gap-unrelated-extension-work",
          question: "Should unrelated discovery resume?",
          affectedDecisionIds: ["decision-breadth-gate-1"],
          resolutionCriteria: "Unrelated discovery is separately authorised.",
          resolutionMethod: "Start a separate Campaign.",
          status: "open",
          resolution: null,
        },
      ],
    },
  });
  assert.equal(unrelatedReasoning.code, 3);
  assert.equal(
    unrelatedReasoning.response.error.code,
    "SVS-RESEARCH-EXTENSION-SCOPE-MISMATCH",
  );

  const targeted = await runKernel(
    kernelPath,
    publicResearchReservationCommand(campaignPath, {
      requestId: "reserve-targeted-extension-research",
      payload: {
        reservedAt: "2026-09-01T10:33:00.000Z",
        reservation: {
          id: "reservation-targeted-extension",
          purpose: "Resolve the targeted durability Evidence Gap",
          researchClass: "deepening",
          opportunityId: "opportunity-specialist-tender-review",
          evidenceGapId: "gap-tender-durability-boundary",
        },
      },
    }),
  );
  assert.equal(targeted.code, 0, `${targeted.stderr}\n${JSON.stringify(targeted.response)}`);
  assert.equal(targeted.response.result.researchBudget.reservedSourceUnits, 1);
  assert.equal(await readFile(reportPath, "utf8"), originalReport);
});

test("selecting multiple Non-Dominated Opportunities creates separately marked immutable briefs", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-select-inconclusive-",
  );
  const storagePath = await mkdtemp(
    path.join(tmpdir(), "solo-venture-scout-storage-"),
  );
  const campaignPath = path.join(storagePath, "select-inconclusive-campaign");
  await enterInconclusiveComparison(kernelPath, campaignPath);
  const reportPath = path.join(campaignPath, "inconclusive-comparison-report.md");
  const originalReport = await readFile(reportPath, "utf8");

  const selected = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "select-inconclusive-opportunities-1",
    command: "respondInconclusiveComparison",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      respondedAt: "2026-09-01T10:32:00.000Z",
      reportId: "inconclusive-comparison-report-1",
      response: {
        kind: "select",
        selections: [
          developerSelection("opportunity-dispatch-reconciliation"),
          developerSelection("opportunity-specialist-tender-review"),
        ],
      },
    },
  });

  assert.equal(selected.code, 0, `${selected.stderr}\n${JSON.stringify(selected.response)}`);
  assert.equal(selected.response.result.action, "select");
  assert.equal(selected.response.result.opportunityBriefs.length, 2);
  for (const brief of selected.response.result.opportunityBriefs) {
    const preferenceTrace = brief.traceability.rows.find(
      (/** @type {any} */ row) =>
        row.conclusion === "Developer selection preference",
    );
    assert.deepEqual(preferenceTrace.entryIds, [
      "select-inconclusive-opportunities-1",
    ]);
    assert.equal(
      brief.selectionProvenance.responseRequestId,
      "select-inconclusive-opportunities-1",
    );
    assert.equal(
      preferenceTrace.entryIds.some((/** @type {string} */ id) =>
        id.startsWith("inference-"),
      ),
      false,
    );
  }
  assert.deepEqual(
    selected.response.result.opportunityBriefs.map(
      (/** @type {any} */ brief) => ({
        opportunityId: brief.opportunity.id,
        role: brief.role,
        provenance: brief.selectionProvenance.classification,
        wayfinderPath: brief.wayfinderHandoff.briefPath,
        invoked: brief.wayfinderHandoff.invoked,
      }),
    ),
    [
      {
        opportunityId: "opportunity-dispatch-reconciliation",
        role: "developer-selected-opportunity",
        provenance: "developer-preference-not-market-evidence",
        wayfinderPath:
          "opportunity-brief-opportunity-dispatch-reconciliation.md",
        invoked: false,
      },
      {
        opportunityId: "opportunity-specialist-tender-review",
        role: "developer-selected-opportunity",
        provenance: "developer-preference-not-market-evidence",
        wayfinderPath:
          "opportunity-brief-opportunity-specialist-tender-review.md",
        invoked: false,
      },
    ],
  );
  assert.deepEqual(selected.response.result.workView.terminal, {
    outcome: "developer-selected-opportunities",
    reportId: "inconclusive-comparison-report-1",
    briefIds: [
      "opportunity-brief-developer-dispatch",
      "opportunity-brief-developer-tender",
    ],
    artifactPaths: [
      "opportunity-brief-opportunity-dispatch-reconciliation.md",
      "opportunity-brief-opportunity-specialist-tender-review.md",
    ],
    immutable: true,
    concludedAt: "2026-09-01T10:32:00.000Z",
  });
  assert.deepEqual(
    selected.response.result.workView.opportunities.map(
      (/** @type {any} */ opportunity) => opportunity.terminalRole,
    ),
    ["developer-selected-opportunity", "developer-selected-opportunity"],
  );
  for (const opportunityId of [
    "opportunity-dispatch-reconciliation",
    "opportunity-specialist-tender-review",
  ]) {
    const brief = await readFile(
      path.join(campaignPath, `opportunity-brief-${opportunityId}.md`),
      "utf8",
    );
    assert.match(brief, /Developer-Selected Opportunity/);
    assert.match(brief, /developer Preference, not market evidence/i);
    assert.match(
      brief,
      /Selection response.+select-inconclusive-opportunities-1/i,
    );
    assert.doesNotMatch(brief, /Scout-recommended Leading Opportunity/);
    assert.match(brief, /Optional separate Wayfinder handoff/i);
    assert.match(brief, /not been started/i);
  }
  assert.equal(await readFile(reportPath, "utf8"), originalReport);
  assert.equal(
    await stat(path.join(campaignPath, "opportunity-brief.md")).then(
      () => true,
      () => false,
    ),
    false,
  );
});

test("a robust comparison produces one immutable Leading Opportunity Brief", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-leading-opportunity-",
  );
  const storagePath = await mkdtemp(
    path.join(tmpdir(), "solo-venture-scout-storage-"),
  );
  const campaignPath = path.join(storagePath, "leading-opportunity-campaign");
  await prepareEligibleCampaign(kernelPath, campaignPath, [
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
  ]);
  await completeAdversarialResearch(kernelPath, campaignPath);

  /** @param {string} evidenceEntryId @param {boolean} dispatch */
  const dimensions = (evidenceEntryId, dispatch) => ({
    requiredInput: {
      validation: comparisonDimension(
        dispatch ? "Bounded public validation is available." : "Specialist validation takes more effort.",
        evidenceEntryId,
      ),
      initialDelivery: comparisonDimension(
        dispatch ? "A narrow customer outcome is feasible." : "Document variance increases initial delivery effort.",
        evidenceEntryId,
      ),
      acquisition: comparisonDimension(
        dispatch ? "Existing workflow access reduces acquisition effort." : "Buyers require specialist procurement access.",
        evidenceEntryId,
      ),
      operations: comparisonDimension(
        dispatch ? "The operating burden remains bounded." : "Tender cycles create a material support burden.",
        evidenceEntryId,
      ),
      time: comparisonDimension(dispatch ? "Fits fifteen hours per week." : "Requires more irregular specialist time.", evidenceEntryId),
      cash: comparisonDimension("The evidence supports low initial cash exposure.", evidenceEntryId),
      irreversibleDownside: comparisonDimension("No material irreversible commitment is required.", evidenceEntryId),
      opportunityCost: comparisonDimension(dispatch ? "The bounded test preserves other options." : "Long tender cycles delay other tests.", evidenceEntryId),
    },
    potentialOutput: {
      commercialHeadroom: comparisonDimension(dispatch ? "The supported range clears the target with headroom." : "The supported range can clear the target.", evidenceEntryId),
      scale: comparisonDimension(dispatch ? "The workflow can serve a broader customer base." : "The specialist segment is narrower.", evidenceEntryId),
      durability: comparisonDimension("Recurring workflow consequences support durable demand.", evidenceEntryId),
      strategicLeverage: comparisonDimension(dispatch ? "Workflow expertise compounds access leverage." : "Specialist knowledge offers bounded leverage.", evidenceEntryId),
    },
    outcomeUncertainty: comparisonDimension("Commercial outcomes remain materially variable across the supported ranges.", evidenceEntryId),
    inputOutputAsymmetry: comparisonDimension(dispatch ? "Low bounded input retains credible high output." : "Credible output requires materially more operating input.", evidenceEntryId),
    riskToleranceFit: {
      fit: "within",
      ...comparisonDimension("The bounded downside remains within the declared risk tolerance.", evidenceEntryId),
    },
  });
  /** @type {any} */
  const command = {
    envelopeVersion: "0.1.0",
    requestId: "conclude-leading-opportunity-1",
    command: "concludeLeadingOpportunity",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      concludedAt: "2026-09-01T10:30:00.000Z",
      comparison: {
        id: "comparison-leading-1",
        profiles: [
          {
            opportunityId: "opportunity-dispatch-reconciliation",
            ...dimensions("inference-dispatch-qualification-evidence", true),
            preferences: [
              {
                statementId: "preference-low-operating-burden",
                effect: "advantage",
                materiality: "material",
                rationale: "The bounded operating model fits the confirmed major Preference.",
                evidenceEntryIds: ["inference-dispatch-qualification-evidence"],
                confidence: { level: "medium", limitingFactors: ["Operating evidence is bounded."] },
              },
            ],
            advantages: [
              {
                statementId: "advantage-operations-domain",
                effect: "reduces-input",
                rationale: "Existing expertise reduces validation and acquisition input.",
                evidenceEntryIds: ["inference-dispatch-qualification-evidence"],
                confidence: { level: "medium", limitingFactors: ["Leverage varies by customer."] },
              },
            ],
          },
          {
            opportunityId: "opportunity-specialist-tender-review",
            ...dimensions("inference-tender-qualification-evidence", false),
            preferences: [
              {
                statementId: "preference-low-operating-burden",
                effect: "disadvantage",
                materiality: "material",
                rationale: "Irregular review cycles conflict with the confirmed major Preference.",
                evidenceEntryIds: ["inference-tender-qualification-evidence"],
                confidence: { level: "medium", limitingFactors: ["Workload varies by tender."] },
              },
            ],
            advantages: [
              {
                statementId: "advantage-operations-domain",
                effect: "not-demonstrated",
                rationale: "The confirmed domain Advantage is not demonstrated for this Opportunity.",
                evidenceEntryIds: [],
                confidence: { level: "unknown", limitingFactors: ["No evidence links the Advantage to this Opportunity."] },
              },
            ],
          },
        ],
        dominanceAssessments: [
          {
            challengerOpportunityId: "opportunity-dispatch-reconciliation",
            alternativeOpportunityId: "opportunity-specialist-tender-review",
            outcome: "does-not-dominate",
            criteria: {
              requiresNoMoreMaterialInput: true,
              offersNoLessCredibleOutput: false,
              fitsDeveloperProfileAtLeastAsWell: true,
              materiallyBetterOn: ["input-output-asymmetry", "developer-profile-fit"],
            },
            rationale: "Tender review retains distinct specialist durability, so it remains Non-Dominated.",
            evidenceEntryIds: ["inference-dispatch-qualification-evidence", "inference-tender-qualification-evidence"],
            confidence: { level: "medium", limitingFactors: ["Output ranges overlap."] },
          },
          {
            challengerOpportunityId: "opportunity-specialist-tender-review",
            alternativeOpportunityId: "opportunity-dispatch-reconciliation",
            outcome: "does-not-dominate",
            criteria: {
              requiresNoMoreMaterialInput: false,
              offersNoLessCredibleOutput: false,
              fitsDeveloperProfileAtLeastAsWell: false,
              materiallyBetterOn: ["durability"],
            },
            rationale: "The specialist durability advantage does not overcome higher material input.",
            evidenceEntryIds: ["inference-dispatch-qualification-evidence", "inference-tender-qualification-evidence"],
            confidence: { level: "medium", limitingFactors: ["Output ranges overlap."] },
          },
        ],
        nonDominatedOpportunityIds: [
          "opportunity-dispatch-reconciliation",
          "opportunity-specialist-tender-review",
        ],
        leadingAssessment: {
          opportunityId: "opportunity-dispatch-reconciliation",
          advantagesOverAlternatives: [
            {
              alternativeOpportunityId: "opportunity-specialist-tender-review",
              basis: "major-preference",
              preferenceStatementId: "preference-low-operating-burden",
              rationale: "Lower operating input materially fits the confirmed major Preference.",
              evidenceEntryIds: ["inference-dispatch-qualification-evidence", "inference-tender-qualification-evidence"],
              confidence: { level: "medium", limitingFactors: ["The ranges overlap at their edges."] },
            },
          ],
          noMaterialDisadvantage: {
            established: true,
            summary: "No alternative has a material advantage on another major Preference or declared Risk Tolerance.",
            evidenceEntryIds: ["inference-dispatch-qualification-evidence", "inference-tender-qualification-evidence"],
            confidence: { level: "medium", limitingFactors: ["Evidence is bounded."] },
          },
          robustAcrossCredibleRanges: {
            established: true,
            summary: "The selection persists at the credible edges of every recorded input and output range.",
            evidenceEntryIds: ["inference-dispatch-qualification-evidence", "inference-tender-qualification-evidence"],
            confidence: { level: "medium", limitingFactors: ["Future ranges may change."] },
          },
          unresolvedContenderOpportunityIds: [],
          decisionChangingEvidenceGapIds: [],
          decisionChangingContradictionIds: [],
          adversarialChallenge: {
            reservationIds: Array.from({ length: 6 }, (_, index) => `reservation-adversarial-${index + 1}`),
            outcome: "leader-remains-eligible",
            summary: "The complete protected reserve found no decision-changing challenge.",
            evidenceEntryIds: ["inference-adversarial-leader-survives"],
            confidence: { level: "medium", limitingFactors: ["The challenge was bounded."] },
          },
        },
        decision: {
          type: "campaign-decision",
          id: "decision-leading-opportunity-1",
          kind: "opportunity-comparison",
          outcome: "leading-opportunity",
          leaderOpportunityId: "opportunity-dispatch-reconciliation",
          intakeVersion: 1,
          applicableRule: "Select only a robust evidence-backed stand-out after adversarial challenge.",
          evidenceEntryIds: ["inference-dispatch-qualification-evidence", "inference-tender-qualification-evidence", "inference-adversarial-leader-survives"],
          rationale: "The dispatch Opportunity retains a material major-Preference advantage across credible ranges.",
          confidence: { level: "medium", limitingFactors: ["Public Research is not market validation."] },
          limitations: ["The recommendation remains subject to external validation."],
          decidedAt: "2026-09-01T10:30:00.000Z",
        },
      },
      brief: {
        id: "opportunity-brief-leading-1",
        buyerEconomics: comparisonDimension("An identifiable operations buyer has reason and supported ability to pay.", "inference-dispatch-qualification-evidence"),
        customerAccess: comparisonDimension("Existing workflow expertise provides a plausible affordable route to customers.", "inference-dispatch-qualification-evidence"),
        alternatives: comparisonDimension("Manual reconciliation and general scheduling tools remain the current alternatives.", "inference-dispatch-qualification-evidence"),
        risks: [comparisonDimension("Acquisition and operating ranges may widen during external validation.", "inference-dispatch-qualification-evidence")],
        valueHypothesis: {
          status: "provisional-not-a-product-specification",
          customer: "Independent dispatch coordinators",
          situation: "Assigning urgent field work across changing schedules",
          smallestDesiredCustomerOutcome: "Reduce paid reconciliation effort while preserving assignment accuracy.",
          supportedReason: "Current behavior evidence shows recurring paid effort and a feasible bounded outcome.",
          confidence: { level: "medium", limitingFactors: ["No External Validation Action has occurred."] },
          supportingEvidenceEntryIds: ["inference-dispatch-qualification-evidence"],
          challengingEvidenceEntryIds: [],
          assumptionIds: [],
          evidenceGapIds: [],
          disconfirmationConditions: ["Customers do not reduce paid reconciliation effort in a separate approved validation effort."],
        },
      },
    },
  };

  const weighted = structuredClone(command);
  weighted.requestId = "reject-weighted-comparison";
  weighted.payload.comparison.weightedTotal = 91;
  const weightedResult = await runKernel(kernelPath, weighted);
  assert.equal(weightedResult.code, 3);
  assert.equal(weightedResult.response.error.code, "SVS-LEADING-OPPORTUNITY-INVALID");
  assert.match(weightedResult.response.error.details.join(" "), /unscored/i);

  const probability = structuredClone(command);
  probability.requestId = "reject-invented-probability";
  probability.payload.comparison.profiles[0].outcomeUncertainty.summary =
    "There is a 72% probability of reaching the target.";
  const probabilityResult = await runKernel(kernelPath, probability);
  assert.equal(probabilityResult.code, 3);
  assert.equal(probabilityResult.response.error.code, "SVS-LEADING-OPPORTUNITY-INVALID");
  assert.match(probabilityResult.response.error.details.join(" "), /invented probability/i);

  const hiddenNonDominated = structuredClone(command);
  hiddenNonDominated.requestId = "reject-hidden-non-dominated-opportunity";
  hiddenNonDominated.payload.comparison.nonDominatedOpportunityIds.pop();
  const hiddenResult = await runKernel(kernelPath, hiddenNonDominated);
  assert.equal(hiddenResult.code, 3);
  assert.equal(hiddenResult.response.error.code, "SVS-LEADING-OPPORTUNITY-NOT-DEFENSIBLE");
  assert.match(hiddenResult.response.error.message, /Non-Dominated Opportunity/i);

  const unresolvedContender = structuredClone(command);
  unresolvedContender.requestId = "reject-unresolved-contender";
  unresolvedContender.payload.comparison.leadingAssessment.unresolvedContenderOpportunityIds = [
    "opportunity-specialist-tender-review",
  ];
  const contenderResult = await runKernel(kernelPath, unresolvedContender);
  assert.equal(contenderResult.code, 3);
  assert.equal(contenderResult.response.error.code, "SVS-LEADING-OPPORTUNITY-NOT-DEFENSIBLE");
  assert.match(contenderResult.response.error.message, /unresolved contender/i);

  const omittedAdvantage = structuredClone(command);
  omittedAdvantage.requestId = "reject-omitted-confirmed-advantage";
  omittedAdvantage.payload.comparison.profiles[1].advantages = [];
  const omittedAdvantageResult = await runKernel(kernelPath, omittedAdvantage);
  assert.equal(omittedAdvantageResult.code, 3);
  assert.match(omittedAdvantageResult.response.error.message, /every confirmed Advantage/i);

  const majorPreferenceDisadvantage = structuredClone(command);
  majorPreferenceDisadvantage.requestId = "reject-leader-major-preference-disadvantage";
  majorPreferenceDisadvantage.payload.comparison.profiles[0].preferences[0].effect =
    "disadvantage";
  const majorPreferenceResult = await runKernel(kernelPath, majorPreferenceDisadvantage);
  assert.equal(majorPreferenceResult.code, 3);
  assert.match(
    majorPreferenceResult.response.error.message,
    /major-Preference leader advantage must match.+leader profile/i,
  );

  const riskToleranceDisadvantage = structuredClone(command);
  riskToleranceDisadvantage.requestId = "reject-leader-risk-tolerance-disadvantage";
  riskToleranceDisadvantage.payload.comparison.profiles[0].riskToleranceFit.fit =
    "material-disadvantage";
  const riskToleranceResult = await runKernel(kernelPath, riskToleranceDisadvantage);
  assert.equal(riskToleranceResult.code, 3);
  assert.match(riskToleranceResult.response.error.message, /material disadvantage.+Risk Tolerance/i);

  const incompleteRangeChallenge = structuredClone(command);
  incompleteRangeChallenge.requestId = "reject-incomplete-credible-range-challenge";
  incompleteRangeChallenge.payload.comparison.leadingAssessment.robustAcrossCredibleRanges.evidenceEntryIds = [
    "inference-dispatch-qualification-evidence",
  ];
  const incompleteRangeResult = await runKernel(kernelPath, incompleteRangeChallenge);
  assert.equal(incompleteRangeResult.code, 3);
  assert.match(incompleteRangeResult.response.error.message, /every Eligible Opportunity.+commercial ranges/i);

  const oneSidedDominance = structuredClone(command);
  oneSidedDominance.requestId = "reject-one-sided-dominance-evidence";
  oneSidedDominance.payload.comparison.dominanceAssessments[0].evidenceEntryIds = [
    "inference-dispatch-qualification-evidence",
  ];
  const oneSidedDominanceResult = await runKernel(kernelPath, oneSidedDominance);
  assert.equal(oneSidedDominanceResult.code, 3);
  assert.match(oneSidedDominanceResult.response.error.message, /Opportunity-scoped Inference.+opportunity-specialist-tender-review/i);

  const oneSidedAdvantage = structuredClone(command);
  oneSidedAdvantage.requestId = "reject-one-sided-leader-advantage";
  oneSidedAdvantage.payload.comparison.leadingAssessment.advantagesOverAlternatives[0].evidenceEntryIds = [
    "inference-dispatch-qualification-evidence",
  ];
  const oneSidedAdvantageResult = await runKernel(kernelPath, oneSidedAdvantage);
  assert.equal(oneSidedAdvantageResult.code, 3);
  assert.match(oneSidedAdvantageResult.response.error.message, /Opportunity-scoped Inference.+opportunity-specialist-tender-review/i);

  const contradictedPreferenceAdvantage = structuredClone(command);
  contradictedPreferenceAdvantage.requestId =
    "reject-contradicted-major-preference-advantage";
  contradictedPreferenceAdvantage.payload.comparison.profiles[0].preferences[0].effect =
    "neutral";
  const contradictedPreferenceResult = await runKernel(
    kernelPath,
    contradictedPreferenceAdvantage,
  );
  assert.equal(contradictedPreferenceResult.code, 3);
  assert.match(
    contradictedPreferenceResult.response.error.message,
    /major-Preference leader advantage must match.+leader profile/i,
  );

  const sharedPreferenceAdvantage = structuredClone(command);
  sharedPreferenceAdvantage.requestId = "reject-shared-major-preference-advantage";
  sharedPreferenceAdvantage.payload.comparison.profiles[1].preferences[0].effect =
    "advantage";
  const sharedPreferenceResult = await runKernel(
    kernelPath,
    sharedPreferenceAdvantage,
  );
  assert.equal(sharedPreferenceResult.code, 3);
  assert.match(
    sharedPreferenceResult.response.error.message,
    /alternative profile does not share/i,
  );

  const unknownDimension = structuredClone(command);
  unknownDimension.requestId = "reject-unknown-comparison-dimension";
  unknownDimension.payload.comparison.dominanceAssessments[0].criteria.materiallyBetterOn = [
    "founder-vibes",
  ];
  const unknownDimensionResult = await runKernel(kernelPath, unknownDimension);
  assert.equal(unknownDimensionResult.code, 3);
  assert.match(unknownDimensionResult.response.error.details.join(" "), /unknown comparison dimension/i);

  const falsePrecision = structuredClone(command);
  falsePrecision.requestId = "reject-false-precision-in-comparison-rationale";
  falsePrecision.payload.comparison.decision.rationale =
    "The leader has a 72% chance of success.";
  const falsePrecisionResult = await runKernel(kernelPath, falsePrecision);
  assert.equal(falsePrecisionResult.code, 3);
  assert.match(falsePrecisionResult.response.error.details.join(" "), /invented probability/i);

  const decisionGapCampaignPath = path.join(storagePath, "leading-opportunity-gap-campaign");
  await cp(campaignPath, decisionGapCampaignPath, { recursive: true });
  assert.equal(
    (
      await runKernel(kernelPath, {
        envelopeVersion: "0.1.0",
        requestId: "record-leading-decision-gap",
        command: "recordEvidenceReasoning",
        payload: {
          campaignPath: decisionGapCampaignPath,
          coordinatorId: "coordinator-primary",
          recordedAt: "2026-09-01T10:29:00.000Z",
          entries: [
            {
              type: "evidence-gap",
              id: "gap-leading-decision",
              question: "Does the leader remain selected under the unresolved boundary case?",
              affectedDecisionIds: ["decision-leading-opportunity-1"],
              resolutionCriteria: "Resolve the boundary case with affirmative evidence.",
              resolutionMethod: "Perform bounded Public Research.",
              status: "open",
              resolution: null,
            },
          ],
        },
      })
    ).code,
    0,
  );
  const omittedDecisionGap = structuredClone(command);
  omittedDecisionGap.requestId = "reject-omitted-authoritative-decision-gap";
  omittedDecisionGap.payload.campaignPath = decisionGapCampaignPath;
  const omittedDecisionGapResult = await runKernel(kernelPath, omittedDecisionGap);
  assert.equal(omittedDecisionGapResult.code, 3);
  assert.match(omittedDecisionGapResult.response.error.message, /derive every decision-changing Evidence Gap/i);

  const contradictionCampaignPath = path.join(
    storagePath,
    "leading-opportunity-contradiction-campaign",
  );
  await cp(campaignPath, contradictionCampaignPath, { recursive: true });
  assert.equal(
    (
      await runKernel(kernelPath, {
        envelopeVersion: "0.1.0",
        requestId: "record-leading-contradiction",
        command: "recordEvidenceReasoning",
        payload: {
          campaignPath: contradictionCampaignPath,
          coordinatorId: "coordinator-primary",
          recordedAt: "2026-09-01T10:29:00.000Z",
          entries: [
            {
              type: "contradiction",
              id: "contradiction-leading-evidence",
              entryIds: [
                "inference-dispatch-qualification-evidence",
                "inference-tender-qualification-evidence",
              ],
              disputedProposition: "The dispatch Opportunity remains preferable across credible ranges.",
              disputedScope: "opportunity-dispatch-reconciliation",
              attemptedReconciliation: "The range-edge evidence does not yet reconcile the conflict.",
              resolutionStatus: "unresolved",
              resolution: null,
            },
          ],
        },
      })
    ).code,
    0,
  );
  const omittedContradiction = structuredClone(command);
  omittedContradiction.requestId = "reject-omitted-authoritative-contradiction";
  omittedContradiction.payload.campaignPath = contradictionCampaignPath;
  const omittedContradictionResult = await runKernel(
    kernelPath,
    omittedContradiction,
  );
  assert.equal(omittedContradictionResult.code, 3);
  assert.match(
    omittedContradictionResult.response.error.message,
    /derive every decision-changing Evidence Gap, Contradiction/i,
  );

  const productSpecification = structuredClone(command);
  productSpecification.requestId = "reject-product-specification-field";
  productSpecification.payload.brief.valueHypothesis.features = ["dashboard"];
  const productResult = await runKernel(kernelPath, productSpecification);
  assert.equal(productResult.code, 3);
  assert.equal(productResult.response.error.code, "SVS-LEADING-OPPORTUNITY-INVALID");
  assert.match(productResult.response.error.details.join(" "), /product specification/i);

  const productLanguage = structuredClone(command);
  productLanguage.requestId = "reject-product-specification-language";
  productLanguage.payload.brief.valueHypothesis.smallestDesiredCustomerOutcome =
    "Receive a dashboard interface with a settled delivery design.";
  const productLanguageResult = await runKernel(kernelPath, productLanguage);
  assert.equal(productLanguageResult.code, 3);
  assert.equal(productLanguageResult.response.error.code, "SVS-LEADING-OPPORTUNITY-INVALID");
  assert.match(productLanguageResult.response.error.details.join(" "), /product specification language/i);

  const productLanguageInUncertainty = structuredClone(command);
  productLanguageInUncertainty.requestId =
    "reject-product-specification-language-in-value-hypothesis-uncertainty";
  productLanguageInUncertainty.payload.brief.valueHypothesis.confidence.limitingFactors = [
    "The feature roadmap remains uncertain.",
  ];
  const uncertaintyLanguageResult = await runKernel(
    kernelPath,
    productLanguageInUncertainty,
  );
  assert.equal(uncertaintyLanguageResult.code, 3);
  assert.match(
    uncertaintyLanguageResult.response.error.details.join(" "),
    /product specification language/i,
  );

  const completed = await runKernel(kernelPath, command);

  assert.equal(completed.code, 0, `${completed.stderr}\n${JSON.stringify(completed.response)}`);
  assert.equal(completed.response.result.terminalOutcome, "leading-opportunity");
  assert.deepEqual(completed.response.result.comparison.nonDominatedOpportunityIds, [
    "opportunity-dispatch-reconciliation",
    "opportunity-specialist-tender-review",
  ]);
  assert.equal(completed.response.result.brief.role, "scout-recommended-leading-opportunity");
  assert.equal(completed.response.result.brief.valueHypothesis.status, "provisional-not-a-product-specification");
  assert.equal(completed.response.result.brief.wayfinderHandoff.invoked, false);
  assert.deepEqual(completed.response.result.artifact, {
    path: path.join(campaignPath, "opportunity-brief.md"),
    format: "markdown",
    immutable: true,
  });
  assert.equal(completed.response.result.workView.phase, "terminal");
  assert.equal(
    completed.response.result.workView.opportunities.find(
      (/** @type {any} */ opportunity) =>
        opportunity.id === "opportunity-dispatch-reconciliation",
    ).terminalRole,
    "leading-opportunity",
  );
  const artifact = await readFile(
    path.join(campaignPath, "opportunity-brief.md"),
    "utf8",
  );
  assert.match(artifact, /^# Opportunity Brief/m);
  assert.match(artifact, /Scout-recommended Leading Opportunity/);
  assert.match(artifact, /Required Input/);
  assert.match(artifact, /Potential Output/);
  assert.match(artifact, /Outcome Uncertainty/);
  assert.match(artifact, /Input.Output Asymmetry/);
  assert.match(artifact, /Declared Risk Tolerance/);
  assert.match(artifact, /Value Hypothesis/);
  assert.match(artifact, /provisional.not a product specification/i);
  assert.match(artifact, /Wayfinder/);
  assert.match(artifact, /not been started/i);
  assert.match(artifact, /Required Input validation.+inference-dispatch-qualification-evidence/is);
  assert.match(artifact, /Potential Output durability.+inference-dispatch-qualification-evidence/is);
  assert.match(artifact, /Adversarial conclusion.+inference-adversarial-leader-survives/is);
  assert.match(artifact, /opportunity-dispatch-reconciliation → opportunity-specialist-tender-review: does-not-dominate/i);
  assert.match(artifact, /Operating evidence is bounded/);
  assert.match(artifact, /The challenge was bounded/);
  assert.equal((await stat(path.join(campaignPath, "opportunity-brief.md"))).mode & 0o777, 0o600);

  const replay = await runKernel(kernelPath, command);
  assert.equal(replay.code, 0, replay.stderr);
  assert.equal(replay.response.result.completed, false);
  assert.equal(await readFile(path.join(campaignPath, "opportunity-brief.md"), "utf8"), artifact);

  const changedReplay = structuredClone(command);
  changedReplay.payload.comparison.profiles[0].requiredInput.time.summary =
    "Changed comparison input under a reused request identity.";
  const conflict = await runKernel(kernelPath, changedReplay);
  assert.equal(conflict.code, 3);
  assert.equal(conflict.response.error.code, "SVS-CAMPAIGN-TERMINAL");

  const inspected = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "inspect-leading-opportunity-campaign",
    command: "inspectCampaign",
    payload: { campaignPath },
  });
  assert.equal(inspected.code, 0, inspected.stderr);
  assert.deepEqual(inspected.response.result.opportunityBrief, completed.response.result.brief);
  assert.deepEqual(inspected.response.result.opportunityComparison, completed.response.result.comparison);

  const postTerminalResearch = await runKernel(
    kernelPath,
    publicResearchReservationCommand(campaignPath, {
      requestId: "reserve-after-leading-opportunity",
      payload: {
        reservedAt: "2026-09-01T10:31:00.000Z",
        reservation: {
          id: "reservation-after-leading-opportunity",
          purpose: "Attempt to mutate a terminal Campaign",
          researchClass: "adversarial",
          opportunityId: "opportunity-dispatch-reconciliation",
        },
      },
    }),
  );
  assert.equal(postTerminalResearch.code, 3);
  assert.equal(postTerminalResearch.response.error.code, "SVS-CAMPAIGN-TERMINAL");
  assert.equal(await readFile(path.join(campaignPath, "opportunity-brief.md"), "utf8"), artifact);

  const challenged = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "reevaluate-leading-opportunity-1",
    command: "reevaluateCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      reevaluatedAt: "2026-09-01T10:32:00.000Z",
      operation: {
        id: "reevaluation-leading-opportunity-1",
        kind: "developer-challenge",
        reason: "New evidence challenges the comparison advantage of the Leading Opportunity.",
        reasoningEntries: [],
        intakeRevision: null,
        decision: {
          type: "campaign-decision",
          id: "decision-reevaluate-leading-opportunity-1",
          kind: "campaign-re-evaluation",
          outcome: "resume",
          intakeVersion: 1,
          applicableRule: "An Eligible Opportunity loses eligibility while a decision-changing challenge is unresolved.",
          triggerEntryIds: ["inference-adversarial-leader-survives"],
          affectedOpportunityIds: [command.payload.comparison.decision.leaderOpportunityId],
          supersededDecisionIds: [command.payload.comparison.decision.id],
          rationale: "Re-open only the challenged Opportunity comparison and its terminal handoff.",
          confidence: {
            level: "medium",
            limitingFactors: ["The new evidence still requires adjudication."],
          },
          limitations: ["Unrelated eligibility decisions remain current."],
          decidedAt: "2026-09-01T10:32:00.000Z",
        },
      },
    },
  });
  assert.equal(challenged.code, 0, `${challenged.stderr}\n${JSON.stringify(challenged.response)}`);
  const formerLeader = challenged.response.result.workView.opportunities.find(
    (/** @type {any} */ opportunity) =>
      opportunity.id === command.payload.comparison.decision.leaderOpportunityId,
  );
  assert.equal(formerLeader.disposition.status, "unresolved");
  assert.equal(formerLeader.eligibility, "pending-qualification");
  assert.equal(formerLeader.terminalRole, null);
  assert.deepEqual(challenged.response.result.supersededArtifactIds, [
    command.payload.brief.id,
  ]);
  assert.equal(await readFile(path.join(campaignPath, "opportunity-brief.md"), "utf8"), artifact);
});

test("no eligible Opportunity is a successful immutable terminal outcome", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-no-qualifying-opportunity-",
  );
  const storagePath = await mkdtemp(
    path.join(tmpdir(), "solo-venture-scout-storage-"),
  );
  const campaignPath = path.join(storagePath, "no-qualifier-campaign");
  const { qualification, rejectedGate } = await prepareNoQualifyingOpportunityCampaign(
    kernelPath,
    campaignPath,
  );
  const evaluated = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "inspect-no-qualifying-opportunity-precondition",
    command: "inspectCampaign",
    payload: { campaignPath },
  });
  assert.equal(evaluated.code, 0, evaluated.stderr);
  assert.deepEqual(
    evaluated.response.result.workView.opportunities.map(
      (/** @type {any} */ opportunity) => opportunity.disposition.status,
    ),
    ["rejected", "unresolved"],
  );

  const conclusion = {
    envelopeVersion: "0.1.0",
    requestId: "conclude-no-qualifying-opportunity-1",
    command: "concludeNoQualifyingOpportunity",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      concludedAt: "2026-09-01T10:05:00.000Z",
      reportId: "no-qualifying-opportunity-report-1",
      continuationConditions: [
        {
          id: "continue-tender-costly-problem",
          opportunityId: "opportunity-specialist-tender-review",
          condition:
            "Reopen only if independent current behavior evidence can resolve the Costly Problem gate within a revised Research Budget.",
          evidenceGapIds: [
            "gap-qualification-costly-problem-opportunity-specialist-tender-review",
          ],
        },
      ],
    },
  };
  const completed = await runKernel(kernelPath, conclusion);

  assert.equal(completed.code, 0, completed.stderr);
  assert.equal(completed.response.ok, true);
  assert.equal(completed.response.result.completed, true);
  assert.equal(
    completed.response.result.terminalOutcome,
    "no-qualifying-opportunity",
  );
  assert.deepEqual(
    completed.response.result.report.rejectedOpportunities.map(
      (/** @type {any} */ opportunity) => opportunity.id,
    ),
    ["opportunity-dispatch-reconciliation"],
  );
  assert.deepEqual(
    completed.response.result.report.unresolvedOpportunities.map(
      (/** @type {any} */ opportunity) => opportunity.id,
    ),
    ["opportunity-specialist-tender-review"],
  );
  assert.equal(completed.response.result.report.coverage.discoverySweeps, 4);
  assert.deepEqual(completed.response.result.report.coverage.breadthGate, {
    id: "breadth-gate-1",
    status: "passed",
  });
  assert.equal(
    completed.response.result.report.researchBudget.settledSourceUnits,
    8,
  );
  assert.equal(
    completed.response.result.report.completeness.researchExhausted,
    true,
  );
  assert.deepEqual(completed.response.result.workView.terminal, {
    outcome: "no-qualifying-opportunity",
    reportId: "no-qualifying-opportunity-report-1",
    artifactPath: "no-qualifying-opportunity-report.md",
    immutable: true,
    concludedAt: "2026-09-01T10:05:00.000Z",
  });
  assert.equal(completed.response.result.workView.phase, "terminal");
  assert.equal(completed.response.result.workView.publicResearchAvailable, false);
  assert.deepEqual(completed.response.result.workView.nextPermittedActions, [
    "inspect-no-qualifying-opportunity-report",
    "explain-no-qualifying-opportunity",
    "start-separate-campaign",
    "finish",
  ]);

  const artifactPath = path.join(
    campaignPath,
    "no-qualifying-opportunity-report.md",
  );
  const artifact = await readFile(artifactPath, "utf8");
  assert.match(artifact, /^# No Qualifying Opportunity Report/m);
  assert.match(artifact, /valid terminal outcome, not an error/i);
  assert.match(artifact, /Affirmatively rejected Opportunities/);
  assert.match(artifact, /Unresolved Opportunities/);
  assert.match(artifact, /Coverage and Breadth Gate/);
  assert.match(artifact, /Research Budget use/);
  assert.match(artifact, /Paid spend cap: 0 GBP/);
  assert.match(artifact, /Recorded paid spend: 0 GBP/);
  assert.match(artifact, /Remaining paid spend: 0 GBP/);
  assert.match(artifact, /Limitations/);
  assert.match(artifact, /Continuation conditions/);
  assert.equal((await stat(artifactPath)).mode & 0o777, 0o600);

  const replay = await runKernel(kernelPath, conclusion);
  assert.equal(replay.code, 0, replay.stderr);
  assert.equal(replay.response.result.completed, false);
  assert.equal(await readFile(artifactPath, "utf8"), artifact);

  const inspected = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "inspect-no-qualifier-campaign",
    command: "inspectCampaign",
    payload: { campaignPath },
  });
  assert.equal(inspected.code, 0, inspected.stderr);
  assert.deepEqual(
    inspected.response.result.noQualifyingOpportunityReport,
    completed.response.result.report,
  );
  assert.equal(inspected.response.result.workView.phase, "terminal");
  assert.equal(await readFile(artifactPath, "utf8"), artifact);

  const postTerminalResearch = await runKernel(
    kernelPath,
    publicResearchReservationCommand(campaignPath, {
      requestId: "reserve-after-no-qualifier",
      payload: {
        reservedAt: "2026-09-01T10:06:00.000Z",
        reservation: {
          id: "reservation-after-no-qualifier",
          purpose: "Attempt to mutate a terminal Campaign",
          researchClass: "deepening",
          opportunityId: "opportunity-specialist-tender-review",
          decisionValuePriorityId: "retired-priority",
        },
      },
    }),
  );
  assert.equal(postTerminalResearch.code, 3);
  assert.equal(
    postTerminalResearch.response.error.code,
    "SVS-CAMPAIGN-TERMINAL",
  );
  assert.equal(await readFile(artifactPath, "utf8"), artifact);

  const postTerminalResume = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "resume-after-no-qualifier",
    command: "resumeCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      resumedAt: "2026-09-01T10:07:00.000Z",
      leaseExpiresAt: "2026-09-01T11:07:00.000Z",
    },
  });
  assert.equal(postTerminalResume.code, 3);
  assert.equal(postTerminalResume.response.error.code, "SVS-CAMPAIGN-TERMINAL");
  assert.equal(await readFile(artifactPath, "utf8"), artifact);

  const reopened = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "reevaluate-no-qualifier-capacity-1",
    command: "reevaluateCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      reevaluatedAt: "2026-09-01T10:08:00.000Z",
      operation: {
        id: "reevaluation-no-qualifier-capacity-1",
        kind: "developer-challenge",
        reason: "The developer can now automate the operating work that caused rejection.",
        reasoningEntries: [],
        intakeRevision: null,
        decision: {
          type: "campaign-decision",
          id: "decision-reevaluate-no-qualifier-capacity-1",
          kind: "campaign-re-evaluation",
          outcome: "resume",
          intakeVersion: 1,
          applicableRule: "A rejected Opportunity may resume only through a new Campaign Decision.",
          triggerEntryIds: ["inference-dispatch-solo-capacity"],
          affectedOpportunityIds: ["opportunity-dispatch-reconciliation"],
          supersededDecisionIds: [
            rejectedGate.decision.id,
            qualification.payload.evaluation.researchDecision.id,
          ],
          rationale: "Re-evaluate only the Solo Developer feasibility gate for the affected Opportunity.",
          confidence: {
            level: "medium",
            limitingFactors: ["The claimed automation still requires evidence."],
          },
          limitations: ["All unrelated Opportunity decisions remain unchanged."],
          decidedAt: "2026-09-01T10:08:00.000Z",
        },
      },
    },
  });
  assert.equal(reopened.code, 0, `${reopened.stderr}\n${JSON.stringify(reopened.response)}`);
  assert.deepEqual(reopened.response.result.invalidatedDecisionIds, [
    rejectedGate.decision.id,
    qualification.payload.evaluation.researchDecision.id,
  ]);
  assert.deepEqual(reopened.response.result.supersededArtifactIds, [
    "no-qualifying-opportunity-report-1",
  ]);
  assert.equal(reopened.response.result.workView.phase, "opportunity-deepening");
  assert.equal(reopened.response.result.workView.terminal, undefined);
  assert.deepEqual(
    reopened.response.result.workView.opportunities.map(
      (/** @type {any} */ opportunity) => ({
        id: opportunity.id,
        disposition: opportunity.disposition.status,
      }),
    ),
    [
      { id: "opportunity-dispatch-reconciliation", disposition: "active" },
      { id: "opportunity-specialist-tender-review", disposition: "unresolved" },
    ],
  );
  assert.equal(await readFile(artifactPath, "utf8"), artifact);

  const prematureConclusion = structuredClone(conclusion);
  prematureConclusion.requestId = "conclude-before-new-capacity-decision-1";
  prematureConclusion.payload.reportId =
    "no-qualifying-opportunity-before-new-capacity-decision-1";
  prematureConclusion.payload.concludedAt = "2026-09-01T10:08:30.000Z";
  const premature = await runKernel(kernelPath, prematureConclusion);
  assert.equal(premature.code, 3);
  assert.equal(
    premature.response.error.code,
    "SVS-NO-QUALIFYING-OPPORTUNITY-NOT-AVAILABLE",
  );
  assert.match(premature.response.error.message, /new Campaign Decisions/);
  assert.equal(await readFile(artifactPath, "utf8"), artifact);

  const resumedWork = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "record-reopened-capacity-gap-1",
    command: "recordEvidenceReasoning",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T10:09:00.000Z",
      entries: [
        {
          type: "evidence-gap",
          id: "gap-reopened-solo-feasibility",
          question: "Does the proposed automation make solo operation feasible?",
          affectedDecisionIds: ["decision-reevaluate-no-qualifier-capacity-1"],
          resolutionCriteria: "Current evidence establishes the bounded operating input.",
          resolutionMethod: "Run only targeted read-only research for solo feasibility.",
          status: "open",
          resolution: null,
        },
      ],
    },
  });
  assert.equal(
    resumedWork.code,
    0,
    `${resumedWork.stderr}\n${JSON.stringify(resumedWork.response)}`,
  );
  assert.equal(await readFile(artifactPath, "utf8"), artifact);

  const revisedQualification = structuredClone(qualification);
  revisedQualification.requestId = "record-reassessed-solo-feasibility-1";
  revisedQualification.payload.recordedAt = "2026-09-01T10:10:00.000Z";
  revisedQualification.payload.reevaluationId =
    "reevaluation-no-qualifier-capacity-1";
  revisedQualification.payload.evaluation.id =
    "qualification-evaluation-reassessed-solo-feasibility";
  revisedQualification.payload.evaluation.assessments = [
    revisedQualification.payload.evaluation.assessments[0],
  ];
  const revisedSoloGate =
    revisedQualification.payload.evaluation.assessments[0].gates.find(
      (/** @type {any} */ gate) => gate.kind === "solo-feasibility",
    );
  revisedSoloGate.id = "gate-solo-feasibility-reassessed";
  revisedSoloGate.decision.id = "decision-solo-feasibility-reassessed";
  revisedSoloGate.decision.decidedAt = "2026-09-01T10:10:00.000Z";
  revisedSoloGate.decision.rationale =
    "The targeted reassessment still finds the operating burden infeasible for one developer.";
  revisedQualification.payload.evaluation.researchDecision.id =
    "decision-reassessed-qualification-research-stop";
  revisedQualification.payload.evaluation.researchDecision.decidedAt =
    "2026-09-01T10:10:00.000Z";
  const reassessed = await runKernel(kernelPath, revisedQualification);
  assert.equal(
    reassessed.code,
    0,
    `${reassessed.stderr}\n${JSON.stringify(reassessed.response)}`,
  );

  const laterConclusion = structuredClone(conclusion);
  laterConclusion.requestId = "conclude-reassessed-no-qualifier-1";
  laterConclusion.payload.reportId =
    "no-qualifying-opportunity-report-reassessed";
  laterConclusion.payload.concludedAt = "2026-09-01T10:11:00.000Z";
  const reconcluded = await runKernel(kernelPath, laterConclusion);
  assert.equal(
    reconcluded.code,
    0,
    `${reconcluded.stderr}\n${JSON.stringify(reconcluded.response)}`,
  );
  assert.equal(
    reconcluded.response.result.report.supersedes,
    "no-qualifying-opportunity-report-1",
  );
  assert.equal(await readFile(artifactPath, "utf8"), artifact);
  const laterArtifactPath = path.join(
    campaignPath,
    "no-qualifying-opportunity-report-no-qualifying-opportunity-report-reassessed.md",
  );
  assert.match(
    await readFile(laterArtifactPath, "utf8"),
    /Supersedes: no-qualifying-opportunity-report-1/,
  );
});

test("no surviving Opportunity still reaches the No Qualifying Opportunity terminal outcome", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-no-surviving-opportunity-",
  );
  const storagePath = await mkdtemp(
    path.join(tmpdir(), "solo-venture-scout-storage-"),
  );
  const campaignPath = path.join(storagePath, "no-surviving-opportunity");
  await createDiscoveryCampaign(kernelPath, campaignPath, [], true);
  for (const command of [
    discoveryTrancheCommand(campaignPath),
    secondDiscoveryTrancheCommand(campaignPath),
    opportunityFormationCommand(campaignPath),
    passBreadthGateCommand(campaignPath),
  ]) {
    const result = await runKernel(kernelPath, command);
    assert.equal(result.code, 0, result.stderr);
  }

  const exclusions = opportunityExclusionGatesCommand(campaignPath);
  for (const assessment of exclusions.payload.assessments) {
    assessment.marketSafety.classification = "excluded-market";
    assessment.marketSafety.intendedActivity =
      "Directly enable an excluded credential-theft workflow";
    assessment.marketSafety.excludedCategory = "credential-theft-enablement";
    assessment.marketSafety.directlyServesExcludedActivity = true;
    assessment.marketSafety.gate.state = "failed";
    assessment.marketSafety.gate.decision.outcome = "failed";
    assessment.marketSafety.gate.decision.rationale =
      "Affirmative evidence establishes direct service of an excluded activity.";
    assessment.marketSafety.gate.decision.limitations = [
      "The rejection applies to the stated intended activity.",
    ];
  }
  const excluded = await runKernel(kernelPath, exclusions);
  assert.equal(excluded.code, 0, excluded.stderr);

  const evaluated = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "record-empty-survivor-qualification-evaluation",
    command: "recordOpportunityQualificationGates",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      recordedAt: "2026-09-01T10:00:00.000Z",
      evaluation: {
        id: "qualification-evaluation-no-survivors",
        assessments: [],
        researchDecision: {
          type: "campaign-decision",
          id: "decision-no-survivors-stop-research",
          kind: "qualification-research",
          outcome: "stop",
          intakeVersion: 1,
          applicableRule:
            "Continue only while budget remains and a permitted action has positive Decision Value.",
          evidenceEntryIds: [],
          decisionValuePriorities: [],
          stopReason: "no-permitted-positive-decision-value",
          rationale:
            "No Opportunity survived Exclusion Gates, so no qualification research can change eligibility.",
          confidence: {
            level: "high",
            limitingFactors: ["A differently scoped future Campaign may form new Opportunities."],
          },
          limitations: ["The result applies to the formed Opportunities only."],
          decidedAt: "2026-09-01T10:00:00.000Z",
        },
      },
    },
  });
  assert.equal(evaluated.code, 0, evaluated.stderr);

  const concluded = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "conclude-no-surviving-opportunity",
    command: "concludeNoQualifyingOpportunity",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      concludedAt: "2026-09-01T10:01:00.000Z",
      reportId: "no-qualifying-opportunity-no-survivors",
      continuationConditions: [],
    },
  });
  assert.equal(concluded.code, 0, concluded.stderr);
  assert.deepEqual(
    concluded.response.result.report.rejectedOpportunities.map(
      (/** @type {any} */ opportunity) => opportunity.id,
    ),
    [
      "opportunity-dispatch-reconciliation",
      "opportunity-specialist-tender-review",
    ],
  );
  assert.deepEqual(concluded.response.result.report.unresolvedOpportunities, []);
  assert.ok(
    concluded.response.result.report.limitations.includes(
      "The rejection applies to the stated intended activity.",
    ),
  );
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
}
