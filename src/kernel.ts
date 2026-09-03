import {
  appendFile,
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { realpathSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import contracts from "../release/contracts.json" with { type: "json" };

const supportedNodeMajor = 24;

type RetrievalRoute = {
  id: string;
  available: boolean;
  public: boolean;
  lawful: boolean;
};

type PreflightCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "preflight";
  payload: {
    storagePath: string;
    retrievalRoutes: RetrievalRoute[];
  };
};

type CreateCampaignCommand = {
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

type InspectCampaignCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "inspectCampaign";
  payload: {
    campaignPath?: string;
    searchPath?: string;
  };
};

type InspectEvidenceCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "inspectEvidence";
  payload: {
    campaignPath?: string;
    searchPath?: string;
    entryIds: string[];
  };
};

type ResumeCampaignCommand = {
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

type IntakeValue =
  | { state: "known"; value: string }
  | { state: "unknown" }
  | { state: "none" }
  | { state: "not-applicable"; rationale: string };

type DeveloperProfileSnapshot = {
  capturedAt: string;
  capacity: IntakeValue;
  capabilities: IntakeValue;
  access: IntakeValue;
  boundaries: IntakeValue;
  operatingPreferences: IntakeValue;
  riskTolerance: IntakeValue;
};

type CommercialOutcomeTarget = {
  amount: number;
  currency: string;
  metric: string;
  deadline: string;
};

type IntakeStatement =
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

type ResearchBudget = {
  profile: "quick" | "standard" | "deep" | "custom";
  sourceCap: number;
  discoverySweepCap: number;
  sourceFamilyMinimum: number;
  deepenedOpportunityCap: number;
  minimumComparisonSet: number;
  adversarialSourceReserve: number;
  paidSpendCap: { amount: number; currency: string };
};

type CampaignIntake = {
  version: 1;
  explicitlyConfirmed: true;
  developerProfileSnapshot: DeveloperProfileSnapshot;
  commercialOutcomeTarget: CommercialOutcomeTarget;
  statements: IntakeStatement[];
  researchBudget: ResearchBudget;
};

type ConfirmedCampaignIntake = CampaignIntake & {
  campaignId: string;
  confirmedAt: string;
};

type ConfirmCampaignIntakeCommand = {
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

type PublicResearchReservation = {
  id: string;
  sourceUnits: 1;
  purpose: string;
  retrievalRoute: string;
  researchClass?: "deepening" | "open-world-discovery";
  opportunityId?: string;
  approvalId?: string;
};

type ReservePublicResearchCommand = {
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

type PublicSource = {
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

type PublicObservation = {
  id: string;
  text: string;
  sourceId: string;
  exactLocator: string;
};

type EvidenceConfidenceLevel = "unknown" | "low" | "medium" | "high";

type EvidenceConfidence = {
  level: EvidenceConfidenceLevel;
  limitingFactors: string[];
};

type SourceLineage = {
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

type SourceCredibilityAssessment = "unknown" | "low" | "medium" | "high";

type SourceFreshnessAssessment = "unknown" | "low" | "medium" | "high";

type SourceCredibility = {
  type: "source-credibility";
  id: string;
  sourceId: string;
  observationId: string;
  intendedUse: string;
  assessment: SourceCredibilityAssessment;
  rationale: string;
  limitations: string[];
};

type SourceFreshness = {
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

type EvidenceGap = {
  type: "evidence-gap";
  id: string;
  question: string;
  affectedDecisionIds: string[];
  resolutionCriteria: string;
  resolutionMethod: string;
  status: "open" | "resolved";
  resolution: string | null;
};

type Assumption = {
  type: "assumption";
  id: string;
  text: string;
  scope: string;
  evidenceGapId: string;
};

type Inference = {
  type: "inference";
  id: string;
  text: string;
  scope: string;
  reasoning: string;
  supportingEntryIds: string[];
  challengingEntryIds: string[];
  confidence: EvidenceConfidence;
};

type Contradiction = {
  type: "contradiction";
  id: string;
  entryIds: string[];
  disputedProposition: string;
  disputedScope: string;
  attemptedReconciliation: string;
  resolutionStatus: "unresolved" | "partially-resolved" | "resolved";
  resolution: string | null;
};

type Correction = {
  type: "correction";
  id: string;
  targetEntryId: string;
  action: "supersede" | "retract";
  replacementEntryId: string | null;
  rationale: string;
};

type ReasoningEntry =
  | SourceLineage
  | SourceCredibility
  | SourceFreshness
  | EvidenceGap
  | Assumption
  | Inference
  | Contradiction
  | Correction;

type RecordPublicResearchObservationCommand = {
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

type RecordEvidenceReasoningCommand = {
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

type DiscoverySampling = {
  frameOrigin: "external-map";
  method: "systematic" | "stratified" | "seeded-random" | "bounded-enumeration";
  frame: string;
  selectionRule: string;
  sampleSize: number;
  randomSeed: string | null;
};

type DiscoverySweep = {
  id: string;
  sourceFamily: {
    id: string;
    name: string;
    economicActivityMap: string;
  };
  sourceIds: string[];
  sampling: DiscoverySampling;
};

type MaterialConsequenceKind =
  | "lost-money"
  | "wasted-skilled-time"
  | "blocked-revenue"
  | "operational-risk"
  | "compliance-exposure"
  | "workaround-expenditure";

type ProblemSignal = {
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

type ExplorationThreadBase = {
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

type SourceLedExplorationThread = ExplorationThreadBase & {
  origin: {
    kind: "source-led";
    sweepId: string;
    observationIds: string[];
  };
  problemSignal: ProblemSignal;
};

type NoveltyProbeExplorationThread = ExplorationThreadBase & {
  origin: {
    kind: "novelty-probe";
    method: "cross-domain-transfer" | "change-combination" | "inversion" | "recombination";
    derivation: string;
    assumption: Assumption;
    evidenceGap: EvidenceGap;
  };
};

type ExplorationThread =
  | SourceLedExplorationThread
  | NoveltyProbeExplorationThread;

type FamiliarDomainException = {
  intakeStatementId: string;
  rationale: string;
};

type DiscoveryTranche = {
  id: string;
  ordinal: number;
  threadSlots: number;
  noveltyProbeSlots: number;
  shallowResearchSourceUnitsPerRetainedThread: number;
  familiarDomainException: FamiliarDomainException | null;
  sweeps: DiscoverySweep[];
  threads: ExplorationThread[];
};

type RecordDiscoveryTrancheCommand = {
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

type FormationCampaignDecision = {
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

type OpportunityGateDecision = {
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

type CampaignDecision = FormationCampaignDecision | OpportunityGateDecision;

type ExclusionGate = {
  id: string;
  state: "passed" | "failed" | "unresolved";
  decision: OpportunityGateDecision;
};

type OpportunityExclusionAssessment = {
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

type OpportunityExclusionEvaluation = {
  assessments: OpportunityExclusionAssessment[];
};

type RecordOpportunityExclusionGatesCommand = {
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

type OpportunityFormationAssessment = {
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

type OpportunityFormation = {
  allocation: {
    discoveryReservationIds: string[];
    shallowProblemMiningReservationIds: string[];
  };
  assessments: OpportunityFormationAssessment[];
};

type RecordOpportunityFormationCommand = {
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

type DecisionValuePriority = {
  id: string;
  researchQuestion: string;
  target: {
    kind: "formation" | "gate" | "contradiction" | "comparison";
    id: string;
  };
  rationale: string;
};

type BreadthGate = {
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

type PassBreadthGateCommand = {
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

type ResearchApprovalRequest = {
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

type PendingResearchApprovalDecision = {
  id: string;
  type: "research-approval";
  requestedAt: string;
  request: ResearchApprovalRequest;
};

type RequestResearchApprovalCommand = {
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

type ResearchApprovalInformation = {
  id: string;
  question: string;
  explanation: string;
};

type RecordedResearchApprovalInformation = ResearchApprovalInformation & {
  decisionId: string;
  recordedAt: string;
};

type RecordResearchApprovalInformationCommand = {
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

type ResearchApproval = {
  id: string;
  decisionId: string;
  approvedAt: string;
  scope: ResearchApprovalRequest;
};

type RecordedResearchApprovalResponse = {
  decisionId: string;
  respondedAt: string;
  response: ResearchApprovalResponse;
};

type ApproveResearchResponse = {
  kind: "approve";
  approval: {
    id: string;
    explicitlyApproved: true;
    scope: ResearchApprovalRequest;
  };
};

type RefuseResearchResponse = {
  kind: "refuse";
  refusal: {
    id: string;
    explicitlyRefused: true;
    rationale: string;
    evidenceGap: EvidenceGap;
  };
};

type ResearchApprovalResponse =
  | ApproveResearchResponse
  | RefuseResearchResponse;

type RespondResearchApprovalCommand = {
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

type ResearchExpenditure = {
  id: string;
  approvalId: string;
  approvalDecisionId: string;
  sourceId: string;
  purpose: string;
  amount: number;
  currency: string;
  incurredAt: string;
};

type RecordResearchExpenditureCommand = {
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

type ResearchBudgetView = {
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

type EvidenceLedger = {
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

type CampaignLocator = {
  campaignPath?: string;
  searchPath?: string;
};

type WorkView = {
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

type CoordinatorLease = {
  coordinatorId: string;
  acquiredAt: string;
  expiresAt: string;
};

type AuthoritativeOperation =
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

type CampaignOperation = {
  campaignId: string;
  requestId: string;
  recordedAt: string;
  firstSequence: number;
  operation: "create-campaign" | "resume-campaign";
  coordinatorId: string;
  leaseExpiresAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validatePreflightFields(command: unknown): string[] {
  const details: string[] = [];
  if (!isRecord(command)) {
    return ["command must be a JSON object."];
  }
  if (typeof command.requestId !== "string" || command.requestId.trim() === "") {
    details.push("requestId must be a non-empty string.");
  }
  if (!isRecord(command.payload)) {
    details.push("payload must be an object.");
    return details;
  }
  if (
    typeof command.payload.storagePath !== "string" ||
    command.payload.storagePath.trim() === ""
  ) {
    details.push("payload.storagePath must be a non-empty string.");
  }
  if (!Array.isArray(command.payload.retrievalRoutes)) {
    details.push("payload.retrievalRoutes must be an array.");
    return details;
  }
  for (const [index, route] of command.payload.retrievalRoutes.entries()) {
    if (!isRecord(route)) {
      details.push(`payload.retrievalRoutes[${index}] must be an object.`);
      continue;
    }
    if (typeof route.id !== "string" || route.id.trim() === "") {
      details.push(`payload.retrievalRoutes[${index}].id must be a non-empty string.`);
    }
    for (const field of ["available", "public", "lawful"] as const) {
      if (typeof route[field] !== "boolean") {
        details.push(
          `payload.retrievalRoutes[${index}].${field} must be a boolean.`,
        );
      }
    }
  }
  return details;
}

function isIsoInstant(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function validateCreateCampaignFields(command: Record<string, unknown>): string[] {
  const details: string[] = [];
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  for (const field of ["campaignPath", "campaignId", "coordinatorId"] as const) {
    if (
      typeof command.payload[field] !== "string" ||
      command.payload[field].trim() === ""
    ) {
      details.push(`payload.${field} must be a non-empty string.`);
    }
  }
  if (
    typeof command.payload.campaignPath === "string" &&
    !path.isAbsolute(command.payload.campaignPath)
  ) {
    details.push("payload.campaignPath must be an absolute path.");
  }
  for (const field of ["createdAt", "leaseExpiresAt"] as const) {
    if (!isIsoInstant(command.payload[field])) {
      details.push(`payload.${field} must be an ISO 8601 UTC instant.`);
    }
  }
  if (
    isIsoInstant(command.payload.createdAt) &&
    isIsoInstant(command.payload.leaseExpiresAt) &&
    command.payload.leaseExpiresAt <= command.payload.createdAt
  ) {
    details.push("payload.leaseExpiresAt must be later than payload.createdAt.");
  }
  return details;
}

function validateInspectCampaignFields(command: Record<string, unknown>): string[] {
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  const payload = command.payload;
  const locators = (["campaignPath", "searchPath"] as const).filter(
    (field) => payload[field] !== undefined,
  );
  if (locators.length !== 1) {
    return ["payload must contain exactly one of campaignPath or searchPath."];
  }
  const locator = locators[0]!;
  const value = payload[locator];
  if (typeof value !== "string" || value.trim() === "") {
    return [`payload.${locator} must be a non-empty string.`];
  }
  if (!path.isAbsolute(value)) {
    return [`payload.${locator} must be an absolute path.`];
  }
  return [];
}

function validateResumeCampaignFields(command: Record<string, unknown>): string[] {
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  const details = validateInspectCampaignFields({ payload: command.payload });
  if (
    typeof command.payload.coordinatorId !== "string" ||
    command.payload.coordinatorId.trim() === ""
  ) {
    details.push("payload.coordinatorId must be a non-empty string.");
  }
  for (const field of ["resumedAt", "leaseExpiresAt"] as const) {
    if (!isIsoInstant(command.payload[field])) {
      details.push(`payload.${field} must be an ISO 8601 UTC instant.`);
    }
  }
  if (
    isIsoInstant(command.payload.resumedAt) &&
    isIsoInstant(command.payload.leaseExpiresAt) &&
    command.payload.leaseExpiresAt <= command.payload.resumedAt
  ) {
    details.push("payload.leaseExpiresAt must be later than payload.resumedAt.");
  }
  return details;
}

function validateInspectEvidenceFields(command: Record<string, unknown>): string[] {
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  const details = validateInspectCampaignFields({ payload: command.payload });
  const locator = command.payload.campaignPath === undefined
    ? "searchPath"
    : "campaignPath";
  if (!hasOnlyFields(command.payload, [locator, "entryIds"])) {
    details.push(
      "payload must contain one Campaign locator and only the requested Evidence Ledger entry identities.",
    );
  }
  details.push(
    ...validateEntryIdList(command.payload.entryIds, "payload.entryIds", false),
  );
  return details;
}

function hasOnlyFields(value: Record<string, unknown>, fields: string[]): boolean {
  return (
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field))
  );
}

function validateIntakeValue(value: unknown, field: string): string[] {
  if (!isRecord(value) || typeof value.state !== "string") {
    return [`${field} must be an intake value with an explicit state.`];
  }
  if (value.state === "known") {
    return hasOnlyFields(value, ["state", "value"]) &&
      typeof value.value === "string" &&
      value.value.trim() !== ""
      ? []
      : [`${field} known value must be a non-empty string.`];
  }
  if (value.state === "not-applicable") {
    return hasOnlyFields(value, ["state", "rationale"]) &&
      typeof value.rationale === "string" &&
      value.rationale.trim() !== ""
      ? []
      : [`${field} not-applicable value must include a rationale.`];
  }
  if (value.state === "unknown" || value.state === "none") {
    return hasOnlyFields(value, ["state"])
      ? []
      : [`${field} ${value.state} value must not contain another value.`];
  }
  return [`${field}.state must be known, unknown, none, or not-applicable.`];
}

const namedResearchBudgets = {
  quick: {
    sourceCap: 30,
    discoverySweepCap: 4,
    sourceFamilyMinimum: 3,
    deepenedOpportunityCap: 2,
    minimumComparisonSet: 2,
    adversarialSourceReserve: 6,
  },
  standard: {
    sourceCap: 100,
    discoverySweepCap: 8,
    sourceFamilyMinimum: 5,
    deepenedOpportunityCap: 4,
    minimumComparisonSet: 3,
    adversarialSourceReserve: 20,
  },
  deep: {
    sourceCap: 250,
    discoverySweepCap: 14,
    sourceFamilyMinimum: 7,
    deepenedOpportunityCap: 6,
    minimumComparisonSet: 4,
    adversarialSourceReserve: 50,
  },
} as const;

const researchBudgetLimitFields = [
  "sourceCap",
  "discoverySweepCap",
  "sourceFamilyMinimum",
  "deepenedOpportunityCap",
  "minimumComparisonSet",
  "adversarialSourceReserve",
] as const;

function validateResearchBudget(
  value: unknown,
  targetCurrency: unknown,
): string[] {
  const field = "payload.intake.researchBudget";
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, ["profile", ...researchBudgetLimitFields, "paidSpendCap"])
  ) {
    return [`${field} must contain the complete expanded Research Budget.`];
  }
  const details: string[] = [];
  if (!(["quick", "standard", "deep", "custom"] as unknown[]).includes(value.profile)) {
    details.push(`${field}.profile must be quick, standard, deep, or custom.`);
  }
  for (const limit of researchBudgetLimitFields) {
    if (!Number.isSafeInteger(value[limit]) || (value[limit] as number) <= 0) {
      details.push(`${field}.${limit} must be a positive safe integer.`);
    }
  }
  if (
    Number.isSafeInteger(value.sourceCap) &&
    Number.isSafeInteger(value.adversarialSourceReserve) &&
    value.adversarialSourceReserve !== Math.ceil((value.sourceCap as number) * 0.2)
  ) {
    details.push(`${field}.adversarialSourceReserve must reserve twenty percent of sourceCap.`);
  }
  if (
    Number.isSafeInteger(value.minimumComparisonSet) &&
    Number.isSafeInteger(value.deepenedOpportunityCap) &&
    (value.minimumComparisonSet as number) > (value.deepenedOpportunityCap as number)
  ) {
    details.push(`${field}.minimumComparisonSet cannot exceed deepenedOpportunityCap.`);
  }
  if (
    Number.isSafeInteger(value.sourceCap) &&
    Number.isSafeInteger(value.adversarialSourceReserve) &&
    (value.adversarialSourceReserve as number) >= (value.sourceCap as number)
  ) {
    details.push(`${field}.adversarialSourceReserve must be less than sourceCap.`);
  }
  for (const boundedLimit of [
    "discoverySweepCap",
    "sourceFamilyMinimum",
    "deepenedOpportunityCap",
  ] as const) {
    if (
      Number.isSafeInteger(value.sourceCap) &&
      Number.isSafeInteger(value[boundedLimit]) &&
      (value[boundedLimit] as number) > (value.sourceCap as number)
    ) {
      details.push(`${field}.${boundedLimit} cannot exceed sourceCap.`);
    }
  }
  if (
    Number.isSafeInteger(value.minimumComparisonSet) &&
    (value.minimumComparisonSet as number) < 2
  ) {
    details.push(`${field}.minimumComparisonSet must contain at least two Opportunities.`);
  }
  if (
    value.profile === "quick" ||
    value.profile === "standard" ||
    value.profile === "deep"
  ) {
    const expected = namedResearchBudgets[value.profile];
    for (const limit of researchBudgetLimitFields) {
      if (value[limit] !== expected[limit]) {
        details.push(
          `${field}.${limit} must be ${expected[limit]} for the ${value.profile} profile.`,
        );
      }
    }
  }
  if (
    !isRecord(value.paidSpendCap) ||
    !hasOnlyFields(value.paidSpendCap, ["amount", "currency"]) ||
    typeof value.paidSpendCap.amount !== "number" ||
    !Number.isFinite(value.paidSpendCap.amount) ||
    value.paidSpendCap.amount < 0 ||
    value.paidSpendCap.currency !== targetCurrency
  ) {
    details.push(
      `${field}.paidSpendCap must have a non-negative finite amount in the target currency.`,
    );
  }
  return details;
}

function validateCampaignIntake(value: unknown, confirmedAt: unknown): string[] {
  const field = "payload.intake";
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, [
      "version",
      "explicitlyConfirmed",
      "developerProfileSnapshot",
      "commercialOutcomeTarget",
      "statements",
      "researchBudget",
    ])
  ) {
    return [`${field} must contain the complete Campaign Intake review.`];
  }
  const details: string[] = [];
  if (value.version !== 1) {
    details.push(`${field}.version must be 1 for the first confirmed intake.`);
  }
  if (value.explicitlyConfirmed !== true) {
    details.push(`${field}.explicitlyConfirmed must be true.`);
  }

  const snapshot = value.developerProfileSnapshot;
  const snapshotFields = [
    "capturedAt",
    "capacity",
    "capabilities",
    "access",
    "boundaries",
    "operatingPreferences",
    "riskTolerance",
  ];
  if (!isRecord(snapshot) || !hasOnlyFields(snapshot, snapshotFields)) {
    details.push(`${field}.developerProfileSnapshot must contain every profile area.`);
  } else {
    if (!isIsoInstant(snapshot.capturedAt)) {
      details.push(`${field}.developerProfileSnapshot.capturedAt must be an ISO 8601 UTC instant.`);
    } else if (isIsoInstant(confirmedAt) && snapshot.capturedAt > confirmedAt) {
      details.push(`${field}.developerProfileSnapshot.capturedAt cannot be after confirmation.`);
    }
    for (const profileField of snapshotFields.slice(1)) {
      details.push(
        ...validateIntakeValue(
          snapshot[profileField],
          `${field}.developerProfileSnapshot.${profileField}`,
        ),
      );
    }
    for (const unsafeField of ["boundaries", "riskTolerance"] as const) {
      const unsafeValue = snapshot[unsafeField];
      if (
        isRecord(unsafeValue) &&
        (unsafeValue.state === "unknown" || unsafeValue.state === "not-applicable")
      ) {
        details.push(
          `${field}.developerProfileSnapshot.${unsafeField} must be resolved before Public Research.`,
        );
      }
    }
  }

  const target = value.commercialOutcomeTarget;
  if (
    !isRecord(target) ||
    !hasOnlyFields(target, ["amount", "currency", "metric", "deadline"])
  ) {
    details.push(`${field}.commercialOutcomeTarget must be complete.`);
  } else {
    if (
      typeof target.amount !== "number" ||
      !Number.isFinite(target.amount) ||
      target.amount <= 0
    ) {
      details.push(`${field}.commercialOutcomeTarget.amount must be a positive finite number.`);
    }
    if (typeof target.currency !== "string" || !/^[A-Z]{3}$/.test(target.currency)) {
      details.push(`${field}.commercialOutcomeTarget.currency must be a three-letter uppercase currency code.`);
    }
    if (typeof target.metric !== "string" || target.metric.trim() === "") {
      details.push(`${field}.commercialOutcomeTarget.metric must be a non-empty string.`);
    }
    if (!isIsoDate(target.deadline)) {
      details.push(`${field}.commercialOutcomeTarget.deadline must be an ISO 8601 date.`);
    } else if (
      isIsoInstant(confirmedAt) &&
      target.deadline <= (confirmedAt as string).slice(0, 10)
    ) {
      details.push(`${field}.commercialOutcomeTarget.deadline must be after confirmation.`);
    }
  }

  if (!Array.isArray(value.statements)) {
    details.push(`${field}.statements must be an array.`);
  } else {
    const ids = new Set<string>();
    const texts = new Set<string>();
    for (const [index, statement] of value.statements.entries()) {
      const statementField = `${field}.statements[${index}]`;
      if (!isRecord(statement)) {
        details.push(`${statementField} must be an object.`);
        continue;
      }
      if (typeof statement.id !== "string" || statement.id.trim() === "") {
        details.push(`${statementField}.id must be a non-empty string.`);
      } else if (ids.has(statement.id)) {
        details.push(`${statementField}.id must be unique.`);
      } else {
        ids.add(statement.id);
      }
      if (typeof statement.text !== "string" || statement.text.trim() === "") {
        details.push(`${statementField}.text must be a non-empty atomic statement.`);
      } else {
        const normalizedText = statement.text.trim().toLocaleLowerCase("en");
        if (texts.has(normalizedText)) {
          details.push(`${statementField}.text conflicts with another classification.`);
        } else {
          texts.add(normalizedText);
        }
      }
      if (statement.classification === "hard-constraint") {
        if (!hasOnlyFields(statement, ["id", "text", "classification"])) {
          details.push(`${statementField} Hard Constraint contains unrelated fields.`);
        }
      } else if (statement.classification === "preference") {
        if (
          !hasOnlyFields(statement, ["id", "text", "classification", "importance"]) ||
          !["minor", "important", "major"].includes(String(statement.importance))
        ) {
          details.push(`${statementField} Preference must have a valid importance.`);
        }
      } else if (statement.classification === "advantage") {
        if (
          !hasOnlyFields(statement, ["id", "text", "classification", "rationale"]) ||
          typeof statement.rationale !== "string" ||
          statement.rationale.trim() === ""
        ) {
          details.push(`${statementField} Advantage must have a non-empty rationale.`);
        }
      } else {
        details.push(`${statementField}.classification must be hard-constraint, preference, or advantage.`);
      }
    }
  }
  details.push(
    ...validateResearchBudget(
      value.researchBudget,
      isRecord(target) ? target.currency : undefined,
    ),
  );
  return details;
}

function validateConfirmCampaignIntakeFields(
  command: Record<string, unknown>,
): string[] {
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  const details: string[] = [];
  for (const field of ["campaignPath", "coordinatorId"] as const) {
    if (
      typeof command.payload[field] !== "string" ||
      command.payload[field].trim() === ""
    ) {
      details.push(`payload.${field} must be a non-empty string.`);
    }
  }
  if (
    typeof command.payload.campaignPath === "string" &&
    !path.isAbsolute(command.payload.campaignPath)
  ) {
    details.push("payload.campaignPath must be an absolute path.");
  }
  if (!isIsoInstant(command.payload.confirmedAt)) {
    details.push("payload.confirmedAt must be an ISO 8601 UTC instant.");
  }
  details.push(
    ...validateCampaignIntake(command.payload.intake, command.payload.confirmedAt),
  );
  return details;
}

function validatePublicResearchCommandBase(
  payload: Record<string, unknown>,
  instantField: "reservedAt" | "recordedAt" | "requestedAt" | "respondedAt" | "incurredAt",
): string[] {
  const details: string[] = [];
  for (const field of ["campaignPath", "coordinatorId"] as const) {
    if (typeof payload[field] !== "string" || payload[field].trim() === "") {
      details.push(`payload.${field} must be a non-empty string.`);
    }
  }
  if (
    typeof payload.campaignPath === "string" &&
    !path.isAbsolute(payload.campaignPath)
  ) {
    details.push("payload.campaignPath must be an absolute path.");
  }
  if (!isIsoInstant(payload[instantField])) {
    details.push(`payload.${instantField} must be an ISO 8601 UTC instant.`);
  }
  return details;
}

function validatePublicResearchReservation(
  value: unknown,
  field = "payload.reservation",
): string[] {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, [
      "id",
      "sourceUnits",
      "purpose",
      "retrievalRoute",
      ...(value.researchClass === undefined ? [] : ["researchClass"]),
      ...(value.opportunityId === undefined ? [] : ["opportunityId"]),
      ...(value.approvalId === undefined ? [] : ["approvalId"]),
    ])
  ) {
    return [`${field} must contain id, sourceUnits, purpose, and retrievalRoute.`];
  }
  const details: string[] = [];
  for (const textField of ["id", "purpose", "retrievalRoute"] as const) {
    if (typeof value[textField] !== "string" || value[textField].trim() === "") {
      details.push(`${field}.${textField} must be a non-empty string.`);
    }
    details.push(
      ...validatePersistableText(value[textField], `${field}.${textField}`),
    );
  }
  if (value.sourceUnits !== 1) {
    details.push(`${field}.sourceUnits must be exactly 1 for one substantive Source examination.`);
  }
  if (
    value.researchClass !== undefined &&
    !["deepening", "open-world-discovery"].includes(
      String(value.researchClass),
    )
  ) {
    details.push(
      `${field}.researchClass must be deepening or open-world-discovery when present.`,
    );
  }
  for (const optionalIdentity of ["opportunityId", "approvalId"] as const) {
    if (
      value[optionalIdentity] !== undefined &&
      (typeof value[optionalIdentity] !== "string" ||
        value[optionalIdentity].trim() === "")
    ) {
      details.push(`${field}.${optionalIdentity} must be a non-empty string when present.`);
    }
  }
  if (value.researchClass !== "deepening" && value.opportunityId !== undefined) {
    details.push(`${field}.opportunityId is available only for Opportunity deepening.`);
  }
  if (value.opportunityId === undefined && value.approvalId !== undefined) {
    details.push(`${field}.approvalId requires an Opportunity-specific reservation.`);
  }
  return details;
}

function validateReservePublicResearchFields(
  command: Record<string, unknown>,
): string[] {
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  return [
    ...validatePublicResearchCommandBase(command.payload, "reservedAt"),
    ...validatePublicResearchReservation(command.payload.reservation),
  ];
}

function isNullableNonEmptyString(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.trim() !== "");
}

function containsProhibitedPersistedContent(value: string): boolean {
  return [
    /\b(?:api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|password|passwd|secret|authorization)\b\s*(?:[:=]|\bis\b)\s*\S+/i,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
    /\b(?:card|iban|bank account|routing number|sort code)\b.{0,24}(?:[:=]|\bis\b)\s*[A-Z0-9 -]{6,}/i,
    /\b(?:credit|debit|payment)\s+card\b/i,
    /\bcard\s+(?:ending|number|details?)\b/i,
    /\b(?:cvv|cvc|iban|bank account|routing number|sort code|payment details?)\b/i,
    /\b(?:last four|last 4|ending in)\s*\d{4}\b/i,
    /\b(?:\d[ -]?){12,18}\d\b/,
    /<\/?[A-Z][^>]*>|```/i,
    /^\s*(?:ignore|disregard|override)\b.{0,80}\b(?:instructions?|workflow|system prompt)\b/i,
  ].some((pattern) => pattern.test(value));
}

function validatePersistableText(value: unknown, field: string): string[] {
  return typeof value === "string" && containsProhibitedPersistedContent(value)
    ? [
        `${field} must not contain sensitive, personal, payment, active-instruction, or raw content.`,
      ]
    : [];
}

function validatePublicSource(value: unknown, recordedAt: unknown): string[] {
  const field = "payload.source";
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, [
      "id",
      "retrievalMode",
      "url",
      "publisher",
      "originator",
      "publishedAt",
      "updatedAt",
      "accessedAt",
      "exactLocator",
    ])
  ) {
    return [
      `${field} must contain only identity, public retrieval provenance, dates, access time, and an exact locator.`,
    ];
  }
  const details: string[] = [];
  for (const textField of ["id", "retrievalMode", "exactLocator"] as const) {
    if (typeof value[textField] !== "string" || value[textField].trim() === "") {
      details.push(`${field}.${textField} must be a non-empty string.`);
    }
  }
  if (typeof value.url !== "string") {
    details.push(`${field}.url must be a public HTTP or HTTPS URL.`);
  } else {
    try {
      const sourceUrl = new URL(value.url);
      if (
        !["http:", "https:"].includes(sourceUrl.protocol) ||
        sourceUrl.username !== "" ||
        sourceUrl.password !== ""
      ) {
        details.push(`${field}.url must be a public HTTP or HTTPS URL without credentials.`);
      }
      const sensitiveQuery = [...sourceUrl.searchParams].some(
        ([name, parameterValue]) =>
          /^(?:password|passwd|secret|token|access_token|refresh_token|api_key|apikey|authorization|auth_token|session_token|credential|signature|sig)$/i.test(
            name,
          ) || containsProhibitedPersistedContent(`${name}=${parameterValue}`),
      );
      if (
        sensitiveQuery ||
        (sourceUrl.hash !== "" && containsProhibitedPersistedContent(sourceUrl.hash))
      ) {
        details.push(`${field}.url must not contain credential-bearing or sensitive query or fragment data.`);
      }
    } catch {
      details.push(`${field}.url must be a valid public HTTP or HTTPS URL.`);
    }
  }
  if (!isNullableNonEmptyString(value.publisher)) {
    details.push(`${field}.publisher must be a non-empty string or null.`);
  }
  if (!isNullableNonEmptyString(value.originator)) {
    details.push(`${field}.originator must be a non-empty string or null.`);
  }
  if (value.publisher === null && value.originator === null) {
    details.push(`${field} must identify a publisher or originator.`);
  }
  for (const textField of [
    "id",
    "retrievalMode",
    "publisher",
    "originator",
    "exactLocator",
  ] as const) {
    details.push(...validatePersistableText(value[textField], `${field}.${textField}`));
  }
  for (const dateField of ["publishedAt", "updatedAt"] as const) {
    if (value[dateField] !== null && !isIsoDate(value[dateField])) {
      details.push(`${field}.${dateField} must be an ISO 8601 date or null when unknown.`);
    }
  }
  if (!isIsoInstant(value.accessedAt)) {
    details.push(`${field}.accessedAt must be an ISO 8601 UTC instant.`);
  } else if (isIsoInstant(recordedAt) && value.accessedAt > recordedAt) {
    details.push(`${field}.accessedAt cannot be after payload.recordedAt.`);
  }
  return details;
}

function validatePublicObservation(value: unknown, source: unknown): string[] {
  const field = "payload.observation";
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, ["id", "text", "sourceId", "exactLocator"])
  ) {
    return [
      `${field} must contain only identity, one neutral paraphrase, and its precise Source link.`,
    ];
  }
  const details: string[] = [];
  for (const textField of ["id", "text", "sourceId", "exactLocator"] as const) {
    if (typeof value[textField] !== "string" || value[textField].trim() === "") {
      details.push(`${field}.${textField} must be a non-empty string.`);
    }
  }
  if (typeof value.text === "string" && (value.text.includes("\n") || value.text.length > 1_000)) {
    details.push(`${field}.text must be one atomic, copyright-conscious paraphrase of at most 1000 characters.`);
  }
  for (const textField of ["id", "text", "sourceId", "exactLocator"] as const) {
    details.push(...validatePersistableText(value[textField], `${field}.${textField}`));
  }
  if (isRecord(source) && value.sourceId !== source.id) {
    details.push(`${field}.sourceId must match payload.source.id.`);
  }
  if (isRecord(source) && value.exactLocator !== source.exactLocator) {
    details.push(`${field}.exactLocator must match payload.source.exactLocator.`);
  }
  return details;
}

function validateRecordPublicResearchObservationFields(
  command: Record<string, unknown>,
): string[] {
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  const details = validatePublicResearchCommandBase(command.payload, "recordedAt");
  if (
    typeof command.payload.reservationId !== "string" ||
    command.payload.reservationId.trim() === ""
  ) {
    details.push("payload.reservationId must be a non-empty string.");
  }
  details.push(
    ...validatePublicSource(command.payload.source, command.payload.recordedAt),
    ...validatePublicObservation(command.payload.observation, command.payload.source),
  );
  return details;
}

function validateEntryIdList(
  value: unknown,
  field: string,
  allowEmpty: boolean,
): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    return [`${field} must be ${allowEmpty ? "an" : "a non-empty"} array of stable Evidence Ledger entry identities.`];
  }
  const details: string[] = [];
  const identities = new Set<string>();
  for (const [index, identity] of value.entries()) {
    if (typeof identity !== "string" || identity.trim() === "") {
      details.push(`${field}[${index}] must be a non-empty string.`);
    } else if (identities.has(identity)) {
      details.push(`${field} must not contain duplicate identities.`);
    } else {
      identities.add(identity);
    }
  }
  return details;
}

function validateReasoningTextFields(
  value: Record<string, unknown>,
  field: string,
  textFields: string[],
): string[] {
  const details: string[] = [];
  for (const textField of textFields) {
    if (typeof value[textField] !== "string" || value[textField].trim() === "") {
      details.push(`${field}.${textField} must be a non-empty string.`);
    }
    details.push(
      ...validatePersistableText(
        value[textField],
        `${field}.${textField}`,
      ),
    );
  }
  return details;
}

function validateAssessmentLimitations(
  value: unknown,
  field: string,
): string[] {
  const details: string[] = [];
  if (!Array.isArray(value) || value.length === 0) {
    details.push(`${field}.limitations must contain at least one explicit limitation.`);
  } else {
    for (const [index, limitation] of value.entries()) {
      if (typeof limitation !== "string" || limitation.trim() === "") {
        details.push(`${field}.limitations[${index}] must be a non-empty string.`);
      }
      details.push(
        ...validatePersistableText(
          limitation,
          `${field}.limitations[${index}]`,
        ),
      );
    }
  }
  return details;
}

function validateEvidenceConfidence(value: unknown, field: string): string[] {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, ["level", "limitingFactors"]) ||
    !["unknown", "low", "medium", "high"].includes(String(value.level)) ||
    !Array.isArray(value.limitingFactors) ||
    value.limitingFactors.length === 0
  ) {
    return [
      `${field} must use unknown, low, medium, or high and include explicit limiting factors.`,
    ];
  }
  const details: string[] = [];
  for (const [index, factor] of value.limitingFactors.entries()) {
    if (typeof factor !== "string" || factor.trim() === "") {
      details.push(`${field}.limitingFactors[${index}] must be a non-empty string.`);
    }
    details.push(
      ...validatePersistableText(factor, `${field}.limitingFactors[${index}]`),
    );
  }
  return details;
}

function validateSourceLineage(value: unknown, field: string): string[] {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, [
      "type",
      "id",
      "sourceIds",
      "sharedOrigin",
      "relationship",
      "independence",
    ]) ||
    value.type !== "source-lineage"
  ) {
    return [`${field} must be a complete Source Lineage entry.`];
  }
  const details = validateReasoningTextFields(value, field, ["id", "sharedOrigin"]);
  details.push(...validateEntryIdList(value.sourceIds, `${field}.sourceIds`, false));
  if (Array.isArray(value.sourceIds) && value.sourceIds.length < 2) {
    details.push(`${field}.sourceIds must identify at least two dependent Sources.`);
  }
  if (
    ![
      "shared-authorship",
      "shared-dataset",
      "syndication",
      "republication",
      "other",
    ].includes(String(value.relationship))
  ) {
    details.push(`${field}.relationship must identify the shared-origin relationship.`);
  }
  if (value.independence !== "dependent") {
    details.push(`${field}.independence must be dependent for Sources with a shared origin.`);
  }
  return details;
}

function validateSourceCredibility(value: unknown, field: string): string[] {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, [
      "type",
      "id",
      "sourceId",
      "observationId",
      "intendedUse",
      "assessment",
      "rationale",
      "limitations",
    ]) ||
    value.type !== "source-credibility"
  ) {
    return [`${field} must be a complete contextual Source Credibility entry.`];
  }
  const details = validateReasoningTextFields(value, field, [
      "id",
      "sourceId",
      "observationId",
      "intendedUse",
      "rationale",
    ]);
  if (!["unknown", "low", "medium", "high"].includes(String(value.assessment))) {
    details.push(`${field}.assessment must be unknown, low, medium, or high.`);
  }
  details.push(...validateAssessmentLimitations(value.limitations, field));
  return details;
}

function validateSourceFreshness(value: unknown, field: string): string[] {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, [
      "type",
      "id",
      "sourceId",
      "observationId",
      "intendedUse",
      "assessment",
      "timeSensitivity",
      "rationale",
      "limitations",
    ]) ||
    value.type !== "source-freshness"
  ) {
    return [`${field} must be a complete contextual Source Freshness entry.`];
  }
  const details = validateReasoningTextFields(value, field, [
    "id",
    "sourceId",
    "observationId",
    "intendedUse",
    "timeSensitivity",
    "rationale",
  ]);
  if (!["unknown", "low", "medium", "high"].includes(String(value.assessment))) {
    details.push(`${field}.assessment must be unknown, low, medium, or high.`);
  }
  details.push(...validateAssessmentLimitations(value.limitations, field));
  return details;
}

function validateEvidenceGap(value: unknown, field: string): string[] {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, [
      "type",
      "id",
      "question",
      "affectedDecisionIds",
      "resolutionCriteria",
      "resolutionMethod",
      "status",
      "resolution",
    ]) ||
    value.type !== "evidence-gap"
  ) {
    return [`${field} must be a complete Evidence Gap entry.`];
  }
  const details = validateReasoningTextFields(value, field, [
    "id",
    "question",
    "resolutionCriteria",
    "resolutionMethod",
  ]);
  details.push(
    ...validateEntryIdList(
      value.affectedDecisionIds,
      `${field}.affectedDecisionIds`,
      false,
    ),
  );
  if (!(["open", "resolved"] as unknown[]).includes(value.status)) {
    details.push(`${field}.status must be open or resolved.`);
  }
  if (value.status === "open" && value.resolution !== null) {
    details.push(`${field}.resolution must be null while the Evidence Gap is open.`);
  }
  if (
    value.status === "resolved" &&
    (typeof value.resolution !== "string" || value.resolution.trim() === "")
  ) {
    details.push(`${field}.resolution must explain how the Evidence Gap was resolved.`);
  }
  details.push(...validatePersistableText(value.resolution, `${field}.resolution`));
  return details;
}

function validateAssumption(value: unknown, field: string): string[] {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, ["type", "id", "text", "scope", "evidenceGapId"]) ||
    value.type !== "assumption"
  ) {
    return [
      `${field} must be an unsupported Assumption linked only to an Evidence Gap.`,
    ];
  }
  return validateReasoningTextFields(value, field, [
    "id",
    "text",
    "scope",
    "evidenceGapId",
  ]);
}

function validateInference(value: unknown, field: string): string[] {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, [
      "type",
      "id",
      "text",
      "scope",
      "reasoning",
      "supportingEntryIds",
      "challengingEntryIds",
      "confidence",
    ]) ||
    value.type !== "inference"
  ) {
    return [`${field} must be a complete Inference entry.`];
  }
  const details: string[] = [];
  for (const textField of ["id", "text", "scope", "reasoning"] as const) {
    if (typeof value[textField] !== "string" || value[textField].trim() === "") {
      details.push(`${field}.${textField} must be a non-empty string.`);
    }
    details.push(
      ...validatePersistableText(value[textField], `${field}.${textField}`),
    );
  }
  details.push(
    ...validateEntryIdList(
      value.supportingEntryIds,
      `${field}.supportingEntryIds`,
      false,
    ),
    ...validateEntryIdList(
      value.challengingEntryIds,
      `${field}.challengingEntryIds`,
      true,
    ),
  );
  if (
    Array.isArray(value.supportingEntryIds) &&
    Array.isArray(value.challengingEntryIds) &&
    value.supportingEntryIds.some((identity) =>
      (value.challengingEntryIds as unknown[]).includes(identity),
    )
  ) {
    details.push(`${field} cannot use one entry as both support and challenge.`);
  }
  details.push(
    ...validateEvidenceConfidence(value.confidence, `${field}.confidence`),
  );
  return details;
}

function validateContradiction(value: unknown, field: string): string[] {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, [
      "type",
      "id",
      "entryIds",
      "disputedProposition",
      "disputedScope",
      "attemptedReconciliation",
      "resolutionStatus",
      "resolution",
    ]) ||
    value.type !== "contradiction"
  ) {
    return [`${field} must be a complete Contradiction entry.`];
  }
  const details = validateReasoningTextFields(value, field, [
    "id",
    "disputedProposition",
    "disputedScope",
    "attemptedReconciliation",
  ]);
  details.push(...validateEntryIdList(value.entryIds, `${field}.entryIds`, false));
  if (Array.isArray(value.entryIds) && value.entryIds.length < 2) {
    details.push(`${field}.entryIds must preserve at least two incompatible entries.`);
  }
  if (
    !["unresolved", "partially-resolved", "resolved"].includes(
      String(value.resolutionStatus),
    )
  ) {
    details.push(
      `${field}.resolutionStatus must be unresolved, partially-resolved, or resolved.`,
    );
  }
  if (value.resolutionStatus === "unresolved" && value.resolution !== null) {
    details.push(`${field}.resolution must be null while the Contradiction is unresolved.`);
  }
  if (
    value.resolutionStatus !== "unresolved" &&
    (typeof value.resolution !== "string" || value.resolution.trim() === "")
  ) {
    details.push(`${field}.resolution must explain the current reconciliation.`);
  }
  details.push(...validatePersistableText(value.resolution, `${field}.resolution`));
  return details;
}

function validateCorrection(value: unknown, field: string): string[] {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, [
      "type",
      "id",
      "targetEntryId",
      "action",
      "replacementEntryId",
      "rationale",
    ]) ||
    value.type !== "correction"
  ) {
    return [`${field} must be a complete append-only Correction entry.`];
  }
  const details = validateReasoningTextFields(value, field, [
    "id",
    "targetEntryId",
    "rationale",
  ]);
  if (!(["supersede", "retract"] as unknown[]).includes(value.action)) {
    details.push(`${field}.action must be supersede or retract.`);
  }
  if (
    value.action === "supersede" &&
    (typeof value.replacementEntryId !== "string" ||
      value.replacementEntryId.trim() === "" ||
      value.replacementEntryId === value.targetEntryId)
  ) {
    details.push(
      `${field}.replacementEntryId must identify a different replacement when superseding.`,
    );
  }
  if (value.action === "retract" && value.replacementEntryId !== null) {
    details.push(`${field}.replacementEntryId must be null when retracting.`);
  }
  details.push(
    ...validatePersistableText(
      value.replacementEntryId,
      `${field}.replacementEntryId`,
    ),
  );
  return details;
}

function validateReasoningEntry(value: unknown, field: string): string[] {
  if (!isRecord(value)) {
    return [`${field} must be an Evidence Ledger entry.`];
  }
  switch (value.type) {
    case "source-lineage":
      return validateSourceLineage(value, field);
    case "source-credibility":
      return validateSourceCredibility(value, field);
    case "source-freshness":
      return validateSourceFreshness(value, field);
    case "evidence-gap":
      return validateEvidenceGap(value, field);
    case "assumption":
      return validateAssumption(value, field);
    case "inference":
      return validateInference(value, field);
    case "contradiction":
      return validateContradiction(value, field);
    case "correction":
      return validateCorrection(value, field);
    default:
      return [`${field}.type is not a supported Evidence Ledger reasoning type.`];
  }
}

function validateRecordEvidenceReasoningFields(
  command: Record<string, unknown>,
): string[] {
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  const details = validatePublicResearchCommandBase(
    command.payload,
    "recordedAt",
  );
  if (!Array.isArray(command.payload.entries) || command.payload.entries.length === 0) {
    details.push("payload.entries must contain at least one Evidence Ledger entry.");
    return details;
  }
  const entryIds = new Set<string>();
  for (const [index, entry] of command.payload.entries.entries()) {
    const field = `payload.entries[${index}]`;
    details.push(...validateReasoningEntry(entry, field));
    if (isRecord(entry) && typeof entry.id === "string") {
      if (entryIds.has(entry.id)) {
        details.push("payload.entries must use unique stable identities.");
      }
      entryIds.add(entry.id);
    }
  }
  return details;
}

function validateDiscoverySampling(
  value: unknown,
  field: string,
): string[] {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, [
      "frameOrigin",
      "method",
      "frame",
      "selectionRule",
      "sampleSize",
      "randomSeed",
    ])
  ) {
    return [`${field} must contain the complete controlled sampling method.`];
  }
  const details = validateReasoningTextFields(value, field, [
    "frame",
    "selectionRule",
  ]);
  if (value.frameOrigin !== "external-map") {
    details.push(`${field}.frameOrigin must be external-map.`);
  }
  if (
    !["systematic", "stratified", "seeded-random", "bounded-enumeration"].includes(
      String(value.method),
    )
  ) {
    details.push(`${field}.method must be a supported controlled sampling method.`);
  }
  if (!Number.isSafeInteger(value.sampleSize) || Number(value.sampleSize) <= 0) {
    details.push(`${field}.sampleSize must be a positive safe integer.`);
  }
  if (
    value.method === "seeded-random" &&
    (typeof value.randomSeed !== "string" || value.randomSeed.trim() === "")
  ) {
    details.push(`${field}.randomSeed must be recorded for seeded-random sampling.`);
  }
  if (value.method !== "seeded-random" && value.randomSeed !== null) {
    details.push(`${field}.randomSeed must be null unless sampling is seeded-random.`);
  }
  details.push(...validatePersistableText(value.randomSeed, `${field}.randomSeed`));
  return details;
}

function validateDiscoverySweep(value: unknown, field: string): string[] {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, ["id", "sourceFamily", "sourceIds", "sampling"])
  ) {
    return [`${field} must contain identity, one Source Family, Sources, and controlled sampling.`];
  }
  const details = validateReasoningTextFields(value, field, ["id"]);
  if (
    !isRecord(value.sourceFamily) ||
    !hasOnlyFields(value.sourceFamily, ["id", "name", "economicActivityMap"])
  ) {
    details.push(`${field}.sourceFamily must identify one external map Source Family.`);
  } else {
    details.push(
      ...validateReasoningTextFields(value.sourceFamily, `${field}.sourceFamily`, [
        "id",
        "name",
        "economicActivityMap",
      ]),
    );
  }
  details.push(...validateEntryIdList(value.sourceIds, `${field}.sourceIds`, false));
  details.push(...validateDiscoverySampling(value.sampling, `${field}.sampling`));
  return details;
}

function validateProblemSignal(value: unknown, field: string): string[] {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, ["materialConsequence", "committedBehavior"])
  ) {
    return [`${field} must contain a material consequence and committed behavior.`];
  }
  const details: string[] = [];
  const consequence = value.materialConsequence;
  if (
    !isRecord(consequence) ||
    !hasOnlyFields(consequence, ["kind", "description", "observationIds"])
  ) {
    details.push(`${field}.materialConsequence must contain kind, description, and Observation links.`);
  } else {
    if (
      ![
        "lost-money",
        "wasted-skilled-time",
        "blocked-revenue",
        "operational-risk",
        "compliance-exposure",
        "workaround-expenditure",
      ].includes(String(consequence.kind))
    ) {
      details.push(`${field}.materialConsequence.kind must name a material consequence.`);
    }
    details.push(
      ...validateReasoningTextFields(
        consequence,
        `${field}.materialConsequence`,
        ["description"],
      ),
      ...validateEntryIdList(
        consequence.observationIds,
        `${field}.materialConsequence.observationIds`,
        false,
      ),
    );
  }
  const behavior = value.committedBehavior;
  if (
    !isRecord(behavior) ||
    !hasOnlyFields(behavior, ["kind", "description", "observationIds"])
  ) {
    details.push(`${field}.committedBehavior must contain kind, description, and Observation links.`);
  } else {
    if (
      ![
        "expenditure",
        "workaround-effort",
        "switching",
        "escalation",
        "measurable-loss",
      ].includes(String(behavior.kind))
    ) {
      details.push(`${field}.committedBehavior.kind must name committed behavior rather than a complaint.`);
    }
    details.push(
      ...validateReasoningTextFields(
        behavior,
        `${field}.committedBehavior`,
        ["description"],
      ),
      ...validateEntryIdList(
        behavior.observationIds,
        `${field}.committedBehavior.observationIds`,
        false,
      ),
    );
  }
  return details;
}

function validateExplorationThread(value: unknown, field: string): string[] {
  if (!isRecord(value)) {
    return [`${field} must be an Exploration Thread.`];
  }
  const origin = value.origin;
  const sourceLed = isRecord(origin) && origin.kind === "source-led";
  const allowedFields = sourceLed
    ? [
        "id",
        "customerGroup",
        "situation",
        "problemFamily",
        "familiarDomain",
        "origin",
        "problemSignal",
        "noveltyCheck",
        "disposition",
      ]
    : [
        "id",
        "customerGroup",
        "situation",
        "problemFamily",
        "familiarDomain",
        "origin",
        "noveltyCheck",
        "disposition",
      ];
  if (!hasOnlyFields(value, allowedFields)) {
    return [`${field} must contain only the complete Exploration Thread contract.`];
  }
  const details = validateReasoningTextFields(value, field, [
    "id",
    "customerGroup",
    "situation",
    "problemFamily",
  ]);
  if (typeof value.familiarDomain !== "boolean") {
    details.push(`${field}.familiarDomain must be a boolean.`);
  }
  if (
    !isRecord(value.noveltyCheck) ||
    !hasOnlyFields(value.noveltyCheck, [
      "comparedWithThreadIds",
      "result",
      "rationale",
    ])
  ) {
    details.push(`${field}.noveltyCheck must record comparison, result, and rationale.`);
  } else {
    details.push(
      ...validateEntryIdList(
        value.noveltyCheck.comparedWithThreadIds,
        `${field}.noveltyCheck.comparedWithThreadIds`,
        true,
      ),
      ...validateReasoningTextFields(
        value.noveltyCheck,
        `${field}.noveltyCheck`,
        ["rationale"],
      ),
    );
    if (!['distinct', 'overlaps-existing'].includes(String(value.noveltyCheck.result))) {
      details.push(`${field}.noveltyCheck.result must be distinct or overlaps-existing.`);
    }
  }
  if (
    !isRecord(value.disposition) ||
    !hasOnlyFields(value.disposition, ["status", "rationale"])
  ) {
    details.push(`${field}.disposition must record retained or dropped with rationale.`);
  } else {
    details.push(
      ...validateReasoningTextFields(value.disposition, `${field}.disposition`, [
        "rationale",
      ]),
    );
    if (!["retained", "dropped"].includes(String(value.disposition.status))) {
      details.push(`${field}.disposition.status must be retained or dropped.`);
    }
  }
  if (sourceLed) {
    if (
      !hasOnlyFields(origin, ["kind", "sweepId", "observationIds"]) ||
      typeof origin.sweepId !== "string" ||
      origin.sweepId.trim() === ""
    ) {
      details.push(`${field}.origin must link a source-led thread to one Discovery Sweep.`);
    }
    details.push(
      ...validatePersistableText(origin.sweepId, `${field}.origin.sweepId`),
      ...validateEntryIdList(
        origin.observationIds,
        `${field}.origin.observationIds`,
        false,
      ),
      ...validateProblemSignal(value.problemSignal, `${field}.problemSignal`),
    );
  } else if (isRecord(origin) && origin.kind === "novelty-probe") {
    if (
      !hasOnlyFields(origin, [
        "kind",
        "method",
        "derivation",
        "assumption",
        "evidenceGap",
      ])
    ) {
      details.push(`${field}.origin must contain the complete Novelty Probe derivation.`);
    }
    if (
      ![
        "cross-domain-transfer",
        "change-combination",
        "inversion",
        "recombination",
      ].includes(String(origin.method))
    ) {
      details.push(`${field}.origin.method must be a supported Novelty Probe method.`);
    }
    details.push(
      ...validateReasoningTextFields(origin, `${field}.origin`, ["derivation"]),
      ...validateEvidenceGap(origin.evidenceGap, `${field}.origin.evidenceGap`),
      ...validateAssumption(origin.assumption, `${field}.origin.assumption`),
    );
    if (
      isRecord(origin.assumption) &&
      isRecord(origin.evidenceGap) &&
      origin.assumption.evidenceGapId !== origin.evidenceGap.id
    ) {
      details.push(`${field}.origin.assumption must link its Novelty Probe Evidence Gap.`);
    }
  } else {
    details.push(`${field}.origin.kind must be source-led or novelty-probe.`);
  }
  return details;
}

function validateDiscoveryTranche(value: unknown, field = "payload.tranche"): string[] {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, [
      "id",
      "ordinal",
      "threadSlots",
      "noveltyProbeSlots",
      "shallowResearchSourceUnitsPerRetainedThread",
      "familiarDomainException",
      "sweeps",
      "threads",
    ])
  ) {
    return [`${field} must contain the complete bounded Discovery Tranche contract.`];
  }
  const details = validateReasoningTextFields(value, field, ["id"]);
  for (const numberField of [
    "ordinal",
    "threadSlots",
    "shallowResearchSourceUnitsPerRetainedThread",
  ] as const) {
    if (!Number.isSafeInteger(value[numberField]) || Number(value[numberField]) <= 0) {
      details.push(`${field}.${numberField} must be a positive safe integer.`);
    }
  }
  if (
    !Number.isSafeInteger(value.noveltyProbeSlots) ||
    Number(value.noveltyProbeSlots) <= 0 ||
    Number.isSafeInteger(value.threadSlots) &&
      (Number(value.threadSlots) % 5 !== 0 ||
        Number(value.noveltyProbeSlots) !== Number(value.threadSlots) / 5)
  ) {
    details.push(`${field}.noveltyProbeSlots must reserve exactly twenty percent of threadSlots.`);
  }
  if (value.familiarDomainException !== null) {
    if (
      !isRecord(value.familiarDomainException) ||
      !hasOnlyFields(value.familiarDomainException, ["intakeStatementId", "rationale"])
    ) {
      details.push(`${field}.familiarDomainException must be null or link one Campaign Intake statement.`);
    } else {
      details.push(
        ...validateReasoningTextFields(
          value.familiarDomainException,
          `${field}.familiarDomainException`,
          ["intakeStatementId", "rationale"],
        ),
      );
    }
  }
  if (!Array.isArray(value.sweeps) || value.sweeps.length < 2) {
    details.push(`${field}.sweeps must contain at least two heterogeneous Source Families.`);
  } else {
    const sweepIds = new Set<string>();
    const familyIds = new Set<string>();
    for (const [index, sweep] of value.sweeps.entries()) {
      details.push(...validateDiscoverySweep(sweep, `${field}.sweeps[${index}]`));
      if (isRecord(sweep) && typeof sweep.id === "string") {
        if (sweepIds.has(sweep.id)) {
          details.push(`${field}.sweeps must use unique stable identities.`);
        }
        sweepIds.add(sweep.id);
      }
      if (isRecord(sweep) && isRecord(sweep.sourceFamily) && typeof sweep.sourceFamily.id === "string") {
        familyIds.add(sweep.sourceFamily.id);
      }
    }
    if (familyIds.size < 2) {
      details.push(`${field}.sweeps must use heterogeneous Source Families.`);
    }
  }
  if (!Array.isArray(value.threads) || value.threads.length === 0) {
    details.push(`${field}.threads must contain at least one inspectable Exploration Thread.`);
  } else {
    const threadIds = new Set<string>();
    for (const [index, thread] of value.threads.entries()) {
      details.push(...validateExplorationThread(thread, `${field}.threads[${index}]`));
      if (isRecord(thread) && typeof thread.id === "string") {
        if (threadIds.has(thread.id)) {
          details.push(`${field}.threads must use unique stable identities.`);
        }
        threadIds.add(thread.id);
      }
    }
    if (Number.isSafeInteger(value.threadSlots) && value.threads.length > Number(value.threadSlots)) {
      details.push(`${field}.threads cannot exceed the bounded threadSlots.`);
    }
    const noveltyProbeCount = value.threads.filter(
      (thread) => isRecord(thread) && isRecord(thread.origin) && thread.origin.kind === "novelty-probe",
    ).length;
    if (Number.isSafeInteger(value.noveltyProbeSlots) && noveltyProbeCount > Number(value.noveltyProbeSlots)) {
      details.push(`${field}.threads cannot exceed the reserved Novelty Probe slots.`);
    }
    const sourceLedCount = value.threads.filter(
      (thread) => isRecord(thread) && isRecord(thread.origin) && thread.origin.kind === "source-led",
    ).length;
    if (
      Number.isSafeInteger(value.threadSlots) &&
      Number.isSafeInteger(value.noveltyProbeSlots) &&
      sourceLedCount > Number(value.threadSlots) - Number(value.noveltyProbeSlots)
    ) {
      details.push(`${field}.threads cannot consume a reserved Novelty Probe slot with a source-led thread.`);
    }
  }
  return details;
}

function validateRecordDiscoveryTrancheFields(
  command: Record<string, unknown>,
): string[] {
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  return [
    ...validatePublicResearchCommandBase(command.payload, "recordedAt"),
    ...validateDiscoveryTranche(command.payload.tranche),
  ];
}

function validateCampaignDecision(
  value: unknown,
  recordedAt: unknown,
  field: string,
): string[] {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, [
      "type",
      "id",
      "kind",
      "outcome",
      "intakeVersion",
      "applicableRule",
      "evidenceEntryIds",
      "rationale",
      "confidence",
      "limitations",
      "decidedAt",
    ]) ||
    value.type !== "campaign-decision"
  ) {
    return [`${field} must be a complete Campaign Decision.`];
  }
  const details = validateReasoningTextFields(value, field, [
    "id",
    "applicableRule",
    "rationale",
  ]);
  if (!["opportunity-formation", "breadth-gate"].includes(String(value.kind))) {
    details.push(`${field}.kind must be opportunity-formation or breadth-gate.`);
  }
  if (
    !["formed", "insufficient-evidence", "passed"].includes(
      String(value.outcome),
    )
  ) {
    details.push(`${field}.outcome is not supported.`);
  }
  if (!Number.isSafeInteger(value.intakeVersion) || Number(value.intakeVersion) <= 0) {
    details.push(`${field}.intakeVersion must be a positive safe integer.`);
  }
  details.push(
    ...validateEntryIdList(
      value.evidenceEntryIds,
      `${field}.evidenceEntryIds`,
      value.outcome === "insufficient-evidence",
    ),
  );
  if (!isIsoInstant(value.decidedAt) || value.decidedAt !== recordedAt) {
    details.push(`${field}.decidedAt must equal the operation's recordedAt instant.`);
  }
  details.push(
    ...validateEvidenceConfidence(value.confidence, `${field}.confidence`),
  );
  details.push(...validateAssessmentLimitations(value.limitations, field));
  return details;
}

function validateOpportunityFormationAssessment(
  value: unknown,
  recordedAt: unknown,
  field: string,
): string[] {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, [
      "id",
      "explorationThreadIds",
      "customer",
      "situation",
      "costlyProblem",
      "clusterBasis",
      "supportingObservationIds",
      "behavioralProblemSignalObservationIds",
      "independentSourceLineages",
      "result",
      "decision",
    ])
  ) {
    return [`${field} must be a complete solution-neutral Opportunity formation assessment.`];
  }
  const keepsExplorationThread =
    isRecord(value.result) && value.result.kind === "exploration-thread";
  const details = validateReasoningTextFields(value, field, ["id", "customer", "situation"]);
  details.push(
    ...validateEntryIdList(value.explorationThreadIds, `${field}.explorationThreadIds`, false),
    ...validateEntryIdList(
      value.supportingObservationIds,
      `${field}.supportingObservationIds`,
      keepsExplorationThread,
    ),
    ...validateEntryIdList(
      value.behavioralProblemSignalObservationIds,
      `${field}.behavioralProblemSignalObservationIds`,
      keepsExplorationThread,
    ),
  );
  if (
    !Array.isArray(value.independentSourceLineages) ||
    (!keepsExplorationThread && value.independentSourceLineages.length === 0)
  ) {
    details.push(`${field}.independentSourceLineages must identify at least one assessed Source Lineage.`);
  } else {
    for (const [index, lineage] of value.independentSourceLineages.entries()) {
      const lineageField = `${field}.independentSourceLineages[${index}]`;
      if (!isRecord(lineage) || !hasOnlyFields(lineage, ["id", "sourceIds", "rationale"])) {
        details.push(`${lineageField} must identify one reasoned Source Lineage.`);
      } else {
        details.push(...validateReasoningTextFields(lineage, lineageField, ["id", "rationale"]));
        details.push(...validateEntryIdList(lineage.sourceIds, `${lineageField}.sourceIds`, false));
      }
    }
  }
  if (
    !isRecord(value.costlyProblem) ||
    !hasOnlyFields(value.costlyProblem, ["description", "materialConsequence", "observationIds"])
  ) {
    details.push(`${field}.costlyProblem must be specific and evidence-linked.`);
  } else {
    details.push(...validateReasoningTextFields(value.costlyProblem, `${field}.costlyProblem`, ["description"]));
    if (![
      "lost-money",
      "wasted-skilled-time",
      "blocked-revenue",
      "operational-risk",
      "compliance-exposure",
      "workaround-expenditure",
    ].includes(String(value.costlyProblem.materialConsequence))) {
      details.push(`${field}.costlyProblem.materialConsequence must identify a material consequence.`);
    }
    details.push(
      ...validateEntryIdList(
        value.costlyProblem.observationIds,
        `${field}.costlyProblem.observationIds`,
        keepsExplorationThread,
      ),
    );
  }
  if (
    !isRecord(value.clusterBasis) ||
    !hasOnlyFields(value.clusterBasis, ["sharedCustomer", "sharedWorkflow", "sharedCostlyConsequence"])
  ) {
    details.push(`${field}.clusterBasis must explain the shared customer, workflow, and costly consequence.`);
  } else {
    details.push(...validateReasoningTextFields(value.clusterBasis, `${field}.clusterBasis`, [
      "sharedCustomer",
      "sharedWorkflow",
      "sharedCostlyConsequence",
    ]));
  }
  if (!isRecord(value.result) || !isRecord(value.decision)) {
    details.push(`${field}.result and decision must be complete.`);
  } else if (value.result.kind === "opportunity") {
    if (!hasOnlyFields(value.result, ["kind", "opportunityId"]) || typeof value.result.opportunityId !== "string" || value.result.opportunityId.trim() === "") {
      details.push(`${field}.result must identify the formed Opportunity.`);
    }
    if (value.decision.kind !== "opportunity-formation" || value.decision.outcome !== "formed") {
      details.push(`${field}.decision must record the matching formed outcome.`);
    }
  } else if (value.result.kind === "exploration-thread") {
    if (!hasOnlyFields(value.result, ["kind", "evidenceGaps"]) || !Array.isArray(value.result.evidenceGaps) || value.result.evidenceGaps.length === 0) {
      details.push(`${field}.result must retain explicit Evidence Gaps.`);
    } else {
      for (const [index, gap] of value.result.evidenceGaps.entries()) {
        details.push(...validateEvidenceGap(gap, `${field}.result.evidenceGaps[${index}]`));
      }
    }
    if (value.decision.kind !== "opportunity-formation" || value.decision.outcome !== "insufficient-evidence") {
      details.push(`${field}.decision must record the matching insufficient-evidence outcome.`);
    }
  } else {
    details.push(`${field}.result.kind must be opportunity or exploration-thread.`);
  }
  details.push(...validateCampaignDecision(value.decision, recordedAt, `${field}.decision`));
  return details;
}

function validateRecordOpportunityFormationFields(command: Record<string, unknown>): string[] {
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  const details = validatePublicResearchCommandBase(command.payload, "recordedAt");
  const allocation = command.payload.allocation;
  if (!isRecord(allocation) || !hasOnlyFields(allocation, ["discoveryReservationIds", "shallowProblemMiningReservationIds"])) {
    details.push("payload.allocation must classify discovery and shallow problem-mining reservations.");
  } else {
    details.push(
      ...validateEntryIdList(allocation.discoveryReservationIds, "payload.allocation.discoveryReservationIds", false),
      ...validateEntryIdList(allocation.shallowProblemMiningReservationIds, "payload.allocation.shallowProblemMiningReservationIds", false),
    );
  }
  if (!Array.isArray(command.payload.assessments) || command.payload.assessments.length === 0) {
    details.push("payload.assessments must contain at least one formation assessment.");
  } else {
    for (const [index, assessment] of command.payload.assessments.entries()) {
      details.push(...validateOpportunityFormationAssessment(assessment, command.payload.recordedAt, `payload.assessments[${index}]`));
    }
  }
  return details;
}

function validateBreadthGate(value: unknown, recordedAt: unknown, field = "payload.gate"): string[] {
  if (!isRecord(value) || !hasOnlyFields(value, [
    "id",
    "comparisonOpportunityIds",
    "diminishingReturns",
    "decisionValuePriorities",
    "decision",
  ])) {
    return [`${field} must contain the complete Breadth Gate evidence.`];
  }
  const details = validateReasoningTextFields(value, field, ["id"]);
  details.push(...validateEntryIdList(value.comparisonOpportunityIds, `${field}.comparisonOpportunityIds`, false));
  if (!Array.isArray(value.diminishingReturns) || value.diminishingReturns.length !== 2) {
    details.push(`${field}.diminishingReturns must contain exactly two tranches.`);
  } else {
    for (const [index, tranche] of value.diminishingReturns.entries()) {
      if (!isRecord(tranche) || !hasOnlyFields(tranche, ["trancheId", "newOpportunityIds", "rationale"])) {
        details.push(`${field}.diminishingReturns[${index}] must be complete.`);
      } else {
        details.push(...validateReasoningTextFields(tranche, `${field}.diminishingReturns[${index}]`, ["trancheId", "rationale"]));
        details.push(...validateEntryIdList(tranche.newOpportunityIds, `${field}.diminishingReturns[${index}].newOpportunityIds`, true));
      }
    }
  }
  if (!Array.isArray(value.decisionValuePriorities) || value.decisionValuePriorities.length === 0) {
    details.push(`${field}.decisionValuePriorities must contain qualitative decision-changing research.`);
  } else {
    for (const [index, priority] of value.decisionValuePriorities.entries()) {
      const priorityField = `${field}.decisionValuePriorities[${index}]`;
      if (!isRecord(priority) || !hasOnlyFields(priority, ["id", "researchQuestion", "target", "rationale"])) {
        details.push(`${priorityField} must be a complete qualitative Decision Value priority.`);
        continue;
      }
      details.push(...validateReasoningTextFields(priority, priorityField, ["id", "researchQuestion", "rationale"]));
      if (!isRecord(priority.target) || !hasOnlyFields(priority.target, ["kind", "id"]) || !["formation", "gate", "contradiction", "comparison"].includes(String(priority.target.kind))) {
        details.push(`${priorityField}.target must name a formation, gate, Contradiction, or comparison.`);
      } else {
        details.push(...validateReasoningTextFields(priority.target, `${priorityField}.target`, ["id"]));
      }
    }
  }
  if (isRecord(value.decision) && (value.decision.kind !== "breadth-gate" || value.decision.outcome !== "passed")) {
    details.push(`${field}.decision must record the passed Breadth Gate.`);
  }
  details.push(...validateCampaignDecision(value.decision, recordedAt, `${field}.decision`));
  return details;
}

function validatePassBreadthGateFields(command: Record<string, unknown>): string[] {
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  return [
    ...validatePublicResearchCommandBase(command.payload, "recordedAt"),
    ...validateBreadthGate(command.payload.gate, command.payload.recordedAt),
  ];
}

function validateOpportunityGateDecision(
  value: unknown,
  recordedAt: unknown,
  field: string,
): string[] {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, [
      "type",
      "id",
      "kind",
      "outcome",
      "opportunityId",
      "intakeVersion",
      "applicableRule",
      "supportingEvidenceEntryIds",
      "challengingEvidenceEntryIds",
      "evidenceGapIds",
      "contradictionIds",
      "rationale",
      "confidence",
      "limitations",
      "decidedAt",
    ]) ||
    value.type !== "campaign-decision" ||
    value.kind !== "exclusion-gate"
  ) {
    return [`${field} must be a complete Exclusion Gate Campaign Decision.`];
  }
  const details = validateReasoningTextFields(value, field, [
    "id",
    "opportunityId",
    "applicableRule",
    "rationale",
  ]);
  if (!["passed", "failed", "unresolved"].includes(String(value.outcome))) {
    details.push(`${field}.outcome must be passed, failed, or unresolved.`);
  }
  if (!Number.isSafeInteger(value.intakeVersion) || Number(value.intakeVersion) <= 0) {
    details.push(`${field}.intakeVersion must be a positive safe integer.`);
  }
  details.push(
    ...validateEntryIdList(
      value.supportingEvidenceEntryIds,
      `${field}.supportingEvidenceEntryIds`,
      value.outcome === "unresolved",
    ),
    ...validateEntryIdList(
      value.challengingEvidenceEntryIds,
      `${field}.challengingEvidenceEntryIds`,
      true,
    ),
    ...validateEntryIdList(value.evidenceGapIds, `${field}.evidenceGapIds`, true),
    ...validateEntryIdList(value.contradictionIds, `${field}.contradictionIds`, true),
    ...validateEvidenceConfidence(value.confidence, `${field}.confidence`),
    ...validateAssessmentLimitations(value.limitations, field),
  );
  if (!isIsoInstant(value.decidedAt) || value.decidedAt !== recordedAt) {
    details.push(`${field}.decidedAt must equal the operation's recordedAt instant.`);
  }
  const terminal = value.outcome === "passed" || value.outcome === "failed";
  if (
    terminal &&
    (!isRecord(value.confidence) ||
      !["medium", "high"].includes(String(value.confidence.level)))
  ) {
    details.push(`${field} requires medium or high Evidence Confidence for a terminal gate state.`);
  }
  if (
    terminal &&
    ((Array.isArray(value.evidenceGapIds) && value.evidenceGapIds.length > 0) ||
      (Array.isArray(value.contradictionIds) && value.contradictionIds.length > 0))
  ) {
    details.push(`${field} cannot reach a terminal gate state with a decision-changing gap or Contradiction.`);
  }
  return details;
}

function validateExclusionGate(
  value: unknown,
  opportunityId: unknown,
  recordedAt: unknown,
  field: string,
): string[] {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, ["id", "state", "decision"])
  ) {
    return [`${field} must be a complete Exclusion Gate.`];
  }
  const details = validateReasoningTextFields(value, field, ["id"]);
  if (!["passed", "failed", "unresolved"].includes(String(value.state))) {
    details.push(`${field}.state must be passed, failed, or unresolved.`);
  }
  details.push(
    ...validateOpportunityGateDecision(value.decision, recordedAt, `${field}.decision`),
  );
  if (
    isRecord(value.decision) &&
    (value.decision.outcome !== value.state ||
      value.decision.opportunityId !== opportunityId)
  ) {
    details.push(`${field}.decision must match the gate state and Opportunity.`);
  }
  return details;
}

function validateOpportunityExclusionAssessment(
  value: unknown,
  recordedAt: unknown,
  field: string,
): string[] {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, [
      "id",
      "opportunityId",
      "marketSafety",
      "hardConstraints",
    ])
  ) {
    return [`${field} must be a complete Opportunity exclusion assessment.`];
  }
  const details = validateReasoningTextFields(value, field, ["id", "opportunityId"]);
  if (
    !isRecord(value.marketSafety) ||
    !hasOnlyFields(value.marketSafety, [
      "classification",
      "intendedActivity",
      "excludedCategory",
      "directlyServesExcludedActivity",
      "gate",
    ])
  ) {
    details.push(`${field}.marketSafety must record the intended-activity classification and gate.`);
  } else {
    const market = value.marketSafety;
    details.push(
      ...validateReasoningTextFields(market, `${field}.marketSafety`, ["intendedActivity"]),
      ...validateExclusionGate(
        market.gate,
        value.opportunityId,
        recordedAt,
        `${field}.marketSafety.gate`,
      ),
    );
    if (
      !["ordinary", "elevated-risk", "excluded-market", "unresolved"].includes(
        String(market.classification),
      )
    ) {
      details.push(`${field}.marketSafety.classification is not supported.`);
    }
    if (
      market.excludedCategory !== null &&
      (typeof market.excludedCategory !== "string" || market.excludedCategory.trim() === "")
    ) {
      details.push(`${field}.marketSafety.excludedCategory must be null or a non-empty category.`);
    }
    const state = isRecord(market.gate) ? market.gate.state : undefined;
    const matchesClassification =
      (market.classification === "excluded-market" &&
        market.directlyServesExcludedActivity === true &&
        typeof market.excludedCategory === "string" &&
        market.excludedCategory.trim() !== "" &&
        state === "failed") ||
      (["ordinary", "elevated-risk"].includes(String(market.classification)) &&
        market.directlyServesExcludedActivity === false &&
        market.excludedCategory === null &&
        state === "passed") ||
      (market.classification === "unresolved" &&
        market.directlyServesExcludedActivity === null &&
        state === "unresolved");
    if (!matchesClassification) {
      details.push(`${field}.marketSafety may fail only for affirmative direct service to a named excluded category; missing evidence must remain unresolved.`);
    }
  }
  if (!Array.isArray(value.hardConstraints)) {
    details.push(`${field}.hardConstraints must be an array.`);
  } else {
    for (const [index, constraint] of value.hardConstraints.entries()) {
      const constraintField = `${field}.hardConstraints[${index}]`;
      if (
        !isRecord(constraint) ||
        !hasOnlyFields(constraint, ["hardConstraintId", "gate"])
      ) {
        details.push(`${constraintField} must link one Hard Constraint and Exclusion Gate.`);
        continue;
      }
      details.push(
        ...validateReasoningTextFields(constraint, constraintField, ["hardConstraintId"]),
        ...validateExclusionGate(
          constraint.gate,
          value.opportunityId,
          recordedAt,
          `${constraintField}.gate`,
        ),
      );
    }
  }
  return details;
}

function validateRecordOpportunityExclusionGatesFields(
  command: Record<string, unknown>,
): string[] {
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  const details = validatePublicResearchCommandBase(command.payload, "recordedAt");
  if (!Array.isArray(command.payload.assessments) || command.payload.assessments.length === 0) {
    details.push("payload.assessments must contain every formed Opportunity.");
  } else {
    for (const [index, assessment] of command.payload.assessments.entries()) {
      details.push(
        ...validateOpportunityExclusionAssessment(
          assessment,
          command.payload.recordedAt,
          `payload.assessments[${index}]`,
        ),
      );
    }
  }
  return details;
}

function validateResearchApprovalTextList(
  value: unknown,
  field: string,
  allowEmpty: boolean,
): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    return [`${field} must be ${allowEmpty ? "an" : "a non-empty"} array.`];
  }
  const details: string[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || item.trim() === "") {
      details.push(`${field}[${index}] must be a non-empty string.`);
    }
    details.push(...validatePersistableText(item, `${field}[${index}]`));
  }
  return details;
}

function validateResearchApprovalRequest(
  value: unknown,
  requestedAt: unknown,
  field = "payload.request",
): string[] {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, [
      "id",
      "access",
      "action",
      ...(value.opportunityId === undefined ? [] : ["opportunityId"]),
      ...(value.researchDepth === undefined ? [] : ["researchDepth"]),
      "purpose",
      "source",
      "accessMethod",
      "data",
      "externalEffects",
      "maximumCost",
      "risks",
      "duration",
      "alternatives",
      "lawfulActivity",
      "externalValidationAction",
    ])
  ) {
    return [`${field} must contain the complete scoped Research Approval request.`];
  }
  const details: string[] = [];
  for (const textField of ["id", "purpose"] as const) {
    if (typeof value[textField] !== "string" || value[textField].trim() === "") {
      details.push(`${field}.${textField} must be a non-empty string.`);
    }
    details.push(
      ...validatePersistableText(value[textField], `${field}.${textField}`),
    );
  }
  if (!( ["restricted", "paid", "restricted-and-paid", "elevated-risk"] as unknown[]).includes(value.access)) {
    details.push(`${field}.access must be restricted, paid, restricted-and-paid, or elevated-risk.`);
  }
  if (value.action !== "read-source") {
    details.push(
      `${field}.action must be read-source; Research Approval cannot authorize an External Validation Action.`,
    );
  }
  const accessMethods = {
    restricted: "developer-controlled-authenticated-read-only",
    paid: "developer-approved-paid-read-only",
    "restricted-and-paid":
      "developer-controlled-authenticated-and-paid-read-only",
    "elevated-risk": "public-read-only",
  } as const;
  if (
    typeof value.access !== "string" ||
    !(value.access in accessMethods) ||
    value.accessMethod !== accessMethods[value.access as keyof typeof accessMethods]
  ) {
    details.push(
      `${field}.accessMethod must be the read-only method matching its access type.`,
    );
  }
  if (value.access === "elevated-risk") {
    if (
      typeof value.opportunityId !== "string" ||
      value.opportunityId.trim() === ""
    ) {
      details.push(`${field}.opportunityId must identify the Elevated-Risk Opportunity.`);
    }
    if (value.researchDepth !== "deep") {
      details.push(`${field}.researchDepth must be deep for Elevated-Risk Opportunity research.`);
    }
  } else if (
    value.opportunityId !== undefined ||
    value.researchDepth !== undefined
  ) {
    details.push(`${field}.opportunityId and researchDepth are reserved for Elevated-Risk Opportunity approval.`);
  }
  if (
    !isRecord(value.source) ||
    !hasOnlyFields(value.source, ["id", "description", "url"])
  ) {
    details.push(`${field}.source must identify id, description, and URL.`);
  } else {
    for (const sourceField of ["id", "description"] as const) {
      if (
        typeof value.source[sourceField] !== "string" ||
        value.source[sourceField].trim() === ""
      ) {
        details.push(`${field}.source.${sourceField} must be a non-empty string.`);
      }
      details.push(
        ...validatePersistableText(
          value.source[sourceField],
          `${field}.source.${sourceField}`,
        ),
      );
    }
    if (typeof value.source.url !== "string") {
      details.push(`${field}.source.url must be an HTTP or HTTPS URL without credentials.`);
    } else {
      try {
        const sourceUrl = new URL(value.source.url);
        if (
          !["http:", "https:"].includes(sourceUrl.protocol) ||
          sourceUrl.username !== "" ||
          sourceUrl.password !== "" ||
          [...sourceUrl.searchParams.keys()].some((name) =>
            /^(?:password|secret|token|access_token|api_key|authorization|session)$/i.test(name),
          )
        ) {
          details.push(`${field}.source.url must be an HTTP or HTTPS URL without credentials.`);
        }
      } catch {
        details.push(`${field}.source.url must be a valid HTTP or HTTPS URL.`);
      }
    }
  }
  if (!isRecord(value.data) || !hasOnlyFields(value.data, ["accessed", "retained"])) {
    details.push(`${field}.data must state accessed and retained data.`);
  } else {
    details.push(
      ...validateResearchApprovalTextList(
        value.data.accessed,
        `${field}.data.accessed`,
        false,
      ),
      ...validateResearchApprovalTextList(
        value.data.retained,
        `${field}.data.retained`,
        true,
      ),
    );
  }
  details.push(
    ...validateResearchApprovalTextList(
      value.externalEffects,
      `${field}.externalEffects`,
      true,
    ),
    ...validateResearchApprovalTextList(value.risks, `${field}.risks`, false),
    ...validateResearchApprovalTextList(
      value.alternatives,
      `${field}.alternatives`,
      false,
    ),
  );
  if (Array.isArray(value.externalEffects) && value.externalEffects.length !== 0) {
    details.push(
      `${field}.externalEffects must be empty; Research Approval is read-only and cannot authorize market interaction.`,
    );
  }
  if (
    !isRecord(value.maximumCost) ||
    !hasOnlyFields(value.maximumCost, ["amount", "currency"]) ||
    typeof value.maximumCost.amount !== "number" ||
    !Number.isFinite(value.maximumCost.amount) ||
    value.maximumCost.amount < 0 ||
    typeof value.maximumCost.currency !== "string" ||
    value.maximumCost.currency.trim() === ""
  ) {
    details.push(`${field}.maximumCost must state a non-negative amount and currency.`);
  } else if (
    (value.access === "paid" || value.access === "restricted-and-paid") &&
    value.maximumCost.amount <= 0
  ) {
    details.push(`${field}.maximumCost.amount must be positive for paid access.`);
  } else if (
    ["restricted", "elevated-risk"].includes(String(value.access)) &&
    value.maximumCost.amount !== 0
  ) {
    details.push(`${field}.maximumCost.amount must be zero for non-paid access.`);
  }
  if (
    !isRecord(value.duration) ||
    !hasOnlyFields(value.duration, ["startsAt", "expiresAt"]) ||
    !isIsoInstant(value.duration.startsAt) ||
    !isIsoInstant(value.duration.expiresAt) ||
    value.duration.expiresAt <= value.duration.startsAt
  ) {
    details.push(`${field}.duration must have increasing ISO 8601 UTC startsAt and expiresAt instants.`);
  } else if (isIsoInstant(requestedAt) && value.duration.startsAt < requestedAt) {
    details.push(`${field}.duration.startsAt cannot predate payload.requestedAt.`);
  }
  if (value.lawfulActivity !== true) {
    details.push(`${field}.lawfulActivity must be true; approval cannot authorize unlawful activity.`);
  }
  if (value.externalValidationAction !== false) {
    details.push(`${field}.externalValidationAction must be false; Research Approval cannot authorize an External Validation Action.`);
  }
  return details;
}

function validateRequestResearchApprovalFields(
  command: Record<string, unknown>,
): string[] {
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  return [
    ...validatePublicResearchCommandBase(command.payload, "requestedAt"),
    ...validateResearchApprovalRequest(
      command.payload.request,
      command.payload.requestedAt,
    ),
  ];
}

function validateRecordResearchApprovalInformationFields(
  command: Record<string, unknown>,
): string[] {
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  const details = validatePublicResearchCommandBase(
    command.payload,
    "recordedAt",
  );
  if (
    typeof command.payload.decisionId !== "string" ||
    command.payload.decisionId.trim() === ""
  ) {
    details.push("payload.decisionId must be a non-empty string.");
  }
  const information = command.payload.information;
  if (
    !isRecord(information) ||
    !hasOnlyFields(information, ["id", "question", "explanation"])
  ) {
    details.push("payload.information must contain id, question, and explanation.");
  } else {
    for (const field of ["id", "question", "explanation"] as const) {
      if (
        typeof information[field] !== "string" ||
        information[field].trim() === ""
      ) {
        details.push(`payload.information.${field} must be a non-empty string.`);
      }
      details.push(
        ...validatePersistableText(
          information[field],
          `payload.information.${field}`,
        ),
      );
    }
  }
  return details;
}

function validateRespondResearchApprovalFields(
  command: Record<string, unknown>,
): string[] {
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  const details = validatePublicResearchCommandBase(
    command.payload,
    "respondedAt",
  );
  if (
    typeof command.payload.decisionId !== "string" ||
    command.payload.decisionId.trim() === ""
  ) {
    details.push("payload.decisionId must be a non-empty string.");
  }
  const response = command.payload.response;
  if (
    isRecord(response) &&
    response.kind === "refuse" &&
    hasOnlyFields(response, ["kind", "refusal"])
  ) {
    const refusal = response.refusal;
    if (
      !isRecord(refusal) ||
      !hasOnlyFields(refusal, [
        "id",
        "explicitlyRefused",
        "rationale",
        "evidenceGap",
      ])
    ) {
      details.push("payload.response.refusal must contain the complete explicit refusal and resulting Evidence Gap.");
      return details;
    }
    for (const field of ["id", "rationale"] as const) {
      if (typeof refusal[field] !== "string" || refusal[field].trim() === "") {
        details.push(`payload.response.refusal.${field} must be a non-empty string.`);
      }
      details.push(
        ...validatePersistableText(
          refusal[field],
          `payload.response.refusal.${field}`,
        ),
      );
    }
    if (refusal.explicitlyRefused !== true) {
      details.push("payload.response.refusal.explicitlyRefused must be true.");
    }
    details.push(
      ...validateEvidenceGap(
        refusal.evidenceGap,
        "payload.response.refusal.evidenceGap",
      ),
    );
    return details;
  }
  if (
    !isRecord(response) ||
    !hasOnlyFields(response, ["kind", "approval"]) ||
    response.kind !== "approve" ||
    !isRecord(response.approval) ||
    !hasOnlyFields(response.approval, ["id", "explicitlyApproved", "scope"])
  ) {
    details.push("payload.response must be one complete explicit approval.");
    return details;
  }
  if (
    typeof response.approval.id !== "string" ||
    response.approval.id.trim() === ""
  ) {
    details.push("payload.response.approval.id must be a non-empty string.");
  }
  if (response.approval.explicitlyApproved !== true) {
    details.push("payload.response.approval.explicitlyApproved must be true.");
  }
  details.push(
    ...validateResearchApprovalRequest(
      response.approval.scope,
      isRecord(response.approval.scope) && isRecord(response.approval.scope.duration)
        ? response.approval.scope.duration.startsAt
        : undefined,
      "payload.response.approval.scope",
    ),
  );
  return details;
}

function validateRecordResearchExpenditureFields(
  command: Record<string, unknown>,
): string[] {
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  const details = validatePublicResearchCommandBase(
    command.payload,
    "incurredAt",
  );
  const expenditure = command.payload.expenditure;
  if (
    !isRecord(expenditure) ||
    !hasOnlyFields(expenditure, [
      "id",
      "approvalId",
      "sourceId",
      "purpose",
      "amount",
      "currency",
    ])
  ) {
    details.push("payload.expenditure must contain only identity, approval provenance, Source, purpose, amount, and currency.");
    return details;
  }
  for (const field of ["id", "approvalId", "sourceId", "purpose", "currency"] as const) {
    if (typeof expenditure[field] !== "string" || expenditure[field].trim() === "") {
      details.push(`payload.expenditure.${field} must be a non-empty string.`);
    }
    details.push(
      ...validatePersistableText(
        expenditure[field],
        `payload.expenditure.${field}`,
      ),
    );
  }
  if (
    typeof expenditure.amount !== "number" ||
    !Number.isFinite(expenditure.amount) ||
    expenditure.amount <= 0
  ) {
    details.push("payload.expenditure.amount must be a positive finite number.");
  }
  return details;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await lstat(targetPath);
    return true;
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function writePrivateJson(targetPath: string, value: unknown): Promise<void> {
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(targetPath, 0o600);
}

async function replacePrivateJson(targetPath: string, value: unknown): Promise<void> {
  const temporaryDirectory = await mkdtemp(
    path.join(path.dirname(targetPath), ".svs-write-"),
  );
  await chmod(temporaryDirectory, 0o700);
  try {
    const temporaryPath = path.join(temporaryDirectory, path.basename(targetPath));
    await writePrivateJson(temporaryPath, value);
    await rename(temporaryPath, targetPath);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

type CoordinatorOperationLock = {
  path: string;
  token: string;
};

async function acquireCoordinatorOperationLock(
  campaignPath: string,
  requestId: string,
  coordinatorId: string,
  acquiredAt: string,
): Promise<CoordinatorOperationLock | undefined> {
  const lockDirectory = path.join(campaignPath, ".coordinator-locks");
  await mkdir(lockDirectory, { recursive: true, mode: 0o700 });
  await chmod(lockDirectory, 0o700);
  const token = randomUUID();
  const lockPath = path.join(lockDirectory, `${token}.json`);
  const candidatePath = path.join(lockDirectory, `.${token}.tmp`);
  const expiresAt = new Date(
    new Date(acquiredAt).valueOf() + 5 * 60 * 1_000,
  ).toISOString();
  await writePrivateJson(candidatePath, {
    version: contracts.records,
    token,
    requestId,
    coordinatorId,
    acquiredAt,
    expiresAt,
  });
  await rename(candidatePath, lockPath);

  try {
    for (const entry of await readdir(lockDirectory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const contenderPath = path.join(lockDirectory, entry.name);
      let contender: unknown;
      try {
        contender = await readJson(contenderPath);
      } catch {
        if (contenderPath !== lockPath) {
          await rm(lockPath, { force: true });
          return undefined;
        }
        throw new Error("coordinator operation lock is unreadable");
      }
      if (
        !isRecord(contender) ||
        typeof contender.token !== "string" ||
        entry.name !== `${contender.token}.json` ||
        !isIsoInstant(contender.acquiredAt) ||
        !isIsoInstant(contender.expiresAt) ||
        contender.expiresAt <= contender.acquiredAt
      ) {
        if (contenderPath !== lockPath) {
          await rm(lockPath, { force: true });
          return undefined;
        }
        throw new Error("coordinator operation lock is invalid");
      }
      if (contender.expiresAt <= acquiredAt) {
        await rm(contenderPath, { force: true });
        continue;
      }
      if (contenderPath !== lockPath) {
        await rm(lockPath, { force: true });
        return undefined;
      }
    }
    return { path: lockPath, token };
  } catch (error) {
    await rm(lockPath, { force: true });
    throw error;
  }
}

async function releaseCoordinatorOperationLock(
  lock: CoordinatorOperationLock,
): Promise<void> {
  await rm(lock.path, { force: true });
}

type AuthoritativeHistoryRebuild = {
  campaignId: string;
  intake?: ConfirmedCampaignIntake;
  reservations: Map<string, PublicResearchReservation>;
  reservationRecordedAt: Map<string, string>;
  settledReservationIds: Set<string>;
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
  discoveryTranches: DiscoveryTranche[];
  opportunityFormations: OpportunityFormation[];
  breadthGates: BreadthGate[];
  opportunityExclusionEvaluations: OpportunityExclusionEvaluation[];
  campaignDecisions: CampaignDecision[];
  researchApprovalDecisions: PendingResearchApprovalDecision[];
  researchApprovalInformation: RecordedResearchApprovalInformation[];
  researchApprovalResponses: RecordedResearchApprovalResponse[];
  researchApprovals: ResearchApproval[];
  researchExpenditures: ResearchExpenditure[];
};

type AuthoritativeRecordPair = {
  intent: Record<string, unknown>;
  outcome: Record<string, unknown>;
  outcomeSequence: number;
  history: AuthoritativeHistoryRebuild;
};

type AuthoritativeOperationDescriptor = {
  outcome: string;
  position: "initial" | "subsequent";
  establishesLease: boolean;
  validateAndApply: (pair: AuthoritativeRecordPair) => void;
};

function activeResearchApprovalDecision(
  history: Pick<
    AuthoritativeHistoryRebuild,
    "researchApprovalDecisions" | "researchApprovalResponses"
  >,
) {
  return history.researchApprovalDecisions.find(
    (decision) =>
      !history.researchApprovalResponses.some(
        (response) => response.decisionId === decision.id,
      ),
  );
}

type PublicResearchAllocationViolation =
  | "required"
  | "not-available"
  | "imbalanced";

function publicResearchAllocationViolation(
  history: AuthoritativeHistoryRebuild,
  reservation: PublicResearchReservation,
): PublicResearchAllocationViolation | undefined {
  const breadthGatePassed = history.breadthGates.length > 0;
  if (breadthGatePassed && reservation.researchClass === undefined) {
    return "required";
  }
  if (!breadthGatePassed && reservation.researchClass !== undefined) {
    return "not-available";
  }
  if (!breadthGatePassed) {
    return undefined;
  }
  const postGateReservations = [...history.reservations.values()].filter(
    (existing) => existing.researchClass !== undefined,
  );
  const totalPostGateSourceUnits = postGateReservations.length + 1;
  const selectedClass = reservation.researchClass!;
  const selectedClassSourceUnits =
    postGateReservations.filter(
      (existing) => existing.researchClass === selectedClass,
    ).length + 1;
  const maximumShare = selectedClass === "deepening" ? 0.8 : 0.2;
  return selectedClassSourceUnits >
    Math.ceil(totalPostGateSourceUnits * maximumShare)
    ? "imbalanced"
    : undefined;
}

function elevatedRiskApprovalRequestViolation(
  history: AuthoritativeHistoryRebuild,
  request: ResearchApprovalRequest,
): string | undefined {
  if (request.access !== "elevated-risk") {
    return undefined;
  }
  const assessment = history.opportunityExclusionEvaluations
    .at(-1)
    ?.assessments.find(
      (candidate) => candidate.opportunityId === request.opportunityId,
    );
  if (assessment === undefined) {
    return "the approval does not identify an assessed Opportunity";
  }
  if (assessment.marketSafety.classification !== "elevated-risk") {
    return "the approval identifies an Opportunity that is not an Elevated-Risk Market";
  }
  const failedGate = [
    assessment.marketSafety.gate,
    ...assessment.hardConstraints.map((constraint) => constraint.gate),
  ].find((gate) => gate.state === "failed");
  return failedGate === undefined
    ? undefined
    : `the approval cannot override failed Exclusion Gate ${failedGate.id}`;
}

type OpportunityDeepeningViolation = "ineligible" | "required" | "scope";

function opportunityDeepeningViolation(
  history: AuthoritativeHistoryRebuild,
  reservation: PublicResearchReservation,
  reservedAt: string,
): OpportunityDeepeningViolation | undefined {
  if (
    reservation.researchClass !== "deepening" ||
    history.opportunityExclusionEvaluations.length === 0
  ) {
    return undefined;
  }
  const assessments = history.opportunityExclusionEvaluations.at(-1)!.assessments;
  if (reservation.opportunityId === undefined) {
    return "ineligible";
  }
  const assessment = assessments.find(
    (candidate) => candidate.opportunityId === reservation.opportunityId,
  );
  if (assessment === undefined) {
    return "ineligible";
  }
  const gates = [
    assessment.marketSafety.gate,
    ...assessment.hardConstraints.map((constraint) => constraint.gate),
  ];
  if (gates.some((gate) => gate.state !== "passed")) {
    return "ineligible";
  }
  const targetsElevatedRisk =
    assessment.marketSafety.classification === "elevated-risk";
  if (!targetsElevatedRisk && reservation.approvalId === undefined) {
    return undefined;
  }
  if (reservation.approvalId === undefined) {
    return "required";
  }
  const approval = history.researchApprovals.find(
    (candidate) => candidate.id === reservation.approvalId,
  );
  if (
    approval === undefined ||
    approval.scope.access !== "elevated-risk" ||
    approval.scope.opportunityId !== reservation.opportunityId ||
    approval.scope.researchDepth !== "deep" ||
    approval.scope.purpose !== reservation.purpose ||
    reservedAt < approval.approvedAt ||
    reservedAt < approval.scope.duration.startsAt ||
    reservedAt > approval.scope.duration.expiresAt
  ) {
    return "scope";
  }
  return undefined;
}

function hasElevatedRiskResearchApproval(
  history: AuthoritativeHistoryRebuild,
  opportunityId: string,
): boolean {
  return history.researchApprovals.some(
    (approval) =>
      approval.scope.access === "elevated-risk" &&
      approval.scope.opportunityId === opportunityId &&
      approval.scope.researchDepth === "deep",
  );
}

function publicResearchApprovalScopeMismatch(
  history: AuthoritativeHistoryRebuild,
  reservationId: string,
  source: PublicSource,
): boolean {
  const reservation = history.reservations.get(reservationId);
  if (reservation?.approvalId === undefined) {
    return false;
  }
  const approval = history.researchApprovals.find(
    (candidate) => candidate.id === reservation.approvalId,
  );
  return (
    approval === undefined ||
    approval.scope.source.id !== source.id ||
    approval.scope.source.url !== source.url
  );
}

type ResearchExpenditurePolicyViolation =
  | "scope"
  | "duration"
  | "approval-budget"
  | "campaign-budget";

function researchExpenditurePolicyViolation({
  expenditure,
  approval,
  intake,
  existingExpenditures,
}: {
  expenditure: ResearchExpenditure;
  approval: ResearchApproval;
  intake: ConfirmedCampaignIntake;
  existingExpenditures: ResearchExpenditure[];
}): ResearchExpenditurePolicyViolation | undefined {
  if (
    !["paid", "restricted-and-paid"].includes(approval.scope.access) ||
    expenditure.approvalDecisionId !== approval.decisionId ||
    expenditure.sourceId !== approval.scope.source.id ||
    expenditure.purpose !== approval.scope.purpose ||
    expenditure.currency !== approval.scope.maximumCost.currency ||
    expenditure.currency !== intake.researchBudget.paidSpendCap.currency
  ) {
    return "scope";
  }
  if (
    expenditure.incurredAt < approval.approvedAt ||
    expenditure.incurredAt < approval.scope.duration.startsAt ||
    expenditure.incurredAt > approval.scope.duration.expiresAt
  ) {
    return "duration";
  }
  const approvalSpend = existingExpenditures
    .filter((existing) => existing.approvalId === approval.id)
    .reduce((total, existing) => total + existing.amount, 0);
  if (approvalSpend + expenditure.amount > approval.scope.maximumCost.amount) {
    return "approval-budget";
  }
  const campaignSpend = existingExpenditures.reduce(
    (total, existing) => total + existing.amount,
    0,
  );
  return campaignSpend + expenditure.amount > intake.researchBudget.paidSpendCap.amount
    ? "campaign-budget"
    : undefined;
}

function invalidAuthoritativeRecord(sequence: number): never {
  throw new Error(`authoritative record ${sequence} is invalid`);
}

type ReasoningState = Omit<EvidenceLedger, "campaignId" | "campaignDecisions">;

function invalidatedEvidenceIds(state: ReasoningState): Set<string> {
  const invalidatedIds = new Set(
    state.corrections.map((correction) => correction.targetEntryId),
  );
  let foundDependentInference = true;
  while (foundDependentInference) {
    foundDependentInference = false;
    for (const inference of state.inferences) {
      if (
        !invalidatedIds.has(inference.id) &&
        [...inference.supportingEntryIds, ...inference.challengingEntryIds].some(
          (identity) => invalidatedIds.has(identity),
        )
      ) {
        invalidatedIds.add(inference.id);
        foundDependentInference = true;
      }
    }
  }
  return invalidatedIds;
}

function allReasoningEntryIds(state: ReasoningState): Set<string> {
  return new Set([
    ...state.sources.map((source) => source.id),
    ...state.observations.map((observation) => observation.id),
    ...state.sourceLineages.map((lineage) => lineage.id),
    ...state.sourceCredibilities.map((credibility) => credibility.id),
    ...state.sourceFreshnesses.map((freshness) => freshness.id),
    ...state.evidenceGaps.map((gap) => gap.id),
    ...state.assumptions.map((assumption) => assumption.id),
    ...state.inferences.map((inference) => inference.id),
    ...state.contradictions.map((contradiction) => contradiction.id),
    ...state.corrections.map((correction) => correction.id),
  ]);
}

function applyReasoningEntries(
  state: ReasoningState,
  entries: ReasoningEntry[],
): string | undefined {
  const allEntryIds = allReasoningEntryIds(state);
  const sourceIds = new Set(state.sources.map((source) => source.id));
  const observationsById = new Map(
    state.observations.map((observation) => [observation.id, observation]),
  );
  const evidenceGapIds = new Set(state.evidenceGaps.map((gap) => gap.id));
  const contradictableEntryIds = new Set([
    ...state.observations.map((observation) => observation.id),
    ...state.assumptions.map((assumption) => assumption.id),
    ...state.inferences.map((inference) => inference.id),
  ]);
  const correctableEntryIds = new Set(
    [...allEntryIds].filter(
      (identity) =>
        !state.corrections.some((correction) => correction.id === identity),
    ),
  );
  const correctedEntryIds = new Set(
    state.corrections.map((correction) => correction.targetEntryId),
  );
  const availableEvidenceIds = new Set<string>();
  const refreshAvailableEvidence = () => {
    const invalidatedIds = invalidatedEvidenceIds(state);
    availableEvidenceIds.clear();
    for (const identity of [
      ...state.observations.map((observation) => observation.id),
      ...state.inferences.map((inference) => inference.id),
    ]) {
      if (!invalidatedIds.has(identity)) {
        availableEvidenceIds.add(identity);
      }
    }
  };
  refreshAvailableEvidence();

  for (const entry of entries) {
    if (
      validateReasoningEntry(entry, "entry").length > 0 ||
      allEntryIds.has(entry.id)
    ) {
      return entry.id;
    }
    switch (entry.type) {
      case "source-lineage":
        if (!entry.sourceIds.every((identity) => sourceIds.has(identity))) {
          return entry.sourceIds.find((identity) => !sourceIds.has(identity));
        }
        state.sourceLineages.push(entry);
        break;
      case "source-credibility":
        if (
          !sourceIds.has(entry.sourceId) ||
          observationsById.get(entry.observationId)?.sourceId !== entry.sourceId
        ) {
          return `${entry.sourceId}/${entry.observationId}`;
        }
        state.sourceCredibilities.push(entry);
        break;
      case "source-freshness":
        if (
          !sourceIds.has(entry.sourceId) ||
          observationsById.get(entry.observationId)?.sourceId !== entry.sourceId
        ) {
          return `${entry.sourceId}/${entry.observationId}`;
        }
        state.sourceFreshnesses.push(entry);
        break;
      case "evidence-gap":
        state.evidenceGaps.push(entry);
        evidenceGapIds.add(entry.id);
        break;
      case "assumption":
        if (!evidenceGapIds.has(entry.evidenceGapId)) {
          return entry.evidenceGapId;
        }
        state.assumptions.push(entry);
        contradictableEntryIds.add(entry.id);
        break;
      case "inference": {
        const unavailableEvidenceId = [
          ...entry.supportingEntryIds,
          ...entry.challengingEntryIds,
        ].find((identity) => !availableEvidenceIds.has(identity));
        if (unavailableEvidenceId !== undefined) {
          return unavailableEvidenceId;
        }
        state.inferences.push(entry);
        availableEvidenceIds.add(entry.id);
        contradictableEntryIds.add(entry.id);
        break;
      }
      case "contradiction": {
        const incompatibleEntryId = entry.entryIds.find(
          (identity) => !contradictableEntryIds.has(identity),
        );
        if (incompatibleEntryId !== undefined) {
          return incompatibleEntryId;
        }
        state.contradictions.push(entry);
        break;
      }
      case "correction":
        if (
          !correctableEntryIds.has(entry.targetEntryId) ||
          correctedEntryIds.has(entry.targetEntryId)
        ) {
          return entry.targetEntryId;
        }
        if (
          entry.action === "supersede" &&
          (entry.replacementEntryId === null ||
            !correctableEntryIds.has(entry.replacementEntryId))
        ) {
          return entry.replacementEntryId ?? "missing replacement";
        }
        state.corrections.push(entry);
        correctedEntryIds.add(entry.targetEntryId);
        refreshAvailableEvidence();
        break;
    }
    allEntryIds.add(entry.id);
    if (entry.type !== "correction") {
      correctableEntryIds.add(entry.id);
    }
  }
  return undefined;
}

function discoveryTrancheViolation(
  history: AuthoritativeHistoryRebuild,
  tranche: DiscoveryTranche,
): string | undefined {
  const intake = history.intake;
  if (intake === undefined) {
    return "Campaign Intake is not confirmed";
  }
  if (tranche.ordinal !== history.discoveryTranches.length + 1) {
    return "Discovery Tranche ordinal is not the next sequential ordinal";
  }
  if (history.discoveryTranches.some((existing) => existing.id === tranche.id)) {
    return `Discovery Tranche identity ${tranche.id} is already present`;
  }
  const existingSweeps = history.discoveryTranches.flatMap((existing) => existing.sweeps);
  const existingThreads = history.discoveryTranches.flatMap((existing) => existing.threads);
  if (existingSweeps.length + tranche.sweeps.length > intake.researchBudget.discoverySweepCap) {
    return "Discovery Sweeps exceed the Campaign Intake cap";
  }
  if (
    history.discoveryTranches.length > 0 &&
    tranche.shallowResearchSourceUnitsPerRetainedThread !==
      history.discoveryTranches[0]!.shallowResearchSourceUnitsPerRetainedThread
  ) {
    return "retained Exploration Threads must receive the same shallow research allowance";
  }
  const existingSweepIds = new Set(existingSweeps.map((sweep) => sweep.id));
  const existingThreadIds = new Set(existingThreads.map((thread) => thread.id));
  const existingFamilies = existingSweeps.map((sweep) => sweep.sourceFamily);
  const trancheFamilies: DiscoverySweep["sourceFamily"][] = [];
  const sourceIds = new Set(history.sources.map((source) => source.id));
  const observationsById = new Map(
    history.observations.map((observation) => [observation.id, observation]),
  );
  for (const sweep of tranche.sweeps) {
    if (existingSweepIds.has(sweep.id)) {
      return `Discovery Sweep identity ${sweep.id} is already present`;
    }
    const missingSourceId = sweep.sourceIds.find((sourceId) => !sourceIds.has(sourceId));
    if (missingSourceId !== undefined) {
      return `Discovery Sweep links unknown Source ${missingSourceId}`;
    }
    const sameIdentity = [...existingFamilies, ...trancheFamilies].find(
      (family) => family.id === sweep.sourceFamily.id,
    );
    if (
      sameIdentity !== undefined &&
      JSON.stringify(sameIdentity) !== JSON.stringify(sweep.sourceFamily)
    ) {
      return `Source Family identity ${sweep.sourceFamily.id} conflicts with its recorded definition`;
    }
    const sameMap = [...existingFamilies, ...trancheFamilies].find(
      (family) =>
        family.name === sweep.sourceFamily.name &&
        family.economicActivityMap === sweep.sourceFamily.economicActivityMap,
    );
    if (sameMap !== undefined && sameMap.id !== sweep.sourceFamily.id) {
      return `Source Family ${sweep.sourceFamily.name} is already identified as ${sameMap.id}`;
    }
    trancheFamilies.push(sweep.sourceFamily);
  }
  const sweepsById = new Map(tranche.sweeps.map((sweep) => [sweep.id, sweep]));
  const availableThreadIds = new Set(existingThreadIds);
  for (const thread of tranche.threads) {
    if (availableThreadIds.has(thread.id)) {
      return `Exploration Thread identity ${thread.id} is already present`;
    }
    const unavailableComparisonId = thread.noveltyCheck.comparedWithThreadIds.find(
      (threadId) => !availableThreadIds.has(threadId),
    );
    if (unavailableComparisonId !== undefined) {
      return `Novelty check links unavailable Exploration Thread ${unavailableComparisonId}`;
    }
    if (
      availableThreadIds.size > 0 &&
      !thread.noveltyCheck.comparedWithThreadIds.some((threadId) =>
        availableThreadIds.has(threadId),
      )
    ) {
      return `Novelty check for ${thread.id} must compare at least one earlier Exploration Thread`;
    }
    if (
      thread.noveltyCheck.result === "overlaps-existing" &&
      thread.disposition.status !== "dropped"
    ) {
      return `overlapping Exploration Thread ${thread.id} must be dropped`;
    }
    if (thread.origin.kind === "source-led" && "problemSignal" in thread) {
      const sweep = sweepsById.get(thread.origin.sweepId);
      if (sweep === undefined) {
        return `Exploration Thread ${thread.id} links unavailable Discovery Sweep ${thread.origin.sweepId}`;
      }
      const linkedObservationIds = new Set(thread.origin.observationIds);
      const allSignalObservationIds = [
        ...thread.problemSignal.materialConsequence.observationIds,
        ...thread.problemSignal.committedBehavior.observationIds,
      ];
      const unavailableObservationId = [
        ...thread.origin.observationIds,
        ...allSignalObservationIds,
      ].find((observationId) => {
        const observation = observationsById.get(observationId);
        return (
          observation === undefined ||
          !sweep.sourceIds.includes(observation.sourceId) ||
          (allSignalObservationIds.includes(observationId) &&
            !linkedObservationIds.has(observationId))
        );
      });
      if (unavailableObservationId !== undefined) {
        return `Exploration Thread ${thread.id} links unavailable sampled Observation ${unavailableObservationId}`;
      }
    }
    availableThreadIds.add(thread.id);
  }
  const noveltyEntries = tranche.threads.flatMap((thread) =>
    thread.origin.kind === "novelty-probe"
      ? [thread.origin.evidenceGap, thread.origin.assumption]
      : [],
  );
  const invalidNoveltyEntry = applyReasoningEntries(
    {
      sources: history.sources,
      observations: history.observations,
      sourceLineages: [...history.sourceLineages],
      sourceCredibilities: [...history.sourceCredibilities],
      sourceFreshnesses: [...history.sourceFreshnesses],
      evidenceGaps: [...history.evidenceGaps],
      assumptions: [...history.assumptions],
      inferences: [...history.inferences],
      contradictions: [...history.contradictions],
      corrections: [...history.corrections],
    },
    noveltyEntries,
  );
  if (invalidNoveltyEntry !== undefined) {
    return `Novelty Probe links invalid Evidence Ledger entry ${invalidNoveltyEntry}`;
  }
  const exception = tranche.familiarDomainException;
  if (
    exception !== null &&
    !intake.statements.some((statement) => statement.id === exception.intakeStatementId)
  ) {
    return `familiar-domain exception does not link Campaign Intake statement ${exception.intakeStatementId}`;
  }
  const initialThreads = [...existingThreads, ...tranche.threads];
  const familiarThreads = initialThreads.filter((thread) => thread.familiarDomain);
  const hasRecordedException = [...history.discoveryTranches, tranche].some(
    (recordedTranche) => recordedTranche.familiarDomainException !== null,
  );
  if (
    !hasRecordedException &&
    familiarThreads.length > Math.floor(initialThreads.length / 3)
  ) {
    return "familiar-domain Exploration Threads exceed one-third without a Campaign Intake exception";
  }
  return undefined;
}

function applyDiscoveryTranche(
  history: AuthoritativeHistoryRebuild,
  tranche: DiscoveryTranche,
): string | undefined {
  const violation = discoveryTrancheViolation(history, tranche);
  if (violation !== undefined) {
    return violation;
  }
  for (const thread of tranche.threads) {
    if (thread.origin.kind === "novelty-probe") {
      history.evidenceGaps.push(thread.origin.evidenceGap);
      history.assumptions.push(thread.origin.assumption);
    }
  }
  history.discoveryTranches.push(tranche);
  return undefined;
}

function opportunityFormationViolation(
  history: AuthoritativeHistoryRebuild,
  formation: OpportunityFormation,
): string | undefined {
  if (history.intake === undefined || history.discoveryTranches.length === 0) {
    return "Opportunity formation requires confirmed intake and recorded discovery";
  }
  if (history.opportunityFormations.length > 0) {
    return "Opportunity formation has already been recorded";
  }
  const discoveryReservationIds = formation.allocation.discoveryReservationIds;
  const shallowReservationIds = formation.allocation.shallowProblemMiningReservationIds;
  if (discoveryReservationIds.length !== shallowReservationIds.length) {
    return "pre-Breadth-Gate research must split Source units evenly between discovery and shallow problem mining";
  }
  const allocatedIds = [...discoveryReservationIds, ...shallowReservationIds];
  if (new Set(allocatedIds).size !== allocatedIds.length) {
    return "each research reservation must have exactly one pre-gate allocation";
  }
  const settledIds = [...history.settledReservationIds];
  if (
    allocatedIds.length !== settledIds.length ||
    allocatedIds.some((reservationId) => !history.settledReservationIds.has(reservationId))
  ) {
    return "every settled ordinary research reservation must be classified exactly once";
  }
  const retainedThreads = history.discoveryTranches
    .flatMap((tranche) => tranche.threads)
    .filter((thread) => thread.disposition.status === "retained");
  const retainedThreadsById = new Map(retainedThreads.map((thread) => [thread.id, thread]));
  const observationsById = new Map(history.observations.map((observation) => [observation.id, observation]));
  const invalidatedIds = invalidatedEvidenceIds(history);
  const assessmentIds = new Set<string>();
  const assessedThreadIds = new Set<string>();
  const opportunityIds = new Set<string>();
  const decisionIds = new Set(history.campaignDecisions.map((decision) => decision.id));
  const reasoningState: ReasoningState = {
    sources: history.sources,
    observations: history.observations,
    sourceLineages: history.sourceLineages,
    sourceCredibilities: history.sourceCredibilities,
    sourceFreshnesses: history.sourceFreshnesses,
    evidenceGaps: [...history.evidenceGaps],
    assumptions: history.assumptions,
    inferences: history.inferences,
    contradictions: history.contradictions,
    corrections: history.corrections,
  };
  for (const assessment of formation.assessments) {
    if (assessmentIds.has(assessment.id)) {
      return `Opportunity formation assessment identity ${assessment.id} is duplicated`;
    }
    assessmentIds.add(assessment.id);
    if (decisionIds.has(assessment.decision.id)) {
      return `Campaign Decision identity ${assessment.decision.id} is already present`;
    }
    decisionIds.add(assessment.decision.id);
    if (assessment.decision.intakeVersion !== history.intake.version) {
      return `Campaign Decision ${assessment.decision.id} does not use the current Campaign Intake version`;
    }
    const unavailableDecisionEvidenceId = assessment.decision.evidenceEntryIds.find(
      (entryId) => !observationsById.has(entryId) && !history.inferences.some((inference) => inference.id === entryId),
    );
    if (unavailableDecisionEvidenceId !== undefined) {
      return `Campaign Decision ${assessment.decision.id} links unavailable evidence ${unavailableDecisionEvidenceId}`;
    }
    for (const threadId of assessment.explorationThreadIds) {
      if (!retainedThreadsById.has(threadId) || assessedThreadIds.has(threadId)) {
        return `Opportunity formation links unavailable or already assessed Exploration Thread ${threadId}`;
      }
      assessedThreadIds.add(threadId);
    }
    const evidenceObservationIds = [
      ...assessment.supportingObservationIds,
      ...assessment.behavioralProblemSignalObservationIds,
      ...assessment.costlyProblem.observationIds,
    ];
    const unavailableObservationId = evidenceObservationIds.find(
      (observationId) => !observationsById.has(observationId) || invalidatedIds.has(observationId),
    );
    if (unavailableObservationId !== undefined) {
      return `Opportunity formation links unavailable Observation ${unavailableObservationId}`;
    }
    if (
      assessment.behavioralProblemSignalObservationIds.some(
        (observationId) => !assessment.supportingObservationIds.includes(observationId),
      ) ||
      assessment.costlyProblem.observationIds.some(
        (observationId) => !assessment.supportingObservationIds.includes(observationId),
      )
    ) {
      return `Opportunity formation assessment ${assessment.id} must include behavioral and Costly Problem Observations in its supporting evidence`;
    }
    const supportingSourceIds = [
      ...new Set(
        assessment.supportingObservationIds.map(
          (observationId) => observationsById.get(observationId)!.sourceId,
        ),
      ),
    ];
    const assessedLineageIds = assessment.independentSourceLineages.map(
      (lineage) => lineage.id,
    );
    const assessedLineageSourceIds = assessment.independentSourceLineages.flatMap(
      (lineage) => lineage.sourceIds,
    );
    if (
      new Set(assessedLineageIds).size !== assessedLineageIds.length ||
      new Set(assessedLineageSourceIds).size !== assessedLineageSourceIds.length ||
      assessedLineageSourceIds.length !== supportingSourceIds.length ||
      assessedLineageSourceIds.some((sourceId) => !supportingSourceIds.includes(sourceId))
    ) {
      return `Opportunity formation assessment ${assessment.id} must classify every supporting Source into exactly one reasoned Source Lineage`;
    }
    const assessedLineageBySourceId = new Map(
      assessment.independentSourceLineages.flatMap((lineage) =>
        lineage.sourceIds.map((sourceId) => [sourceId, lineage.id] as const),
      ),
    );
    const correctedEntryIds = new Set(
      history.corrections.map((correction) => correction.targetEntryId),
    );
    const contradictedLineage = history.sourceLineages.find((lineage) => {
      if (correctedEntryIds.has(lineage.id)) {
        return false;
      }
      const assessedLineageIdsForDependency = new Set(
        lineage.sourceIds
          .map((sourceId) => assessedLineageBySourceId.get(sourceId))
          .filter((lineageId): lineageId is string => lineageId !== undefined),
      );
      return assessedLineageIdsForDependency.size > 1;
    });
    if (contradictedLineage !== undefined) {
      return `Opportunity formation assessment ${assessment.id} cannot establish two independent Source Lineages because ${contradictedLineage.id} links supporting Sources as dependent`;
    }
    const lineageCount = assessment.independentSourceLineages.length;
    const hasCompleteEvidence =
      lineageCount >= 2 && assessment.behavioralProblemSignalObservationIds.length > 0;
    if (assessment.result.kind === "opportunity") {
      if (!hasCompleteEvidence) {
        return `Opportunity ${assessment.result.opportunityId} lacks two independent Source Lineages and a behavioral Problem Signal`;
      }
      if (opportunityIds.has(assessment.result.opportunityId)) {
        return `Opportunity identity ${assessment.result.opportunityId} is duplicated`;
      }
      opportunityIds.add(assessment.result.opportunityId);
    } else {
      if (hasCompleteEvidence) {
        return `Assessment ${assessment.id} must form an Opportunity when the complete formation evidence is present`;
      }
      for (const gap of assessment.result.evidenceGaps) {
        if (!gap.affectedDecisionIds.includes(assessment.decision.id)) {
          return `Evidence Gap ${gap.id} must link its Opportunity formation decision`;
        }
      }
      const invalidGapId = applyReasoningEntries(reasoningState, assessment.result.evidenceGaps);
      if (invalidGapId !== undefined) {
        return `Opportunity formation links invalid Evidence Gap ${invalidGapId}`;
      }
    }
  }
  if (assessedThreadIds.size !== retainedThreads.length) {
    const unassessedThreadId = retainedThreads.find(
      (thread) => !assessedThreadIds.has(thread.id),
    )!.id;
    return `retained Exploration Thread ${unassessedThreadId} requires an Opportunity formation assessment and explicit Evidence Gaps when unsupported`;
  }
  return undefined;
}

function applyOpportunityFormation(
  history: AuthoritativeHistoryRebuild,
  formation: OpportunityFormation,
): string | undefined {
  const violation = opportunityFormationViolation(history, formation);
  if (violation !== undefined) {
    return violation;
  }
  for (const assessment of formation.assessments) {
    if (assessment.result.kind === "exploration-thread") {
      history.evidenceGaps.push(...assessment.result.evidenceGaps);
    }
    history.campaignDecisions.push(assessment.decision);
  }
  history.opportunityFormations.push(formation);
  return undefined;
}

function formedOpportunities(history: AuthoritativeHistoryRebuild) {
  return history.opportunityFormations.flatMap((formation) =>
    formation.assessments.flatMap((assessment) => {
      if (assessment.result.kind !== "opportunity") {
        return [];
      }
      return [{
        id: assessment.result.opportunityId,
        assessmentId: assessment.id,
        explorationThreadIds: assessment.explorationThreadIds,
        customer: assessment.customer,
        situation: assessment.situation,
        costlyProblem: assessment.costlyProblem,
        supportingObservationIds: assessment.supportingObservationIds,
        behavioralProblemSignalObservationIds: assessment.behavioralProblemSignalObservationIds,
        independentSourceLineages: assessment.independentSourceLineages.map(
          (lineage) => lineage.sourceIds,
        ),
        decisionId: assessment.decision.id,
      }];
    }),
  );
}

function breadthGateViolation(
  history: AuthoritativeHistoryRebuild,
  gate: BreadthGate,
): string | undefined {
  if (history.intake === undefined || history.opportunityFormations.length === 0) {
    return "Breadth Gate requires recorded Opportunity formation";
  }
  if (history.breadthGates.length > 0) {
    return "Breadth Gate has already passed";
  }
  if (history.reservations.size !== history.settledReservationIds.size) {
    return "Breadth Gate requires every reserved pre-gate Source examination to be settled";
  }
  if (gate.decision.intakeVersion !== history.intake.version) {
    return "Breadth Gate decision does not use the current Campaign Intake version";
  }
  const decisionIds = new Set(history.campaignDecisions.map((decision) => decision.id));
  if (decisionIds.has(gate.decision.id)) {
    return `Campaign Decision identity ${gate.decision.id} is already present`;
  }
  const unavailableDecisionEvidence = gate.decision.evidenceEntryIds.find(
    (entryId) => !decisionIds.has(entryId) && !history.observations.some((observation) => observation.id === entryId) && !history.inferences.some((inference) => inference.id === entryId),
  );
  if (unavailableDecisionEvidence !== undefined) {
    return `Breadth Gate decision links unavailable evidence ${unavailableDecisionEvidence}`;
  }
  const sweeps = history.discoveryTranches.flatMap((tranche) => tranche.sweeps);
  if (new Set(sweeps.map((sweep) => sweep.sourceFamily.id)).size < history.intake.researchBudget.sourceFamilyMinimum) {
    return "Breadth Gate lacks the required Source Family diversity";
  }
  const opportunities = formedOpportunities(history);
  const opportunitiesById = new Map(opportunities.map((opportunity) => [opportunity.id, opportunity]));
  if (gate.comparisonOpportunityIds.length < history.intake.researchBudget.minimumComparisonSet) {
    return "Breadth Gate lacks the minimum comparison set";
  }
  const unavailableOpportunityId = gate.comparisonOpportunityIds.find(
    (opportunityId) => !opportunitiesById.has(opportunityId),
  );
  if (unavailableOpportunityId !== undefined) {
    return `Breadth Gate links unavailable Opportunity ${unavailableOpportunityId}`;
  }
  const latestAllocation = history.opportunityFormations.at(-1)!.allocation;
  const classifiedReservationIds = [
    ...latestAllocation.discoveryReservationIds,
    ...latestAllocation.shallowProblemMiningReservationIds,
  ];
  if (
    classifiedReservationIds.length !== history.settledReservationIds.size ||
    [...history.settledReservationIds].some(
      (reservationId) => !classifiedReservationIds.includes(reservationId),
    )
  ) {
    return "Breadth Gate requires every completed pre-gate Source examination to remain in the equal allocation";
  }
  const finalTranches = history.discoveryTranches.slice(-2);
  if (
    finalTranches.length !== 2 ||
    gate.diminishingReturns.some(
      (entry, index) => entry.trancheId !== finalTranches[index]!.id,
    )
  ) {
    return "Breadth Gate must assess the final two consecutive Discovery Tranches";
  }
  if (gate.diminishingReturns[1]!.newOpportunityIds.length >= gate.diminishingReturns[0]!.newOpportunityIds.length) {
    return "the final two Discovery Tranches do not demonstrate diminishing returns";
  }
  const reportedOpportunityIds = gate.diminishingReturns.flatMap((entry) => entry.newOpportunityIds);
  if (
    new Set(reportedOpportunityIds).size !== reportedOpportunityIds.length ||
    reportedOpportunityIds.length !== opportunities.length ||
    reportedOpportunityIds.some((opportunityId) => !opportunitiesById.has(opportunityId))
  ) {
    return "diminishing-return evidence must account for every formed Opportunity exactly once";
  }
  for (const [index, entry] of gate.diminishingReturns.entries()) {
    const trancheThreadIds = new Set(finalTranches[index]!.threads.map((thread) => thread.id));
    const misattributedOpportunityId = entry.newOpportunityIds.find((opportunityId) =>
      !opportunitiesById.get(opportunityId)!.explorationThreadIds.some((threadId) => trancheThreadIds.has(threadId)),
    );
    if (misattributedOpportunityId !== undefined) {
      return `Opportunity ${misattributedOpportunityId} is attributed to the wrong Discovery Tranche`;
    }
  }
  const threads = history.discoveryTranches.flatMap((tranche) => tranche.threads);
  const hasException = history.discoveryTranches.some((tranche) => tranche.familiarDomainException !== null);
  if (!hasException && threads.filter((thread) => thread.familiarDomain).length > Math.floor(threads.length / 3)) {
    return "Breadth Gate does not comply with the familiar-domain limit";
  }
  const ordinaryCap = history.intake.researchBudget.sourceCap - history.intake.researchBudget.adversarialSourceReserve;
  const usedSourceUnits = [...history.reservations.values()].reduce((total, reservation) => total + reservation.sourceUnits, 0);
  if (ordinaryCap - usedSourceUnits < gate.comparisonOpportunityIds.length * 2) {
    return "Breadth Gate lacks sufficient remaining ordinary budget for meaningful deepening and challenge";
  }
  return undefined;
}

function applyBreadthGate(
  history: AuthoritativeHistoryRebuild,
  gate: BreadthGate,
): string | undefined {
  const violation = breadthGateViolation(history, gate);
  if (violation !== undefined) {
    return violation;
  }
  history.campaignDecisions.push(gate.decision);
  history.breadthGates.push(gate);
  return undefined;
}

function opportunityExclusionEvaluationViolation(
  history: AuthoritativeHistoryRebuild,
  evaluation: OpportunityExclusionEvaluation,
): string | undefined {
  if (history.intake === undefined || history.breadthGates.length === 0) {
    return "Opportunity Exclusion Gates require a passed Breadth Gate";
  }
  if (history.opportunityExclusionEvaluations.length > 0) {
    return "Opportunity Exclusion Gates have already been recorded for the current Campaign Intake";
  }
  const opportunities = formedOpportunities(history);
  const opportunityIds = new Set(opportunities.map((opportunity) => opportunity.id));
  const assessedOpportunityIds = evaluation.assessments.map(
    (assessment) => assessment.opportunityId,
  );
  if (
    new Set(assessedOpportunityIds).size !== assessedOpportunityIds.length ||
    assessedOpportunityIds.length !== opportunityIds.size ||
    assessedOpportunityIds.some((opportunityId) => !opportunityIds.has(opportunityId))
  ) {
    return "every formed Opportunity must receive exactly one exclusion assessment";
  }
  const hardConstraintIds = history.intake.statements
    .filter((statement) => statement.classification === "hard-constraint")
    .map((statement) => statement.id);
  const availableEvidenceIds = allReasoningEntryIds(history);
  const invalidatedIds = invalidatedEvidenceIds(history);
  const existingDecisionIds = new Set(
    history.campaignDecisions.map((decision) => decision.id),
  );
  const assessmentIds = new Set<string>();
  const gateIds = new Set<string>();
  const decisionIds = new Set(existingDecisionIds);
  for (const assessment of evaluation.assessments) {
    if (assessmentIds.has(assessment.id)) {
      return `Opportunity exclusion assessment identity ${assessment.id} is duplicated`;
    }
    assessmentIds.add(assessment.id);
    const assessedHardConstraintIds = assessment.hardConstraints.map(
      (constraint) => constraint.hardConstraintId,
    );
    if (
      new Set(assessedHardConstraintIds).size !== assessedHardConstraintIds.length ||
      assessedHardConstraintIds.length !== hardConstraintIds.length ||
      assessedHardConstraintIds.some(
        (hardConstraintId) => !hardConstraintIds.includes(hardConstraintId),
      )
    ) {
      return `Opportunity ${assessment.opportunityId} must assess every confirmed Hard Constraint exactly once`;
    }
    const gates = [
      assessment.marketSafety.gate,
      ...assessment.hardConstraints.map((constraint) => constraint.gate),
    ];
    for (const gate of gates) {
      const decision = gate.decision;
      if (gateIds.has(gate.id)) {
        return `Exclusion Gate identity ${gate.id} is duplicated`;
      }
      gateIds.add(gate.id);
      if (decisionIds.has(decision.id)) {
        return `Campaign Decision identity ${decision.id} is already present`;
      }
      decisionIds.add(decision.id);
      if (decision.intakeVersion !== history.intake.version) {
        return `Campaign Decision ${decision.id} does not use the current Campaign Intake version`;
      }
      const unavailableEvidenceId = [
        ...decision.supportingEvidenceEntryIds,
        ...decision.challengingEvidenceEntryIds,
      ].find(
        (entryId) =>
          !availableEvidenceIds.has(entryId) || invalidatedIds.has(entryId),
      );
      if (unavailableEvidenceId !== undefined) {
        return `Campaign Decision ${decision.id} links unavailable evidence ${unavailableEvidenceId}`;
      }
      const unavailableGapId = decision.evidenceGapIds.find(
        (gapId) =>
          !history.evidenceGaps.some(
            (gap) => gap.id === gapId && gap.status === "open",
          ),
      );
      if (unavailableGapId !== undefined) {
        return `Campaign Decision ${decision.id} links unavailable open Evidence Gap ${unavailableGapId}`;
      }
      const unavailableContradictionId = decision.contradictionIds.find(
        (contradictionId) =>
          !history.contradictions.some(
            (contradiction) =>
              contradiction.id === contradictionId &&
              contradiction.resolutionStatus !== "resolved",
          ),
      );
      if (unavailableContradictionId !== undefined) {
        return `Campaign Decision ${decision.id} links unavailable unresolved Contradiction ${unavailableContradictionId}`;
      }
      if (
        gate.state === "unresolved" &&
        decision.supportingEvidenceEntryIds.length === 0 &&
        decision.evidenceGapIds.length === 0
      ) {
        return `unresolved Exclusion Gate ${gate.id} requires an explicit Evidence Gap when evidence is missing`;
      }
    }
  }
  return undefined;
}

function applyOpportunityExclusionEvaluation(
  history: AuthoritativeHistoryRebuild,
  evaluation: OpportunityExclusionEvaluation,
): string | undefined {
  const violation = opportunityExclusionEvaluationViolation(history, evaluation);
  if (violation !== undefined) {
    return violation;
  }
  for (const assessment of evaluation.assessments) {
    history.campaignDecisions.push(
      assessment.marketSafety.gate.decision,
      ...assessment.hardConstraints.map((constraint) => constraint.gate.decision),
    );
  }
  history.opportunityExclusionEvaluations.push(evaluation);
  return undefined;
}

const authoritativeOperationDescriptors = {
  "create-campaign": {
    outcome: "campaign-created",
    position: "initial",
    establishesLease: true,
    validateAndApply() {},
  },
  "resume-campaign": {
    outcome: "campaign-resumed",
    position: "subsequent",
    establishesLease: true,
    validateAndApply() {},
  },
  "confirm-campaign-intake": {
    outcome: "campaign-intake-confirmed",
    position: "subsequent",
    establishesLease: false,
    validateAndApply({ outcome, outcomeSequence, history }) {
      if (
        history.intake !== undefined ||
        !isRecord(outcome.intake) ||
        outcome.intake.campaignId !== history.campaignId ||
        outcome.intake.confirmedAt !== outcome.recordedAt
      ) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
      const { campaignId: _campaignId, confirmedAt: _confirmedAt, ...intakeValue } =
        outcome.intake;
      if (validateCampaignIntake(intakeValue, outcome.recordedAt).length > 0) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
      history.intake = outcome.intake as unknown as ConfirmedCampaignIntake;
    },
  },
  "reserve-public-research": {
    outcome: "public-research-reserved",
    position: "subsequent",
    establishesLease: false,
    validateAndApply({ intent, outcome, outcomeSequence, history }) {
      if (
        history.intake === undefined ||
        typeof outcome.recordedAt !== "string" ||
        outcome.recordedAt < history.intake.confirmedAt ||
        !isRecord(outcome.reservation) ||
        validatePublicResearchReservation(outcome.reservation, "reservation").length > 0 ||
        intent.reservationId !== outcome.reservation.id ||
        history.reservations.has(String(outcome.reservation.id))
      ) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
      const reservation = outcome.reservation as unknown as PublicResearchReservation;
      const totalReserved =
        [...history.reservations.values()].reduce(
          (total, existing) => total + existing.sourceUnits,
          0,
        ) + reservation.sourceUnits;
      const ordinarySourceCap =
        history.intake.researchBudget.sourceCap -
        history.intake.researchBudget.adversarialSourceReserve;
      if (totalReserved > ordinarySourceCap) {
        throw new Error(
          `authoritative record ${outcomeSequence} exceeds the Research Budget`,
        );
      }
      if (publicResearchAllocationViolation(history, reservation) !== undefined) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
      if (
        opportunityDeepeningViolation(
          history,
          reservation,
          outcome.recordedAt as string,
        ) !== undefined
      ) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
      history.reservations.set(reservation.id, reservation);
      history.reservationRecordedAt.set(
        reservation.id,
        outcome.recordedAt as string,
      );
    },
  },
  "record-public-research-observation": {
    outcome: "public-research-observation-recorded",
    position: "subsequent",
    establishesLease: false,
    validateAndApply({ intent, outcome, outcomeSequence, history }) {
      const reservationId = String(outcome.reservationId);
      if (!isRecord(outcome.source) || !isRecord(outcome.observation)) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
      const source = outcome.source;
      const observation = outcome.observation;
      if (
        history.intake === undefined ||
        intent.reservationId !== outcome.reservationId ||
        !history.reservations.has(reservationId) ||
        history.settledReservationIds.has(reservationId) ||
        validatePublicSource(source, outcome.recordedAt).length > 0 ||
        validatePublicObservation(observation, source).length > 0 ||
        typeof source.accessedAt !== "string" ||
        typeof outcome.recordedAt !== "string" ||
        source.accessedAt < history.reservationRecordedAt.get(reservationId)! ||
        outcome.recordedAt < history.reservationRecordedAt.get(reservationId)! ||
        publicResearchApprovalScopeMismatch(
          history,
          reservationId,
          source as unknown as PublicSource,
        ) ||
        history.sources.some((existingSource) => existingSource.id === source.id) ||
        history.observations.some(
          (existingObservation) => existingObservation.id === observation.id,
        )
      ) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
      history.settledReservationIds.add(reservationId);
      history.sources.push(source as unknown as PublicSource);
      history.observations.push(observation as unknown as PublicObservation);
    },
  },
  "record-evidence-reasoning": {
    outcome: "evidence-reasoning-recorded",
    position: "subsequent",
    establishesLease: false,
    validateAndApply({ intent, outcome, outcomeSequence, history }) {
      if (
        history.intake === undefined ||
        !Array.isArray(outcome.entries) ||
        outcome.entries.length === 0 ||
        !Array.isArray(intent.entryIds) ||
        JSON.stringify(intent.entryIds) !==
          JSON.stringify(
            outcome.entries.map((entry) =>
              isRecord(entry) ? entry.id : undefined,
            ),
          )
      ) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
      if (
        applyReasoningEntries(
          history,
          outcome.entries as unknown as ReasoningEntry[],
        ) !== undefined
      ) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
    },
  },
  "record-discovery-tranche": {
    outcome: "discovery-tranche-recorded",
    position: "subsequent",
    establishesLease: false,
    validateAndApply({ intent, outcome, outcomeSequence, history }) {
      if (
        history.intake === undefined ||
        !isRecord(outcome.tranche) ||
        intent.trancheId !== outcome.tranche.id ||
        validateDiscoveryTranche(outcome.tranche, "tranche").length > 0 ||
        applyDiscoveryTranche(
          history,
          outcome.tranche as unknown as DiscoveryTranche,
        ) !== undefined
      ) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
    },
  },
  "record-opportunity-formation": {
    outcome: "opportunity-formation-recorded",
    position: "subsequent",
    establishesLease: false,
    validateAndApply({ intent, outcome, outcomeSequence, history }) {
      const formation = {
        allocation: outcome.allocation,
        assessments: outcome.assessments,
      };
      if (
        history.intake === undefined ||
        intent.formationId !== (Array.isArray(outcome.assessments) && isRecord(outcome.assessments[0]) ? outcome.assessments[0].id : undefined) ||
        !isRecord(outcome.allocation) ||
        !Array.isArray(outcome.assessments) ||
        outcome.assessments.length === 0 ||
        validateRecordOpportunityFormationFields({
          payload: {
            campaignPath: "/authoritative-rebuild",
            coordinatorId: intent.coordinatorId,
            recordedAt: outcome.recordedAt,
            allocation: outcome.allocation,
            assessments: outcome.assessments,
          },
        }).length > 0 ||
        applyOpportunityFormation(history, formation as OpportunityFormation) !== undefined
      ) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
    },
  },
  "pass-breadth-gate": {
    outcome: "breadth-gate-passed",
    position: "subsequent",
    establishesLease: false,
    validateAndApply({ intent, outcome, outcomeSequence, history }) {
      if (
        history.intake === undefined ||
        !isRecord(outcome.gate) ||
        intent.gateId !== outcome.gate.id ||
        validateBreadthGate(outcome.gate, outcome.recordedAt, "gate").length > 0 ||
        applyBreadthGate(history, outcome.gate as unknown as BreadthGate) !== undefined
      ) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
    },
  },
  "record-opportunity-exclusion-gates": {
    outcome: "opportunity-exclusion-gates-recorded",
    position: "subsequent",
    establishesLease: false,
    validateAndApply({ intent, outcome, outcomeSequence, history }) {
      const evaluation = { assessments: outcome.assessments };
      if (
        history.intake === undefined ||
        intent.assessmentId !==
          (Array.isArray(outcome.assessments) && isRecord(outcome.assessments[0])
            ? outcome.assessments[0].id
            : undefined) ||
        !Array.isArray(outcome.assessments) ||
        outcome.assessments.length === 0 ||
        validateRecordOpportunityExclusionGatesFields({
          payload: {
            campaignPath: "/authoritative-rebuild",
            coordinatorId: intent.coordinatorId,
            recordedAt: outcome.recordedAt,
            assessments: outcome.assessments,
          },
        }).length > 0 ||
        applyOpportunityExclusionEvaluation(
          history,
          evaluation as OpportunityExclusionEvaluation,
        ) !== undefined
      ) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
    },
  },
  "request-research-approval": {
    outcome: "research-approval-requested",
    position: "subsequent",
    establishesLease: false,
    validateAndApply({ intent, outcome, outcomeSequence, history }) {
      const pendingDecision = isRecord(outcome.pendingDecision)
        ? outcome.pendingDecision
        : {};
      if (
        history.intake === undefined ||
        typeof outcome.recordedAt !== "string" ||
        outcome.recordedAt < history.intake.confirmedAt ||
        !isRecord(outcome.pendingDecision) ||
        pendingDecision.type !== "research-approval" ||
        pendingDecision.id !== intent.pendingDecisionId ||
        pendingDecision.requestedAt !== outcome.recordedAt ||
        validateResearchApprovalRequest(
          pendingDecision.request,
          outcome.recordedAt,
          "pendingDecision.request",
        ).length > 0 ||
        elevatedRiskApprovalRequestViolation(
          history,
          pendingDecision.request as unknown as ResearchApprovalRequest,
        ) !== undefined ||
        history.researchApprovalDecisions.some(
          (decision) => decision.id === pendingDecision.id,
        ) ||
        activeResearchApprovalDecision(history) !== undefined
      ) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
      history.researchApprovalDecisions.push(
        outcome.pendingDecision as unknown as PendingResearchApprovalDecision,
      );
    },
  },
  "record-research-approval-information": {
    outcome: "research-approval-information-recorded",
    position: "subsequent",
    establishesLease: false,
    validateAndApply({ intent, outcome, outcomeSequence, history }) {
      const information = outcome.information;
      const informationRecord = isRecord(information) ? information : {};
      if (
        typeof outcome.decisionId !== "string" ||
        outcome.decisionId !== intent.pendingDecisionId ||
        activeResearchApprovalDecision(history)?.id !== outcome.decisionId ||
        typeof outcome.recordedAt !== "string" ||
        outcome.recordedAt <
          activeResearchApprovalDecision(history)!.requestedAt ||
        !isRecord(information) ||
        !hasOnlyFields(informationRecord, ["id", "question", "explanation"]) ||
        ["id", "question", "explanation"].some(
          (field) =>
            typeof informationRecord[field] !== "string" ||
            String(informationRecord[field]).trim() === "" ||
            validatePersistableText(
              informationRecord[field],
              `information.${field}`,
            ).length > 0,
        ) ||
        history.researchApprovalInformation.some(
          (existing) => existing.id === informationRecord.id,
        )
      ) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
      history.researchApprovalInformation.push({
        ...(information as unknown as ResearchApprovalInformation),
        decisionId: outcome.decisionId,
        recordedAt: String(outcome.recordedAt),
      });
    },
  },
  "respond-research-approval": {
    outcome: "research-approval-responded",
    position: "subsequent",
    establishesLease: false,
    validateAndApply({ intent, outcome, outcomeSequence, history }) {
      const activeDecision = activeResearchApprovalDecision(history);
      const response = outcome.response;
      if (
        activeDecision === undefined ||
        outcome.decisionId !== activeDecision.id ||
        outcome.decisionId !== intent.pendingDecisionId ||
        typeof outcome.recordedAt !== "string" ||
        outcome.recordedAt < activeDecision.requestedAt ||
        !isRecord(response)
      ) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
      if (response.kind === "approve") {
        const approval = isRecord(response.approval) ? response.approval : {};
        if (
          approval.explicitlyApproved !== true ||
          typeof approval.id !== "string" ||
          approval.id.trim() === "" ||
          JSON.stringify(approval.scope) !== JSON.stringify(activeDecision.request) ||
          history.researchApprovals.some(
            (existing) => existing.id === approval.id,
          )
        ) {
          invalidAuthoritativeRecord(outcomeSequence);
        }
        history.researchApprovals.push({
          id: String(approval.id),
          decisionId: activeDecision.id,
          approvedAt: String(outcome.recordedAt),
          scope: approval.scope as unknown as ResearchApprovalRequest,
        });
      } else if (response.kind === "refuse") {
        const refusal = isRecord(response.refusal) ? response.refusal : {};
        if (
          refusal.explicitlyRefused !== true ||
          typeof refusal.id !== "string" ||
          refusal.id.trim() === "" ||
          typeof refusal.rationale !== "string" ||
          refusal.rationale.trim() === "" ||
          validatePersistableText(
            refusal.rationale,
            "response.refusal.rationale",
          ).length > 0 ||
          !isRecord(refusal.evidenceGap) ||
          applyReasoningEntries(
            history,
            [refusal.evidenceGap as unknown as EvidenceGap],
          ) !== undefined
        ) {
          invalidAuthoritativeRecord(outcomeSequence);
        }
      } else {
        invalidAuthoritativeRecord(outcomeSequence);
      }
      history.researchApprovalResponses.push({
        decisionId: activeDecision.id,
        respondedAt: String(outcome.recordedAt),
        response: response as unknown as ResearchApprovalResponse,
      });
    },
  },
  "record-research-expenditure": {
    outcome: "research-expenditure-recorded",
    position: "subsequent",
    establishesLease: false,
    validateAndApply({ intent, outcome, outcomeSequence, history }) {
      const expenditure = isRecord(outcome.expenditure)
        ? outcome.expenditure
        : {};
      const approval = history.researchApprovals.find(
        (existing) => existing.id === expenditure.approvalId,
      );
      if (
        history.intake === undefined ||
        approval === undefined ||
        !hasOnlyFields(expenditure, [
          "id",
          "approvalId",
          "approvalDecisionId",
          "sourceId",
          "purpose",
          "amount",
          "currency",
          "incurredAt",
        ]) ||
        intent.expenditureId !== expenditure.id ||
        typeof expenditure.id !== "string" ||
        expenditure.id.trim() === "" ||
        typeof expenditure.purpose !== "string" ||
        validatePersistableText(
          expenditure.purpose,
          "expenditure.purpose",
        ).length > 0 ||
        typeof expenditure.amount !== "number" ||
        !Number.isFinite(expenditure.amount) ||
        expenditure.amount <= 0 ||
        outcome.recordedAt !== expenditure.incurredAt ||
        typeof outcome.recordedAt !== "string" ||
        history.researchExpenditures.some(
          (existing) => existing.id === expenditure.id,
        )
      ) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
      const validatedExpenditure = expenditure as unknown as ResearchExpenditure;
      if (
        researchExpenditurePolicyViolation({
          expenditure: validatedExpenditure,
          approval,
          intake: history.intake,
          existingExpenditures: history.researchExpenditures,
        }) !== undefined
      ) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
      history.researchExpenditures.push(validatedExpenditure);
    },
  },
} as const satisfies Record<
  AuthoritativeOperation,
  AuthoritativeOperationDescriptor
>;

function authoritativeOperationDescriptor(
  operation: unknown,
): AuthoritativeOperationDescriptor | undefined {
  if (
    typeof operation !== "string" ||
    !Object.hasOwn(authoritativeOperationDescriptors, operation)
  ) {
    return undefined;
  }
  return authoritativeOperationDescriptors[
    operation as AuthoritativeOperation
  ];
}

function initialWorkView(campaignId: string): WorkView {
  return {
    campaignId,
    recordSequence: 2,
    phase: "campaign-created",
    pause: null,
    completedWork: ["Scouting Campaign created"],
    nextPermittedActions: ["confirm-campaign-intake"],
    publicResearchAvailable: false,
  };
}

function campaignRecordPair({
  campaignId,
  requestId,
  recordedAt,
  firstSequence,
  operation,
  intent,
  outcome,
}: {
  campaignId: string;
  requestId: string;
  recordedAt: string;
  firstSequence: number;
  operation: AuthoritativeOperation;
  intent: Record<string, unknown>;
  outcome: Record<string, unknown>;
}) {
  const recordBase = {
    recordVersion: contracts.records,
    campaignId,
    requestId,
    recordedAt,
  };
  return [
    {
      ...recordBase,
      recordId: `${campaignId}:record:${String(firstSequence).padStart(12, "0")}`,
      sequence: firstSequence,
      type: "operation-intent",
      operation,
      ...intent,
    },
    {
      ...recordBase,
      recordId: `${campaignId}:record:${String(firstSequence + 1).padStart(12, "0")}`,
      sequence: firstSequence + 1,
      type: authoritativeOperationDescriptors[operation].outcome,
      ...outcome,
    },
  ];
}

function campaignOperationRecords(operation: CampaignOperation) {
  return campaignRecordPair({
    ...operation,
    intent: {
      coordinatorId: operation.coordinatorId,
      leaseExpiresAt: operation.leaseExpiresAt,
    },
    outcome: {},
  });
}

function campaignIntakeRecords(
  campaignId: string,
  command: ConfirmCampaignIntakeCommand,
  firstSequence: number,
) {
  const intake: ConfirmedCampaignIntake = {
    campaignId,
    confirmedAt: command.payload.confirmedAt,
    ...command.payload.intake,
  };
  return campaignRecordPair({
    campaignId,
    requestId: command.requestId,
    recordedAt: command.payload.confirmedAt,
    firstSequence,
    operation: "confirm-campaign-intake",
    intent: {
      coordinatorId: command.payload.coordinatorId,
      intakeVersion: command.payload.intake.version,
    },
    outcome: { intake },
  });
}

function publicResearchReservationRecords(
  campaignId: string,
  command: ReservePublicResearchCommand,
  firstSequence: number,
) {
  return campaignRecordPair({
    campaignId,
    requestId: command.requestId,
    recordedAt: command.payload.reservedAt,
    firstSequence,
    operation: "reserve-public-research",
    intent: {
      coordinatorId: command.payload.coordinatorId,
      reservationId: command.payload.reservation.id,
    },
    outcome: { reservation: command.payload.reservation },
  });
}

function publicResearchObservationRecords(
  campaignId: string,
  command: RecordPublicResearchObservationCommand,
  firstSequence: number,
) {
  return campaignRecordPair({
    campaignId,
    requestId: command.requestId,
    recordedAt: command.payload.recordedAt,
    firstSequence,
    operation: "record-public-research-observation",
    intent: {
      coordinatorId: command.payload.coordinatorId,
      reservationId: command.payload.reservationId,
    },
    outcome: {
      reservationId: command.payload.reservationId,
      source: command.payload.source,
      observation: command.payload.observation,
    },
  });
}

function evidenceReasoningRecords(
  campaignId: string,
  command: RecordEvidenceReasoningCommand,
  firstSequence: number,
) {
  return campaignRecordPair({
    campaignId,
    requestId: command.requestId,
    recordedAt: command.payload.recordedAt,
    firstSequence,
    operation: "record-evidence-reasoning",
    intent: {
      coordinatorId: command.payload.coordinatorId,
      entryIds: command.payload.entries.map((entry) => entry.id),
    },
    outcome: { entries: command.payload.entries },
  });
}

function discoveryTrancheRecords(
  campaignId: string,
  command: RecordDiscoveryTrancheCommand,
  firstSequence: number,
) {
  return campaignRecordPair({
    campaignId,
    requestId: command.requestId,
    recordedAt: command.payload.recordedAt,
    firstSequence,
    operation: "record-discovery-tranche",
    intent: {
      coordinatorId: command.payload.coordinatorId,
      trancheId: command.payload.tranche.id,
    },
    outcome: { tranche: command.payload.tranche },
  });
}

function opportunityFormationRecords(
  campaignId: string,
  command: RecordOpportunityFormationCommand,
  firstSequence: number,
) {
  return campaignRecordPair({
    campaignId,
    requestId: command.requestId,
    recordedAt: command.payload.recordedAt,
    firstSequence,
    operation: "record-opportunity-formation",
    intent: {
      coordinatorId: command.payload.coordinatorId,
      formationId: command.payload.assessments[0]!.id,
    },
    outcome: {
      allocation: command.payload.allocation,
      assessments: command.payload.assessments,
    },
  });
}

function breadthGateRecords(
  campaignId: string,
  command: PassBreadthGateCommand,
  firstSequence: number,
) {
  return campaignRecordPair({
    campaignId,
    requestId: command.requestId,
    recordedAt: command.payload.recordedAt,
    firstSequence,
    operation: "pass-breadth-gate",
    intent: {
      coordinatorId: command.payload.coordinatorId,
      gateId: command.payload.gate.id,
    },
    outcome: { gate: command.payload.gate },
  });
}

function opportunityExclusionGateRecords(
  campaignId: string,
  command: RecordOpportunityExclusionGatesCommand,
  firstSequence: number,
) {
  return campaignRecordPair({
    campaignId,
    requestId: command.requestId,
    recordedAt: command.payload.recordedAt,
    firstSequence,
    operation: "record-opportunity-exclusion-gates",
    intent: {
      coordinatorId: command.payload.coordinatorId,
      assessmentId: command.payload.assessments[0]!.id,
    },
    outcome: { assessments: command.payload.assessments },
  });
}

function researchApprovalRequestRecords(
  campaignId: string,
  command: RequestResearchApprovalCommand,
  firstSequence: number,
) {
  const pendingDecision: PendingResearchApprovalDecision = {
    id: command.payload.request.id,
    type: "research-approval",
    requestedAt: command.payload.requestedAt,
    request: command.payload.request,
  };
  return campaignRecordPair({
    campaignId,
    requestId: command.requestId,
    recordedAt: command.payload.requestedAt,
    firstSequence,
    operation: "request-research-approval",
    intent: {
      coordinatorId: command.payload.coordinatorId,
      pendingDecisionId: command.payload.request.id,
    },
    outcome: { pendingDecision },
  });
}

function researchApprovalInformationRecords(
  campaignId: string,
  command: RecordResearchApprovalInformationCommand,
  firstSequence: number,
) {
  return campaignRecordPair({
    campaignId,
    requestId: command.requestId,
    recordedAt: command.payload.recordedAt,
    firstSequence,
    operation: "record-research-approval-information",
    intent: {
      coordinatorId: command.payload.coordinatorId,
      pendingDecisionId: command.payload.decisionId,
    },
    outcome: {
      decisionId: command.payload.decisionId,
      information: command.payload.information,
    },
  });
}

function researchApprovalResponseRecords(
  campaignId: string,
  command: RespondResearchApprovalCommand,
  firstSequence: number,
) {
  return campaignRecordPair({
    campaignId,
    requestId: command.requestId,
    recordedAt: command.payload.respondedAt,
    firstSequence,
    operation: "respond-research-approval",
    intent: {
      coordinatorId: command.payload.coordinatorId,
      pendingDecisionId: command.payload.decisionId,
    },
    outcome: {
      decisionId: command.payload.decisionId,
      response: command.payload.response,
    },
  });
}

function researchExpenditureRecords(
  campaignId: string,
  approval: ResearchApproval,
  command: RecordResearchExpenditureCommand,
  firstSequence: number,
) {
  const expenditure: ResearchExpenditure = {
    ...command.payload.expenditure,
    incurredAt: command.payload.incurredAt,
    approvalDecisionId: approval.decisionId,
  };
  return campaignRecordPair({
    campaignId,
    requestId: command.requestId,
    recordedAt: command.payload.incurredAt,
    firstSequence,
    operation: "record-research-expenditure",
    intent: {
      coordinatorId: command.payload.coordinatorId,
      expenditureId: command.payload.expenditure.id,
      approvalId: command.payload.expenditure.approvalId,
    },
    outcome: { expenditure },
  });
}

async function readJson(targetPath: string): Promise<unknown> {
  return JSON.parse(await readFile(targetPath, "utf8"));
}

async function readCampaignRecords(campaignPath: string): Promise<unknown[]> {
  return (await readFile(path.join(campaignPath, "records.jsonl"), "utf8"))
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as unknown);
}

function matchesContracts(value: Record<string, unknown>): boolean {
  const entries = Object.entries(contracts);
  return (
    Object.keys(value).length === entries.length &&
    entries.every(([name, version]) => value[name] === version)
  );
}

type CampaignManifest = {
  campaignId: string;
  createdAt: string;
  versions: Record<string, unknown>;
  authority: { records: "records.jsonl" };
  projections: {
    workView: "work-view.json";
    campaignIntake?: "campaign-intake.json";
    researchBudget?: "research-budget.json";
    evidenceLedger?: "evidence-ledger.json";
  };
};

function parseCampaignManifest(value: unknown): CampaignManifest | undefined {
  if (
    !isRecord(value) ||
    typeof value.campaignId !== "string" ||
    value.campaignId.trim() === "" ||
    !isIsoInstant(value.createdAt) ||
    !isRecord(value.versions) ||
    !matchesContracts(value.versions) ||
    !isRecord(value.authority) ||
    value.authority.records !== "records.jsonl" ||
    !isRecord(value.projections) ||
    value.projections.workView !== "work-view.json" ||
    (value.projections.campaignIntake !== undefined &&
      value.projections.campaignIntake !== "campaign-intake.json") ||
    (value.projections.researchBudget !== undefined &&
      value.projections.researchBudget !== "research-budget.json") ||
    (value.projections.evidenceLedger !== undefined &&
      value.projections.evidenceLedger !== "evidence-ledger.json")
  ) {
    return undefined;
  }
  return value as unknown as CampaignManifest;
}

async function rebuildCampaignFromAuthority(campaignPath: string) {
  const resolvedPath = path.resolve(campaignPath);
  const manifest = parseCampaignManifest(
    await readJson(path.join(resolvedPath, "manifest.json")),
  );
  if (manifest === undefined) {
    throw new Error("manifest is missing identity or supported contract versions");
  }

  const records = await readCampaignRecords(resolvedPath);
  if (records.length < 2 || records.length % 2 !== 0) {
    throw new Error("authoritative history is incomplete");
  }
  const operationRequests = new Set<string>();
  const authoritativeHistory: AuthoritativeHistoryRebuild = {
    campaignId: manifest.campaignId,
    reservations: new Map(),
    reservationRecordedAt: new Map(),
    settledReservationIds: new Set(),
    sources: [],
    observations: [],
    sourceLineages: [],
    sourceCredibilities: [],
    sourceFreshnesses: [],
    evidenceGaps: [],
    assumptions: [],
    inferences: [],
    contradictions: [],
    corrections: [],
    discoveryTranches: [],
    opportunityFormations: [],
    breadthGates: [],
    opportunityExclusionEvaluations: [],
    campaignDecisions: [],
    researchApprovalDecisions: [],
    researchApprovalInformation: [],
    researchApprovalResponses: [],
    researchApprovals: [],
    researchExpenditures: [],
  };
  for (let index = 0; index < records.length; index += 2) {
    const sequence = index + 1;
    const record = records[index];
    const expectedRecordId = `${manifest.campaignId}:record:${String(sequence).padStart(12, "0")}`;
    if (
      !isRecord(record) ||
      record.sequence !== sequence ||
      record.campaignId !== manifest.campaignId ||
      record.recordVersion !== contracts.records ||
      record.recordId !== expectedRecordId ||
      typeof record.requestId !== "string" ||
      record.requestId.trim() === "" ||
      !isIsoInstant(record.recordedAt)
    ) {
      throw new Error(`authoritative record ${sequence} is invalid`);
    }
    const operationDescriptor = isRecord(record)
      ? authoritativeOperationDescriptor(record.operation)
      : undefined;
    if (
      record.type !== "operation-intent" ||
      operationDescriptor === undefined ||
      operationDescriptor.position !== (sequence === 1 ? "initial" : "subsequent") ||
      typeof record.coordinatorId !== "string" ||
      record.coordinatorId.trim() === "" ||
      operationRequests.has(record.requestId)
    ) {
      throw new Error(`authoritative record ${sequence} is invalid`);
    }
    operationRequests.add(record.requestId);
    if (
      operationDescriptor.establishesLease &&
      (!isIsoInstant(record.leaseExpiresAt) ||
        record.leaseExpiresAt <= record.recordedAt)
    ) {
      throw new Error(`authoritative record ${sequence} is invalid`);
    }

    const outcomeSequence = sequence + 1;
    const outcome = records[index + 1];
    const expectedOutcomeId = `${manifest.campaignId}:record:${String(outcomeSequence).padStart(12, "0")}`;
    if (
      !isRecord(outcome) ||
      outcome.sequence !== outcomeSequence ||
      outcome.campaignId !== manifest.campaignId ||
      outcome.recordVersion !== contracts.records ||
      outcome.recordId !== expectedOutcomeId ||
      outcome.requestId !== record.requestId ||
      outcome.recordedAt !== record.recordedAt ||
      outcome.type !== operationDescriptor.outcome
    ) {
      throw new Error(`authoritative record ${outcomeSequence} is invalid`);
    }
    operationDescriptor.validateAndApply({
      intent: record,
      outcome,
      outcomeSequence,
      history: authoritativeHistory,
    });
  }
  const {
    intake,
    reservations,
    settledReservationIds,
    sources,
    observations,
    sourceLineages,
    sourceCredibilities,
    sourceFreshnesses,
    evidenceGaps,
    assumptions,
    inferences,
    contradictions,
    corrections,
    discoveryTranches,
    opportunityFormations,
    breadthGates,
    opportunityExclusionEvaluations,
    campaignDecisions,
    researchApprovalDecisions,
    researchApprovalInformation,
    researchApprovalResponses,
    researchApprovals,
    researchExpenditures,
  } = authoritativeHistory;
  const creationIntent = records[0];
  if (!isRecord(creationIntent) || manifest.createdAt !== creationIntent.recordedAt) {
    throw new Error("manifest creation time does not match authoritative history");
  }

  const workView = initialWorkView(manifest.campaignId);
  workView.recordSequence = records.length;
  if (intake !== undefined) {
    workView.phase = "campaign-intake-confirmed";
    workView.completedWork.push(
      `Campaign Intake version ${intake.version} confirmed`,
    );
    workView.nextPermittedActions = ["reserve-public-research"];
    workView.publicResearchAvailable = true;
  }
  for (const reservation of reservations.values()) {
    workView.completedWork.push(
      settledReservationIds.has(reservation.id)
        ? `Public Research reservation ${reservation.id} settled`
        : `Public Research reservation ${reservation.id} reserved`,
    );
  }
  if (observations.length > 0) {
    workView.phase = "public-research-active";
    workView.completedWork.push(
      `${observations.length} cited Public Research Observation${observations.length === 1 ? "" : "s"} recorded`,
    );
    workView.nextPermittedActions = [
      "reserve-public-research",
      "record-evidence-reasoning",
      "record-discovery-tranche",
    ];
  }
  if (
    sourceLineages.length > 0 ||
    sourceCredibilities.length > 0 ||
    sourceFreshnesses.length > 0 ||
    evidenceGaps.length > 0 ||
    assumptions.length > 0 ||
    inferences.length > 0 ||
    contradictions.length > 0 ||
    corrections.length > 0 ||
    campaignDecisions.length > 0
  ) {
    const correctedEntryIds = new Set(
      corrections.map((correction) => correction.targetEntryId),
    );
    const invalidatedIds = invalidatedEvidenceIds({
      sources,
      observations,
      sourceLineages,
      sourceCredibilities,
      sourceFreshnesses,
      evidenceGaps,
      assumptions,
      inferences,
      contradictions,
      corrections,
    });
    const reasoningEntryCount =
      sourceLineages.length +
      sourceCredibilities.length +
      sourceFreshnesses.length +
      evidenceGaps.length +
      assumptions.length +
      inferences.length +
      contradictions.length +
      corrections.length +
      campaignDecisions.length;
    workView.completedWork.push(
      `${reasoningEntryCount} reasoning entr${reasoningEntryCount === 1 ? "y" : "ies"} recorded`,
    );
    workView.reasoning = {
      evidenceLedgerPath: "evidence-ledger.json",
      evidenceInspectionCommand: "inspectEvidence",
      sourceLineageIds: sourceLineages
        .filter((lineage) => !correctedEntryIds.has(lineage.id))
        .map((lineage) => lineage.id),
      sourceCredibilityIds: sourceCredibilities
        .filter((credibility) => !correctedEntryIds.has(credibility.id))
        .map((credibility) => credibility.id),
      sourceFreshnessIds: sourceFreshnesses
        .filter((freshness) => !correctedEntryIds.has(freshness.id))
        .map((freshness) => freshness.id),
      activeAssumptionIds: assumptions
        .filter((assumption) => !correctedEntryIds.has(assumption.id))
        .map((assumption) => assumption.id),
      activeInferenceIds: inferences
        .filter((inference) => !invalidatedIds.has(inference.id))
        .map((inference) => inference.id),
      reassessmentInferenceIds: inferences
        .filter(
          (inference) =>
            invalidatedIds.has(inference.id) &&
            !correctedEntryIds.has(inference.id),
        )
        .map((inference) => inference.id),
      openEvidenceGapIds: evidenceGaps
        .filter(
          (gap) => gap.status === "open" && !correctedEntryIds.has(gap.id),
        )
        .map((gap) => gap.id),
      unresolvedContradictionIds: contradictions
        .filter(
          (contradiction) =>
            contradiction.resolutionStatus !== "resolved" &&
            !correctedEntryIds.has(contradiction.id),
        )
        .map((contradiction) => contradiction.id),
      correctionIds: corrections.map((correction) => correction.id),
      ...(campaignDecisions.length > 0
        ? { campaignDecisionIds: campaignDecisions.map((decision) => decision.id) }
        : {}),
    };
  }
  if (discoveryTranches.length > 0) {
    const sweeps = discoveryTranches.flatMap((tranche) => tranche.sweeps);
    const threads = discoveryTranches.flatMap((tranche) => tranche.threads);
    const retainedThreads = threads.filter(
      (thread) => thread.disposition.status === "retained",
    );
    const droppedThreads = threads.filter(
      (thread) => thread.disposition.status === "dropped",
    );
    const sourceFamilies = [
      ...new Set(sweeps.map((sweep) => sweep.sourceFamily.id)),
    ];
    const threadSlots = discoveryTranches.reduce(
      (total, tranche) => total + tranche.threadSlots,
      0,
    );
    const noveltyProbeSlots = discoveryTranches.reduce(
      (total, tranche) => total + tranche.noveltyProbeSlots,
      0,
    );
    const formationGapIdsByThread = new Map<string, string[]>();
    for (const formation of opportunityFormations) {
      for (const assessment of formation.assessments) {
        if (assessment.result.kind === "exploration-thread") {
          for (const threadId of assessment.explorationThreadIds) {
            formationGapIdsByThread.set(
              threadId,
              assessment.result.evidenceGaps.map((gap) => gap.id),
            );
          }
        }
      }
    }
    workView.phase = "discovery-active";
    workView.completedWork.push(
      `${discoveryTranches.length} Discovery Tranche${discoveryTranches.length === 1 ? "" : "s"} recorded`,
    );
    workView.nextPermittedActions = [
      "reserve-public-research",
      "record-evidence-reasoning",
      "record-discovery-tranche",
    ];
    workView.discovery = {
      coverage: {
        discoveryTranches: discoveryTranches.length,
        discoverySweeps: sweeps.length,
        discoverySweepCap: intake!.researchBudget.discoverySweepCap,
        sourceFamilies,
        sourceFamilyMinimum: intake!.researchBudget.sourceFamilyMinimum,
      },
      allowances: {
        threadSlots,
        noveltyProbeSlots,
        noveltyProbeShare: noveltyProbeSlots / threadSlots,
        shallowResearchSourceUnitsPerRetainedThread:
          discoveryTranches[0]!.shallowResearchSourceUnitsPerRetainedThread,
      },
      familiarDomain: {
        familiarThreads: threads.filter((thread) => thread.familiarDomain).length,
        totalInitialThreads: threads.length,
        maximumWithoutException: Math.floor(threads.length / 3),
        exception:
          discoveryTranches.findLast(
            (tranche) => tranche.familiarDomainException !== null,
          )?.familiarDomainException ?? null,
      },
      retainedThreads: retainedThreads.map((thread) => ({
        id: thread.id,
        customerGroup: thread.customerGroup,
        situation: thread.situation,
        problemFamily: thread.problemFamily,
        origin: thread.origin.kind,
        shallowResearchSourceUnits:
          discoveryTranches[0]!.shallowResearchSourceUnitsPerRetainedThread,
        evidenceCredit:
          thread.origin.kind === "source-led" ? "source-led" : "none",
        comparisonBonus: "none",
        ...(formationGapIdsByThread.has(thread.id)
          ? { evidenceGapIds: formationGapIdsByThread.get(thread.id)! }
          : {}),
      })),
      droppedThreads: droppedThreads.map((thread) => ({
        id: thread.id,
        customerGroup: thread.customerGroup,
        situation: thread.situation,
        problemFamily: thread.problemFamily,
        origin: thread.origin.kind,
        familiarDomain: thread.familiarDomain,
        rationale: thread.disposition.rationale,
      })),
    };
  }
  if (opportunityFormations.length > 0) {
    workView.phase = "opportunity-formation";
    workView.completedWork.push(
      `${opportunityFormations.flatMap((formation) => formation.assessments).length} Opportunity formation assessments recorded`,
    );
    workView.nextPermittedActions = [
      "reserve-public-research",
      "record-evidence-reasoning",
      "record-discovery-tranche",
      "pass-breadth-gate",
    ];
    workView.opportunities = formedOpportunities(authoritativeHistory);
    workView.researchAllocation = {
      phase: "pre-breadth-gate",
      discoveryShare: 0.5,
      shallowProblemMiningShare: 0.5,
      adversarialSourceUnitsReserved: intake!.researchBudget.adversarialSourceReserve,
    };
  }
  if (breadthGates.length > 0) {
    const gate = breadthGates.at(-1)!;
    const ordinarySourceCap =
      intake!.researchBudget.sourceCap - intake!.researchBudget.adversarialSourceReserve;
    const usedSourceUnits = [...reservations.values()].reduce(
      (total, reservation) => total + reservation.sourceUnits,
      0,
    );
    workView.phase = "opportunity-deepening";
    workView.completedWork.push(`Breadth Gate ${gate.id} passed`);
    workView.nextPermittedActions = [
      "reserve-public-research",
      "record-evidence-reasoning",
      "evaluate-opportunity-gates",
    ];
    workView.researchAllocation = {
      phase: "post-breadth-gate",
      deepeningShare: 0.8,
      openWorldDiscoveryShare: 0.2,
      adversarialSourceUnitsReserved: intake!.researchBudget.adversarialSourceReserve,
      ...([...reservations.values()].some(
        (reservation) => reservation.researchClass !== undefined,
      )
        ? {
            deepeningSourceUnits: [...reservations.values()].filter(
              (reservation) => reservation.researchClass === "deepening",
            ).length,
            openWorldDiscoverySourceUnits: [...reservations.values()].filter(
              (reservation) =>
                reservation.researchClass === "open-world-discovery",
            ).length,
          }
        : {}),
    };
    workView.breadthGate = {
      id: gate.id,
      status: "passed",
      sourceFamilyCount: new Set(
        discoveryTranches.flatMap((tranche) =>
          tranche.sweeps.map((sweep) => sweep.sourceFamily.id),
        ),
      ).size,
      sourceFamilyMinimum: intake!.researchBudget.sourceFamilyMinimum,
      comparisonOpportunityIds: gate.comparisonOpportunityIds,
      diminishingReturnTrancheIds: gate.diminishingReturns.map(
        (entry) => entry.trancheId,
      ),
      remainingOrdinarySourceUnits: ordinarySourceCap - usedSourceUnits,
      decisionValuePriorities: gate.decisionValuePriorities,
      decisionId: gate.decision.id,
    };
  }
  if (opportunityExclusionEvaluations.length > 0) {
    const evaluation = opportunityExclusionEvaluations.at(-1)!;
    const assessmentsByOpportunityId = new Map(
      evaluation.assessments.map((assessment) => [
        assessment.opportunityId,
        assessment,
      ]),
    );
    workView.completedWork.push(
      `${evaluation.assessments.length} Opportunity exclusion assessment${evaluation.assessments.length === 1 ? "" : "s"} recorded`,
    );
    workView.nextPermittedActions = [
      "reserve-public-research",
      "record-evidence-reasoning",
      "evaluate-qualification-gates",
    ];
    if (
      evaluation.assessments.some(
        (assessment) =>
          assessment.marketSafety.classification === "elevated-risk" &&
          !hasElevatedRiskResearchApproval(
            authoritativeHistory,
            assessment.opportunityId,
          ),
      )
    ) {
      workView.nextPermittedActions.push(
        "request-elevated-risk-research-approval",
      );
    }
    workView.opportunities = workView.opportunities!.map((opportunity) => {
      const assessment = assessmentsByOpportunityId.get(opportunity.id)!;
      const gates = [
        {
          id: assessment.marketSafety.gate.id,
          kind: "market-safety" as const,
          state: assessment.marketSafety.gate.state,
          applicableRule:
            assessment.marketSafety.gate.decision.applicableRule,
          decisionId: assessment.marketSafety.gate.decision.id,
        },
        ...assessment.hardConstraints.map((constraint) => ({
          id: constraint.gate.id,
          kind: "hard-constraint" as const,
          hardConstraintId: constraint.hardConstraintId,
          state: constraint.gate.state,
          applicableRule: constraint.gate.decision.applicableRule,
          decisionId: constraint.gate.decision.id,
        })),
      ];
      const failedGates = gates.filter((gate) => gate.state === "failed");
      const unresolvedGates = gates.filter((gate) => gate.state === "unresolved");
      const elevatedRiskApprovalUnavailable =
        assessment.marketSafety.classification === "elevated-risk" &&
        !hasElevatedRiskResearchApproval(
          authoritativeHistory,
          assessment.opportunityId,
        );
      const disposition =
        failedGates.length > 0
          ? {
              status: "rejected" as const,
              decisionIds: failedGates.map((gate) => gate.decisionId),
            }
          : unresolvedGates.length > 0 || elevatedRiskApprovalUnavailable
            ? {
                status: "unresolved" as const,
                decisionIds:
                  unresolvedGates.length > 0
                    ? unresolvedGates.map((gate) => gate.decisionId)
                    : [assessment.marketSafety.gate.decision.id],
              }
            : {
                status: "active" as const,
                decisionIds: gates.map((gate) => gate.decisionId),
              };
      return {
        ...opportunity,
        marketSafety: {
          classification: assessment.marketSafety.classification,
          intendedActivity: assessment.marketSafety.intendedActivity,
          excludedCategory: assessment.marketSafety.excludedCategory,
          directlyServesExcludedActivity:
            assessment.marketSafety.directlyServesExcludedActivity,
        },
        exclusionGates: gates,
        disposition,
        eligibility:
          disposition.status === "active"
            ? ("pending-qualification" as const)
            : ("ineligible" as const),
        terminalRole: null,
      };
    });
  }
  const pendingDecision = activeResearchApprovalDecision({
    researchApprovalDecisions,
    researchApprovalResponses,
  });
  if (pendingDecision !== undefined) {
    const pendingInformation = researchApprovalInformation.filter(
      (information) => information.decisionId === pendingDecision.id,
    );
    workView.pause = {
      reason: "pending-decision",
      pendingDecisionId: pendingDecision.id,
      decisionType: "research-approval",
      requestedAction: pendingDecision.request.action,
      resumable: true,
    };
    workView.completedWork.push(
      `Research Approval ${pendingDecision.id} requested`,
    );
    if (pendingInformation.length > 0) {
      workView.completedWork.push(
        `${pendingInformation.length} Research Approval explanation${pendingInformation.length === 1 ? "" : "s"} recorded for ${pendingDecision.id}`,
      );
    }
    workView.nextPermittedActions = [
      "respond-research-approval",
      "explain-research-approval",
      ...workView.nextPermittedActions,
    ];
  }
  for (const response of researchApprovalResponses) {
    if (response.response.kind === "refuse") {
      workView.completedWork.push(
        `Research Approval ${response.decisionId} refused`,
      );
    }
  }
  for (const approval of researchApprovals) {
    workView.completedWork.push(`Research Approval ${approval.id} granted`);
    workView.nextPermittedActions = [
      "verify-research-approval-scope-and-duration",
      ...workView.nextPermittedActions,
    ];
  }
  for (const expenditure of researchExpenditures) {
    workView.completedWork.push(
      `Research Expenditure ${expenditure.id} recorded against approval ${expenditure.approvalId}`,
    );
  }
  if (
    [...reservations.keys()].some(
      (reservationId) => !settledReservationIds.has(reservationId),
    )
  ) {
    workView.nextPermittedActions = ["record-public-research-observation"];
  }
  const latestIntent = records.findLast(
    (record) =>
      isRecord(record) &&
      record.type === "operation-intent" &&
      authoritativeOperationDescriptor(record.operation)?.establishesLease === true,
  );
  if (
    !isRecord(latestIntent) ||
    typeof latestIntent.coordinatorId !== "string" ||
    !isIsoInstant(latestIntent.recordedAt) ||
    !isIsoInstant(latestIntent.leaseExpiresAt)
  ) {
    throw new Error("authoritative coordinator lease is invalid");
  }
  const checkpointSequence = records.length;
  const latestRecord = records.at(-1);
  if (!isRecord(latestRecord) || !isIsoInstant(latestRecord.recordedAt)) {
    throw new Error("latest authoritative record is invalid");
  }
  const lease: CoordinatorLease = {
    coordinatorId: latestIntent.coordinatorId,
    acquiredAt: latestIntent.recordedAt,
    expiresAt: latestIntent.leaseExpiresAt,
  };
  const evidenceLedger: EvidenceLedger = {
    campaignId: manifest.campaignId,
    sources,
    observations,
    sourceLineages,
    sourceCredibilities,
    sourceFreshnesses,
    evidenceGaps,
    assumptions,
    inferences,
    contradictions,
    corrections,
    campaignDecisions,
  };
  const researchBudget: ResearchBudgetView | undefined =
    intake === undefined
      ? undefined
      : {
          sourceCap: intake.researchBudget.sourceCap,
          adversarialSourceReserve: intake.researchBudget.adversarialSourceReserve,
          ordinarySourceCap:
            intake.researchBudget.sourceCap -
            intake.researchBudget.adversarialSourceReserve,
          reservedSourceUnits: [...reservations.values()].reduce(
            (total, reservation) =>
              total +
              (settledReservationIds.has(reservation.id)
                ? 0
                : reservation.sourceUnits),
            0,
          ),
          settledSourceUnits: [...reservations.values()].reduce(
            (total, reservation) =>
              total +
              (settledReservationIds.has(reservation.id)
                ? reservation.sourceUnits
                : 0),
            0,
          ),
          remainingOrdinarySourceUnits:
            intake.researchBudget.sourceCap -
            intake.researchBudget.adversarialSourceReserve -
            [...reservations.values()].reduce(
              (total, reservation) => total + reservation.sourceUnits,
              0,
            ),
          ...(researchExpenditures.length === 0
            ? {}
            : {
                paidSpendCap: intake.researchBudget.paidSpendCap,
                recordedPaidSpend: {
                  amount: researchExpenditures.reduce(
                    (total, expenditure) => total + expenditure.amount,
                    0,
                  ),
                  currency: intake.researchBudget.paidSpendCap.currency,
                },
                remainingPaidSpend: {
                  amount:
                    intake.researchBudget.paidSpendCap.amount -
                    researchExpenditures.reduce(
                      (total, expenditure) => total + expenditure.amount,
                      0,
                    ),
                  currency: intake.researchBudget.paidSpendCap.currency,
                },
              }),
        };
  return {
    authoritativeHistory,
    campaign: {
      id: manifest.campaignId,
      path: resolvedPath,
      versions: contracts,
    },
    records,
    workView,
    lease,
    checkpoint: {
      campaignId: manifest.campaignId,
      recordSequence: checkpointSequence,
      recordedAt: latestRecord.recordedAt,
    },
    validation: {
      valid: true,
      recordCount: records.length,
      checkpointSequence,
    },
    projectionContracts: manifest.projections,
    ...(intake === undefined ? {} : { intake }),
    ...(researchBudget === undefined ? {} : { researchBudget, evidenceLedger }),
    ...(pendingDecision === undefined
      ? {}
      : { pendingDecision, researchApprovalInformation }),
    ...(researchApprovals.length === 0 ? {} : { researchApprovals }),
    ...(researchExpenditures.length === 0 ? {} : { researchExpenditures }),
  };
}

function matchesPersistedWorkView(
  persistedWorkView: unknown,
  rebuiltWorkView: WorkView,
): boolean {
  if (JSON.stringify(persistedWorkView) === JSON.stringify(rebuiltWorkView)) {
    return true;
  }
  if (rebuiltWorkView.publicResearchAvailable) {
    return false;
  }
  const {
    publicResearchAvailable: _publicResearchAvailable,
    ...legacyWorkView
  } = rebuiltWorkView;
  return JSON.stringify(persistedWorkView) === JSON.stringify(legacyWorkView);
}

async function loadCampaign(campaignPath: string) {
  const rebuiltCampaign = await rebuildCampaignFromAuthority(campaignPath);
  const persistedWorkView = await readJson(
    path.join(rebuiltCampaign.campaign.path, "work-view.json"),
  );
  if (!matchesPersistedWorkView(persistedWorkView, rebuiltCampaign.workView)) {
    throw new Error("Work View does not match authoritative history");
  }
  const persistedLease = await readJson(
    path.join(rebuiltCampaign.campaign.path, "lease.json"),
  );
  if (JSON.stringify(persistedLease) !== JSON.stringify(rebuiltCampaign.lease)) {
    throw new Error("coordinator lease does not match authoritative history");
  }
  const persistedCheckpoint = await readJson(
    path.join(
      rebuiltCampaign.campaign.path,
      "checkpoints",
      `${String(rebuiltCampaign.validation.checkpointSequence).padStart(12, "0")}.json`,
    ),
  );
  if (
    JSON.stringify(persistedCheckpoint) !==
    JSON.stringify(rebuiltCampaign.checkpoint)
  ) {
    throw new Error("latest checkpoint is invalid");
  }
  const intakePath = path.join(
    rebuiltCampaign.campaign.path,
    "campaign-intake.json",
  );
  if (rebuiltCampaign.intake === undefined) {
    if (await pathExists(intakePath)) {
      throw new Error("Campaign Intake projection has no authoritative record");
    }
  } else if (
    JSON.stringify(await readJson(intakePath)) !==
    JSON.stringify(rebuiltCampaign.intake)
  ) {
    throw new Error("Campaign Intake does not match authoritative history");
  }
  const researchBudgetPath = path.join(
    rebuiltCampaign.campaign.path,
    "research-budget.json",
  );
  const evidenceLedgerPath = path.join(
    rebuiltCampaign.campaign.path,
    "evidence-ledger.json",
  );
  if (rebuiltCampaign.researchBudget === undefined) {
    if (
      (await pathExists(researchBudgetPath)) ||
      (await pathExists(evidenceLedgerPath))
    ) {
      throw new Error("Public Research projections have no confirmed Campaign Intake");
    }
  } else {
    const requireResearchBudget =
      rebuiltCampaign.projectionContracts.researchBudget !== undefined ||
      (await pathExists(researchBudgetPath));
    const requireEvidenceLedger =
      rebuiltCampaign.projectionContracts.evidenceLedger !== undefined ||
      (await pathExists(evidenceLedgerPath));
    if (
      requireResearchBudget &&
      JSON.stringify(await readJson(researchBudgetPath)) !==
        JSON.stringify(rebuiltCampaign.researchBudget)
    ) {
      throw new Error("Research Budget does not match authoritative history");
    }
    if (
      requireEvidenceLedger &&
      JSON.stringify(await readJson(evidenceLedgerPath)) !==
        JSON.stringify(rebuiltCampaign.evidenceLedger)
    ) {
      throw new Error("Evidence Ledger does not match authoritative history");
    }
  }

  return {
    campaign: rebuiltCampaign.campaign,
    workView: rebuiltCampaign.workView,
    lease: rebuiltCampaign.lease,
    validation: rebuiltCampaign.validation,
    ...(rebuiltCampaign.intake === undefined
      ? {}
      : { intake: rebuiltCampaign.intake }),
    ...(rebuiltCampaign.researchBudget === undefined
      ? {}
      : {
          researchBudget: rebuiltCampaign.researchBudget,
          evidenceLedger: rebuiltCampaign.evidenceLedger,
        }),
    ...(rebuiltCampaign.pendingDecision === undefined
      ? {}
      : {
          pendingDecision: rebuiltCampaign.pendingDecision,
          researchApprovalInformation:
            rebuiltCampaign.researchApprovalInformation,
        }),
    ...(rebuiltCampaign.researchApprovals === undefined
      ? {}
      : { researchApprovals: rebuiltCampaign.researchApprovals }),
    ...(rebuiltCampaign.researchExpenditures === undefined
      ? {}
      : { researchExpenditures: rebuiltCampaign.researchExpenditures }),
  };
}

async function persistDerivedCampaignState(
  campaignPath: string,
  rebuiltCampaign: Awaited<ReturnType<typeof rebuildCampaignFromAuthority>>,
) {
  await replacePrivateJson(
    path.join(campaignPath, "work-view.json"),
    rebuiltCampaign.workView,
  );
  await replacePrivateJson(
    path.join(campaignPath, "lease.json"),
    rebuiltCampaign.lease,
  );
  await replacePrivateJson(
    path.join(
      campaignPath,
      "checkpoints",
      `${String(rebuiltCampaign.validation.checkpointSequence).padStart(12, "0")}.json`,
    ),
    rebuiltCampaign.checkpoint,
  );
  if (rebuiltCampaign.intake !== undefined) {
    await replacePrivateJson(
      path.join(campaignPath, "campaign-intake.json"),
      rebuiltCampaign.intake,
    );
  }
  if (rebuiltCampaign.researchBudget !== undefined) {
    await replacePrivateJson(
      path.join(campaignPath, "research-budget.json"),
      rebuiltCampaign.researchBudget,
    );
    await replacePrivateJson(
      path.join(campaignPath, "evidence-ledger.json"),
      rebuiltCampaign.evidenceLedger,
    );
  }
}

async function appendCampaignRecordsAndPersist(
  campaignPath: string,
  records: Record<string, unknown>[],
) {
  await appendFile(
    path.join(campaignPath, "records.jsonl"),
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  const updatedCampaign = await rebuildCampaignFromAuthority(campaignPath);
  await persistDerivedCampaignState(campaignPath, updatedCampaign);
  return loadCampaign(campaignPath);
}

async function hasCampaignManifest(campaignPath: string): Promise<boolean> {
  const manifestPath = path.join(campaignPath, "manifest.json");
  try {
    const manifestFile = await lstat(manifestPath);
    if (!manifestFile.isFile()) {
      return false;
    }
    return parseCampaignManifest(await readJson(manifestPath)) !== undefined;
  } catch {
    return false;
  }
}

async function locateCampaign(locator: CampaignLocator) {
  if (locator.campaignPath !== undefined) {
    return {
      campaignPath: path.resolve(locator.campaignPath),
      locatedBy: "campaignPath" as const,
    };
  }
  const searchPath = path.resolve(locator.searchPath!);
  const matches: string[] = [];
  if (await hasCampaignManifest(searchPath)) {
    matches.push(searchPath);
  }
  for (const entry of await readdir(searchPath, { withFileTypes: true })) {
    if (
      entry.isDirectory() &&
      (await hasCampaignManifest(path.join(searchPath, entry.name)))
    ) {
      matches.push(path.join(searchPath, entry.name));
    }
  }
  if (matches.length !== 1) {
    throw new Error(
      `manifest discovery requires exactly one direct Scouting Campaign; found ${matches.length}`,
    );
  }
  return { campaignPath: matches[0]!, locatedBy: "manifestDiscovery" as const };
}

async function inspectCampaign(command: InspectCampaignCommand) {
  try {
    const { campaignPath, locatedBy } = await locateCampaign(command.payload);
    const campaign = await loadCampaign(campaignPath);
    return {
      envelopeVersion: contracts.commandEnvelope,
      requestId: command.requestId,
      command: command.command,
      ok: true as const,
      result: { locatedBy, ...campaign },
    };
  } catch (error) {
    return {
      envelopeVersion: contracts.commandEnvelope,
      requestId: command.requestId,
      command: command.command,
      ok: false as const,
      error: {
        code: "SVS-CAMPAIGN-INVALID",
        message: "Scouting Campaign could not be located and validated.",
        action:
          "Check the explicit Campaign path and preserve its contents for recovery; do not continue the Campaign.",
        details: [error instanceof Error ? error.message : "unknown validation error"],
      },
    };
  }
}

function evidenceEntriesById(evidenceLedger: EvidenceLedger) {
  return new Map<string, Record<string, unknown>>([
    ...evidenceLedger.sources.map(
      (source) => [source.id, { type: "source", ...source }] as const,
    ),
    ...evidenceLedger.observations.map(
      (observation) =>
        [observation.id, { type: "observation", ...observation }] as const,
    ),
    ...[
      ...evidenceLedger.sourceLineages,
      ...evidenceLedger.sourceCredibilities,
      ...evidenceLedger.sourceFreshnesses,
      ...evidenceLedger.evidenceGaps,
      ...evidenceLedger.assumptions,
      ...evidenceLedger.inferences,
      ...evidenceLedger.contradictions,
      ...evidenceLedger.corrections,
      ...evidenceLedger.campaignDecisions,
    ].map((entry) => [entry.id, entry] as const),
  ]);
}

async function inspectEvidence(command: InspectEvidenceCommand) {
  try {
    const { campaignPath, locatedBy } = await locateCampaign(command.payload);
    const campaign = await loadCampaign(campaignPath);
    if (campaign.evidenceLedger === undefined) {
      throw new Error("Evidence Ledger is not available before Campaign Intake confirmation");
    }
    const entriesById = evidenceEntriesById(campaign.evidenceLedger);
    const missingEntryId = command.payload.entryIds.find(
      (identity) => !entriesById.has(identity),
    );
    if (missingEntryId !== undefined) {
      throw new Error(`Evidence Ledger entry ${missingEntryId} was not found`);
    }
    return {
      envelopeVersion: contracts.commandEnvelope,
      requestId: command.requestId,
      command: command.command,
      ok: true as const,
      result: {
        locatedBy,
        campaign: campaign.campaign,
        entries: command.payload.entryIds.map((identity) => entriesById.get(identity)),
      },
    };
  } catch (error) {
    return {
      envelopeVersion: contracts.commandEnvelope,
      requestId: command.requestId,
      command: command.command,
      ok: false as const,
      error: {
        code: "SVS-EVIDENCE-INSPECTION-INVALID",
        message: "Requested Evidence Ledger entries could not be inspected.",
        action:
          "Use stable entry identities from the validated Work View and preserve Campaign state when validation fails.",
        details: [error instanceof Error ? error.message : "unknown validation error"],
      },
    };
  }
}

type CoordinatorCommand =
  | ResumeCampaignCommand
  | ConfirmCampaignIntakeCommand
  | ReservePublicResearchCommand
  | RecordPublicResearchObservationCommand
  | RecordEvidenceReasoningCommand
  | RecordDiscoveryTrancheCommand
  | RecordOpportunityFormationCommand
  | PassBreadthGateCommand
  | RecordOpportunityExclusionGatesCommand
  | RequestResearchApprovalCommand
  | RecordResearchApprovalInformationCommand
  | RespondResearchApprovalCommand
  | RecordResearchExpenditureCommand;

type CoordinatorOperationFailure = {
  code: string;
  message: string;
  action: string;
  details?: string[];
};

type RebuiltCampaign = Awaited<ReturnType<typeof rebuildCampaignFromAuthority>>;
type LoadedCampaign = Awaited<ReturnType<typeof loadCampaign>>;

type CoordinatorOperationContext<Command extends CoordinatorCommand> = {
  command: Command;
  currentTime: string;
  campaignPath: string;
  rebuiltCampaign: RebuiltCampaign;
  before?: LoadedCampaign;
};

type CoordinatorOperationDescriptor<
  Command extends CoordinatorCommand,
  Result extends Record<string, unknown>,
> = {
  locateCampaign: (command: Command) => Promise<string>;
  lockedAction: string;
  requestConflict: CoordinatorOperationFailure;
  invalidCampaign: Omit<CoordinatorOperationFailure, "details">;
  requireCampaignManifest?: boolean;
  loadBeforeRequestConflict?: boolean;
  loadBeforeValidation?: boolean;
  isReplay: (context: CoordinatorOperationContext<Command>) => boolean;
  replayResult: (command: Command, replayed: LoadedCampaign) => Result;
  validateBeforeLease?: (
    context: CoordinatorOperationContext<Command>,
  ) => CoordinatorOperationFailure | undefined;
  lease: {
    mode: "active" | "reclaim";
    failure: (
      context: CoordinatorOperationContext<Command>,
      lease: CoordinatorLease,
    ) => CoordinatorOperationFailure;
  };
  validateAfterLease?: (
    context: CoordinatorOperationContext<Command>,
  ) => CoordinatorOperationFailure | undefined;
  records: (
    context: CoordinatorOperationContext<Command>,
  ) => Record<string, unknown>[];
  successResult: (command: Command, after: LoadedCampaign) => Result;
};

function coordinatorOperationSuccess<
  Command extends CoordinatorCommand,
  Result extends Record<string, unknown>,
>(command: Command, result: Result) {
  return {
    envelopeVersion: contracts.commandEnvelope,
    requestId: command.requestId,
    command: command.command,
    ok: true as const,
    result,
  };
}

function coordinatorOperationFailure(
  command: CoordinatorCommand,
  error: CoordinatorOperationFailure,
) {
  return {
    envelopeVersion: contracts.commandEnvelope,
    requestId: command.requestId,
    command: command.command,
    ok: false as const,
    error,
  };
}

async function runCoordinatorOperation<
  Command extends CoordinatorCommand,
  Result extends Record<string, unknown>,
>(
  command: Command,
  currentTime: string,
  descriptor: CoordinatorOperationDescriptor<Command, Result>,
) {
  let coordinatorLock: CoordinatorOperationLock | undefined;
  try {
    const campaignPath = await descriptor.locateCampaign(command);
    if (
      descriptor.requireCampaignManifest !== false &&
      !(await hasCampaignManifest(campaignPath))
    ) {
      throw new Error("Campaign manifest is missing or invalid");
    }
    coordinatorLock = await acquireCoordinatorOperationLock(
      campaignPath,
      command.requestId,
      command.payload.coordinatorId,
      currentTime,
    );
    if (coordinatorLock === undefined) {
      return coordinatorOperationFailure(command, {
        code: "SVS-CAMPAIGN-LOCKED",
        message: "Scouting Campaign is being changed by another coordinator.",
        action: descriptor.lockedAction,
      });
    }

    const rebuiltCampaign = await rebuildCampaignFromAuthority(campaignPath);
    let context: CoordinatorOperationContext<Command> = {
      command,
      currentTime,
      campaignPath,
      rebuiltCampaign,
    };
    if (descriptor.isReplay(context)) {
      await persistDerivedCampaignState(campaignPath, rebuiltCampaign);
      const replayed = await loadCampaign(campaignPath);
      return coordinatorOperationSuccess(
        command,
        descriptor.replayResult(command, replayed),
      );
    }

    if (descriptor.loadBeforeRequestConflict) {
      context = { ...context, before: await loadCampaign(campaignPath) };
    }
    if (
      rebuiltCampaign.records.some(
        (record) => isRecord(record) && record.requestId === command.requestId,
      )
    ) {
      return coordinatorOperationFailure(command, descriptor.requestConflict);
    }
    if (descriptor.loadBeforeValidation && context.before === undefined) {
      context = { ...context, before: await loadCampaign(campaignPath) };
    }

    const beforeLeaseFailure = descriptor.validateBeforeLease?.(context);
    if (beforeLeaseFailure !== undefined) {
      return coordinatorOperationFailure(command, beforeLeaseFailure);
    }

    const lease = context.before?.lease ?? rebuiltCampaign.lease;
    const leaseUnavailable =
      descriptor.lease.mode === "active"
        ? lease.coordinatorId !== command.payload.coordinatorId ||
          lease.expiresAt <= currentTime
        : lease.coordinatorId !== command.payload.coordinatorId &&
          lease.expiresAt > currentTime;
    if (leaseUnavailable) {
      return coordinatorOperationFailure(
        command,
        descriptor.lease.failure(context, lease),
      );
    }

    const afterLeaseFailure = descriptor.validateAfterLease?.(context);
    if (afterLeaseFailure !== undefined) {
      return coordinatorOperationFailure(command, afterLeaseFailure);
    }

    const records = descriptor.records(context);
    const after = await appendCampaignRecordsAndPersist(campaignPath, records);
    return coordinatorOperationSuccess(
      command,
      descriptor.successResult(command, after),
    );
  } catch (error) {
    return coordinatorOperationFailure(command, {
      ...descriptor.invalidCampaign,
      details: [error instanceof Error ? error.message : "unknown validation error"],
    });
  } finally {
    if (coordinatorLock !== undefined) {
      await releaseCoordinatorOperationLock(coordinatorLock);
    }
  }
}

async function resumeCampaign(command: ResumeCampaignCommand, currentTime: string) {
  const buildResumeResult = (resumed: boolean, campaign: LoadedCampaign) => ({
    resumed,
    campaign: campaign.campaign,
    summary: {
      completedWork: campaign.workView.completedWork,
      currentPhase: campaign.workView.phase,
      currentPause: campaign.workView.pause,
      nextPermittedActions: campaign.workView.nextPermittedActions,
    },
    workView: campaign.workView,
    lease: campaign.lease,
    validation: campaign.validation,
    ...(campaign.pendingDecision === undefined
      ? {}
      : { pendingDecision: campaign.pendingDecision }),
  });

  return runCoordinatorOperation(command, currentTime, {
    async locateCampaign(command) {
      return (await locateCampaign(command.payload)).campaignPath;
    },
    lockedAction: "Do not resume concurrently; retry after the active operation finishes.",
    requestConflict: {
      code: "SVS-CAMPAIGN-REQUEST-CONFLICT",
      message: "Resume request identity was already used with different input.",
      action:
        "Reuse the original request payload or provide a new stable request identity.",
    },
    invalidCampaign: {
      code: "SVS-CAMPAIGN-INVALID",
      message: "Scouting Campaign could not be located and validated for resume.",
      action:
        "Preserve the Campaign contents for recovery and do not continue until validation succeeds.",
    },
    requireCampaignManifest: false,
    loadBeforeRequestConflict: true,
    isReplay({ rebuiltCampaign }) {
      const matchingIntent = rebuiltCampaign.records.some(
        (record) =>
          isRecord(record) &&
          record.type === "operation-intent" &&
          record.operation === "resume-campaign" &&
          record.requestId === command.requestId &&
          record.recordedAt === command.payload.resumedAt &&
          record.coordinatorId === command.payload.coordinatorId &&
          record.leaseExpiresAt === command.payload.leaseExpiresAt,
      );
      const matchingOutcome = rebuiltCampaign.records.some(
        (record) =>
          isRecord(record) &&
          record.type ===
            authoritativeOperationDescriptors["resume-campaign"].outcome &&
          record.requestId === command.requestId,
      );
      return matchingIntent && matchingOutcome;
    },
    replayResult(_command, replayed) {
      return buildResumeResult(false, replayed);
    },
    lease: {
      mode: "reclaim",
      failure(_context, lease) {
        return {
          code: "SVS-CAMPAIGN-LEASE-HELD",
          message: `Scouting Campaign has an active lease held by ${lease.coordinatorId}.`,
          action:
            "Do not resume concurrently; use the active coordinator or wait until the recorded lease expires.",
        };
      },
    },
    records({ before }) {
      const campaign = before!;
      return campaignOperationRecords({
        campaignId: campaign.campaign.id,
        requestId: command.requestId,
        recordedAt: command.payload.resumedAt,
        firstSequence: campaign.validation.recordCount + 1,
        operation: "resume-campaign",
        coordinatorId: command.payload.coordinatorId,
        leaseExpiresAt: command.payload.leaseExpiresAt,
      });
    },
    successResult(_command, after) {
      return buildResumeResult(true, after);
    },
  });
}
async function confirmCampaignIntake(
  command: ConfirmCampaignIntakeCommand,
  currentTime: string,
) {
  const buildIntakeConfirmationResult = (
    confirmed: boolean,
    campaign: LoadedCampaign,
  ) => ({
    confirmed,
    campaign: campaign.campaign,
    intake: campaign.intake,
    workView: campaign.workView,
    lease: campaign.lease,
  });

  return runCoordinatorOperation(command, currentTime, {
    async locateCampaign(command) {
      return path.resolve(command.payload.campaignPath);
    },
    lockedAction:
      "Do not confirm Campaign Intake concurrently; retry after the active operation finishes.",
    requestConflict: {
      code: "SVS-CAMPAIGN-REQUEST-CONFLICT",
      message:
        "Campaign Intake request identity was already used with different input.",
      action:
        "Reuse the original request payload or provide a new stable request identity.",
    },
    invalidCampaign: {
      code: "SVS-CAMPAIGN-INVALID",
      message:
        "Campaign Intake could not be confirmed against valid authoritative Campaign history.",
      action:
        "Preserve the Campaign contents, resolve the reported validation problem, and keep Public Research paused.",
    },
    isReplay({ rebuiltCampaign }) {
      const expectedIntake: ConfirmedCampaignIntake = {
        campaignId: rebuiltCampaign.campaign.id,
        confirmedAt: command.payload.confirmedAt,
        ...command.payload.intake,
      };
      return rebuiltCampaign.records.some(
        (record) =>
          isRecord(record) &&
          record.type ===
            authoritativeOperationDescriptors["confirm-campaign-intake"].outcome &&
          record.requestId === command.requestId &&
          JSON.stringify(record.intake) === JSON.stringify(expectedIntake),
      );
    },
    replayResult(_command, replayed) {
      return buildIntakeConfirmationResult(false, replayed);
    },
    validateBeforeLease({ rebuiltCampaign }) {
      return rebuiltCampaign.intake === undefined
        ? undefined
        : {
            code: "SVS-CAMPAIGN-INTAKE-ALREADY-CONFIRMED",
            message: "The first Campaign Intake version is already confirmed.",
            action:
              "Inspect the confirmed Campaign Intake; do not overwrite authoritative history.",
          };
    },
    lease: {
      mode: "active",
      failure() {
        return {
          code: "SVS-CAMPAIGN-LEASE-NOT-HELD",
          message:
            "Campaign Intake confirmation requires the active coordinator lease.",
          action:
            "Resume the Scouting Campaign with this coordinator before confirming Campaign Intake.",
        };
      },
    },
    records({ rebuiltCampaign }) {
      return campaignIntakeRecords(
        rebuiltCampaign.campaign.id,
        command,
        rebuiltCampaign.records.length + 1,
      );
    },
    successResult(_command, after) {
      return buildIntakeConfirmationResult(true, after);
    },
  });
}
async function reservePublicResearch(
  command: ReservePublicResearchCommand,
  currentTime: string,
) {
  const buildReservationResult = (
    reserved: boolean,
    campaign: LoadedCampaign,
  ) => ({
    reserved,
    reservation: command.payload.reservation,
    researchBudget: campaign.researchBudget,
    workView: campaign.workView,
  });

  return runCoordinatorOperation(command, currentTime, {
    async locateCampaign(command) {
      return path.resolve(command.payload.campaignPath);
    },
    lockedAction:
      "Do not reserve research concurrently; retry after the active operation finishes.",
    requestConflict: {
      code: "SVS-CAMPAIGN-REQUEST-CONFLICT",
      message:
        "Public Research reservation request identity was already used with different input.",
      action:
        "Reuse the original request payload or provide a new stable request identity.",
    },
    invalidCampaign: {
      code: "SVS-CAMPAIGN-INVALID",
      message:
        "Public Research capacity could not be reserved against valid Campaign history.",
      action:
        "Preserve the Campaign contents and keep Public Research paused until validation succeeds.",
    },
    loadBeforeValidation: true,
    isReplay({ rebuiltCampaign }) {
      return rebuiltCampaign.records.some(
        (record) =>
          isRecord(record) &&
          record.type ===
            authoritativeOperationDescriptors["reserve-public-research"].outcome &&
          record.requestId === command.requestId &&
          JSON.stringify(record.reservation) ===
            JSON.stringify(command.payload.reservation),
      );
    },
    replayResult(_command, replayed) {
      return buildReservationResult(false, replayed);
    },
    validateBeforeLease({ before, rebuiltCampaign }) {
      const campaign = before!;
      if (
        campaign.intake === undefined ||
        campaign.researchBudget === undefined ||
        campaign.evidenceLedger === undefined
      ) {
        return {
          code: "SVS-PUBLIC-RESEARCH-NOT-AVAILABLE",
          message:
            "Public Research requires a valid explicitly confirmed Campaign Intake.",
          action:
            "Complete and explicitly confirm Campaign Intake before reserving Public Research capacity.",
        };
      }
      if (command.payload.reservedAt < campaign.intake.confirmedAt) {
        return {
          code: "SVS-RESEARCH-RESERVATION-INVALID",
          message:
            "Public Research reservation cannot predate Campaign Intake confirmation.",
          action:
            "Reserve capacity only after the confirmed Campaign Intake makes Public Research available.",
        };
      }
      return undefined;
    },
    lease: {
      mode: "active",
      failure() {
        return {
          code: "SVS-CAMPAIGN-LEASE-NOT-HELD",
          message:
            "Public Research reservation requires the active coordinator lease.",
          action:
            "Resume the Scouting Campaign with this coordinator before reserving research.",
        };
      },
    },
    validateAfterLease({ before, rebuiltCampaign }) {
      const campaign = before!;
      if (
        rebuiltCampaign.records.some(
          (record) =>
            isRecord(record) &&
            record.type ===
              authoritativeOperationDescriptors["reserve-public-research"].outcome &&
            isRecord(record.reservation) &&
            record.reservation.id === command.payload.reservation.id,
        )
      ) {
        return {
          code: "SVS-RESEARCH-RESERVATION-CONFLICT",
          message:
            "Research reservation identity is already present in this Campaign.",
          action:
            "Reuse the original reservation request or create a new stable reservation identity.",
        };
      }
      if (
        campaign.researchBudget!.remainingOrdinarySourceUnits <
        command.payload.reservation.sourceUnits
      ) {
        return {
          code: "SVS-RESEARCH-BUDGET-EXHAUSTED",
          message:
            "The ordinary Public Research Source cap has no unreserved capacity.",
          action:
            "Do not retrieve another ordinary Source; preserve the adversarial reserve.",
        };
      }
      const deepeningViolation =
        opportunityDeepeningViolation(
          rebuiltCampaign.authoritativeHistory,
          command.payload.reservation,
          command.payload.reservedAt,
        );
      if (deepeningViolation !== undefined) {
        return {
          code:
            deepeningViolation === "ineligible"
              ? "SVS-OPPORTUNITY-INELIGIBLE"
              : deepeningViolation === "required"
              ? "SVS-ELEVATED-RISK-APPROVAL-REQUIRED"
              : "SVS-ELEVATED-RISK-APPROVAL-SCOPE-MISMATCH",
          message:
            deepeningViolation === "ineligible"
              ? "Deep research requires a named Opportunity with every current Exclusion Gate passed."
              : deepeningViolation === "required"
              ? "Deep research for an Elevated-Risk Market requires Opportunity-specific Research Approval."
              : "The Research Approval does not match this Opportunity, purpose, depth, or time.",
          action:
            "Keep the Opportunity unresolved and ineligible; request explicit scoped approval or continue only shallow classification and independent permitted work.",
        };
      }
      const allocationViolation = publicResearchAllocationViolation(
        rebuiltCampaign.authoritativeHistory,
        command.payload.reservation,
      );
      if (allocationViolation === "required") {
        return {
          code: "SVS-RESEARCH-ALLOCATION-REQUIRED",
          message:
            "Post-Breadth-Gate ordinary research must identify its deepening or open-world discovery allocation.",
          action:
            "Classify the reservation against the post-gate eighty/twenty allocation and retry.",
        };
      }
      if (allocationViolation === "not-available") {
        return {
          code: "SVS-RESEARCH-ALLOCATION-NOT-AVAILABLE",
          message:
            "Post-Breadth-Gate research allocation cannot be used before the Breadth Gate passes.",
          action:
            "Continue pre-gate discovery and shallow problem mining without a post-gate research class.",
        };
      }
      if (allocationViolation === "imbalanced") {
        return {
          code: "SVS-RESEARCH-ALLOCATION-IMBALANCED",
          message:
            "The reservation would exceed the post-Breadth-Gate eighty/twenty allocation.",
          action:
            command.payload.reservation.researchClass === "deepening"
              ? "Use the next ordinary Source unit for open-world discovery."
              : "Use the next ordinary Source unit for Opportunity deepening.",
        };
      }
      return undefined;
    },
    records({ before }) {
      const campaign = before!;
      return publicResearchReservationRecords(
        campaign.campaign.id,
        command,
        campaign.validation.recordCount + 1,
      );
    },
    successResult(_command, after) {
      return buildReservationResult(true, after);
    },
  });
}

async function requestResearchApproval(
  command: RequestResearchApprovalCommand,
  currentTime: string,
) {
  const buildResult = (requested: boolean, campaign: LoadedCampaign) => ({
    requested,
    pendingDecision: campaign.pendingDecision,
    workView: campaign.workView,
  });

  return runCoordinatorOperation(command, currentTime, {
    async locateCampaign(command) {
      return path.resolve(command.payload.campaignPath);
    },
    lockedAction:
      "Do not request approval concurrently; retry after the active operation finishes.",
    requestConflict: {
      code: "SVS-CAMPAIGN-REQUEST-CONFLICT",
      message: "Research Approval request identity was already used with different input.",
      action: "Reuse the original request payload or provide a new stable request identity.",
    },
    invalidCampaign: {
      code: "SVS-CAMPAIGN-INVALID",
      message: "Research Approval could not be requested against valid Campaign history.",
      action: "Preserve Campaign contents and do not perform the restricted or paid action.",
    },
    loadBeforeValidation: true,
    isReplay({ rebuiltCampaign }) {
      return rebuiltCampaign.records.some(
        (record) =>
          isRecord(record) &&
          record.type ===
            authoritativeOperationDescriptors["request-research-approval"].outcome &&
          record.requestId === command.requestId &&
          isRecord(record.pendingDecision) &&
          JSON.stringify(record.pendingDecision.request) ===
            JSON.stringify(command.payload.request),
      );
    },
    replayResult(_command, replayed) {
      return buildResult(false, replayed);
    },
    validateBeforeLease({ before, rebuiltCampaign }) {
      const campaign = before!;
      if (campaign.intake === undefined) {
        return {
          code: "SVS-RESEARCH-APPROVAL-NOT-AVAILABLE",
          message: "Research Approval requires a confirmed Campaign Intake.",
          action: "Confirm Campaign Intake before requesting restricted or paid research.",
        };
      }
      if (campaign.pendingDecision !== undefined) {
        return {
          code: "SVS-PENDING-DECISION-ACTIVE",
          message: `Pending Decision ${campaign.pendingDecision.id} already requires an explicit response.`,
          action: "Answer, refuse, or ask about the active Pending Decision; do not replace it.",
        };
      }
      const elevatedRiskViolation = elevatedRiskApprovalRequestViolation(
        rebuiltCampaign.authoritativeHistory,
        command.payload.request,
      );
      if (elevatedRiskViolation !== undefined) {
        return {
          code: "SVS-ELEVATED-RISK-APPROVAL-SCOPE-INVALID",
          message: `Elevated-Risk Research Approval is invalid: ${elevatedRiskViolation}.`,
          action:
            "Request approval only for deep research on the named surviving Elevated-Risk Opportunity; approval cannot override an Exclusion Gate.",
        };
      }
      if (currentTime > command.payload.request.duration.expiresAt) {
        return {
          code: "SVS-RESEARCH-APPROVAL-EXPIRED",
          message: "Research Approval request duration has already expired.",
          action: "Create a current bounded scope and request renewed approval; do not backdate permission.",
        };
      }
      const maximumCost = command.payload.request.maximumCost;
      const recordedSpend = (campaign.researchExpenditures ?? []).reduce(
        (total, expenditure) => total + expenditure.amount,
        0,
      );
      if (
        maximumCost.currency !== campaign.intake.researchBudget.paidSpendCap.currency ||
        maximumCost.amount >
          campaign.intake.researchBudget.paidSpendCap.amount - recordedSpend
      ) {
        return {
          code: "SVS-RESEARCH-APPROVAL-BUDGET-INVALID",
          message: "Requested maximum cost exceeds or uses a different currency from the Research Budget.",
          action: "Reduce the maximum cost to the confirmed paid-spend cap or revise Campaign Intake explicitly.",
        };
      }
      return undefined;
    },
    lease: {
      mode: "active",
      failure() {
        return {
          code: "SVS-CAMPAIGN-LEASE-NOT-HELD",
          message: "Research Approval request requires the active coordinator lease.",
          action: "Resume the Scouting Campaign with this coordinator before requesting approval.",
        };
      },
    },
    records({ before }) {
      return researchApprovalRequestRecords(
        before!.campaign.id,
        command,
        before!.validation.recordCount + 1,
      );
    },
    successResult(_command, after) {
      return buildResult(true, after);
    },
  });
}

async function recordResearchApprovalInformation(
  command: RecordResearchApprovalInformationCommand,
  currentTime: string,
) {
  const buildResult = (recorded: boolean, campaign: LoadedCampaign) => ({
    recorded,
    pendingDecision: campaign.pendingDecision,
    information: command.payload.information,
    workView: campaign.workView,
  });
  return runCoordinatorOperation(command, currentTime, {
    async locateCampaign(command) {
      return path.resolve(command.payload.campaignPath);
    },
    lockedAction:
      "Do not record approval information concurrently; retry after the active operation finishes.",
    requestConflict: {
      code: "SVS-CAMPAIGN-REQUEST-CONFLICT",
      message: "Research Approval information request identity was already used with different input.",
      action: "Reuse the original request payload or provide a new stable request identity.",
    },
    invalidCampaign: {
      code: "SVS-CAMPAIGN-INVALID",
      message: "Research Approval information could not be recorded against valid Campaign history.",
      action: "Preserve Campaign contents and leave the Pending Decision unanswered.",
    },
    loadBeforeValidation: true,
    isReplay({ rebuiltCampaign }) {
      return rebuiltCampaign.records.some(
        (record) =>
          isRecord(record) &&
          record.type ===
            authoritativeOperationDescriptors[
              "record-research-approval-information"
            ].outcome &&
          record.requestId === command.requestId &&
          record.decisionId === command.payload.decisionId &&
          JSON.stringify(record.information) ===
            JSON.stringify(command.payload.information),
      );
    },
    replayResult(_command, replayed) {
      return buildResult(false, replayed);
    },
    validateBeforeLease({ before }) {
      const pendingDecision = before!.pendingDecision;
      if (pendingDecision?.id !== command.payload.decisionId) {
        return {
            code: "SVS-PENDING-DECISION-NOT-FOUND",
            message: "The named Research Approval Pending Decision is not active.",
            action: "Use the active Pending Decision identity without treating information as consent.",
          };
      }
      return command.payload.recordedAt < pendingDecision.requestedAt
        ? {
            code: "SVS-RESEARCH-APPROVAL-INFORMATION-INVALID",
            message: "Research Approval information cannot predate its Pending Decision.",
            action: "Record information only after the approval request was checkpointed.",
          }
        : undefined;
    },
    lease: {
      mode: "active",
      failure() {
        return {
          code: "SVS-CAMPAIGN-LEASE-NOT-HELD",
          message: "Recording Research Approval information requires the active coordinator lease.",
          action: "Resume the Scouting Campaign with this coordinator before recording information.",
        };
      },
    },
    validateAfterLease({ rebuiltCampaign }) {
      return (rebuiltCampaign.researchApprovalInformation ?? []).some(
        (information) => information.id === command.payload.information.id,
      )
        ? {
            code: "SVS-RESEARCH-APPROVAL-INFORMATION-CONFLICT",
            message: "Research Approval information identity already exists.",
            action: "Replay the original request or use a new stable information identity.",
          }
        : undefined;
    },
    records({ before }) {
      return researchApprovalInformationRecords(
        before!.campaign.id,
        command,
        before!.validation.recordCount + 1,
      );
    },
    successResult(_command, after) {
      return buildResult(true, after);
    },
  });
}

async function respondResearchApproval(
  command: RespondResearchApprovalCommand,
  currentTime: string,
) {
  const buildResult = (responded: boolean, campaign: LoadedCampaign) => ({
    responded,
    pendingDecision: campaign.pendingDecision ?? null,
    researchApprovals: campaign.researchApprovals ?? [],
    ...(command.payload.response.kind === "refuse"
      ? { evidenceGap: command.payload.response.refusal.evidenceGap }
      : {}),
    workView: campaign.workView,
  });
  return runCoordinatorOperation(command, currentTime, {
    async locateCampaign(command) {
      return path.resolve(command.payload.campaignPath);
    },
    lockedAction:
      "Do not respond to approval concurrently; retry after the active operation finishes.",
    requestConflict: {
      code: "SVS-CAMPAIGN-REQUEST-CONFLICT",
      message: "Research Approval response identity was already used with different input.",
      action: "Reuse the original response payload or provide a new stable request identity.",
    },
    invalidCampaign: {
      code: "SVS-CAMPAIGN-INVALID",
      message: "Research Approval response could not be recorded against valid Campaign history.",
      action: "Preserve Campaign contents and do not perform the restricted or paid action.",
    },
    loadBeforeValidation: true,
    isReplay({ rebuiltCampaign }) {
      return rebuiltCampaign.records.some(
        (record) =>
          isRecord(record) &&
          record.type ===
            authoritativeOperationDescriptors["respond-research-approval"].outcome &&
          record.requestId === command.requestId &&
          record.decisionId === command.payload.decisionId &&
          JSON.stringify(record.response) === JSON.stringify(command.payload.response),
      );
    },
    replayResult(_command, replayed) {
      return buildResult(false, replayed);
    },
    validateBeforeLease({ before }) {
      const pendingDecision = before!.pendingDecision;
      if (pendingDecision?.id !== command.payload.decisionId) {
        return {
          code: "SVS-PENDING-DECISION-NOT-FOUND",
          message: "The named Research Approval Pending Decision is not active.",
          action: "Use the active Pending Decision identity; silence and unrelated messages are not consent.",
        };
      }
      if (command.payload.respondedAt < pendingDecision.requestedAt) {
        return {
          code: "SVS-RESEARCH-APPROVAL-RESPONSE-INVALID",
          message: "Research Approval response cannot predate its Pending Decision.",
          action: "Record the explicit response only after the approval request was checkpointed.",
        };
      }
      if (command.payload.response.kind === "approve") {
        if (
          JSON.stringify(command.payload.response.approval.scope) !==
          JSON.stringify(pendingDecision.request)
        ) {
          return {
            code: "SVS-RESEARCH-APPROVAL-SCOPE-CHANGED",
            message: "The approved scope differs from the active Research Approval request.",
            action: "Keep the current decision pending or refuse it, then request renewed approval for the changed scope.",
          };
        }
      }
      if (
        command.payload.response.kind === "approve" &&
        currentTime > pendingDecision.request.duration.expiresAt
      ) {
        return {
          code: "SVS-RESEARCH-APPROVAL-EXPIRED",
          message: "The Research Approval request expired before the explicit response.",
          action: "Request renewed approval with a current duration; do not use the expired scope.",
        };
      }
      return undefined;
    },
    lease: {
      mode: "active",
      failure() {
        return {
          code: "SVS-CAMPAIGN-LEASE-NOT-HELD",
          message: "Research Approval response requires the active coordinator lease.",
          action: "Resume the Scouting Campaign with this coordinator before recording the response.",
        };
      },
    },
    validateAfterLease({ rebuiltCampaign }) {
      const response = command.payload.response;
      const identityConflict = response.kind === "approve"
        ? rebuiltCampaign.researchApprovals?.some(
            (approval) => approval.id === response.approval.id,
          )
        : rebuiltCampaign.records.some(
            (recorded) =>
              isRecord(recorded) &&
              recorded.type ===
                authoritativeOperationDescriptors["respond-research-approval"].outcome &&
              isRecord(recorded.response) &&
              recorded.response.kind === "refuse" &&
              isRecord(recorded.response.refusal) &&
              recorded.response.refusal.id === response.refusal.id,
          );
      if (identityConflict) {
        return {
          code: "SVS-RESEARCH-APPROVAL-IDENTITY-CONFLICT",
          message: "Research Approval response identity already exists.",
          action: "Replay the original response or use a unique stable response identity.",
        };
      }
      if (response.kind === "refuse") {
        const ledger = rebuiltCampaign.evidenceLedger!;
        const invalidLink = applyReasoningEntries(
          {
            sources: ledger.sources,
            observations: ledger.observations,
            sourceLineages: [...ledger.sourceLineages],
            sourceCredibilities: [...ledger.sourceCredibilities],
            sourceFreshnesses: [...ledger.sourceFreshnesses],
            evidenceGaps: [...ledger.evidenceGaps],
            assumptions: [...ledger.assumptions],
            inferences: [...ledger.inferences],
            contradictions: [...ledger.contradictions],
            corrections: [...ledger.corrections],
          },
          [response.refusal.evidenceGap],
        );
        if (invalidLink !== undefined) {
          return {
            code: "SVS-EVIDENCE-LINK-INVALID",
            message: `Refusal Evidence Gap uses an unknown or duplicate identity ${invalidLink}.`,
            action: "Use a unique Evidence Gap identity and preserve the refused research boundary.",
          };
        }
      }
      return undefined;
    },
    records({ before }) {
      return researchApprovalResponseRecords(
        before!.campaign.id,
        command,
        before!.validation.recordCount + 1,
      );
    },
    successResult(_command, after) {
      return buildResult(true, after);
    },
  });
}

async function recordResearchExpenditure(
  command: RecordResearchExpenditureCommand,
  currentTime: string,
) {
  const buildResult = (recorded: boolean, campaign: LoadedCampaign) => ({
    recorded,
    expenditure: campaign.researchExpenditures?.find(
      (expenditure) => expenditure.id === command.payload.expenditure.id,
    ),
    researchBudget: campaign.researchBudget,
    workView: campaign.workView,
  });
  return runCoordinatorOperation(command, currentTime, {
    async locateCampaign(command) {
      return path.resolve(command.payload.campaignPath);
    },
    lockedAction:
      "Do not record expenditure concurrently; retry after the active operation finishes.",
    requestConflict: {
      code: "SVS-CAMPAIGN-REQUEST-CONFLICT",
      message: "Research Expenditure request identity was already used with different input.",
      action: "Reuse the original expenditure payload or provide a new stable request identity.",
    },
    invalidCampaign: {
      code: "SVS-CAMPAIGN-INVALID",
      message: "Research Expenditure could not be recorded against valid Campaign history.",
      action: "Preserve Campaign contents and do not repeat an ambiguous purchase or charge.",
    },
    loadBeforeValidation: true,
    isReplay({ rebuiltCampaign }) {
      return rebuiltCampaign.records.some(
        (record) =>
          isRecord(record) &&
          record.type ===
            authoritativeOperationDescriptors["record-research-expenditure"].outcome &&
          record.requestId === command.requestId &&
          isRecord(record.expenditure) &&
          record.expenditure.id === command.payload.expenditure.id &&
          record.expenditure.approvalId === command.payload.expenditure.approvalId &&
          record.expenditure.sourceId === command.payload.expenditure.sourceId &&
          record.expenditure.purpose === command.payload.expenditure.purpose &&
          record.expenditure.amount === command.payload.expenditure.amount &&
          record.expenditure.currency === command.payload.expenditure.currency &&
          record.expenditure.incurredAt === command.payload.incurredAt,
      );
    },
    replayResult(_command, replayed) {
      return buildResult(false, replayed);
    },
    validateBeforeLease({ before }) {
      const campaign = before!;
      const expenditure = command.payload.expenditure;
      const approval = campaign.researchApprovals?.find(
        (existing) => existing.id === expenditure.approvalId,
      );
      if (approval === undefined) {
        return {
          code: "SVS-RESEARCH-APPROVAL-NOT-FOUND",
          message: "Research Expenditure has no matching granted Research Approval.",
          action: "Do not pay or retry; request explicit scoped approval first.",
        };
      }
      const policyViolation = researchExpenditurePolicyViolation({
        expenditure: {
          ...expenditure,
          approvalDecisionId: approval.decisionId,
          incurredAt: command.payload.incurredAt,
        },
        approval,
        intake: campaign.intake!,
        existingExpenditures: campaign.researchExpenditures ?? [],
      });
      if (policyViolation === "scope") {
        return {
          code: "SVS-RESEARCH-APPROVAL-SCOPE-CHANGED",
          message: "Research Expenditure differs from the approved Source, purpose, access, or currency.",
          action: "Do not pay; request renewed approval for the changed material scope.",
        };
      }
      if (policyViolation === "duration") {
        return {
          code: "SVS-RESEARCH-APPROVAL-EXPIRED",
          message: "Research Expenditure falls outside the granted approval duration.",
          action: "Do not pay or retry; request renewed approval for a current duration.",
        };
      }
      if (
        policyViolation === "approval-budget" ||
        policyViolation === "campaign-budget"
      ) {
        return {
          code: "SVS-RESEARCH-BUDGET-EXHAUSTED",
          message: "Research Expenditure exceeds its approved maximum or Campaign Research Budget.",
          action: "Do not pay; reduce the cost or explicitly revise the governing scope and budget.",
        };
      }
      return undefined;
    },
    lease: {
      mode: "active",
      failure() {
        return {
          code: "SVS-CAMPAIGN-LEASE-NOT-HELD",
          message: "Research Expenditure requires the active coordinator lease.",
          action: "Resume the Scouting Campaign before recording expenditure; do not repeat an ambiguous charge.",
        };
      },
    },
    validateAfterLease({ rebuiltCampaign }) {
      return rebuiltCampaign.researchExpenditures?.some(
        (existing) => existing.id === command.payload.expenditure.id,
      )
        ? {
            code: "SVS-RESEARCH-EXPENDITURE-IDENTITY-CONFLICT",
            message: "Research Expenditure identity already exists.",
            action: "Replay the original request; do not charge the expenditure again.",
          }
        : undefined;
    },
    records({ before }) {
      const approval = before!.researchApprovals!.find(
        (existing) => existing.id === command.payload.expenditure.approvalId,
      )!;
      return researchExpenditureRecords(
        before!.campaign.id,
        approval,
        command,
        before!.validation.recordCount + 1,
      );
    },
    successResult(_command, after) {
      return buildResult(true, after);
    },
  });
}
async function recordPublicResearchObservation(
  command: RecordPublicResearchObservationCommand,
  currentTime: string,
) {
  const buildObservationImportResult = (
    recorded: boolean,
    campaign: LoadedCampaign,
  ) => ({
    recorded,
    researchBudget: campaign.researchBudget,
    evidenceLedger: campaign.evidenceLedger,
    workView: campaign.workView,
  });

  return runCoordinatorOperation(command, currentTime, {
    async locateCampaign(command) {
      return path.resolve(command.payload.campaignPath);
    },
    lockedAction:
      "Do not import research concurrently; retry after the active operation finishes.",
    requestConflict: {
      code: "SVS-CAMPAIGN-REQUEST-CONFLICT",
      message:
        "Public Research import request identity was already used with different input.",
      action:
        "Reuse the original request payload or provide a new stable request identity.",
    },
    invalidCampaign: {
      code: "SVS-CAMPAIGN-INVALID",
      message:
        "Public Research Observation could not be imported against valid Campaign history.",
      action:
        "Preserve the Campaign contents and reservation; do not repeat retrieval until validation succeeds.",
    },
    loadBeforeValidation: true,
    isReplay({ rebuiltCampaign }) {
      return rebuiltCampaign.records.some(
        (record) =>
          isRecord(record) &&
          record.type ===
            authoritativeOperationDescriptors[
              "record-public-research-observation"
            ].outcome &&
          record.requestId === command.requestId &&
          record.reservationId === command.payload.reservationId &&
          JSON.stringify(record.source) ===
            JSON.stringify(command.payload.source) &&
          JSON.stringify(record.observation) ===
            JSON.stringify(command.payload.observation),
      );
    },
    replayResult(_command, replayed) {
      return buildObservationImportResult(false, replayed);
    },
    validateBeforeLease({ before }) {
      const campaign = before!;
      return campaign.intake !== undefined &&
        campaign.researchBudget !== undefined &&
        campaign.evidenceLedger !== undefined
        ? undefined
        : {
            code: "SVS-PUBLIC-RESEARCH-NOT-AVAILABLE",
            message:
              "Public Research requires a valid explicitly confirmed Campaign Intake.",
            action:
              "Complete and explicitly confirm Campaign Intake before importing research.",
          };
    },
    lease: {
      mode: "active",
      failure() {
        return {
          code: "SVS-CAMPAIGN-LEASE-NOT-HELD",
          message:
            "Public Research import requires the active coordinator lease.",
          action:
            "Resume the Scouting Campaign with this coordinator before importing research.",
        };
      },
    },
    validateAfterLease({ before, rebuiltCampaign }) {
      const campaign = before!;
      const reservationOutcome = rebuiltCampaign.records.find(
        (record) =>
          isRecord(record) &&
          record.type ===
            authoritativeOperationDescriptors["reserve-public-research"].outcome &&
          isRecord(record.reservation) &&
          record.reservation.id === command.payload.reservationId,
      );
      const alreadySettled = rebuiltCampaign.records.some(
        (record) =>
          isRecord(record) &&
          record.type ===
            authoritativeOperationDescriptors[
              "record-public-research-observation"
            ].outcome &&
          record.reservationId === command.payload.reservationId,
      );
      if (!isRecord(reservationOutcome) || alreadySettled) {
        return {
          code: "SVS-RESEARCH-RESERVATION-INVALID",
          message: !isRecord(reservationOutcome)
            ? "Public Research import has no matching capacity reservation."
            : "Public Research reservation is already settled.",
          action: !isRecord(reservationOutcome)
            ? "Reserve capacity before retrieving and importing a Source."
            : "Inspect the existing Observation; do not charge or import the reservation twice.",
        };
      }
      if (
        publicResearchApprovalScopeMismatch(
          rebuiltCampaign.authoritativeHistory,
          command.payload.reservationId,
          command.payload.source,
        )
      ) {
        return {
          code: "SVS-ELEVATED-RISK-APPROVAL-SCOPE-MISMATCH",
          message:
            "The retrieved Source differs from the Source named in the Opportunity-specific Research Approval.",
          action:
            "Leave the reservation unsettled and use only the exact approved public Source, or request renewed approval for the changed scope.",
        };
      }
      if (
        !isIsoInstant(reservationOutcome.recordedAt) ||
        command.payload.source.accessedAt < reservationOutcome.recordedAt ||
        command.payload.recordedAt < reservationOutcome.recordedAt
      ) {
        return {
          code: "SVS-RESEARCH-RESERVATION-INVALID",
          message:
            "Source access and import must occur after Research Budget capacity was reserved.",
          action:
            "Do not import or charge work performed before its reservation; leave the reservation unsettled.",
        };
      }
      if (
        campaign.evidenceLedger!.sources.some(
          (source: PublicSource) => source.id === command.payload.source.id,
        ) ||
        campaign.evidenceLedger!.observations.some(
          (observation: PublicObservation) =>
            observation.id === command.payload.observation.id,
        )
      ) {
        return {
          code: "SVS-EVIDENCE-IDENTITY-CONFLICT",
          message:
            "Source or Observation identity is already present in the Evidence Ledger.",
          action:
            "Use stable unique evidence identities or replay the original import request.",
        };
      }
      return undefined;
    },
    records({ before }) {
      const campaign = before!;
      return publicResearchObservationRecords(
        campaign.campaign.id,
        command,
        campaign.validation.recordCount + 1,
      );
    },
    successResult(_command, after) {
      return buildObservationImportResult(true, after);
    },
  });
}

async function recordEvidenceReasoning(
  command: RecordEvidenceReasoningCommand,
  currentTime: string,
) {
  const buildReasoningResult = (
    recorded: boolean,
    campaign: LoadedCampaign,
  ) => ({
    recorded,
    recordedEntries: command.payload.entries,
    workView: campaign.workView,
  });

  return runCoordinatorOperation(command, currentTime, {
    async locateCampaign(command) {
      return path.resolve(command.payload.campaignPath);
    },
    lockedAction:
      "Do not record reasoning concurrently; retry after the active operation finishes.",
    requestConflict: {
      code: "SVS-CAMPAIGN-REQUEST-CONFLICT",
      message:
        "Evidence reasoning request identity was already used with different input.",
      action:
        "Reuse the original request payload or provide a new stable request identity.",
    },
    invalidCampaign: {
      code: "SVS-CAMPAIGN-INVALID",
      message:
        "Evidence reasoning could not be recorded against valid Campaign history.",
      action:
        "Preserve the Campaign contents and inspect its Evidence Ledger before retrying.",
    },
    loadBeforeValidation: true,
    isReplay({ rebuiltCampaign }) {
      return rebuiltCampaign.records.some(
        (record) =>
          isRecord(record) &&
          record.type ===
            authoritativeOperationDescriptors["record-evidence-reasoning"].outcome &&
          record.requestId === command.requestId &&
          JSON.stringify(record.entries) === JSON.stringify(command.payload.entries),
      );
    },
    replayResult(_command, replayed) {
      return buildReasoningResult(false, replayed);
    },
    validateBeforeLease({ before }) {
      return before!.evidenceLedger === undefined
        ? {
            code: "SVS-EVIDENCE-NOT-AVAILABLE",
            message:
              "Evidence reasoning requires a confirmed Campaign Intake and an Evidence Ledger.",
            action:
              "Confirm Campaign Intake and record cited Observations before deriving reasoning.",
          }
        : undefined;
    },
    lease: {
      mode: "active",
      failure() {
        return {
          code: "SVS-CAMPAIGN-LEASE-NOT-HELD",
          message: "Evidence reasoning requires the active coordinator lease.",
          action:
            "Resume the Scouting Campaign with this coordinator before recording reasoning.",
        };
      },
    },
    validateAfterLease({ before }) {
      const ledger = before!.evidenceLedger!;
      const invalidLink = applyReasoningEntries(
        {
          sources: ledger.sources,
          observations: ledger.observations,
          sourceLineages: [...ledger.sourceLineages],
          sourceCredibilities: [...ledger.sourceCredibilities],
          sourceFreshnesses: [...ledger.sourceFreshnesses],
          evidenceGaps: [...ledger.evidenceGaps],
          assumptions: [...ledger.assumptions],
          inferences: [...ledger.inferences],
          contradictions: [...ledger.contradictions],
          corrections: [...ledger.corrections],
        },
        command.payload.entries,
      );
      return invalidLink === undefined
        ? undefined
        : {
            code: "SVS-EVIDENCE-LINK-INVALID",
            message: `Evidence reasoning links an unknown, duplicate, corrected, or incompatible entry ${invalidLink}.`,
            action:
              "Link each entry only to compatible active Sources, Observations, prior Inferences, Assumptions, or Evidence Gaps already in the Campaign or earlier in this request.",
          };
    },
    records({ before }) {
      return evidenceReasoningRecords(
        before!.campaign.id,
        command,
        before!.validation.recordCount + 1,
      );
    },
    successResult(_command, after) {
      return buildReasoningResult(true, after);
    },
  });
}

async function recordDiscoveryTranche(
  command: RecordDiscoveryTrancheCommand,
  currentTime: string,
) {
  const buildDiscoveryResult = (
    recorded: boolean,
    campaign: LoadedCampaign,
  ) => ({
    recorded,
    tranche: command.payload.tranche,
    workView: campaign.workView,
  });

  return runCoordinatorOperation(command, currentTime, {
    async locateCampaign(command) {
      return path.resolve(command.payload.campaignPath);
    },
    lockedAction:
      "Do not record a Discovery Tranche concurrently; retry after the active operation finishes.",
    requestConflict: {
      code: "SVS-CAMPAIGN-REQUEST-CONFLICT",
      message:
        "Discovery Tranche request identity was already used with different input.",
      action:
        "Reuse the original request payload or provide a new stable request identity.",
    },
    invalidCampaign: {
      code: "SVS-CAMPAIGN-INVALID",
      message:
        "Discovery Tranche could not be recorded against valid authoritative Campaign history.",
      action:
        "Preserve the Campaign contents and inspect its Work View before retrying.",
    },
    loadBeforeValidation: true,
    isReplay({ rebuiltCampaign }) {
      return rebuiltCampaign.records.some(
        (record) =>
          isRecord(record) &&
          record.type ===
            authoritativeOperationDescriptors["record-discovery-tranche"].outcome &&
          record.requestId === command.requestId &&
          JSON.stringify(record.tranche) === JSON.stringify(command.payload.tranche),
      );
    },
    replayResult(_command, replayed) {
      return buildDiscoveryResult(false, replayed);
    },
    validateBeforeLease({ rebuiltCampaign }) {
      return rebuiltCampaign.intake === undefined ||
        rebuiltCampaign.evidenceLedger === undefined
        ? {
            code: "SVS-DISCOVERY-NOT-AVAILABLE",
            message:
              "Discovery requires a valid explicitly confirmed Campaign Intake and cited Public Research.",
            action:
              "Confirm Campaign Intake and record the sampled public Sources before recording a Discovery Tranche.",
          }
        : undefined;
    },
    lease: {
      mode: "active",
      failure() {
        return {
          code: "SVS-CAMPAIGN-LEASE-NOT-HELD",
          message: "Discovery requires the active coordinator lease.",
          action:
            "Resume the Scouting Campaign with this coordinator before recording discovery.",
        };
      },
    },
    validateAfterLease({ rebuiltCampaign }) {
      const history = rebuiltCampaign.authoritativeHistory;
      const violation = discoveryTrancheViolation(
        history,
        command.payload.tranche,
      );
      return violation === undefined
        ? undefined
        : {
            code: "SVS-DISCOVERY-INVARIANT-VIOLATION",
            message: `Discovery Tranche violates a campaign invariant: ${violation}.`,
            action:
              "Preserve the existing campaign and correct the tranche coverage, evidence links, allowances, or bias control before retrying.",
          };
    },
    records({ before }) {
      return discoveryTrancheRecords(
        before!.campaign.id,
        command,
        before!.validation.recordCount + 1,
      );
    },
    successResult(_command, after) {
      return buildDiscoveryResult(true, after);
    },
  });
}

async function recordOpportunityFormation(
  command: RecordOpportunityFormationCommand,
  currentTime: string,
) {
  const result = (recorded: boolean, campaign: LoadedCampaign) => ({
    recorded,
    assessments: command.payload.assessments,
    workView: campaign.workView,
    evidenceLedger: campaign.evidenceLedger,
  });
  return runCoordinatorOperation(command, currentTime, {
    async locateCampaign(command) {
      return path.resolve(command.payload.campaignPath);
    },
    lockedAction: "Do not record Opportunity formation concurrently; retry after the active operation finishes.",
    requestConflict: {
      code: "SVS-CAMPAIGN-REQUEST-CONFLICT",
      message: "Opportunity formation request identity was already used with different input.",
      action: "Reuse the original request payload or provide a new stable request identity.",
    },
    invalidCampaign: {
      code: "SVS-CAMPAIGN-INVALID",
      message: "Opportunity formation could not be recorded against valid authoritative Campaign history.",
      action: "Preserve the Campaign contents and inspect its Work View before retrying.",
    },
    loadBeforeValidation: true,
    isReplay({ rebuiltCampaign }) {
      return rebuiltCampaign.records.some(
        (record) =>
          isRecord(record) &&
          record.type === authoritativeOperationDescriptors["record-opportunity-formation"].outcome &&
          record.requestId === command.requestId &&
          JSON.stringify(record.assessments) === JSON.stringify(command.payload.assessments),
      );
    },
    replayResult(_command, campaign) {
      return result(false, campaign);
    },
    validateBeforeLease({ rebuiltCampaign }) {
      return rebuiltCampaign.authoritativeHistory.discoveryTranches.length === 0
        ? {
            code: "SVS-OPPORTUNITY-FORMATION-NOT-AVAILABLE",
            message: "Opportunity formation requires recorded discovery and cited evidence.",
            action: "Record bounded Discovery Tranches and shallow problem-mining Sources first.",
          }
        : undefined;
    },
    lease: {
      mode: "active",
      failure() {
        return {
          code: "SVS-CAMPAIGN-LEASE-NOT-HELD",
          message: "Opportunity formation requires the active coordinator lease.",
          action: "Resume the Scouting Campaign with this coordinator before recording formation.",
        };
      },
    },
    validateAfterLease({ rebuiltCampaign }) {
      const formation = {
        allocation: command.payload.allocation,
        assessments: command.payload.assessments,
      };
      const violation = opportunityFormationViolation(
        rebuiltCampaign.authoritativeHistory,
        formation,
      );
      return violation === undefined
        ? undefined
        : {
            code: "SVS-OPPORTUNITY-FORMATION-INVARIANT-VIOLATION",
            message: `Opportunity formation violates a campaign invariant: ${violation}.`,
            action: "Preserve Exploration Threads unless the complete independent behavioral evidence rule is satisfied, and correct the pre-gate allocation or evidence links before retrying.",
          };
    },
    records({ before }) {
      return opportunityFormationRecords(
        before!.campaign.id,
        command,
        before!.validation.recordCount + 1,
      );
    },
    successResult(_command, campaign) {
      return result(true, campaign);
    },
  });
}

async function passBreadthGate(
  command: PassBreadthGateCommand,
  currentTime: string,
) {
  const result = (passed: boolean, campaign: LoadedCampaign) => ({
    passed,
    gate: command.payload.gate,
    workView: campaign.workView,
    evidenceLedger: campaign.evidenceLedger,
  });
  return runCoordinatorOperation(command, currentTime, {
    async locateCampaign(command) {
      return path.resolve(command.payload.campaignPath);
    },
    lockedAction: "Do not pass the Breadth Gate concurrently; retry after the active operation finishes.",
    requestConflict: {
      code: "SVS-CAMPAIGN-REQUEST-CONFLICT",
      message: "Breadth Gate request identity was already used with different input.",
      action: "Reuse the original request payload or provide a new stable request identity.",
    },
    invalidCampaign: {
      code: "SVS-CAMPAIGN-INVALID",
      message: "Breadth Gate could not be evaluated against valid authoritative Campaign history.",
      action: "Preserve the Campaign contents and inspect its Work View before retrying.",
    },
    loadBeforeValidation: true,
    isReplay({ rebuiltCampaign }) {
      return rebuiltCampaign.records.some(
        (record) =>
          isRecord(record) &&
          record.type === authoritativeOperationDescriptors["pass-breadth-gate"].outcome &&
          record.requestId === command.requestId &&
          JSON.stringify(record.gate) === JSON.stringify(command.payload.gate),
      );
    },
    replayResult(_command, campaign) {
      return result(false, campaign);
    },
    validateBeforeLease({ rebuiltCampaign }) {
      return rebuiltCampaign.authoritativeHistory.opportunityFormations.length === 0
        ? {
            code: "SVS-BREADTH-GATE-NOT-AVAILABLE",
            message: "Breadth Gate requires recorded Opportunity formation.",
            action: "Assess the retained Exploration Threads before attempting to narrow research.",
          }
        : undefined;
    },
    lease: {
      mode: "active",
      failure() {
        return {
          code: "SVS-CAMPAIGN-LEASE-NOT-HELD",
          message: "Breadth Gate requires the active coordinator lease.",
          action: "Resume the Scouting Campaign with this coordinator before passing the gate.",
        };
      },
    },
    validateAfterLease({ rebuiltCampaign }) {
      const violation = breadthGateViolation(
        rebuiltCampaign.authoritativeHistory,
        command.payload.gate,
      );
      return violation === undefined
        ? undefined
        : {
            code: "SVS-BREADTH-GATE-INVARIANT-VIOLATION",
            message: `Breadth Gate violates a campaign invariant: ${violation}.`,
            action: "Continue broad discovery or shallow mining until every diversity, comparison, diminishing-return, familiarity, and remaining-budget condition is satisfied.",
          };
    },
    records({ before }) {
      return breadthGateRecords(
        before!.campaign.id,
        command,
        before!.validation.recordCount + 1,
      );
    },
    successResult(_command, campaign) {
      return result(true, campaign);
    },
  });
}

async function recordOpportunityExclusionGates(
  command: RecordOpportunityExclusionGatesCommand,
  currentTime: string,
) {
  const result = (recorded: boolean, campaign: LoadedCampaign) => ({
    recorded,
    assessments: command.payload.assessments,
    workView: campaign.workView,
    evidenceLedger: campaign.evidenceLedger,
  });
  return runCoordinatorOperation(command, currentTime, {
    async locateCampaign(command) {
      return path.resolve(command.payload.campaignPath);
    },
    lockedAction:
      "Do not record Opportunity Exclusion Gates concurrently; retry after the active operation finishes.",
    requestConflict: {
      code: "SVS-CAMPAIGN-REQUEST-CONFLICT",
      message:
        "Opportunity Exclusion Gate request identity was already used with different input.",
      action:
        "Reuse the original request payload or provide a new stable request identity.",
    },
    invalidCampaign: {
      code: "SVS-CAMPAIGN-INVALID",
      message:
        "Opportunity Exclusion Gates could not be recorded against valid authoritative Campaign history.",
      action:
        "Preserve the Campaign contents and inspect its Work View before retrying.",
    },
    loadBeforeValidation: true,
    isReplay({ rebuiltCampaign }) {
      return rebuiltCampaign.records.some(
        (record) =>
          isRecord(record) &&
          record.type ===
            authoritativeOperationDescriptors["record-opportunity-exclusion-gates"]
              .outcome &&
          record.requestId === command.requestId &&
          JSON.stringify(record.assessments) ===
            JSON.stringify(command.payload.assessments),
      );
    },
    replayResult(_command, campaign) {
      return result(false, campaign);
    },
    validateBeforeLease({ rebuiltCampaign }) {
      return rebuiltCampaign.authoritativeHistory.breadthGates.length === 0
        ? {
            code: "SVS-OPPORTUNITY-EXCLUSION-GATES-NOT-AVAILABLE",
            message:
              "Opportunity Exclusion Gates require formed Opportunities and a passed Breadth Gate.",
            action:
              "Complete formation and the Breadth Gate before recording the earliest fatal Opportunity decisions.",
          }
        : undefined;
    },
    lease: {
      mode: "active",
      failure() {
        return {
          code: "SVS-CAMPAIGN-LEASE-NOT-HELD",
          message:
            "Opportunity Exclusion Gates require the active coordinator lease.",
          action:
            "Resume the Scouting Campaign with this coordinator before recording gate decisions.",
        };
      },
    },
    validateAfterLease({ rebuiltCampaign }) {
      const evaluation = { assessments: command.payload.assessments };
      const violation = opportunityExclusionEvaluationViolation(
        rebuiltCampaign.authoritativeHistory,
        evaluation,
      );
      return violation === undefined
        ? undefined
        : {
            code: "SVS-OPPORTUNITY-EXCLUSION-GATE-INVARIANT-VIOLATION",
            message: `Opportunity Exclusion Gates violate a campaign invariant: ${violation}.`,
            action:
              "Assess every formed Opportunity against market safety and every confirmed Hard Constraint using traceable affirmative evidence or an explicit unresolved state.",
          };
    },
    records({ before }) {
      return opportunityExclusionGateRecords(
        before!.campaign.id,
        command,
        before!.validation.recordCount + 1,
      );
    },
    successResult(_command, campaign) {
      return result(true, campaign);
    },
  });
}

async function createCampaign(command: CreateCampaignCommand) {
  const campaignPath = path.resolve(command.payload.campaignPath);
  if (await pathExists(campaignPath)) {
    try {
      const existing = await loadCampaign(campaignPath);
      const records = await readCampaignRecords(campaignPath);
      const matchingIntent = records.some(
        (record) =>
          isRecord(record) &&
          record.type === "operation-intent" &&
          record.operation === "create-campaign" &&
          record.requestId === command.requestId &&
          record.campaignId === command.payload.campaignId &&
          record.recordedAt === command.payload.createdAt &&
          record.coordinatorId === command.payload.coordinatorId &&
          record.leaseExpiresAt === command.payload.leaseExpiresAt,
      );
      if (matchingIntent && existing.campaign.id === command.payload.campaignId) {
        return {
          envelopeVersion: contracts.commandEnvelope,
          requestId: command.requestId,
          command: command.command,
          ok: true as const,
          result: {
            created: false,
            campaign: existing.campaign,
            workView: existing.workView,
            lease: existing.lease,
          },
        };
      }
    } catch {
      // The existing path is reported below without changing it.
    }
    return {
      envelopeVersion: contracts.commandEnvelope,
      requestId: command.requestId,
      command: command.command,
      ok: false as const,
      error: {
        code: "SVS-CAMPAIGN-PATH-EXISTS",
        message: `Campaign path already exists: ${campaignPath}`,
        action:
          "Inspect the existing path or choose a different explicit Campaign path; the Scout did not relocate the Campaign.",
      },
    };
  }

  const parentPath = path.dirname(campaignPath);
  const stagingPath = await mkdtemp(path.join(parentPath, ".svs-create-"));
  await chmod(stagingPath, 0o700);
  try {
    const records = campaignOperationRecords({
      campaignId: command.payload.campaignId,
      requestId: command.requestId,
      recordedAt: command.payload.createdAt,
      firstSequence: 1,
      operation: "create-campaign",
      coordinatorId: command.payload.coordinatorId,
      leaseExpiresAt: command.payload.leaseExpiresAt,
    });
    const workView = initialWorkView(command.payload.campaignId);
    const lease: CoordinatorLease = {
      coordinatorId: command.payload.coordinatorId,
      acquiredAt: command.payload.createdAt,
      expiresAt: command.payload.leaseExpiresAt,
    };
    const manifest = {
      campaignId: command.payload.campaignId,
      createdAt: command.payload.createdAt,
      versions: contracts,
      authority: { records: "records.jsonl" },
      projections: {
        workView: "work-view.json",
        campaignIntake: "campaign-intake.json",
        researchBudget: "research-budget.json",
        evidenceLedger: "evidence-ledger.json",
      },
    };

    await writeFile(
      path.join(stagingPath, "records.jsonl"),
      `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
      { mode: 0o600 },
    );
    await mkdir(path.join(stagingPath, "checkpoints"), { mode: 0o700 });
    await writePrivateJson(path.join(stagingPath, "manifest.json"), manifest);
    await writePrivateJson(path.join(stagingPath, "work-view.json"), workView);
    await writePrivateJson(path.join(stagingPath, "lease.json"), lease);
    const checkpointPath = path.join(
      stagingPath,
      "checkpoints",
      "000000000002.json",
    );
    const temporaryCheckpointPath = `${checkpointPath}.tmp`;
    await writePrivateJson(temporaryCheckpointPath, {
      campaignId: command.payload.campaignId,
      recordSequence: 2,
      recordedAt: command.payload.createdAt,
    });
    await rename(temporaryCheckpointPath, checkpointPath);
    await rename(stagingPath, campaignPath);

    return {
      envelopeVersion: contracts.commandEnvelope,
      requestId: command.requestId,
      command: command.command,
      ok: true as const,
      result: {
        created: true,
        campaign: {
          id: command.payload.campaignId,
          path: campaignPath,
          versions: contracts,
        },
        workView,
        lease,
      },
    };
  } catch (error) {
    await rm(stagingPath, { recursive: true, force: true });
    throw error;
  }
}

export type KernelEffects = {
  nodeVersion: string;
  probeWritableStorage: (storagePath: string) => Promise<boolean>;
  now?: () => string;
};

async function probeWritableStorage(storagePath: string): Promise<void> {
  const probePath = await mkdtemp(path.join(storagePath, ".svs-preflight-"));
  await rm(probePath, { recursive: true, force: true });
}

const realEffects: KernelEffects = {
  nodeVersion: process.versions.node,
  now: () => new Date().toISOString(),
  async probeWritableStorage(storagePath) {
    await probeWritableStorage(storagePath);
    return true;
  },
};

export async function executeCommand(
  command: unknown,
  effects: KernelEffects = realEffects,
) {
  if (!isRecord(command)) {
    return {
      envelopeVersion: contracts.commandEnvelope,
      requestId: "unknown",
      command: "unknown",
      ok: false as const,
      error: {
        code: "SVS-COMMAND-INVALID",
        message: "Kernel command envelope must be a JSON object.",
        action: `Send one JSON object using command envelope ${contracts.commandEnvelope} and retry.`,
        details: ["command must be a JSON object."],
      },
    };
  }

  const requestId =
    typeof command.requestId === "string" && command.requestId.trim() !== ""
      ? command.requestId
      : "unknown";
  const receivedCommand =
    typeof command.command === "string" && command.command.trim() !== ""
      ? command.command
      : "unknown";

  if (
    typeof command.envelopeVersion === "string" &&
    command.envelopeVersion !== contracts.commandEnvelope
  ) {
    return {
      envelopeVersion: contracts.commandEnvelope,
      requestId,
      command: receivedCommand,
      ok: false as const,
      error: {
        code: "SVS-COMMAND-ENVELOPE-UNSUPPORTED",
        message: `Command envelope ${command.envelopeVersion} is not supported.`,
        action: `Use command envelope ${contracts.commandEnvelope} and retry.`,
      },
    };
  }

  if (
    typeof command.command === "string" &&
    ![
      "preflight",
      "createCampaign",
      "inspectCampaign",
      "inspectEvidence",
      "resumeCampaign",
      "confirmCampaignIntake",
      "reservePublicResearch",
      "recordPublicResearchObservation",
      "recordEvidenceReasoning",
      "recordDiscoveryTranche",
      "recordOpportunityFormation",
      "passBreadthGate",
      "recordOpportunityExclusionGates",
      "requestResearchApproval",
      "recordResearchApprovalInformation",
      "respondResearchApproval",
      "recordResearchExpenditure",
    ].includes(receivedCommand)
  ) {
    return {
      envelopeVersion: contracts.commandEnvelope,
      requestId,
      command: receivedCommand,
      ok: false as const,
      error: {
        code: "SVS-COMMAND-UNSUPPORTED",
        message: `Kernel command ${String(receivedCommand)} is not supported.`,
        action: `Use a supported command with envelope ${contracts.commandEnvelope}.`,
      },
    };
  }

  if (command.command === "createCampaign") {
    const invalidFields = validateCreateCampaignFields(command);
    if (typeof command.envelopeVersion !== "string") {
      invalidFields.unshift("envelopeVersion must be a string.");
    }
    if (invalidFields.length > 0) {
      return {
        envelopeVersion: contracts.commandEnvelope,
        requestId,
        command: receivedCommand,
        ok: false as const,
        error: {
          code: "SVS-COMMAND-INVALID",
          message: "Create Campaign command is invalid.",
          action: "Correct the reported fields and retry without creating Campaign state.",
          details: invalidFields,
        },
      };
    }
    return createCampaign(command as unknown as CreateCampaignCommand);
  }

  if (command.command === "inspectCampaign") {
    const invalidFields = validateInspectCampaignFields(command);
    if (typeof command.envelopeVersion !== "string") {
      invalidFields.unshift("envelopeVersion must be a string.");
    }
    if (invalidFields.length > 0) {
      return {
        envelopeVersion: contracts.commandEnvelope,
        requestId,
        command: receivedCommand,
        ok: false as const,
        error: {
          code: "SVS-COMMAND-INVALID",
          message: "Inspect Campaign command is invalid.",
          action: "Correct the reported fields and retry without changing Campaign state.",
          details: invalidFields,
        },
      };
    }
    return inspectCampaign(command as unknown as InspectCampaignCommand);
  }

  if (command.command === "inspectEvidence") {
    const invalidFields = validateInspectEvidenceFields(command);
    if (typeof command.envelopeVersion !== "string") {
      invalidFields.unshift("envelopeVersion must be a string.");
    }
    if (invalidFields.length > 0) {
      return {
        envelopeVersion: contracts.commandEnvelope,
        requestId,
        command: receivedCommand,
        ok: false as const,
        error: {
          code: "SVS-COMMAND-INVALID",
          message: "Evidence inspection command is invalid.",
          action:
            "Provide one Campaign locator and the stable Evidence Ledger entry identities from the Work View.",
          details: invalidFields,
        },
      };
    }
    return inspectEvidence(command as unknown as InspectEvidenceCommand);
  }

  if (command.command === "resumeCampaign") {
    const invalidFields = validateResumeCampaignFields(command);
    if (typeof command.envelopeVersion !== "string") {
      invalidFields.unshift("envelopeVersion must be a string.");
    }
    if (invalidFields.length > 0) {
      return {
        envelopeVersion: contracts.commandEnvelope,
        requestId,
        command: receivedCommand,
        ok: false as const,
        error: {
          code: "SVS-COMMAND-INVALID",
          message: "Resume Campaign command is invalid.",
          action: "Correct the reported fields and retry without changing Campaign state.",
          details: invalidFields,
        },
      };
    }
    return resumeCampaign(
      command as unknown as ResumeCampaignCommand,
      effects.now?.() ?? new Date().toISOString(),
    );
  }

  if (command.command === "confirmCampaignIntake") {
    const invalidFields = validateConfirmCampaignIntakeFields(command);
    if (typeof command.envelopeVersion !== "string") {
      invalidFields.unshift("envelopeVersion must be a string.");
    }
    if (invalidFields.length > 0) {
      return {
        envelopeVersion: contracts.commandEnvelope,
        requestId,
        command: receivedCommand,
        ok: false as const,
        error: {
          code: "SVS-CAMPAIGN-INTAKE-INVALID",
          message: "Campaign Intake confirmation is invalid.",
          action:
            "Return to the intake review, resolve every reported omission or conflict, and obtain explicit confirmation before retrying.",
          details: invalidFields,
        },
      };
    }
    return confirmCampaignIntake(
      command as unknown as ConfirmCampaignIntakeCommand,
      effects.now?.() ?? new Date().toISOString(),
    );
  }

  if (command.command === "reservePublicResearch") {
    const invalidFields = validateReservePublicResearchFields(command);
    if (typeof command.envelopeVersion !== "string") {
      invalidFields.unshift("envelopeVersion must be a string.");
    }
    if (invalidFields.length > 0) {
      return {
        envelopeVersion: contracts.commandEnvelope,
        requestId,
        command: receivedCommand,
        ok: false as const,
        error: {
          code: "SVS-PUBLIC-RESEARCH-INVALID",
          message: "Public Research reservation is invalid.",
          action: "Correct the reported fields and reserve capacity before retrieval.",
          details: invalidFields,
        },
      };
    }
    return reservePublicResearch(
      command as unknown as ReservePublicResearchCommand,
      effects.now?.() ?? new Date().toISOString(),
    );
  }

  if (command.command === "recordPublicResearchObservation") {
    const invalidFields = validateRecordPublicResearchObservationFields(command);
    if (typeof command.envelopeVersion !== "string") {
      invalidFields.unshift("envelopeVersion must be a string.");
    }
    if (invalidFields.length > 0) {
      return {
        envelopeVersion: contracts.commandEnvelope,
        requestId,
        command: receivedCommand,
        ok: false as const,
        error: {
          code: "SVS-PUBLIC-RESEARCH-INVALID",
          message: "Public Research Source or Observation is invalid.",
          action: "Keep retrieval outside the kernel and correct the inert provenance or paraphrase fields before retrying.",
          details: invalidFields,
        },
      };
    }
    return recordPublicResearchObservation(
      command as unknown as RecordPublicResearchObservationCommand,
      effects.now?.() ?? new Date().toISOString(),
    );
  }

  if (command.command === "recordEvidenceReasoning") {
    const invalidFields = validateRecordEvidenceReasoningFields(command);
    if (typeof command.envelopeVersion !== "string") {
      invalidFields.unshift("envelopeVersion must be a string.");
    }
    if (invalidFields.length > 0) {
      return {
        envelopeVersion: contracts.commandEnvelope,
        requestId,
        command: receivedCommand,
        ok: false as const,
        error: {
          code: "SVS-EVIDENCE-REASONING-INVALID",
          message: "Evidence reasoning entries are invalid.",
          action:
            "Separate evidence types, correct every reported link or assessment, and retry without mutating Campaign history.",
          details: invalidFields,
        },
      };
    }
    return recordEvidenceReasoning(
      command as unknown as RecordEvidenceReasoningCommand,
      effects.now?.() ?? new Date().toISOString(),
    );
  }

  if (command.command === "recordDiscoveryTranche") {
    const invalidFields = validateRecordDiscoveryTrancheFields(command);
    if (typeof command.envelopeVersion !== "string") {
      invalidFields.unshift("envelopeVersion must be a string.");
    }
    if (invalidFields.length > 0) {
      return {
        envelopeVersion: contracts.commandEnvelope,
        requestId,
        command: receivedCommand,
        ok: false as const,
        error: {
          code: "SVS-DISCOVERY-INVALID",
          message: "Discovery Tranche is invalid.",
          action:
            "Correct the bounded sweeps, controlled sampling, Exploration Threads, or Novelty Probe records before retrying.",
          details: invalidFields,
        },
      };
    }
    return recordDiscoveryTranche(
      command as unknown as RecordDiscoveryTrancheCommand,
      effects.now?.() ?? new Date().toISOString(),
    );
  }

  if (command.command === "recordOpportunityFormation") {
    const invalidFields = validateRecordOpportunityFormationFields(command);
    if (typeof command.envelopeVersion !== "string") {
      invalidFields.unshift("envelopeVersion must be a string.");
    }
    if (invalidFields.length > 0) {
      return {
        envelopeVersion: contracts.commandEnvelope,
        requestId,
        command: receivedCommand,
        ok: false as const,
        error: {
          code: "SVS-OPPORTUNITY-FORMATION-INVALID",
          message: "Opportunity formation is invalid.",
          action: "Correct the solution-neutral clusters, evidence links, explicit gaps, Campaign Decisions, or equal pre-gate allocation before retrying.",
          details: invalidFields,
        },
      };
    }
    return recordOpportunityFormation(
      command as unknown as RecordOpportunityFormationCommand,
      effects.now?.() ?? new Date().toISOString(),
    );
  }

  if (command.command === "passBreadthGate") {
    const invalidFields = validatePassBreadthGateFields(command);
    if (typeof command.envelopeVersion !== "string") {
      invalidFields.unshift("envelopeVersion must be a string.");
    }
    if (invalidFields.length > 0) {
      return {
        envelopeVersion: contracts.commandEnvelope,
        requestId,
        command: receivedCommand,
        ok: false as const,
        error: {
          code: "SVS-BREADTH-GATE-INVALID",
          message: "Breadth Gate evidence is invalid.",
          action: "Correct the comparison set, diminishing-return evidence, Decision Value priorities, or Campaign Decision before retrying.",
          details: invalidFields,
        },
      };
    }
    return passBreadthGate(
      command as unknown as PassBreadthGateCommand,
      effects.now?.() ?? new Date().toISOString(),
    );
  }

  if (command.command === "recordOpportunityExclusionGates") {
    const invalidFields = validateRecordOpportunityExclusionGatesFields(command);
    if (typeof command.envelopeVersion !== "string") {
      invalidFields.unshift("envelopeVersion must be a string.");
    }
    if (invalidFields.length > 0) {
      return {
        envelopeVersion: contracts.commandEnvelope,
        requestId,
        command: receivedCommand,
        ok: false as const,
        error: {
          code: "SVS-OPPORTUNITY-EXCLUSION-GATES-INVALID",
          message: "Opportunity Exclusion Gate evidence is invalid.",
          action:
            "Correct the complete market-safety and Hard Constraint gate records, preserving unresolved decisions where evidence is missing.",
          details: invalidFields,
        },
      };
    }
    return recordOpportunityExclusionGates(
      command as unknown as RecordOpportunityExclusionGatesCommand,
      effects.now?.() ?? new Date().toISOString(),
    );
  }

  if (command.command === "requestResearchApproval") {
    const invalidFields = validateRequestResearchApprovalFields(command);
    if (typeof command.envelopeVersion !== "string") {
      invalidFields.unshift("envelopeVersion must be a string.");
    }
    if (invalidFields.length > 0) {
      return {
        envelopeVersion: contracts.commandEnvelope,
        requestId,
        command: receivedCommand,
        ok: false as const,
        error: {
          code: "SVS-RESEARCH-APPROVAL-INVALID",
          message: "Research Approval request is invalid.",
          action:
            "State the complete bounded scope and safety constraints before presenting a Pending Decision.",
          details: invalidFields,
        },
      };
    }
    return requestResearchApproval(
      command as unknown as RequestResearchApprovalCommand,
      effects.now?.() ?? new Date().toISOString(),
    );
  }

  if (command.command === "recordResearchApprovalInformation") {
    const invalidFields = validateRecordResearchApprovalInformationFields(command);
    if (typeof command.envelopeVersion !== "string") {
      invalidFields.unshift("envelopeVersion must be a string.");
    }
    if (invalidFields.length > 0) {
      return {
        envelopeVersion: contracts.commandEnvelope,
        requestId,
        command: receivedCommand,
        ok: false as const,
        error: {
          code: "SVS-RESEARCH-APPROVAL-INFORMATION-INVALID",
          message: "Research Approval information is invalid.",
          action:
            "Correct the bounded informational record without resolving the Pending Decision.",
          details: invalidFields,
        },
      };
    }
    return recordResearchApprovalInformation(
      command as unknown as RecordResearchApprovalInformationCommand,
      effects.now?.() ?? new Date().toISOString(),
    );
  }

  if (command.command === "respondResearchApproval") {
    const invalidFields = validateRespondResearchApprovalFields(command);
    if (typeof command.envelopeVersion !== "string") {
      invalidFields.unshift("envelopeVersion must be a string.");
    }
    if (invalidFields.length > 0) {
      return {
        envelopeVersion: contracts.commandEnvelope,
        requestId,
        command: receivedCommand,
        ok: false as const,
        error: {
          code: "SVS-RESEARCH-APPROVAL-RESPONSE-INVALID",
          message: "Research Approval response is invalid.",
          action:
            "Record only an explicit response bound to the complete unchanged Pending Decision scope.",
          details: invalidFields,
        },
      };
    }
    return respondResearchApproval(
      command as unknown as RespondResearchApprovalCommand,
      effects.now?.() ?? new Date().toISOString(),
    );
  }

  if (command.command === "recordResearchExpenditure") {
    const invalidFields = validateRecordResearchExpenditureFields(command);
    if (typeof command.envelopeVersion !== "string") {
      invalidFields.unshift("envelopeVersion must be a string.");
    }
    if (invalidFields.length > 0) {
      return {
        envelopeVersion: contracts.commandEnvelope,
        requestId,
        command: receivedCommand,
        ok: false as const,
        error: {
          code: "SVS-RESEARCH-EXPENDITURE-INVALID",
          message: "Research Expenditure is invalid.",
          action:
            "Record only approval provenance, Source, purpose, amount, and currency; never include credentials or payment details.",
          details: invalidFields,
        },
      };
    }
    return recordResearchExpenditure(
      command as unknown as RecordResearchExpenditureCommand,
      effects.now?.() ?? new Date().toISOString(),
    );
  }

  const invalidFields = validatePreflightFields(command);
  if (typeof command.envelopeVersion !== "string") {
    invalidFields.unshift("envelopeVersion must be a string.");
  }
  if (command.command !== "preflight") {
    invalidFields.push('command must be "preflight".');
  }
  if (invalidFields.length > 0) {
    return {
      envelopeVersion: contracts.commandEnvelope,
      requestId,
      command: receivedCommand,
      ok: false as const,
      error: {
        code: "SVS-COMMAND-INVALID",
        message: "Preflight command is invalid.",
        action: "Correct the reported fields and retry without creating Campaign state.",
        details: invalidFields,
      },
    };
  }

  const preflightCommand = command as unknown as PreflightCommand;
  const nodeMajor = Number.parseInt(effects.nodeVersion.split(".")[0] ?? "", 10);
  let storageWritable = true;
  try {
    storageWritable = await effects.probeWritableStorage(
      preflightCommand.payload.storagePath,
    );
  } catch {
    storageWritable = false;
  }
  const routes = preflightCommand.payload.retrievalRoutes
    .filter((route) => route.available && route.public && route.lawful)
    .map((route) => route.id);
  const diagnostics = [];
  if (nodeMajor !== supportedNodeMajor) {
    diagnostics.push({
      code: "SVS-PREFLIGHT-NODE-UNSUPPORTED",
      message: `Node.js ${supportedNodeMajor}.x is required; found ${effects.nodeVersion}.`,
      action: `Install Node.js ${supportedNodeMajor} and rerun $solo-venture-scout.`,
    });
  }
  if (!storageWritable) {
    diagnostics.push({
      code: "SVS-PREFLIGHT-STORAGE-NOT-WRITABLE",
      message: `Campaign storage is not writable: ${preflightCommand.payload.storagePath}`,
      action:
        "Choose an existing writable directory and rerun $solo-venture-scout; no Campaign state was created.",
    });
  }
  if (routes.length === 0) {
    diagnostics.push({
      code: "SVS-PREFLIGHT-NO-LAWFUL-PUBLIC-RETRIEVAL",
      message: "No available lawful public-retrieval route was declared.",
      action:
        "Enable at least one public retrieval tool that respects access controls, site rules, and applicable law, then rerun $solo-venture-scout.",
    });
  }

  return {
    envelopeVersion: contracts.commandEnvelope,
    requestId: preflightCommand.requestId,
    command: preflightCommand.command,
    ok: true as const,
    result: {
      ready: diagnostics.length === 0,
      diagnostics,
      versions: contracts,
      capabilities: {
        nodeRuntime: {
          supportedMajor: supportedNodeMajor,
          detected: effects.nodeVersion,
          major: nodeMajor,
        },
        storage: {
          path: path.resolve(preflightCommand.payload.storagePath),
          writable: storageWritable,
        },
        publicRetrieval: {
          available: routes.length > 0,
          routes,
        },
      },
    },
  };
}

async function runCli() {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const command: unknown = JSON.parse(input);
  const response = await executeCommand(command);
  process.stdout.write(`${JSON.stringify(response)}\n`);
  if (!response.ok) {
    process.exitCode = 3;
  } else if (
    response.command === "preflight" &&
    "ready" in response.result &&
    !response.result.ready
  ) {
    process.exitCode = 2;
  }
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  await runCli();
}
