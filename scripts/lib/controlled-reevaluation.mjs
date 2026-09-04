/**
 * Deterministic candidate for the controlled correction scenario. The coordinator
 * must inspect the Campaign and decide whether to submit it through the public seam.
 *
 * @param {string} campaignPath
 * @param {string} reevaluatedAt
 */
export function controlledReevaluationCommand(campaignPath, reevaluatedAt) {
  return {
    envelopeVersion: "0.1.0",
    requestId: "controlled-reevaluate-customer-access-correction",
    command: "reevaluateCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      reevaluatedAt,
      operation: {
        id: "controlled-customer-access-source-correction",
        kind: "developer-challenge",
        reason:
          "The developer disputes the prior customer-access conclusion because the Source behind observation-dispatch-time-loss was wrong; no replacement Source or Observation was supplied.",
        reasoningEntries: [
          {
            type: "correction",
            id: "correction-retract-observation-dispatch-time-loss",
            targetEntryId: "observation-dispatch-time-loss",
            action: "retract",
            replacementEntryId: null,
            rationale:
              "The developer states that the Source behind this Observation was wrong and supplied no replacement Source or Observation.",
          },
          {
            type: "evidence-gap",
            id: "gap-dispatch-independent-formation-after-correction",
            question:
              "Does a second genuinely independent Source Lineage establish the dispatch behavioral Problem Signal and material consequence after the retraction?",
            affectedDecisionIds: [
              "decision-form-dispatch",
              "decision-pass-breadth-gate",
            ],
            resolutionCriteria:
              "A current independent Source supplies an atomic Observation of committed behavior and a material consequence for the same dispatch customer and workflow.",
            resolutionMethod:
              "If later permitted, examine one independent public Source scoped to the dispatch workflow; otherwise leave formation unresolved.",
            status: "open",
            resolution: null,
          },
          {
            type: "evidence-gap",
            id: "gap-dispatch-customer-access-after-correction",
            question:
              "Does current evidence establish a plausible affordable route to reach independent dispatch coordinators?",
            affectedDecisionIds: [
              "decision-qualification-customer-access-opportunity-dispatch-reconciliation",
              "decision-qualification-complete-1",
              "decision-inconclusive-comparison-1",
            ],
            resolutionCriteria:
              "Current Opportunity-scoped evidence from genuinely independent Source Lineages affirmatively supports a plausible affordable customer-access route.",
            resolutionMethod:
              "If later permitted, examine independent public evidence about reachable dispatch customer channels; otherwise keep customer access unresolved.",
            status: "open",
            resolution: null,
          },
          {
            type: "inference",
            id: "inference-dispatch-after-source-correction",
            text:
              "The remaining Observation supports repeated manual reconciliation in the dispatch workflow, but it does not independently establish the complete qualification case.",
            scope: "opportunity-dispatch-reconciliation",
            reasoning:
              "After the challenged Observation is retracted, only one cited Source Lineage remains for the dispatch behavior claim and no affirmative customer-access evidence remains.",
            supportingEntryIds: ["observation-coordination-workaround"],
            challengingEntryIds: [],
            confidence: {
              level: "low",
              limitingFactors: [
                "Only one Source Lineage remains.",
                "The remaining Observation does not establish customer access.",
              ],
            },
          },
          {
            type: "correction",
            id: "correction-supersede-dispatch-qualification-inference",
            targetEntryId: "inference-dispatch-qualification-evidence",
            action: "supersede",
            replacementEntryId: "inference-dispatch-after-source-correction",
            rationale:
              "The prior Inference depended on the retracted Observation and overstated what the remaining evidence can support.",
          },
        ],
        intakeRevision: null,
        decision: {
          type: "campaign-decision",
          id: "decision-controlled-customer-access-source-correction",
          kind: "campaign-re-evaluation",
          outcome: "resume",
          intakeVersion: 1,
          applicableRule:
            "Append corrections without rewriting history, reassess transitively affected Inferences, and supersede exactly the Campaign Decisions dependent on corrected evidence.",
          triggerEntryIds: [
            "correction-retract-observation-dispatch-time-loss",
            "correction-supersede-dispatch-qualification-inference",
            "gap-dispatch-independent-formation-after-correction",
            "gap-dispatch-customer-access-after-correction",
          ],
          affectedOpportunityIds: [
            "opportunity-dispatch-reconciliation",
            "opportunity-specialist-tender-review",
          ],
          supersededDecisionIds: [
            "decision-qualification-costly-problem-opportunity-dispatch-reconciliation",
            "decision-qualification-buyer-economics-opportunity-dispatch-reconciliation",
            "decision-qualification-customer-access-opportunity-dispatch-reconciliation",
            "decision-qualification-value-feasibility-opportunity-dispatch-reconciliation",
            "decision-qualification-solo-feasibility-opportunity-dispatch-reconciliation",
            "decision-qualification-competitive-viability-opportunity-dispatch-reconciliation",
            "decision-qualification-legal-operational-feasibility-opportunity-dispatch-reconciliation",
            "decision-qualification-commercial-plausibility-opportunity-dispatch-reconciliation",
            "decision-qualification-complete-1",
            "decision-inconclusive-comparison-1",
            "decision-pass-breadth-gate",
            "decision-market-safety-opportunity-dispatch-reconciliation",
            "decision-market-safety-opportunity-specialist-tender-review",
            "decision-qualification-costly-problem-opportunity-specialist-tender-review",
            "decision-qualification-buyer-economics-opportunity-specialist-tender-review",
            "decision-qualification-customer-access-opportunity-specialist-tender-review",
            "decision-qualification-value-feasibility-opportunity-specialist-tender-review",
            "decision-qualification-solo-feasibility-opportunity-specialist-tender-review",
            "decision-qualification-competitive-viability-opportunity-specialist-tender-review",
            "decision-qualification-legal-operational-feasibility-opportunity-specialist-tender-review",
            "decision-qualification-commercial-plausibility-opportunity-specialist-tender-review",
          ],
          rationale:
            "The Source correction invalidates the shared dispatch qualification Inference and reopens the Breadth Gate. Exactly the kernel-derived downstream gate, qualification-completion, and comparison decisions are superseded; formation history and unrelated evidence remain preserved.",
          confidence: {
            level: "medium",
            limitingFactors: [
              "No replacement Source or Observation was supplied.",
              "The remaining dispatch Observation is insufficient for the affected terminal conclusions.",
            ],
          },
          limitations: [
            "The correction does not disprove customer access; it leaves customer access unresolved.",
            "The tender evidence remains current even though its downstream gate snapshot must be rebuilt after the Breadth Gate.",
          ],
          decidedAt: reevaluatedAt,
        },
      },
    },
  };
}
