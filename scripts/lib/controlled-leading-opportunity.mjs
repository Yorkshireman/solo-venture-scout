/** @param {string} summary @param {string} evidenceEntryId */
function dimension(summary, evidenceEntryId) {
  return {
    summary,
    evidenceEntryIds: [evidenceEntryId],
    confidence: {
      level: "medium",
      limitingFactors: ["The controlled public evidence is bounded."],
    },
  };
}

/** @param {string} evidenceEntryId @param {boolean} dispatch */
function profileDimensions(evidenceEntryId, dispatch) {
  return {
    requiredInput: {
      validation: dimension(
        dispatch
          ? "Bounded public validation is available."
          : "Specialist validation takes more effort.",
        evidenceEntryId,
      ),
      initialDelivery: dimension(
        dispatch
          ? "A narrow customer outcome is feasible."
          : "Document variance increases initial delivery effort.",
        evidenceEntryId,
      ),
      acquisition: dimension(
        dispatch
          ? "Existing workflow access reduces acquisition effort."
          : "Buyers require specialist procurement access.",
        evidenceEntryId,
      ),
      operations: dimension(
        dispatch
          ? "The operating burden remains bounded."
          : "Tender cycles create a material support burden.",
        evidenceEntryId,
      ),
      time: dimension(
        dispatch
          ? "Fits the confirmed solo capacity."
          : "Requires more irregular specialist time.",
        evidenceEntryId,
      ),
      cash: dimension(
        "The evidence supports low initial cash exposure.",
        evidenceEntryId,
      ),
      irreversibleDownside: dimension(
        "No material irreversible commitment is required.",
        evidenceEntryId,
      ),
      opportunityCost: dimension(
        dispatch
          ? "The bounded test preserves other options."
          : "Long tender cycles delay other tests.",
        evidenceEntryId,
      ),
    },
    potentialOutput: {
      commercialHeadroom: dimension(
        dispatch
          ? "The supported range clears the target with headroom."
          : "The supported range can clear the target.",
        evidenceEntryId,
      ),
      scale: dimension(
        dispatch
          ? "The workflow can serve a broader customer base."
          : "The specialist segment is narrower.",
        evidenceEntryId,
      ),
      durability: dimension(
        "Recurring workflow consequences support durable demand.",
        evidenceEntryId,
      ),
      strategicLeverage: dimension(
        dispatch
          ? "Workflow expertise compounds access leverage."
          : "Specialist knowledge offers bounded leverage.",
        evidenceEntryId,
      ),
    },
    outcomeUncertainty: dimension(
      "Commercial outcomes remain materially variable across the supported ranges.",
      evidenceEntryId,
    ),
    inputOutputAsymmetry: dimension(
      dispatch
        ? "Low bounded input retains credible high output."
        : "Credible output requires materially more operating input.",
      evidenceEntryId,
    ),
    riskToleranceFit: {
      fit: "within",
      ...dimension(
        "The bounded downside remains within the declared Risk Tolerance.",
        evidenceEntryId,
      ),
    },
  };
}

/**
 * The large comparison contract is deterministic fixture data, not evaluator
 * guidance. The coordinator must still inspect the Campaign and decide whether it
 * is valid to submit this candidate through the public kernel seam.
 *
 * @param {string} campaignPath
 * @param {string} concludedAt
 */
export function controlledLeadingOpportunityCommand(campaignPath, concludedAt) {
  const dispatchEvidence = "inference-dispatch-qualification-evidence";
  const tenderEvidence = "inference-tender-qualification-evidence";
  return {
    envelopeVersion: "0.1.0",
    requestId: "controlled-conclude-leading-opportunity",
    command: "concludeLeadingOpportunity",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      concludedAt,
      comparison: {
        id: "controlled-leading-comparison",
        profiles: [
          {
            opportunityId: "opportunity-dispatch-reconciliation",
            ...profileDimensions(dispatchEvidence, true),
            preferences: [
              {
                statementId: "preference-low-operating-burden",
                effect: "advantage",
                materiality: "material",
                rationale:
                  "The bounded operating model fits the confirmed major Preference.",
                evidenceEntryIds: [dispatchEvidence],
                confidence: {
                  level: "medium",
                  limitingFactors: ["Operating evidence is bounded."],
                },
              },
            ],
            advantages: [
              {
                statementId: "advantage-operations-domain",
                effect: "reduces-input",
                rationale:
                  "Existing expertise reduces validation and acquisition input.",
                evidenceEntryIds: [dispatchEvidence],
                confidence: {
                  level: "medium",
                  limitingFactors: ["Leverage varies by customer."],
                },
              },
            ],
          },
          {
            opportunityId: "opportunity-specialist-tender-review",
            ...profileDimensions(tenderEvidence, false),
            preferences: [
              {
                statementId: "preference-low-operating-burden",
                effect: "disadvantage",
                materiality: "material",
                rationale:
                  "Irregular review cycles conflict with the confirmed major Preference.",
                evidenceEntryIds: [tenderEvidence],
                confidence: {
                  level: "medium",
                  limitingFactors: ["Workload varies by tender."],
                },
              },
            ],
            advantages: [
              {
                statementId: "advantage-operations-domain",
                effect: "not-demonstrated",
                rationale:
                  "The confirmed domain Advantage is not demonstrated for this Opportunity.",
                evidenceEntryIds: [],
                confidence: {
                  level: "unknown",
                  limitingFactors: [
                    "No evidence links the Advantage to this Opportunity.",
                  ],
                },
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
              materiallyBetterOn: [
                "input-output-asymmetry",
                "developer-profile-fit",
              ],
            },
            rationale:
              "Tender review retains distinct specialist durability, so it remains Non-Dominated.",
            evidenceEntryIds: [dispatchEvidence, tenderEvidence],
            confidence: {
              level: "medium",
              limitingFactors: ["Output ranges overlap."],
            },
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
            rationale:
              "The specialist durability advantage does not overcome higher material input.",
            evidenceEntryIds: [dispatchEvidence, tenderEvidence],
            confidence: {
              level: "medium",
              limitingFactors: ["Output ranges overlap."],
            },
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
              rationale:
                "Lower operating input materially fits the confirmed major Preference.",
              evidenceEntryIds: [dispatchEvidence, tenderEvidence],
              confidence: {
                level: "medium",
                limitingFactors: ["The ranges overlap at their edges."],
              },
            },
          ],
          noMaterialDisadvantage: {
            established: true,
            summary:
              "No alternative has a material advantage on another major Preference or declared Risk Tolerance.",
            evidenceEntryIds: [dispatchEvidence, tenderEvidence],
            confidence: {
              level: "medium",
              limitingFactors: ["Evidence is bounded."],
            },
          },
          robustAcrossCredibleRanges: {
            established: true,
            summary:
              "The selection persists at the credible edges of every recorded input and output range.",
            evidenceEntryIds: [dispatchEvidence, tenderEvidence],
            confidence: {
              level: "medium",
              limitingFactors: ["Future ranges may change."],
            },
          },
          unresolvedContenderOpportunityIds: [],
          decisionChangingEvidenceGapIds: [],
          decisionChangingContradictionIds: [],
          adversarialChallenge: {
            reservationIds: Array.from(
              { length: 6 },
              (_, index) => `reservation-adversarial-${index + 1}`,
            ),
            outcome: "leader-remains-eligible",
            summary:
              "The complete protected reserve found no decision-changing challenge.",
            evidenceEntryIds: ["inference-adversarial-leader-survives"],
            confidence: {
              level: "medium",
              limitingFactors: ["The challenge was bounded."],
            },
          },
        },
        decision: {
          type: "campaign-decision",
          id: "controlled-leading-decision",
          kind: "opportunity-comparison",
          outcome: "leading-opportunity",
          leaderOpportunityId: "opportunity-dispatch-reconciliation",
          intakeVersion: 1,
          applicableRule:
            "Select only a robust evidence-backed stand-out after adversarial challenge.",
          evidenceEntryIds: [
            dispatchEvidence,
            tenderEvidence,
            "inference-adversarial-leader-survives",
          ],
          rationale:
            "The dispatch Opportunity retains a material major-Preference advantage across credible ranges.",
          confidence: {
            level: "medium",
            limitingFactors: ["Public Research is not market validation."],
          },
          limitations: [
            "The specialist tender-review Opportunity remains Eligible and Non-Dominated.",
            "No External Validation Action has occurred.",
          ],
          decidedAt: concludedAt,
        },
      },
      brief: {
        id: "controlled-leading-opportunity-brief",
        buyerEconomics: dimension(
          "An identifiable operations buyer has reason and supported ability to pay.",
          dispatchEvidence,
        ),
        customerAccess: dimension(
          "Existing workflow expertise provides a plausible affordable route to customers.",
          dispatchEvidence,
        ),
        alternatives: dimension(
          "Manual reconciliation and general scheduling tools remain the current alternatives.",
          dispatchEvidence,
        ),
        risks: [
          dimension(
            "Acquisition and operating ranges may widen during external validation.",
            dispatchEvidence,
          ),
        ],
        valueHypothesis: {
          status: "provisional-not-a-product-specification",
          customer: "Independent dispatch coordinators",
          situation: "Assigning urgent field work across changing schedules",
          smallestDesiredCustomerOutcome:
            "Reduce paid reconciliation effort while preserving assignment accuracy.",
          supportedReason:
            "Current behavior evidence shows recurring paid effort and a feasible bounded outcome.",
          confidence: {
            level: "medium",
            limitingFactors: ["No External Validation Action has occurred."],
          },
          supportingEvidenceEntryIds: [dispatchEvidence],
          challengingEvidenceEntryIds: [],
          assumptionIds: [],
          evidenceGapIds: [],
          disconfirmationConditions: [
            "Customers do not reduce paid reconciliation effort in a separate approved validation effort.",
          ],
        },
      },
    },
  };
}
