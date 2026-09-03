import contracts from "../../release/contracts.json" with { type: "json" };
import type { AuthoritativeHistoryRebuild } from "./authority.js";
import type {
  ConcludeLeadingOpportunityCommand,
  LeadingOpportunityBriefInput,
  OpportunityBrief,
  OpportunityComparison,
  OpportunityFormationAssessment,
  ResearchBudgetView,
} from "./types.js";

type FormedOpportunity = {
  id: string;
  customer: string;
  situation: string;
  costlyProblem: OpportunityFormationAssessment["costlyProblem"];
  decisionId: string;
};

export type BaseOpportunityComparison = Pick<
  OpportunityComparison,
  "id" | "profiles" | "dominanceAssessments" | "nonDominatedOpportunityIds"
> & {
  decision: Pick<
    OpportunityComparison["decision"],
    "id" | "intakeVersion" | "evidenceEntryIds" | "confidence" | "decidedAt"
  >;
};

export type OpportunityBriefBuildInput = {
  comparison: BaseOpportunityComparison;
  brief: LeadingOpportunityBriefInput;
  opportunityId: string;
  concludedAt: string;
  role: OpportunityBrief["role"];
  selectionProvenance?: OpportunityBrief["selectionProvenance"];
  selection: {
    rationale: string;
    decisionId: string;
    evidenceEntryIds: string[];
    limitations: string[];
    traceabilityConclusion: string;
  };
  adversarialReservationIds: string[];
  comparisonLimitingFactors: string[];
  additionalTraceabilityRows: Array<{
    conclusion: string;
    entryIds: string[];
  }>;
  wayfinderHandoff: OpportunityBrief["wayfinderHandoff"];
};

export type LeadingOpportunityServices = {
  activeResearchApprovalDecision: (
    history: AuthoritativeHistoryRebuild,
  ) => unknown | undefined;
  availableAffirmativeEvidenceIds: (
    history: AuthoritativeHistoryRebuild,
  ) => Set<string>;
  formedOpportunities: (
    history: AuthoritativeHistoryRebuild,
  ) => FormedOpportunity[];
  noQualifyingOpportunityDisposition: (
    history: AuthoritativeHistoryRebuild,
    opportunityId: string,
    concludedAt: string,
  ) => { status: "eligible" | "rejected" | "unresolved" };
  supportingObservationIds: (
    history: AuthoritativeHistoryRebuild,
    entryIds: string[],
  ) => Set<string>;
  researchBudgetViewForHistory: (
    history: AuthoritativeHistoryRebuild,
  ) => ResearchBudgetView;
};

export function createLeadingOpportunityModule({
  activeResearchApprovalDecision,
  availableAffirmativeEvidenceIds,
  formedOpportunities,
  noQualifyingOpportunityDisposition,
  supportingObservationIds,
  researchBudgetViewForHistory,
}: LeadingOpportunityServices) {
  function eligibleOpportunityIds(
    history: AuthoritativeHistoryRebuild,
    at: string,
  ): string[] {
    return formedOpportunities(history)
      .filter(
        (opportunity) =>
          noQualifyingOpportunityDisposition(history, opportunity.id, at).status ===
          "eligible",
      )
      .map((opportunity) => opportunity.id);
  }

  function unresolvedOpportunityIds(
    history: AuthoritativeHistoryRebuild,
    at: string,
  ): string[] {
    return formedOpportunities(history)
      .filter(
        (opportunity) =>
          noQualifyingOpportunityDisposition(history, opportunity.id, at).status ===
          "unresolved",
      )
      .map((opportunity) => opportunity.id);
  }

  function comparisonEvidenceViolation(
    history: AuthoritativeHistoryRebuild,
    entryIds: string[],
    opportunityIds: string[],
  ): string | undefined {
    const availableIds = availableAffirmativeEvidenceIds(history);
    const citedOpportunityScopes = new Set<string>();
    for (const entryId of entryIds) {
      if (!availableIds.has(entryId)) {
        return `comparison links unavailable affirmative evidence ${entryId}`;
      }
      const inference = history.inferences.find((entry) => entry.id === entryId);
      if (
        inference === undefined ||
        !opportunityIds.includes(inference.scope) ||
        !["medium", "high"].includes(inference.confidence.level)
      ) {
        return `material comparison evidence ${entryId} must be a medium- or high-confidence Opportunity-scoped Inference`;
      }
      citedOpportunityScopes.add(inference.scope);
    }
    const unsupportedOpportunityId = opportunityIds.find(
      (opportunityId) => !citedOpportunityScopes.has(opportunityId),
    );
    if (unsupportedOpportunityId !== undefined) {
      return `material comparison evidence must include an Opportunity-scoped Inference for ${unsupportedOpportunityId}`;
    }
    return undefined;
  }

  function materialComparisonEvidenceViolation(
    history: AuthoritativeHistoryRebuild,
    assessment: { evidenceEntryIds: string[]; confidence: { level: string } },
    opportunityIds: string[],
    subject: string,
  ): string | undefined {
    if (!["medium", "high"].includes(assessment.confidence.level)) {
      return `${subject} requires at least medium Evidence Confidence`;
    }
    return comparisonEvidenceViolation(
      history,
      assessment.evidenceEntryIds,
      opportunityIds,
    );
  }

  function sameIdentitySet(submittedIds: string[], derivedIds: string[]): boolean {
    return (
      submittedIds.length === derivedIds.length &&
      new Set(submittedIds).size === submittedIds.length &&
      derivedIds.every((id) => submittedIds.includes(id))
    );
  }

  function profileEvidenceBackedComparisons(profile: OpportunityComparison["profiles"][number]) {
    return [
      ...Object.values(profile.requiredInput),
      ...Object.values(profile.potentialOutput),
      profile.outcomeUncertainty,
      profile.inputOutputAsymmetry,
      profile.riskToleranceFit,
      ...profile.preferences,
      ...profile.advantages.filter(
        (advantage) => advantage.effect !== "not-demonstrated",
      ),
    ];
  }

  function opportunityComparisonViolation(
    history: AuthoritativeHistoryRebuild,
    comparison: BaseOpportunityComparison,
    concludedAt: string,
  ): string | undefined {
    if (
      history.intake === undefined ||
      history.breadthGates.length === 0 ||
      history.opportunityQualificationEvaluations.at(-1)?.researchDecision
        .stopReason !== "qualification-complete"
    ) {
      return "Opportunity comparison requires a passed Breadth Gate and completed Qualification Gates";
    }
    if (
      history.noQualifyingOpportunityReports.length > 0 ||
      history.opportunityBriefs.length > 0
    ) {
      return "the Scouting Campaign already has an immutable terminal artifact";
    }
    if (history.reservations.size !== history.settledReservationIds.size) {
      return "Opportunity comparison requires every reserved Source examination to be settled";
    }
    if (activeResearchApprovalDecision(history) !== undefined) {
      return "Opportunity comparison cannot conclude with a pending Research Approval decision";
    }
    if (
      history.campaignDecisions.some(
        (decision) => decision.id === comparison.decision.id,
      )
    ) {
      return `Campaign Decision identity ${comparison.decision.id} is already present`;
    }
    if (
      comparison.decision.intakeVersion !== history.intake.version ||
      comparison.decision.decidedAt !== concludedAt ||
      !["medium", "high"].includes(comparison.decision.confidence.level)
    ) {
      return "Opportunity comparison requires a supported Campaign Decision for the current Campaign Intake";
    }
    const eligibleIds = eligibleOpportunityIds(history, concludedAt);
    const profileIds = comparison.profiles.map((profile) => profile.opportunityId);
    if (
      eligibleIds.length === 0 ||
      profileIds.length !== eligibleIds.length ||
      new Set(profileIds).size !== profileIds.length ||
      eligibleIds.some((id) => !profileIds.includes(id))
    ) {
      return "comparison profiles must preserve every Eligible Opportunity exactly once";
    }
    const intakePreferences = history.intake.statements.filter(
      (statement) => statement.classification === "preference",
    );
    const intakeAdvantages = history.intake.statements.filter(
      (statement) => statement.classification === "advantage",
    );
    for (const profile of comparison.profiles) {
      const preferenceIds = profile.preferences.map((preference) => preference.statementId);
      if (
        preferenceIds.length !== intakePreferences.length ||
        new Set(preferenceIds).size !== preferenceIds.length ||
        intakePreferences.some((preference) => !preferenceIds.includes(preference.id))
      ) {
        return `comparison profile ${profile.opportunityId} must represent every confirmed Preference`;
      }
      const advantageIds = profile.advantages.map(
        (advantage) => advantage.statementId,
      );
      if (
        advantageIds.length !== intakeAdvantages.length ||
        new Set(advantageIds).size !== advantageIds.length ||
        intakeAdvantages.some((advantage) => !advantageIds.includes(advantage.id))
      ) {
        return `comparison profile ${profile.opportunityId} must represent every confirmed Advantage and explicitly mark any that is not demonstrated`;
      }
      for (const assessment of profileEvidenceBackedComparisons(profile)) {
        const evidenceViolation = materialComparisonEvidenceViolation(
          history,
          assessment,
          [profile.opportunityId],
          `comparison profile ${profile.opportunityId} material credit`,
        );
        if (evidenceViolation !== undefined) {
          return evidenceViolation;
        }
      }
    }
    const pairKeys = new Set<string>();
    for (const assessment of comparison.dominanceAssessments) {
      if (
        assessment.challengerOpportunityId === assessment.alternativeOpportunityId ||
        !eligibleIds.includes(assessment.challengerOpportunityId) ||
        !eligibleIds.includes(assessment.alternativeOpportunityId)
      ) {
        return "dominance assessments must compare two distinct Eligible Opportunities";
      }
      const pairKey = `${assessment.challengerOpportunityId}\0${assessment.alternativeOpportunityId}`;
      if (pairKeys.has(pairKey)) {
        return "dominance assessments must contain each directed pair exactly once";
      }
      pairKeys.add(pairKey);
      const allCriteriaSatisfied =
        assessment.criteria.requiresNoMoreMaterialInput &&
        assessment.criteria.offersNoLessCredibleOutput &&
        assessment.criteria.fitsDeveloperProfileAtLeastAsWell &&
        assessment.criteria.materiallyBetterOn.length > 0;
      if ((assessment.outcome === "dominates") !== allCriteriaSatisfied) {
        return "an Eligible Opportunity is dominated only when every material dominance condition is satisfied";
      }
      const evidenceViolation = materialComparisonEvidenceViolation(
        history,
        assessment,
        [assessment.challengerOpportunityId, assessment.alternativeOpportunityId],
        "material dominance",
      );
      if (evidenceViolation !== undefined) {
        return evidenceViolation;
      }
    }
    if (pairKeys.size !== eligibleIds.length * (eligibleIds.length - 1)) {
      return "dominance assessments must contain every directed Eligible Opportunity pair";
    }
    const derivedNonDominatedIds = eligibleIds.filter(
      (opportunityId) =>
        !comparison.dominanceAssessments.some(
          (assessment) =>
            assessment.alternativeOpportunityId === opportunityId &&
            assessment.outcome === "dominates",
        ),
    );
    if (!sameIdentitySet(comparison.nonDominatedOpportunityIds, derivedNonDominatedIds)) {
      return "every and only Non-Dominated Opportunity must remain visible";
    }
    return comparisonEvidenceViolation(
      history,
      comparison.decision.evidenceEntryIds,
      eligibleIds,
    );
  }

  function opportunityBriefInputViolation(
    history: AuthoritativeHistoryRebuild,
    opportunityId: string,
    briefInput: LeadingOpportunityBriefInput,
  ): string | undefined {
    for (const assessment of [
      briefInput.buyerEconomics,
      briefInput.customerAccess,
      briefInput.alternatives,
      ...briefInput.risks,
    ]) {
      const evidenceViolation = materialComparisonEvidenceViolation(
        history,
        assessment,
        [opportunityId],
        "Opportunity Brief material claims",
      );
      if (evidenceViolation !== undefined) {
        return evidenceViolation;
      }
    }
    const opportunity = formedOpportunities(history).find(
      (opportunity) => opportunity.id === opportunityId,
    );
    const hypothesis = briefInput.valueHypothesis;
    if (
      opportunity === undefined ||
      hypothesis.customer !== opportunity.customer ||
      hypothesis.situation !== opportunity.situation
    ) {
      return "Value Hypothesis must identify the Opportunity's customer and situation";
    }
    const hypothesisEvidenceViolation = materialComparisonEvidenceViolation(
      history,
      {
        confidence: hypothesis.confidence,
        evidenceEntryIds: [
          ...hypothesis.supportingEvidenceEntryIds,
          ...hypothesis.challengingEvidenceEntryIds,
        ],
      },
      [opportunityId],
      "Value Hypothesis support",
    );
    if (hypothesisEvidenceViolation !== undefined) {
      return hypothesisEvidenceViolation;
    }
    if (
      hypothesis.assumptionIds.some(
        (id) => !history.assumptions.some((assumption) => assumption.id === id),
      ) ||
      hypothesis.evidenceGapIds.some(
        (id) => !history.evidenceGaps.some((gap) => gap.id === id),
      )
    ) {
      return "Value Hypothesis links an unavailable Assumption or Evidence Gap";
    }
    return undefined;
  }

  function leadingOpportunityViolation(
    history: AuthoritativeHistoryRebuild,
    comparison: OpportunityComparison,
    concludedAt: string,
    briefInput: LeadingOpportunityBriefInput,
  ): string | undefined {
    const comparisonViolation = opportunityComparisonViolation(
      history,
      comparison,
      concludedAt,
    );
    if (comparisonViolation !== undefined) {
      return comparisonViolation;
    }
    const intake = history.intake!;
    const intakePreferences = intake.statements.filter(
      (statement) => statement.classification === "preference",
    );
    const eligibleIds = eligibleOpportunityIds(history, concludedAt);
    const derivedNonDominatedIds = comparison.nonDominatedOpportunityIds;
    const leading = comparison.leadingAssessment;
    if (
      !derivedNonDominatedIds.includes(leading.opportunityId) ||
      comparison.decision.leaderOpportunityId !== leading.opportunityId
    ) {
      return "Leading Opportunity must be a current Non-Dominated Opportunity with a supported terminal Campaign Decision";
    }
    const alternativeIds = eligibleIds.filter((id) => id !== leading.opportunityId);
    const advantagedAlternativeIds = leading.advantagesOverAlternatives.map(
      (advantage) => advantage.alternativeOpportunityId,
    );
    if (
      advantagedAlternativeIds.length !== alternativeIds.length ||
      new Set(advantagedAlternativeIds).size !== advantagedAlternativeIds.length ||
      alternativeIds.some((id) => !advantagedAlternativeIds.includes(id))
    ) {
      return "Leading Opportunity requires one supported material advantage over every alternative";
    }
    for (const advantage of leading.advantagesOverAlternatives) {
      if (advantage.basis === "major-preference") {
        const preference = intake.statements.find(
          (statement) => statement.id === advantage.preferenceStatementId,
        );
        if (
          preference?.classification !== "preference" ||
          preference.importance !== "major"
        ) {
          return "a major-Preference leader advantage must link a confirmed major Preference";
        }
        const leaderPreferenceFit = comparison.profiles
          .find((profile) => profile.opportunityId === leading.opportunityId)!
          .preferences.find(
            (fit) => fit.statementId === advantage.preferenceStatementId,
          )!;
        const alternativePreferenceFit = comparison.profiles
          .find(
            (profile) =>
              profile.opportunityId === advantage.alternativeOpportunityId,
          )!
          .preferences.find(
            (fit) => fit.statementId === advantage.preferenceStatementId,
          )!;
        if (
          leaderPreferenceFit.effect !== "advantage" ||
          leaderPreferenceFit.materiality !== "material" ||
          alternativePreferenceFit.effect === "advantage"
        ) {
          return "a major-Preference leader advantage must match a material advantage in the leader profile that the alternative profile does not share";
        }
      }
      const evidenceViolation = materialComparisonEvidenceViolation(
        history,
        advantage,
        [leading.opportunityId, advantage.alternativeOpportunityId],
        "Leading Opportunity advantages",
      );
      if (evidenceViolation !== undefined) {
        return evidenceViolation;
      }
    }
    const leaderProfile = comparison.profiles.find(
      (profile) => profile.opportunityId === leading.opportunityId,
    )!;
    const hasMajorPreferenceDisadvantage = leaderProfile.preferences.some(
      (preferenceFit) =>
        preferenceFit.effect === "disadvantage" &&
        preferenceFit.materiality === "material" &&
        intakePreferences.some(
          (preference) =>
            preference.id === preferenceFit.statementId &&
            preference.importance === "major",
        ),
    );
    if (
      hasMajorPreferenceDisadvantage ||
      leaderProfile.riskToleranceFit.fit === "material-disadvantage"
    ) {
      return "Leading Opportunity has a material disadvantage on a major Preference or declared Risk Tolerance";
    }
    const latestQualification = history.opportunityQualificationEvaluations.at(-1)!;
    const credibleRangeEvidenceIds = latestQualification.assessments
      .filter((assessment) => eligibleIds.includes(assessment.opportunityId))
      .flatMap((assessment) =>
        Object.values(
          assessment.gates.find(
            (gate) => gate.kind === "commercial-plausibility",
          )!.commercialRanges!,
        ).flatMap((range) => range.evidenceEntryIds),
      );
    if (
      credibleRangeEvidenceIds.some(
        (id) => !leading.robustAcrossCredibleRanges.evidenceEntryIds.includes(id),
      )
    ) {
      return "robust-across-credible-ranges evidence must cover every Eligible Opportunity's recorded commercial ranges";
    }
    const relevantDecisionIds = new Set([
      comparison.decision.id,
      ...formedOpportunities(history)
        .filter((opportunity) => eligibleIds.includes(opportunity.id))
        .map((opportunity) => opportunity.decisionId),
      ...history.opportunityExclusionEvaluations
        .at(-1)!
        .assessments.filter((assessment) => eligibleIds.includes(assessment.opportunityId))
        .flatMap((assessment) => [
          assessment.marketSafety.gate.decision.id,
          ...assessment.hardConstraints.map(({ gate }) => gate.decision.id),
        ]),
      ...latestQualification.assessments
        .filter((assessment) => eligibleIds.includes(assessment.opportunityId))
        .flatMap((assessment) => assessment.gates.map((gate) => gate.decision.id)),
    ]);
    const derivedDecisionChangingGapIds = history.evidenceGaps
      .filter(
        (gap) =>
          gap.status === "open" &&
          gap.affectedDecisionIds.some((id) => relevantDecisionIds.has(id)),
      )
      .map((gap) => gap.id);
    const comparisonEvidenceIds = [
      ...comparison.profiles.flatMap(profileEvidenceBackedComparisons).flatMap(
        (assessment) => assessment.evidenceEntryIds,
      ),
      ...comparison.dominanceAssessments.flatMap(
        (assessment) => assessment.evidenceEntryIds,
      ),
      ...leading.advantagesOverAlternatives.flatMap(
        (advantage) => advantage.evidenceEntryIds,
      ),
      ...leading.noMaterialDisadvantage.evidenceEntryIds,
      ...leading.robustAcrossCredibleRanges.evidenceEntryIds,
      ...leading.adversarialChallenge.evidenceEntryIds,
      ...comparison.decision.evidenceEntryIds,
      ...briefInput.buyerEconomics.evidenceEntryIds,
      ...briefInput.customerAccess.evidenceEntryIds,
      ...briefInput.alternatives.evidenceEntryIds,
      ...briefInput.risks.flatMap((risk) => risk.evidenceEntryIds),
      ...briefInput.valueHypothesis.supportingEvidenceEntryIds,
      ...briefInput.valueHypothesis.challengingEvidenceEntryIds,
    ];
    const comparisonEvidenceGraphIds = new Set([
      ...comparisonEvidenceIds,
      ...supportingObservationIds(history, comparisonEvidenceIds),
    ]);
    const derivedDecisionChangingContradictionIds = history.contradictions
      .filter(
        (contradiction) =>
          contradiction.resolutionStatus !== "resolved" &&
          (eligibleIds.includes(contradiction.disputedScope) ||
            contradiction.entryIds.some((id) => comparisonEvidenceGraphIds.has(id))),
      )
      .map((contradiction) => contradiction.id);
    const derivedUnresolvedContenderIds = unresolvedOpportunityIds(
      history,
      concludedAt,
    );
    if (
      !sameIdentitySet(
        leading.unresolvedContenderOpportunityIds,
        derivedUnresolvedContenderIds,
      ) ||
      !sameIdentitySet(
        leading.decisionChangingEvidenceGapIds,
        derivedDecisionChangingGapIds,
      ) ||
      !sameIdentitySet(
        leading.decisionChangingContradictionIds,
        derivedDecisionChangingContradictionIds,
      )
    ) {
      return "Leading Opportunity must derive every decision-changing Evidence Gap, Contradiction, and unresolved contender from authoritative Campaign history";
    }
    if (
      derivedUnresolvedContenderIds.length > 0 ||
      derivedDecisionChangingGapIds.length > 0 ||
      derivedDecisionChangingContradictionIds.length > 0
    ) {
      return "Leading Opportunity cannot have a decision-changing gap, Contradiction, or unresolved contender";
    }
    const adversarialReservations = [...history.reservations.values()].filter(
      (reservation) => reservation.researchClass === "adversarial",
    );
    const challengeIds = leading.adversarialChallenge.reservationIds;
    if (
      adversarialReservations.length !== intake.researchBudget.adversarialSourceReserve ||
      challengeIds.length !== adversarialReservations.length ||
      new Set(challengeIds).size !== challengeIds.length ||
      adversarialReservations.some(
        (reservation) =>
          reservation.opportunityId !== leading.opportunityId ||
          !challengeIds.includes(reservation.id) ||
          !history.settledReservationIds.has(reservation.id),
      )
    ) {
      return "the complete protected adversarial Source reserve must challenge the apparent leader and be settled";
    }
    const challengeEvidenceViolation = materialComparisonEvidenceViolation(
      history,
      leading.adversarialChallenge,
      [leading.opportunityId],
      "adversarial challenge",
    );
    if (challengeEvidenceViolation !== undefined) {
      return challengeEvidenceViolation;
    }
    const adversarialObservationIds = challengeIds.map(
      (reservationId) => history.reservationObservationIds.get(reservationId)!,
    );
    const challengeSupportingObservationIds = supportingObservationIds(
      history,
      leading.adversarialChallenge.evidenceEntryIds,
    );
    if (
      adversarialObservationIds.some(
        (observationId) =>
          !challengeSupportingObservationIds.has(observationId),
      )
    ) {
      return "adversarial challenge evidence must account for every protected Source examination";
    }
    const briefViolation = opportunityBriefInputViolation(
      history,
      leading.opportunityId,
      briefInput,
    );
    if (briefViolation !== undefined) {
      return briefViolation;
    }
    for (const assessment of [
      leading.noMaterialDisadvantage,
      leading.robustAcrossCredibleRanges,
    ]) {
      const evidenceViolation = materialComparisonEvidenceViolation(
        history,
        assessment,
        eligibleIds,
        "robust leader conditions",
      );
      if (evidenceViolation !== undefined) {
        return evidenceViolation;
      }
    }
    return comparisonEvidenceViolation(
      history,
      comparison.decision.evidenceEntryIds,
      eligibleIds,
    );
  }

  function buildOpportunityBrief(
    history: AuthoritativeHistoryRebuild,
    input: OpportunityBriefBuildInput,
  ): OpportunityBrief {
    const { comparison, brief, opportunityId } = input;
    const opportunity = formedOpportunities(history).find(
      (opportunity) => opportunity.id === opportunityId,
    )!;
    const profile = comparison.profiles.find(
      (profile) => profile.opportunityId === opportunityId,
    )!;
    const exclusion = history.opportunityExclusionEvaluations
      .at(-1)!
      .assessments.find((assessment) => assessment.opportunityId === opportunityId)!;
    const qualification = history.opportunityQualificationEvaluations
      .at(-1)!
      .assessments.find((assessment) => assessment.opportunityId === opportunityId)!;
    const eligibility = [
      { kind: "market-safety" as const, gate: exclusion.marketSafety.gate },
      ...exclusion.hardConstraints.map(({ gate }) => ({
        kind: "hard-constraint" as const,
        gate,
      })),
      ...qualification.gates.map((gate) => ({ kind: gate.kind, gate })),
    ].map(({ kind, gate }) => ({
      kind,
      state: "passed" as const,
      decisionId: gate.decision.id,
      confidence: gate.decision.confidence,
      supportingEvidenceEntryIds: gate.decision.supportingEvidenceEntryIds,
      challengingEvidenceEntryIds: gate.decision.challengingEvidenceEntryIds,
      evidenceGapIds: gate.decision.evidenceGapIds,
      contradictionIds: gate.decision.contradictionIds,
      rationale: gate.decision.rationale,
    }));
    const commercialRanges = qualification.gates.find(
      (gate) => gate.kind === "commercial-plausibility",
    )!.commercialRanges!;
    const breadthGate = history.breadthGates.at(-1)!;
    const sweeps = history.discoveryTranches.flatMap((tranche) => tranche.sweeps);
    const profileAssessments = [
      ...Object.values(profile.requiredInput),
      ...Object.values(profile.potentialOutput),
      profile.outcomeUncertainty,
      profile.inputOutputAsymmetry,
      profile.riskToleranceFit,
      ...profile.preferences,
      ...profile.advantages,
    ];
    const limitations = [
      ...eligibility.flatMap((gate) => {
        const decision = history.campaignDecisions.find(
          (decision) => decision.id === gate.decisionId,
        )!;
        return decision.limitations;
      }),
      ...input.selection.limitations,
      ...profileAssessments.flatMap(
        (assessment) => assessment.confidence.limitingFactors,
      ),
      ...comparison.dominanceAssessments.flatMap(
        (assessment) => assessment.confidence.limitingFactors,
      ),
      ...input.comparisonLimitingFactors,
      ...[
        brief.buyerEconomics,
        brief.customerAccess,
        brief.alternatives,
        ...brief.risks,
      ].flatMap((assessment) => assessment.confidence.limitingFactors),
      ...brief.valueHypothesis.confidence.limitingFactors,
    ].filter((limitation, index, all) => all.indexOf(limitation) === index);
    const assumptionIds = history.assumptions
      .filter((assumption) => assumption.scope === opportunityId)
      .map((assumption) => assumption.id);
    const evidenceGapIds = [
      ...history.assumptions
        .filter((assumption) => assumption.scope === opportunityId)
        .map((assumption) => assumption.evidenceGapId),
      ...eligibility.flatMap((gate) => gate.evidenceGapIds),
      ...brief.valueHypothesis.evidenceGapIds,
    ].filter((id, index, all) => all.indexOf(id) === index);
    const contradictionIds = [
      ...history.contradictions
        .filter((contradiction) => contradiction.disputedScope === opportunityId)
        .map((contradiction) => contradiction.id),
      ...eligibility.flatMap((gate) => gate.contradictionIds),
    ].filter((id, index, all) => all.indexOf(id) === index);
    const disconfirmingEvidenceEntryIds = [
      ...eligibility.flatMap((gate) => gate.challengingEvidenceEntryIds),
      ...brief.valueHypothesis.challengingEvidenceEntryIds,
      ...history.inferences
        .filter((inference) => inference.scope === opportunityId)
        .flatMap((inference) => inference.challengingEntryIds),
    ].filter((id, index, all) => all.indexOf(id) === index);
    const traceabilityRows = [
      ...eligibility.map((gate) => ({
        conclusion: `Eligibility gate ${gate.kind}`,
        entryIds: [gate.decisionId, ...gate.supportingEvidenceEntryIds],
      })),
      { conclusion: "Buyer economics", entryIds: brief.buyerEconomics.evidenceEntryIds },
      { conclusion: "Customer access", entryIds: brief.customerAccess.evidenceEntryIds },
      { conclusion: "Current alternatives", entryIds: brief.alternatives.evidenceEntryIds },
      ...Object.entries(commercialRanges).map(([dimension, range]) => ({
        conclusion: `Commercial range ${dimension}`,
        entryIds: range.evidenceEntryIds,
      })),
      ...Object.entries(profile.requiredInput).map(([dimension, assessment]) => ({
        conclusion: `Required Input ${dimension}`,
        entryIds: assessment.evidenceEntryIds,
      })),
      ...Object.entries(profile.potentialOutput).map(([dimension, assessment]) => ({
        conclusion: `Potential Output ${dimension}`,
        entryIds: assessment.evidenceEntryIds,
      })),
      {
        conclusion: "Outcome Uncertainty",
        entryIds: profile.outcomeUncertainty.evidenceEntryIds,
      },
      {
        conclusion: "Input–Output Asymmetry",
        entryIds: profile.inputOutputAsymmetry.evidenceEntryIds,
      },
      ...profile.preferences.map((preference) => ({
        conclusion: `Preference fit ${preference.statementId}`,
        entryIds: [preference.statementId, ...preference.evidenceEntryIds],
      })),
      ...profile.advantages.map((advantage) => ({
        conclusion: `Advantage ${advantage.statementId}`,
        entryIds: [advantage.statementId, ...advantage.evidenceEntryIds],
      })),
      {
        conclusion: "Declared Risk Tolerance fit",
        entryIds: profile.riskToleranceFit.evidenceEntryIds,
      },
      ...brief.risks.map((risk, index) => ({
        conclusion: `Risk ${index + 1}`,
        entryIds: risk.evidenceEntryIds,
      })),
      {
        conclusion: "Value Hypothesis",
        entryIds: [
          ...brief.valueHypothesis.supportingEvidenceEntryIds,
          ...brief.valueHypothesis.challengingEvidenceEntryIds,
          ...brief.valueHypothesis.assumptionIds,
          ...brief.valueHypothesis.evidenceGapIds,
        ],
      },
      ...input.additionalTraceabilityRows,
      {
        conclusion: input.selection.traceabilityConclusion,
        entryIds: [
          input.selection.decisionId,
          ...input.selection.evidenceEntryIds,
        ],
      },
    ];
    return {
      briefVersion: contracts.renderTemplates,
      id: brief.id,
      kind: "opportunity-brief",
      role: input.role,
      campaignId: history.campaignId,
      concludedAt: input.concludedAt,
      intakeVersion: history.intake!.version,
      supersedes: null,
      ...(input.selectionProvenance === undefined
        ? {}
        : { selectionProvenance: input.selectionProvenance }),
      opportunity: {
        id: opportunity.id,
        customer: opportunity.customer,
        situation: opportunity.situation,
        costlyProblem: opportunity.costlyProblem,
      },
      commercialOutcomeTarget: history.intake!.commercialOutcomeTarget,
      researchBudget: researchBudgetViewForHistory(history),
      coverage: {
        discoveryTranches: history.discoveryTranches.length,
        discoverySweeps: sweeps.length,
        sourceFamilies: [...new Set(sweeps.map((sweep) => sweep.sourceFamily.id))],
        formedOpportunities: formedOpportunities(history).length,
        breadthGate: { id: breadthGate.id, status: "passed" },
      },
      eligibility,
      buyerEconomics: brief.buyerEconomics,
      customerAccess: brief.customerAccess,
      alternatives: brief.alternatives,
      valueHypothesis: brief.valueHypothesis,
      requiredInput: profile.requiredInput,
      potentialOutput: profile.potentialOutput,
      outcomeUncertainty: profile.outcomeUncertainty,
      inputOutputAsymmetry: profile.inputOutputAsymmetry,
      profileFit: {
        preferences: profile.preferences,
        advantages: profile.advantages,
        riskToleranceFit: profile.riskToleranceFit,
      },
      commercialRanges,
      risks: brief.risks,
      evidenceLimits: {
        limitations,
        assumptionIds,
        evidenceGapIds,
        contradictionIds,
        disconfirmingEvidenceEntryIds,
      },
      comparisonContext: {
        comparisonId: comparison.id,
        eligibleOpportunityIds: comparison.profiles.map(
          (profile) => profile.opportunityId,
        ),
        nonDominatedOpportunityIds: comparison.nonDominatedOpportunityIds,
        dominanceAssessments: comparison.dominanceAssessments,
        selectionRationale: input.selection.rationale,
        decisionId: input.selection.decisionId,
        adversarialReservationIds: input.adversarialReservationIds,
      },
      traceability: {
        authoritativeRecordsPath: "records.jsonl",
        evidenceLedgerPath: "evidence-ledger.json",
        rows: traceabilityRows,
      },
      wayfinderHandoff: input.wayfinderHandoff,
    };
  }

  function buildLeadingOpportunityBrief(
    history: AuthoritativeHistoryRebuild,
    command: ConcludeLeadingOpportunityCommand,
  ): OpportunityBrief {
    const { comparison, brief } = command.payload;
    const leading = comparison.leadingAssessment;
    return buildOpportunityBrief(history, {
      comparison,
      brief,
      opportunityId: leading.opportunityId,
      concludedAt: command.payload.concludedAt,
      role: "scout-recommended-leading-opportunity",
      selection: {
        rationale: comparison.decision.rationale,
        decisionId: comparison.decision.id,
        evidenceEntryIds: comparison.decision.evidenceEntryIds,
        limitations: comparison.decision.limitations,
        traceabilityConclusion: "Leading Opportunity selection",
      },
      adversarialReservationIds: leading.adversarialChallenge.reservationIds,
      comparisonLimitingFactors: [
        ...leading.advantagesOverAlternatives.flatMap(
          (assessment) => assessment.confidence.limitingFactors,
        ),
        ...leading.noMaterialDisadvantage.confidence.limitingFactors,
        ...leading.robustAcrossCredibleRanges.confidence.limitingFactors,
        ...leading.adversarialChallenge.confidence.limitingFactors,
      ],
      additionalTraceabilityRows: [
        {
          conclusion: "Adversarial conclusion",
          entryIds: leading.adversarialChallenge.evidenceEntryIds,
        },
      ],
      wayfinderHandoff: {
        optional: true,
        invoked: false,
        briefPath: "opportunity-brief.md",
        instruction:
          "If you choose, invoke Wayfinder separately using this immutable Opportunity Brief as input; challenge the provisional Value Hypothesis and keep product-planning decisions outside this Campaign.",
      },
    });
  }

  return {
    unresolvedOpportunityIds,
    opportunityComparisonViolation,
    opportunityBriefInputViolation,
    leadingOpportunityViolation,
    buildOpportunityBrief,
    buildLeadingOpportunityBrief,
  };
}

function briefText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function renderComparisonGroup(
  title: string,
  values: Record<string, { summary: string; evidenceEntryIds: string[] }>,
): string[] {
  return [
    `## ${title}`,
    "",
    ...Object.entries(values).map(
      ([name, value]) =>
        `- ${briefText(name)}: ${briefText(value.summary)} (Evidence: ${value.evidenceEntryIds.join(", ")})`,
    ),
    "",
  ];
}

export function renderOpportunityBrief(brief: OpportunityBrief): string {
  const developerSelected = brief.role === "developer-selected-opportunity";
  const ranges = Object.entries(brief.commercialRanges).map(
    ([name, range]) =>
      `- ${briefText(name)}: ${range.low}–${range.high} ${briefText(range.unit)} (Evidence: ${range.evidenceEntryIds.join(", ")})`,
  );
  const traceability = brief.traceability.rows.map(
    (row) => `| ${briefText(row.conclusion)} | ${row.entryIds.map(briefText).join(", ")} |`,
  );
  return [
    "# Opportunity Brief",
    "",
    developerSelected
      ? "**Role:** Developer-Selected Opportunity"
      : "**Role:** Scout-recommended Leading Opportunity",
    ...(brief.selectionProvenance === undefined
      ? []
      : [
          `**Selection provenance:** ${briefText(brief.selectionProvenance.rationale)} (developer Preference, not market evidence; never a Leading Opportunity)`,
        ]),
    `**Opportunity:** ${briefText(brief.opportunity.id)}`,
    `**Customer:** ${briefText(brief.opportunity.customer)}`,
    `**Situation:** ${briefText(brief.opportunity.situation)}`,
    `**Costly Problem:** ${briefText(brief.opportunity.costlyProblem.description)}`,
    `**Campaign:** ${briefText(brief.campaignId)}`,
    `**Campaign Intake version:** ${brief.intakeVersion}`,
    `**Created:** ${brief.concludedAt}`,
    "**Supersedes:** none",
    "",
    "## Eligibility",
    "",
    ...brief.eligibility.map(
      (gate) =>
        `- ${briefText(gate.kind)}: passed (${gate.confidence.level} Evidence Confidence; Campaign Decision ${briefText(gate.decisionId)}). ${briefText(gate.rationale)}`,
    ),
    "",
    "## Economics, access, and alternatives",
    "",
    `- Buyer economics: ${briefText(brief.buyerEconomics.summary)}`,
    `- Customer access: ${briefText(brief.customerAccess.summary)}`,
    `- Current alternatives: ${briefText(brief.alternatives.summary)}`,
    "",
    "### Commercial ranges against the Commercial Outcome Target",
    "",
    `Target: ${brief.commercialOutcomeTarget.amount} ${brief.commercialOutcomeTarget.currency} ${briefText(brief.commercialOutcomeTarget.metric)} by ${brief.commercialOutcomeTarget.deadline}.`,
    "",
    ...ranges,
    "",
    ...renderComparisonGroup("Required Input", brief.requiredInput),
    ...renderComparisonGroup("Potential Output", brief.potentialOutput),
    "## Outcome Uncertainty",
    "",
    briefText(brief.outcomeUncertainty.summary),
    "",
    "## Input–Output Asymmetry",
    "",
    briefText(brief.inputOutputAsymmetry.summary),
    "",
    "## Developer Profile fit",
    "",
    ...(brief.profileFit.preferences.length === 0
      ? ["- Confirmed Preferences: none."]
      : brief.profileFit.preferences.map(
          (preference) =>
            `- Preference ${briefText(preference.statementId)}: ${preference.effect}, ${preference.materiality}. ${briefText(preference.rationale)}`,
        )),
    ...(brief.profileFit.advantages.length === 0
      ? ["- Demonstrated Advantages: none."]
      : brief.profileFit.advantages.map(
          (advantage) =>
            `- Advantage ${briefText(advantage.statementId)}: ${advantage.effect}. ${briefText(advantage.rationale)}`,
        )),
    `- Declared Risk Tolerance: ${brief.profileFit.riskToleranceFit.fit}. ${briefText(brief.profileFit.riskToleranceFit.summary)}`,
    "",
    "## Value Hypothesis",
    "",
    "**Provisional—not a product specification.**",
    `For ${briefText(brief.valueHypothesis.customer)} in ${briefText(brief.valueHypothesis.situation)}, the smallest desired customer outcome is: ${briefText(brief.valueHypothesis.smallestDesiredCustomerOutcome)}`,
    "",
    briefText(brief.valueHypothesis.supportedReason),
    "",
    "Disconfirmation conditions:",
    ...brief.valueHypothesis.disconfirmationConditions.map(
      (condition) => `- ${briefText(condition)}`,
    ),
    "",
    "## Risks and evidence limits",
    "",
    ...brief.risks.map((risk) => `- ${briefText(risk.summary)}`),
    ...brief.evidenceLimits.limitations.map((limitation) => `- ${briefText(limitation)}`),
    `- Material Assumptions: ${brief.evidenceLimits.assumptionIds.length === 0 ? "none" : brief.evidenceLimits.assumptionIds.map(briefText).join(", ")}`,
    `- Evidence Gaps: ${brief.evidenceLimits.evidenceGapIds.length === 0 ? "none" : brief.evidenceLimits.evidenceGapIds.map(briefText).join(", ")}`,
    `- Contradictions: ${brief.evidenceLimits.contradictionIds.length === 0 ? "none" : brief.evidenceLimits.contradictionIds.map(briefText).join(", ")}`,
    `- Disconfirming evidence: ${brief.evidenceLimits.disconfirmingEvidenceEntryIds.length === 0 ? "none" : brief.evidenceLimits.disconfirmingEvidenceEntryIds.map(briefText).join(", ")}`,
    "",
    "## Comparison context",
    "",
    `Eligible Opportunities: ${brief.comparisonContext.eligibleOpportunityIds.map(briefText).join(", ")}.`,
    `Non-Dominated Opportunities: ${brief.comparisonContext.nonDominatedOpportunityIds.map(briefText).join(", ")}.`,
    `Selection rationale: ${briefText(brief.comparisonContext.selectionRationale)}`,
    ...brief.comparisonContext.dominanceAssessments.map(
      (assessment) =>
        `- ${briefText(assessment.challengerOpportunityId)} → ${briefText(assessment.alternativeOpportunityId)}: ${assessment.outcome}. ${briefText(assessment.rationale)} (Evidence: ${assessment.evidenceEntryIds.map(briefText).join(", ")})`,
    ),
    `Adversarial Source reservations: ${brief.comparisonContext.adversarialReservationIds.map(briefText).join(", ")}.`,
    "",
    "## Coverage and Research Budget",
    "",
    `- Discovery Tranches: ${brief.coverage.discoveryTranches}`,
    `- Discovery Sweeps: ${brief.coverage.discoverySweeps}`,
    `- Source Families: ${brief.coverage.sourceFamilies.map(briefText).join(", ")}`,
    `- Settled Source units: ${brief.researchBudget.settledSourceUnits}/${brief.researchBudget.sourceCap}`,
    `- Adversarial Source reserve remaining: ${brief.researchBudget.remainingAdversarialSourceUnits}`,
    "",
    "## Traceability contract",
    "",
    "| Material conclusion | Stable Evidence Ledger or Campaign Decision identities |",
    "| --- | --- |",
    ...traceability,
    "",
    `- Authoritative history: ${brief.traceability.authoritativeRecordsPath}`,
    `- Evidence Ledger: ${brief.traceability.evidenceLedgerPath}`,
    "",
    "## Optional separate Wayfinder handoff",
    "",
    "Wayfinder has not been started. The developer may choose whether to invoke it.",
    "",
    briefText(brief.wayfinderHandoff.instruction),
    "",
    `Immutable brief path: ${brief.wayfinderHandoff.briefPath}`,
    "",
  ].join("\n");
}
