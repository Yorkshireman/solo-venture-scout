
export type RetrievalRoute = {
  id: string;
  available: boolean;
  public: boolean;
  lawful: boolean;
};

export type PreflightCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "preflight";
  payload: {
    storagePath: string;
    retrievalRoutes: RetrievalRoute[];
  };
};

export type CreateCampaignCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "createCampaign";
  payload: {
    campaignPath: string;
    campaignId: string;
    coordinatorId: string;
    createdAt: string;
    leaseExpiresAt: string;
  };
};

export type InspectCampaignCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "inspectCampaign";
  payload: {
    campaignPath?: string;
    searchPath?: string;
  };
};

export type InspectEvidenceCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "inspectEvidence";
  payload: {
    campaignPath?: string;
    searchPath?: string;
    entryIds: string[];
  };
};

export type ResumeCampaignCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "resumeCampaign";
  payload: {
    campaignPath?: string;
    searchPath?: string;
    coordinatorId: string;
    resumedAt: string;
    leaseExpiresAt: string;
  };
};

export type IntakeValue =
  | { state: "known"; value: string }
  | { state: "unknown" }
  | { state: "none" }
  | { state: "not-applicable"; rationale: string };

export type DeveloperProfileSnapshot = {
  capturedAt: string;
  capacity: IntakeValue;
  capabilities: IntakeValue;
  access: IntakeValue;
  boundaries: IntakeValue;
  operatingPreferences: IntakeValue;
  riskTolerance: IntakeValue;
};

export type CommercialOutcomeTarget = {
  amount: number;
  currency: string;
  metric: string;
  deadline: string;
};

export type IntakeStatement =
  | {
      id: string;
      text: string;
      classification: "hard-constraint";
    }
  | {
      id: string;
      text: string;
      classification: "preference";
      importance: "minor" | "important" | "major";
    }
  | {
      id: string;
      text: string;
      classification: "advantage";
      rationale: string;
    };

export type ResearchBudget = {
  profile: "quick" | "standard" | "deep" | "custom";
  sourceCap: number;
  discoverySweepCap: number;
  sourceFamilyMinimum: number;
  deepenedOpportunityCap: number;
  minimumComparisonSet: number;
  adversarialSourceReserve: number;
  paidSpendCap: { amount: number; currency: string };
};

export type CampaignIntake = {
  version: number;
  explicitlyConfirmed: true;
  developerProfileSnapshot: DeveloperProfileSnapshot;
  commercialOutcomeTarget: CommercialOutcomeTarget;
  statements: IntakeStatement[];
  researchBudget: ResearchBudget;
};

export type ConfirmedCampaignIntake = CampaignIntake & {
  campaignId: string;
  confirmedAt: string;
};

export type ConfirmCampaignIntakeCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "confirmCampaignIntake";
  payload: {
    campaignPath: string;
    coordinatorId: string;
    confirmedAt: string;
    intake: CampaignIntake;
  };
};

export type CampaignResearchReservation = {
  id: string;
  sourceUnits: 1;
  purpose: string;
  retrievalRoute: string;
  researchClass?: "deepening" | "open-world-discovery" | "adversarial";
  opportunityId?: string;
  approvalId?: string;
  decisionValuePriorityId?: string;
  evidenceGapId?: string;
};

export type PublicResearchReservation = CampaignResearchReservation;

export type ApprovedResearchReservation = CampaignResearchReservation & {
  approvalId: string;
};

export type ReservePublicResearchCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "reservePublicResearch";
  payload: {
    campaignPath: string;
    coordinatorId: string;
    reservedAt: string;
    reservation: PublicResearchReservation;
  };
};

export type ReserveApprovedResearchCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "reserveApprovedResearch";
  payload: {
    campaignPath: string;
    coordinatorId: string;
    reservedAt: string;
    reservation: ApprovedResearchReservation;
  };
};

export type Source = {
  id: string;
  retrievalMode: string;
  url: string;
  publisher: string | null;
  originator: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  accessedAt: string;
  exactLocator: string;
};

export type PublicSource = Source;

export type Observation = {
  id: string;
  text: string;
  sourceId: string;
  exactLocator: string;
};

export type PublicObservation = Observation;

export type EvidenceConfidenceLevel = "unknown" | "low" | "medium" | "high";

export type EvidenceConfidence = {
  level: EvidenceConfidenceLevel;
  limitingFactors: string[];
};

export type SourceLineage = {
  type: "source-lineage";
  id: string;
  sourceIds: string[];
  sharedOrigin: string;
  relationship:
    | "shared-authorship"
    | "shared-dataset"
    | "syndication"
    | "republication"
    | "other";
  independence: "dependent";
};

export type SourceCredibilityAssessment = "unknown" | "low" | "medium" | "high";

export type SourceFreshnessAssessment = "unknown" | "low" | "medium" | "high";

export type SourceCredibility = {
  type: "source-credibility";
  id: string;
  sourceId: string;
  observationId: string;
  intendedUse: string;
  assessment: SourceCredibilityAssessment;
  rationale: string;
  limitations: string[];
};

export type SourceFreshness = {
  type: "source-freshness";
  id: string;
  sourceId: string;
  observationId: string;
  intendedUse: string;
  assessment: SourceFreshnessAssessment;
  timeSensitivity: string;
  rationale: string;
  limitations: string[];
  refreshAfter?: string | null;
};

export type EvidenceGap = {
  type: "evidence-gap";
  id: string;
  question: string;
  affectedDecisionIds: string[];
  resolutionCriteria: string;
  resolutionMethod: string;
  status: "open" | "resolved";
  resolution: string | null;
};

export type Assumption = {
  type: "assumption";
  id: string;
  text: string;
  scope: string;
  evidenceGapId: string;
};

export type Inference = {
  type: "inference";
  id: string;
  text: string;
  scope: string;
  reasoning: string;
  supportingEntryIds: string[];
  challengingEntryIds: string[];
  confidence: EvidenceConfidence;
};

export type Contradiction = {
  type: "contradiction";
  id: string;
  entryIds: string[];
  disputedProposition: string;
  disputedScope: string;
  attemptedReconciliation: string;
  resolutionStatus: "unresolved" | "partially-resolved" | "resolved";
  resolution: string | null;
};

export type Correction = {
  type: "correction";
  id: string;
  targetEntryId: string;
  action: "reaffirm" | "supersede" | "retract";
  replacementEntryId: string | null;
  rationale: string;
};

export type ReasoningEntry =
  | SourceLineage
  | SourceCredibility
  | SourceFreshness
  | EvidenceGap
  | Assumption
  | Inference
  | Contradiction
  | Correction;

export type RecordPublicResearchObservationCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "recordPublicResearchObservation";
  payload: {
    campaignPath: string;
    coordinatorId: string;
    recordedAt: string;
    reservationId: string;
    source: PublicSource;
    observation: PublicObservation;
  };
};

export type ResearchChargeResolution =
  | { incurred: false }
  | { incurred: true; expenditureId: string };

export type RecordApprovedResearchObservationCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "recordApprovedResearchObservation";
  payload: {
    campaignPath: string;
    coordinatorId: string;
    recordedAt: string;
    reservationId: string;
    source: Source;
    observation: Observation;
    charge: ResearchChargeResolution;
  };
};

export type RecordEvidenceReasoningCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "recordEvidenceReasoning";
  payload: {
    campaignPath: string;
    coordinatorId: string;
    recordedAt: string;
    entries: ReasoningEntry[];
  };
};

export type DiscoverySampling = {
  frameOrigin: "external-map";
  method: "systematic" | "stratified" | "seeded-random" | "bounded-enumeration";
  frame: string;
  selectionRule: string;
  sampleSize: number;
  randomSeed: string | null;
};

export type DiscoverySweep = {
  id: string;
  sourceFamily: {
    id: string;
    name: string;
    economicActivityMap: string;
  };
  sourceIds: string[];
  sampling: DiscoverySampling;
};

export type MaterialConsequenceKind =
  | "lost-money"
  | "wasted-skilled-time"
  | "blocked-revenue"
  | "operational-risk"
  | "compliance-exposure"
  | "workaround-expenditure";

export type ProblemSignal = {
  materialConsequence: {
    kind: MaterialConsequenceKind;
    description: string;
    observationIds: string[];
  };
  committedBehavior: {
    kind:
      | "expenditure"
      | "workaround-effort"
      | "switching"
      | "escalation"
      | "measurable-loss";
    description: string;
    observationIds: string[];
  };
};

export type ExplorationThreadBase = {
  id: string;
  customerGroup: string;
  situation: string;
  problemFamily: string;
  familiarDomain: boolean;
  noveltyCheck: {
    comparedWithThreadIds: string[];
    result: "distinct" | "overlaps-existing";
    rationale: string;
  };
  disposition: {
    status: "retained" | "dropped";
    rationale: string;
  };
};

export type SourceLedExplorationThread = ExplorationThreadBase & {
  origin: {
    kind: "source-led";
    sweepId: string;
    observationIds: string[];
  };
  problemSignal: ProblemSignal;
};

export type NoveltyProbeExplorationThread = ExplorationThreadBase & {
  origin: {
    kind: "novelty-probe";
    method: "cross-domain-transfer" | "change-combination" | "inversion" | "recombination";
    derivation: string;
    assumption: Assumption;
    evidenceGap: EvidenceGap;
  };
};

export type ExplorationThread =
  | SourceLedExplorationThread
  | NoveltyProbeExplorationThread;

export type FamiliarDomainException = {
  intakeStatementId: string;
  rationale: string;
};

export type DiscoveryTranche = {
  id: string;
  ordinal: number;
  threadSlots: number;
  noveltyProbeSlots: number;
  shallowResearchSourceUnitsPerRetainedThread: number;
  familiarDomainException: FamiliarDomainException | null;
  sweeps: DiscoverySweep[];
  threads: ExplorationThread[];
};

export type RecordDiscoveryTrancheCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "recordDiscoveryTranche";
  payload: {
    campaignPath: string;
    coordinatorId: string;
    recordedAt: string;
    tranche: DiscoveryTranche;
  };
};

export type FormationCampaignDecision = {
  type: "campaign-decision";
  id: string;
  kind: "opportunity-formation" | "breadth-gate";
  outcome: "formed" | "insufficient-evidence" | "passed";
  intakeVersion: number;
  applicableRule: string;
  evidenceEntryIds: string[];
  rationale: string;
  confidence: EvidenceConfidence;
  limitations: string[];
  decidedAt: string;
};

export type OpportunityGateDecision = {
  type: "campaign-decision";
  id: string;
  kind: "exclusion-gate" | "qualification-gate";
  outcome: "passed" | "failed" | "unresolved";
  opportunityId: string;
  intakeVersion: number;
  applicableRule: string;
  supportingEvidenceEntryIds: string[];
  challengingEvidenceEntryIds: string[];
  evidenceGapIds: string[];
  contradictionIds: string[];
  rationale: string;
  confidence: EvidenceConfidence;
  limitations: string[];
  decidedAt: string;
};

export type QualificationCampaignDecision = {
  type: "campaign-decision";
  id: string;
  kind: "qualification-research";
  outcome: "continue" | "stop";
  intakeVersion: number;
  applicableRule: string;
  evidenceEntryIds: string[];
  decisionValuePriorities: QualificationDecisionValuePriority[];
  stopReason:
    | null
    | "ordinary-budget-exhausted"
    | "no-permitted-positive-decision-value"
    | "qualification-complete";
  rationale: string;
  confidence: EvidenceConfidence;
  limitations: string[];
  decidedAt: string;
};

export type ComparisonCampaignDecision = {
  type: "campaign-decision";
  id: string;
  kind: "opportunity-comparison";
  outcome: "leading-opportunity";
  leaderOpportunityId: string;
  intakeVersion: number;
  applicableRule: string;
  evidenceEntryIds: string[];
  rationale: string;
  confidence: EvidenceConfidence;
  limitations: string[];
  decidedAt: string;
};

export type InconclusiveComparisonCampaignDecision = Omit<
  ComparisonCampaignDecision,
  "outcome" | "leaderOpportunityId"
> & {
  outcome: "inconclusive-comparison";
  leaderOpportunityId: null;
};

export type ReevaluationCampaignDecision = {
  type: "campaign-decision";
  id: string;
  kind: "campaign-re-evaluation";
  outcome: "resume" | "reaffirm";
  intakeVersion: number;
  applicableRule: string;
  triggerEntryIds: string[];
  affectedOpportunityIds: string[];
  supersededDecisionIds: string[];
  rationale: string;
  confidence: EvidenceConfidence;
  limitations: string[];
  decidedAt: string;
};

export type CampaignDecision =
  | FormationCampaignDecision
  | OpportunityGateDecision
  | QualificationCampaignDecision
  | ComparisonCampaignDecision
  | InconclusiveComparisonCampaignDecision
  | ReevaluationCampaignDecision;

export type CampaignReevaluationKind =
  | "developer-challenge"
  | "intake-revision"
  | "source-correction"
  | "source-redaction"
  | "freshness-change"
  | "contradiction"
  | "new-evidence"
  | "resume-refresh";

export type CampaignIntakeRevision = {
  reason: string;
  previousVersion: number;
  intake: ConfirmedCampaignIntake;
};

export type CampaignReevaluation = {
  id: string;
  kind: CampaignReevaluationKind;
  reason: string;
  reasoningEntryIds: string[];
  intakeRevision: CampaignIntakeRevision | null;
  decision: ReevaluationCampaignDecision;
  invalidatedDecisionIds: string[];
  supersededArtifactIds: string[];
};

export type ReevaluationOperationInput = {
  id: string;
  kind: CampaignReevaluationKind;
  reason: string;
  reasoningEntries: ReasoningEntry[];
  intakeRevision: null | {
    reason: string;
    intake: CampaignIntake;
  };
  decision: ReevaluationCampaignDecision;
};

export type ReevaluateCampaignCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "reevaluateCampaign";
  payload: {
    campaignPath: string;
    coordinatorId: string;
    reevaluatedAt: string;
    operation: ReevaluationOperationInput;
  };
};

export type ExclusionGate = {
  id: string;
  state: "passed" | "failed" | "unresolved";
  decision: OpportunityGateDecision;
};

export type OpportunityExclusionAssessment = {
  id: string;
  opportunityId: string;
  marketSafety: {
    classification:
      | "ordinary"
      | "elevated-risk"
      | "excluded-market"
      | "unresolved";
    intendedActivity: string;
    excludedCategory: string | null;
    directlyServesExcludedActivity: boolean | null;
    gate: ExclusionGate;
  };
  hardConstraints: Array<{
    hardConstraintId: string;
    gate: ExclusionGate;
  }>;
};

export type OpportunityExclusionEvaluation = {
  assessments: OpportunityExclusionAssessment[];
};

export type RecordOpportunityExclusionGatesCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "recordOpportunityExclusionGates";
  payload: {
    campaignPath: string;
    coordinatorId: string;
    recordedAt: string;
    reevaluationId?: string;
    assessments: OpportunityExclusionAssessment[];
  };
};

export const qualificationGateKinds = [
  "costly-problem",
  "buyer-economics",
  "customer-access",
  "value-feasibility",
  "solo-feasibility",
  "competitive-viability",
  "legal-operational-feasibility",
  "commercial-plausibility",
] as const;

export type QualificationGateKind = (typeof qualificationGateKinds)[number];

export type QualificationEvidenceBasis = {
  behavioralEvidenceEntryIds: string[];
  independentSourceLineages: Array<{
    sourceIds: string[];
    rationale: string;
  }>;
  sourceFreshnessIds: string[];
};

export type TraceableCommercialRange = {
  low: number;
  high: number;
  unit: string;
  evidenceEntryIds: string[];
};

export type CommercialPlausibilityRanges = {
  price: TraceableCommercialRange;
  customerVolume: TraceableCommercialRange;
  costs: TraceableCommercialRange;
  acquisition: TraceableCommercialRange;
  capacity: TraceableCommercialRange;
  timing: TraceableCommercialRange;
};

export type QualificationGate = {
  id: string;
  kind: QualificationGateKind;
  state: "passed" | "failed" | "unresolved";
  evidenceBasis: QualificationEvidenceBasis;
  commercialRanges?: CommercialPlausibilityRanges | null;
  decision: OpportunityGateDecision;
};

export type OpportunityQualificationAssessment = {
  id: string;
  opportunityId: string;
  gates: QualificationGate[];
};

export type OpportunityQualificationEvaluation = {
  id: string;
  assessments: OpportunityQualificationAssessment[];
  researchDecision: QualificationCampaignDecision;
};

export type RecordOpportunityQualificationGatesCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "recordOpportunityQualificationGates";
  payload: {
    campaignPath: string;
    coordinatorId: string;
    recordedAt: string;
    reevaluationId?: string;
    evaluation: OpportunityQualificationEvaluation;
  };
};

export type NoQualifyingOpportunityContinuationCondition = {
  id: string;
  opportunityId: string;
  condition: string;
  evidenceGapIds: string[];
};

export type NoQualifyingOpportunityReport = {
  reportVersion: string;
  id: string;
  kind: "no-qualifying-opportunity-report";
  campaignId: string;
  concludedAt: string;
  intakeVersion: number;
  supersedes: string | null;
  outcome: "no-qualifying-opportunity";
  summary: string;
  rejectedOpportunities: Array<{
    id: string;
    customer: string;
    situation: string;
    decisionIds: string[];
    reasons: string[];
  }>;
  unresolvedOpportunities: Array<{
    id: string;
    customer: string;
    situation: string;
    decisionIds: string[];
    evidenceGapIds: string[];
    reasons: string[];
  }>;
  coverage: {
    discoveryTranches: number;
    discoverySweeps: number;
    sourceFamilies: string[];
    formedOpportunities: number;
    breadthGate: { id: string; status: "passed" };
  };
  researchBudget: ResearchBudgetView;
  limitations: string[];
  continuationConditions: NoQualifyingOpportunityContinuationCondition[];
  audit: {
    authoritativeRecordsPath: "records.jsonl";
    evidenceLedgerPath: "evidence-ledger.json";
    qualificationEvaluationId: string;
    researchDecisionId: string;
  };
  completeness: {
    allSurvivingOpportunitiesEvaluated: true;
    noEligibleOpportunities: true;
    researchExhausted: true;
  };
};

export type ConcludeNoQualifyingOpportunityCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "concludeNoQualifyingOpportunity";
  payload: {
    campaignPath: string;
    coordinatorId: string;
    concludedAt: string;
    reportId: string;
    continuationConditions: NoQualifyingOpportunityContinuationCondition[];
  };
};

export type EvidenceBackedComparison = {
  summary: string;
  evidenceEntryIds: string[];
  confidence: EvidenceConfidence;
};

export const requiredInputComparisonFields = [
  "validation",
  "initialDelivery",
  "acquisition",
  "operations",
  "time",
  "cash",
  "irreversibleDownside",
  "opportunityCost",
] as const;

export const potentialOutputComparisonFields = [
  "commercialHeadroom",
  "scale",
  "durability",
  "strategicLeverage",
] as const;

export const comparisonDimensions = [
  "validation",
  "initial-delivery",
  "acquisition",
  "operations",
  "time",
  "cash",
  "irreversible-downside",
  "opportunity-cost",
  "commercial-headroom",
  "scale",
  "durability",
  "strategic-leverage",
  "outcome-uncertainty",
  "input-output-asymmetry",
  "developer-profile-fit",
] as const;

export type ComparisonDimension = (typeof comparisonDimensions)[number];

export type OpportunityComparisonProfile = {
  opportunityId: string;
  requiredInput: Record<
    (typeof requiredInputComparisonFields)[number],
    EvidenceBackedComparison
  >;
  potentialOutput: Record<
    (typeof potentialOutputComparisonFields)[number],
    EvidenceBackedComparison
  >;
  outcomeUncertainty: EvidenceBackedComparison;
  inputOutputAsymmetry: EvidenceBackedComparison;
  riskToleranceFit: EvidenceBackedComparison & {
    fit: "within" | "material-disadvantage";
  };
  preferences: Array<{
    statementId: string;
    effect: "advantage" | "neutral" | "disadvantage";
    materiality: "minor" | "material";
    rationale: string;
    evidenceEntryIds: string[];
    confidence: EvidenceConfidence;
  }>;
  advantages: Array<{
    statementId: string;
    effect:
      | "reduces-input"
      | "increases-output"
      | "improves-access"
      | "reduces-risk"
      | "not-demonstrated";
    rationale: string;
    evidenceEntryIds: string[];
    confidence: EvidenceConfidence;
  }>;
};

export type DominanceAssessment = {
  challengerOpportunityId: string;
  alternativeOpportunityId: string;
  outcome: "dominates" | "does-not-dominate";
  criteria: {
    requiresNoMoreMaterialInput: boolean;
    offersNoLessCredibleOutput: boolean;
    fitsDeveloperProfileAtLeastAsWell: boolean;
    materiallyBetterOn: ComparisonDimension[];
  };
  rationale: string;
  evidenceEntryIds: string[];
  confidence: EvidenceConfidence;
};

export type LeadingAssessment = {
  opportunityId: string;
  advantagesOverAlternatives: Array<{
    alternativeOpportunityId: string;
    basis: "input-output-asymmetry" | "major-preference";
    preferenceStatementId?: string;
    rationale: string;
    evidenceEntryIds: string[];
    confidence: EvidenceConfidence;
  }>;
  noMaterialDisadvantage: EvidenceBackedComparison & { established: true };
  robustAcrossCredibleRanges: EvidenceBackedComparison & { established: true };
  unresolvedContenderOpportunityIds: string[];
  decisionChangingEvidenceGapIds: string[];
  decisionChangingContradictionIds: string[];
  adversarialChallenge: EvidenceBackedComparison & {
    reservationIds: string[];
    outcome: "leader-remains-eligible";
  };
};

export type OpportunityComparison = {
  id: string;
  profiles: OpportunityComparisonProfile[];
  dominanceAssessments: DominanceAssessment[];
  nonDominatedOpportunityIds: string[];
  leadingAssessment: LeadingAssessment;
  decision: ComparisonCampaignDecision;
};

export type ValueHypothesis = {
  status: "provisional-not-a-product-specification";
  customer: string;
  situation: string;
  smallestDesiredCustomerOutcome: string;
  supportedReason: string;
  confidence: EvidenceConfidence;
  supportingEvidenceEntryIds: string[];
  challengingEvidenceEntryIds: string[];
  assumptionIds: string[];
  evidenceGapIds: string[];
  disconfirmationConditions: string[];
};

export type LeadingOpportunityBriefInput = {
  id: string;
  buyerEconomics: EvidenceBackedComparison;
  customerAccess: EvidenceBackedComparison;
  alternatives: EvidenceBackedComparison;
  risks: EvidenceBackedComparison[];
  valueHypothesis: ValueHypothesis;
};

export type OpportunityBrief = {
  briefVersion: string;
  id: string;
  kind: "opportunity-brief";
  role:
    | "scout-recommended-leading-opportunity"
    | "developer-selected-opportunity";
  campaignId: string;
  concludedAt: string;
  intakeVersion: number;
  supersedes: string | null;
  selectionProvenance?: {
    kind: "developer-selection";
    reportId: string;
    rationale: string;
    classification: "developer-preference-not-market-evidence";
  };
  opportunity: OpportunityBriefOpportunity;
  commercialOutcomeTarget: CommercialOutcomeTarget;
  researchBudget: ResearchBudgetView;
  coverage: NoQualifyingOpportunityReport["coverage"];
  eligibility: Array<{
    kind: "market-safety" | "hard-constraint" | QualificationGateKind;
    state: "passed";
    decisionId: string;
    confidence: EvidenceConfidence;
    supportingEvidenceEntryIds: string[];
    challengingEvidenceEntryIds: string[];
    evidenceGapIds: string[];
    contradictionIds: string[];
    rationale: string;
  }>;
  buyerEconomics: EvidenceBackedComparison;
  customerAccess: EvidenceBackedComparison;
  alternatives: EvidenceBackedComparison;
  valueHypothesis: ValueHypothesis;
  requiredInput: OpportunityComparisonProfile["requiredInput"];
  potentialOutput: OpportunityComparisonProfile["potentialOutput"];
  outcomeUncertainty: EvidenceBackedComparison;
  inputOutputAsymmetry: EvidenceBackedComparison;
  profileFit: Pick<
    OpportunityComparisonProfile,
    "preferences" | "advantages" | "riskToleranceFit"
  >;
  commercialRanges: CommercialPlausibilityRanges;
  risks: EvidenceBackedComparison[];
  evidenceLimits: {
    limitations: string[];
    assumptionIds: string[];
    evidenceGapIds: string[];
    contradictionIds: string[];
    disconfirmingEvidenceEntryIds: string[];
  };
  comparisonContext: {
    comparisonId: string;
    eligibleOpportunityIds: string[];
    nonDominatedOpportunityIds: string[];
    dominanceAssessments: DominanceAssessment[];
    selectionRationale: string;
    decisionId: string;
    adversarialReservationIds: string[];
  };
  traceability: {
    authoritativeRecordsPath: "records.jsonl";
    evidenceLedgerPath: "evidence-ledger.json";
    rows: Array<{ conclusion: string; entryIds: string[] }>;
  };
  wayfinderHandoff: {
    optional: true;
    invoked: false;
    briefPath: string;
    instruction: string;
  };
};

type OpportunityBriefOpportunity = {
  id: string;
  customer: string;
  situation: string;
  costlyProblem: OpportunityFormationAssessment["costlyProblem"];
};

export type ConcludeLeadingOpportunityCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "concludeLeadingOpportunity";
  payload: {
    campaignPath: string;
    coordinatorId: string;
    concludedAt: string;
    comparison: OpportunityComparison;
    brief: LeadingOpportunityBriefInput;
  };
};

export type InconclusiveComparisonBlocker = {
  contenderOpportunityId: string;
  couldDisplaceOpportunityIds: string[];
  summary: string;
  evidenceGapIds: string[];
  contradictionIds: string[];
  evidenceEntryIds: string[];
};

export type InconclusiveOpportunityComparison = Pick<
  OpportunityComparison,
  "id" | "profiles" | "dominanceAssessments" | "nonDominatedOpportunityIds"
> & {
  decisiveTradeOffs: Array<
    EvidenceBackedComparison & { opportunityIds: string[] }
  >;
  apparentLeaderOpportunityId: string | null;
  blockers: InconclusiveComparisonBlocker[];
  decision: InconclusiveComparisonCampaignDecision;
};

export type InconclusiveComparisonReport = {
  reportVersion: string;
  id: string;
  kind: "inconclusive-comparison-report";
  campaignId: string;
  concludedAt: string;
  intakeVersion: number;
  supersedes: string | null;
  comparison: InconclusiveOpportunityComparison;
  availableActions: ["stop", "extend", "select"];
  audit: {
    authoritativeRecordsPath: "records.jsonl";
    evidenceLedgerPath: "evidence-ledger.json";
  };
};

export type ConcludeInconclusiveComparisonCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "concludeInconclusiveComparison";
  payload: {
    campaignPath: string;
    coordinatorId: string;
    concludedAt: string;
    reportId: string;
    comparison: InconclusiveOpportunityComparison;
  };
};

export type InconclusiveComparisonStopResponse = {
  kind: "stop";
  rationale: string;
};

export type InconclusiveComparisonExtendResponse = {
  kind: "extend";
  rationale: string;
  targetedEvidenceGapIds: string[];
  affectedOpportunityIds: string[];
  researchBudget: ResearchBudget;
};

export type DeveloperOpportunitySelection = {
  opportunityId: string;
  rationale: string;
  brief: LeadingOpportunityBriefInput;
};

export type InconclusiveComparisonSelectResponse = {
  kind: "select";
  selections: DeveloperOpportunitySelection[];
};

export type InconclusiveComparisonResponse =
  | InconclusiveComparisonStopResponse
  | InconclusiveComparisonExtendResponse
  | InconclusiveComparisonSelectResponse;

export type RespondInconclusiveComparisonCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "respondInconclusiveComparison";
  payload: {
    campaignPath: string;
    coordinatorId: string;
    respondedAt: string;
    reportId: string;
    response: InconclusiveComparisonResponse;
  };
};

export type InconclusiveComparisonResponseRecord = {
  reportId: string;
  respondedAt: string;
  response: InconclusiveComparisonResponse;
};

export type OpportunityFormationAssessment = {
  id: string;
  explorationThreadIds: string[];
  customer: string;
  situation: string;
  costlyProblem: {
    description: string;
    materialConsequence: MaterialConsequenceKind;
    observationIds: string[];
  };
  clusterBasis: {
    sharedCustomer: string;
    sharedWorkflow: string;
    sharedCostlyConsequence: string;
  };
  supportingObservationIds: string[];
  behavioralProblemSignalObservationIds: string[];
  independentSourceLineages: Array<{
    id: string;
    sourceIds: string[];
    rationale: string;
  }>;
  result:
    | { kind: "opportunity"; opportunityId: string }
    | { kind: "exploration-thread"; evidenceGaps: EvidenceGap[] };
  decision: FormationCampaignDecision;
};

export type OpportunityFormation = {
  allocation: {
    discoveryReservationIds: string[];
    shallowProblemMiningReservationIds: string[];
  };
  assessments: OpportunityFormationAssessment[];
};

export type RecordOpportunityFormationCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "recordOpportunityFormation";
  payload: {
    campaignPath: string;
    coordinatorId: string;
    recordedAt: string;
    allocation: OpportunityFormation["allocation"];
    assessments: OpportunityFormationAssessment[];
  };
};

export type DecisionValuePriority = {
  id: string;
  researchQuestion: string;
  target: {
    kind: "formation" | "gate" | "contradiction" | "comparison";
    id: string;
  };
  rationale: string;
};

export type QualificationDecisionValuePriority = Omit<
  DecisionValuePriority,
  "target"
> & {
  target: {
    kind: "gate";
    id: string;
  };
  permittedAction: {
    purpose: string;
    retrievalRoute: string;
    researchClass: "deepening";
    opportunityId: string;
  };
};

export type BreadthGate = {
  id: string;
  comparisonOpportunityIds: string[];
  diminishingReturns: Array<{
    trancheId: string;
    newOpportunityIds: string[];
    rationale: string;
  }>;
  decisionValuePriorities: DecisionValuePriority[];
  decision: FormationCampaignDecision;
};

export type PassBreadthGateCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "passBreadthGate";
  payload: {
    campaignPath: string;
    coordinatorId: string;
    recordedAt: string;
    gate: BreadthGate;
  };
};

export type ResearchApprovalRequest = {
  id: string;
  access: "restricted" | "paid" | "restricted-and-paid" | "elevated-risk";
  action: "read-source";
  opportunityId?: string;
  researchDepth?: "deep";
  purpose: string;
  source: {
    id: string;
    description: string;
    url: string;
  };
  accessMethod:
    | "developer-controlled-authenticated-read-only"
    | "developer-approved-paid-read-only"
    | "developer-controlled-authenticated-and-paid-read-only"
    | "public-read-only";
  data: {
    accessed: string[];
    retained: string[];
  };
  externalEffects: string[];
  maximumCost: { amount: number; currency: string };
  risks: string[];
  duration: { startsAt: string; expiresAt: string };
  alternatives: string[];
  lawfulActivity: true;
  externalValidationAction: false;
};

export type PendingResearchApprovalDecision = {
  id: string;
  type: "research-approval";
  requestedAt: string;
  request: ResearchApprovalRequest;
};

export type PendingInterruptedResearchDecision = {
  id: string;
  type: "interrupted-approved-research";
  requestedAt: string;
  question: string;
  reservations: Array<{
    reservationId: string;
    approvalId: string;
    access: "restricted" | "paid" | "restricted-and-paid";
    sourceId: string;
    purpose: string;
    maximumCost: { amount: number; currency: string };
  }>;
  options: [
    {
      kind: "record-completed-result";
      action: "recordApprovedResearchObservation";
    },
    {
      kind: "resolve-without-result";
      action: "respondInterruptedResearch";
    },
  ];
};

export type PendingDecision =
  | PendingResearchApprovalDecision
  | PendingInterruptedResearchDecision;

export type InterruptedResearchResponse = {
  decisionId: string;
  respondedAt: string;
  response: {
    kind: "resolve-without-result";
    reservations: Array<{
      reservationId: string;
      externalWorkCompleted: boolean;
      charge: ResearchChargeResolution;
    }>;
    explicitlyConfirmed: true;
    rationale: string;
  };
};

export type RespondInterruptedResearchCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "respondInterruptedResearch";
  payload: {
    campaignPath: string;
    coordinatorId: string;
    respondedAt: string;
    decisionId: string;
    response: InterruptedResearchResponse["response"];
  };
};

export type RequestResearchApprovalCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "requestResearchApproval";
  payload: {
    campaignPath: string;
    coordinatorId: string;
    requestedAt: string;
    request: ResearchApprovalRequest;
  };
};

export type ResearchApprovalInformation = {
  id: string;
  question: string;
  explanation: string;
};

export type RecordedResearchApprovalInformation = ResearchApprovalInformation & {
  decisionId: string;
  recordedAt: string;
};

export type RecordResearchApprovalInformationCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "recordResearchApprovalInformation";
  payload: {
    campaignPath: string;
    coordinatorId: string;
    recordedAt: string;
    decisionId: string;
    information: ResearchApprovalInformation;
  };
};

export type ResearchApproval = {
  id: string;
  decisionId: string;
  approvedAt: string;
  scope: ResearchApprovalRequest;
};

export type RecordedResearchApprovalResponse = {
  decisionId: string;
  respondedAt: string;
  response: ResearchApprovalResponse;
};

export type ApproveResearchResponse = {
  kind: "approve";
  approval: {
    id: string;
    explicitlyApproved: true;
    scope: ResearchApprovalRequest;
  };
};

export type RefuseResearchResponse = {
  kind: "refuse";
  refusal: {
    id: string;
    explicitlyRefused: true;
    rationale: string;
    evidenceGap: EvidenceGap;
  };
};

export type ResearchApprovalResponse =
  | ApproveResearchResponse
  | RefuseResearchResponse;

export type RespondResearchApprovalCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "respondResearchApproval";
  payload: {
    campaignPath: string;
    coordinatorId: string;
    respondedAt: string;
    decisionId: string;
    response: ResearchApprovalResponse;
  };
};

export type ResearchExpenditure = {
  id: string;
  approvalId: string;
  approvalDecisionId: string;
  sourceId: string;
  purpose: string;
  amount: number;
  currency: string;
  incurredAt: string;
};

export type RecordResearchExpenditureCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "recordResearchExpenditure";
  payload: {
    campaignPath: string;
    coordinatorId: string;
    incurredAt: string;
    expenditure: Omit<
      ResearchExpenditure,
      "approvalDecisionId" | "incurredAt"
    >;
  };
};

export type ResearchBudgetView = {
  sourceCap: number;
  adversarialSourceReserve: number;
  ordinarySourceCap: number;
  reservedSourceUnits: number;
  settledSourceUnits: number;
  remainingOrdinarySourceUnits: number;
  remainingAdversarialSourceUnits: number;
  paidSpendCap?: { amount: number; currency: string };
  recordedPaidSpend?: { amount: number; currency: string };
  reservedPaidSpend?: { amount: number; currency: string };
  remainingPaidSpend?: { amount: number; currency: string };
};

export type EvidenceLedger = {
  campaignId: string;
  sources: Source[];
  observations: Observation[];
  sourceLineages: SourceLineage[];
  sourceCredibilities: SourceCredibility[];
  sourceFreshnesses: SourceFreshness[];
  evidenceGaps: EvidenceGap[];
  assumptions: Assumption[];
  inferences: Inference[];
  contradictions: Contradiction[];
  corrections: Correction[];
  campaignDecisions: CampaignDecision[];
};

export type CampaignLocator = {
  campaignPath?: string;
  searchPath?: string;
};

export type WorkView = {
  campaignId: string;
  recordSequence: number;
  phase:
    | "campaign-created"
    | "campaign-intake-confirmed"
    | "public-research-active"
    | "discovery-active"
    | "opportunity-formation"
    | "opportunity-deepening"
    | "inconclusive-comparison"
    | "terminal";
  pause:
    | null
    | {
        reason: "pending-decision";
        pendingDecisionId: string;
        decisionType: "research-approval" | "interrupted-approved-research";
        requestedAction: string;
        resumable: true;
      };
  completedWork: string[];
  nextPermittedActions: string[];
  publicResearchAvailable: boolean;
  reasoning?: {
    evidenceLedgerPath: "evidence-ledger.json";
    evidenceInspectionCommand: "inspectEvidence";
    sourceLineageIds: string[];
    sourceCredibilityIds: string[];
    sourceFreshnessIds: string[];
    activeAssumptionIds: string[];
    activeInferenceIds: string[];
    reassessmentInferenceIds: string[];
    openEvidenceGapIds: string[];
    unresolvedContradictionIds: string[];
    correctionIds: string[];
    campaignDecisionIds?: string[];
  };
  discovery?: {
    coverage: {
      discoveryTranches: number;
      discoverySweeps: number;
      discoverySweepCap: number;
      sourceFamilies: string[];
      sourceFamilyMinimum: number;
    };
    allowances: {
      threadSlots: number;
      noveltyProbeSlots: number;
      noveltyProbeShare: number;
      shallowResearchSourceUnitsPerRetainedThread: number;
    };
    familiarDomain: {
      familiarThreads: number;
      totalInitialThreads: number;
      maximumWithoutException: number;
      exception: FamiliarDomainException | null;
    };
    retainedThreads: Array<{
      id: string;
      customerGroup: string;
      situation: string;
      problemFamily: string;
      origin: "source-led" | "novelty-probe";
      shallowResearchSourceUnits: number;
      evidenceCredit: "source-led" | "none";
      comparisonBonus: "none";
      evidenceGapIds?: string[];
    }>;
    droppedThreads: Array<{
      id: string;
      customerGroup: string;
      situation: string;
      problemFamily: string;
      origin: "source-led" | "novelty-probe";
      familiarDomain: boolean;
      rationale: string;
    }>;
  };
  opportunities?: Array<{
    id: string;
    assessmentId: string;
    explorationThreadIds: string[];
    customer: string;
    situation: string;
    costlyProblem: OpportunityFormationAssessment["costlyProblem"];
    supportingObservationIds: string[];
    behavioralProblemSignalObservationIds: string[];
    independentSourceLineages: string[][];
    decisionId: string;
    marketSafety?: {
      classification:
        | "ordinary"
        | "elevated-risk"
        | "excluded-market"
        | "unresolved";
      intendedActivity: string;
      excludedCategory: string | null;
      directlyServesExcludedActivity: boolean | null;
    };
    exclusionGates?: Array<{
      id: string;
      kind: "market-safety" | "hard-constraint";
      hardConstraintId?: string;
      state: ExclusionGate["state"];
      applicableRule: string;
      decisionId: string;
    }>;
    qualificationGates?: Array<{
      id: string;
      kind: QualificationGateKind;
      state: QualificationGate["state"];
      applicableRule: string;
      decisionId: string;
    }>;
    disposition?: {
      status: "active" | "rejected" | "unresolved";
      decisionIds: string[];
    };
    eligibility?: "ineligible" | "pending-qualification" | "eligible";
    terminalRole?:
      | null
      | "leading-opportunity"
      | "developer-selected-opportunity";
  }>;
  researchAllocation?:
    | {
        phase: "pre-breadth-gate";
        discoveryShare: 0.5;
        shallowProblemMiningShare: 0.5;
        adversarialSourceUnitsReserved: number;
      }
    | {
        phase: "post-breadth-gate";
        deepeningShare: 0.8;
        openWorldDiscoveryShare: 0.2;
        adversarialSourceUnitsReserved: number;
        deepeningSourceUnits?: number;
        openWorldDiscoverySourceUnits?: number;
      };
  breadthGate?: {
    id: string;
    status: "passed";
    sourceFamilyCount: number;
    sourceFamilyMinimum: number;
    comparisonOpportunityIds: string[];
    diminishingReturnTrancheIds: string[];
    remainingOrdinarySourceUnits: number;
    decisionValuePriorities: DecisionValuePriority[];
    decisionId: string;
  };
  qualificationResearch?: {
    state: QualificationCampaignDecision["outcome"];
    decisionValuePriorities: QualificationDecisionValuePriority[];
    stopReason: QualificationCampaignDecision["stopReason"];
    decisionId: string;
  };
  terminal?:
    | {
        outcome: "no-qualifying-opportunity";
        reportId: string;
        artifactPath: string;
        immutable: true;
        concludedAt: string;
      }
    | {
        outcome: "leading-opportunity";
        briefId: string;
        opportunityId: string;
        artifactPath: string;
        immutable: true;
        concludedAt: string;
      }
    | {
        outcome: "inconclusive-comparison";
        reportId: string;
        artifactPath: string;
        action: "stopped";
        immutable: true;
        concludedAt: string;
      }
    | {
        outcome: "developer-selected-opportunities";
        reportId: string;
        briefIds: string[];
        artifactPaths: string[];
        immutable: true;
        concludedAt: string;
      };
  inconclusiveComparison?: {
    reportId: string;
    artifactPath: string;
    immutable: true;
    concludedAt: string;
    availableActions: ["stop", "extend", "select"];
  };
  researchExtension?: {
    reportId: string;
    intakeVersion: number;
    targetedEvidenceGapIds: string[];
    affectedOpportunityIds: string[];
  };
  reevaluation?: {
    id: string;
    kind: CampaignReevaluationKind;
    intakeVersion: number;
    affectedOpportunityIds: string[];
    invalidatedDecisionIds: string[];
    supersededArtifactIds: string[];
  };
  evidenceRefresh?: {
    freshnessIds: string[];
    observationIds: string[];
    affectedDecisionIds: string[];
  };
};

export type CoordinatorLease = {
  coordinatorId: string;
  acquiredAt: string;
  expiresAt: string;
};

export const authoritativeOperations = [
  "create-campaign",
  "resume-campaign",
  "confirm-campaign-intake",
  "reserve-public-research",
  "reserve-approved-research",
  "record-public-research-observation",
  "record-approved-research-observation",
  "record-evidence-reasoning",
  "record-discovery-tranche",
  "record-opportunity-formation",
  "pass-breadth-gate",
  "record-opportunity-exclusion-gates",
  "record-opportunity-qualification-gates",
  "conclude-no-qualifying-opportunity",
  "conclude-leading-opportunity",
  "conclude-inconclusive-comparison",
  "respond-inconclusive-comparison",
  "reevaluate-campaign",
  "request-research-approval",
  "record-research-approval-information",
  "respond-research-approval",
  "respond-interrupted-research",
  "record-research-expenditure",
] as const;

export type AuthoritativeOperation =
  (typeof authoritativeOperations)[number];

export type CampaignOperation = {
  campaignId: string;
  requestId: string;
  recordedAt: string;
  firstSequence: number;
  operation: "create-campaign" | "resume-campaign";
  coordinatorId: string;
  leaseExpiresAt: string;
  commandDigest?: string;
};
