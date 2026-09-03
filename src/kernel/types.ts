
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
  version: 1;
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

export type PublicResearchReservation = {
  id: string;
  sourceUnits: 1;
  purpose: string;
  retrievalRoute: string;
  researchClass?: "deepening" | "open-world-discovery";
  opportunityId?: string;
  approvalId?: string;
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

export type PublicSource = {
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

export type PublicObservation = {
  id: string;
  text: string;
  sourceId: string;
  exactLocator: string;
};

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
  action: "supersede" | "retract";
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
  kind: "exclusion-gate";
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

export type CampaignDecision = FormationCampaignDecision | OpportunityGateDecision;

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
    assessments: OpportunityExclusionAssessment[];
  };
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
  paidSpendCap?: { amount: number; currency: string };
  recordedPaidSpend?: { amount: number; currency: string };
  remainingPaidSpend?: { amount: number; currency: string };
};

export type EvidenceLedger = {
  campaignId: string;
  sources: PublicSource[];
  observations: PublicObservation[];
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
    | "opportunity-deepening";
  pause:
    | null
    | {
        reason: "pending-decision";
        pendingDecisionId: string;
        decisionType: "research-approval";
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
    disposition?: {
      status: "active" | "rejected" | "unresolved";
      decisionIds: string[];
    };
    eligibility?: "ineligible" | "pending-qualification";
    terminalRole?: null;
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
};

export type CoordinatorLease = {
  coordinatorId: string;
  acquiredAt: string;
  expiresAt: string;
};

export type AuthoritativeOperation =
  | "create-campaign"
  | "resume-campaign"
  | "confirm-campaign-intake"
  | "reserve-public-research"
  | "record-public-research-observation"
  | "record-evidence-reasoning"
  | "record-discovery-tranche"
  | "record-opportunity-formation"
  | "pass-breadth-gate"
  | "record-opportunity-exclusion-gates"
  | "request-research-approval"
  | "record-research-approval-information"
  | "respond-research-approval"
  | "record-research-expenditure";

export type CampaignOperation = {
  campaignId: string;
  requestId: string;
  recordedAt: string;
  firstSequence: number;
  operation: "create-campaign" | "resume-campaign";
  coordinatorId: string;
  leaseExpiresAt: string;
};
