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
 * @param {boolean} [includeFormationEvidence]
 */
async function createDiscoveryCampaign(
  kernelPath,
  campaignPath,
  statements = [],
  includeFormationEvidence = false,
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
