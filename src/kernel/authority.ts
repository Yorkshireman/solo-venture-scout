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
import { randomUUID } from "node:crypto";
import path from "node:path";
import contracts from "../../release/contracts.json" with { type: "json" };
import type {
  InspectCampaignCommand,
  InspectEvidenceCommand,
  ConfirmedCampaignIntake,
  ConfirmCampaignIntakeCommand,
  PublicResearchReservation,
  ReservePublicResearchCommand,
  PublicSource,
  PublicObservation,
  SourceLineage,
  SourceCredibility,
  SourceFreshness,
  EvidenceGap,
  Assumption,
  Inference,
  Contradiction,
  Correction,
  ReasoningEntry,
  RecordPublicResearchObservationCommand,
  RecordEvidenceReasoningCommand,
  DiscoverySweep,
  DiscoveryTranche,
  RecordDiscoveryTrancheCommand,
  CampaignDecision,
  OpportunityExclusionAssessment,
  OpportunityExclusionEvaluation,
  RecordOpportunityExclusionGatesCommand,
  OpportunityFormation,
  RecordOpportunityFormationCommand,
  BreadthGate,
  PassBreadthGateCommand,
  ResearchApprovalRequest,
  PendingResearchApprovalDecision,
  RequestResearchApprovalCommand,
  ResearchApprovalInformation,
  RecordedResearchApprovalInformation,
  RecordResearchApprovalInformationCommand,
  ResearchApproval,
  RecordedResearchApprovalResponse,
  ResearchApprovalResponse,
  RespondResearchApprovalCommand,
  ResearchExpenditure,
  RecordResearchExpenditureCommand,
  ResearchBudgetView,
  EvidenceLedger,
  CampaignLocator,
  WorkView,
  CoordinatorLease,
  AuthoritativeOperation,
  CampaignOperation,
} from "./types.js";
import {
  hasOnlyFields,
  isIsoInstant,
  isRecord,
  validateBreadthGate,
  validateCampaignIntake,
  validateDiscoveryTranche,
  validatePersistableText,
  validatePublicObservation,
  validatePublicResearchReservation,
  validatePublicSource,
  validateReasoningEntry,
  validateRecordOpportunityExclusionGatesFields,
  validateRecordOpportunityFormationFields,
  validateResearchApprovalRequest,
} from "./validation.js";

export async function pathExists(targetPath: string): Promise<boolean> {
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

export async function writePrivateJson(targetPath: string, value: unknown): Promise<void> {
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(targetPath, 0o600);
}

export async function replacePrivateJson(targetPath: string, value: unknown): Promise<void> {
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

export type CoordinatorOperationLock = {
  path: string;
  token: string;
};

export async function acquireCoordinatorOperationLock(
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

export async function releaseCoordinatorOperationLock(
  lock: CoordinatorOperationLock,
): Promise<void> {
  await rm(lock.path, { force: true });
}

export type AuthoritativeHistoryRebuild = {
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

export type AuthoritativeRecordPair = {
  intent: Record<string, unknown>;
  outcome: Record<string, unknown>;
  outcomeSequence: number;
  history: AuthoritativeHistoryRebuild;
};

export type AuthoritativeOperationDescriptor = {
  outcome: string;
  position: "initial" | "subsequent";
  establishesLease: boolean;
  validateAndApply: (pair: AuthoritativeRecordPair) => void;
};

export function activeResearchApprovalDecision(
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

export type PublicResearchAllocationViolation =
  | "required"
  | "not-available"
  | "imbalanced";

export function publicResearchAllocationViolation(
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

export function exclusionGatesFor(assessment: OpportunityExclusionAssessment) {
  return [
    assessment.marketSafety.gate,
    ...assessment.hardConstraints.map((constraint) => constraint.gate),
  ];
}

export function elevatedRiskApprovalRequestViolation(
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
  const failedGate = exclusionGatesFor(assessment).find(
    (gate) => gate.state === "failed",
  );
  return failedGate === undefined
    ? undefined
    : `the approval cannot override failed Exclusion Gate ${failedGate.id}`;
}

export type OpportunityDeepeningViolation =
  | "gates-required"
  | "ineligible"
  | "required"
  | "scope";

export function opportunityDeepeningViolation(
  history: AuthoritativeHistoryRebuild,
  reservation: PublicResearchReservation,
  reservedAt: string,
): OpportunityDeepeningViolation | undefined {
  if (reservation.researchClass !== "deepening") {
    return undefined;
  }
  if (history.opportunityExclusionEvaluations.length === 0) {
    return "gates-required";
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
  const gates = exclusionGatesFor(assessment);
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

export function hasElevatedRiskResearchApproval(
  approvals: ResearchApproval[],
  opportunityId: string,
  availableAt: string,
): boolean {
  return approvals.some(
    (approval) =>
      approval.scope.access === "elevated-risk" &&
      approval.scope.opportunityId === opportunityId &&
      approval.scope.researchDepth === "deep" &&
      approval.approvedAt <= availableAt &&
      approval.scope.duration.startsAt <= availableAt &&
      approval.scope.duration.expiresAt >= availableAt,
  );
}

export function isElevatedRiskApprovalUnavailable(
  classification: OpportunityExclusionAssessment["marketSafety"]["classification"],
  approvals: ResearchApproval[],
  opportunityId: string,
  availableAt: string,
): boolean {
  return (
    classification === "elevated-risk" &&
    !hasElevatedRiskResearchApproval(approvals, opportunityId, availableAt)
  );
}

export type OpportunityGateView = NonNullable<
  NonNullable<WorkView["opportunities"]>[number]["exclusionGates"]
>[number];

export function opportunityDispositionFor(
  gates: OpportunityGateView[],
  elevatedRiskApprovalUnavailable: boolean,
) {
  const failedGates = gates.filter((gate) => gate.state === "failed");
  const unresolvedGates = gates.filter((gate) => gate.state === "unresolved");
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
                : [
                    gates.find((gate) => gate.kind === "market-safety")!
                      .decisionId,
                  ],
          }
        : {
            status: "active" as const,
            decisionIds: gates.map((gate) => gate.decisionId),
          };
  return {
    disposition,
    eligibility:
      disposition.status === "active"
        ? ("pending-qualification" as const)
        : ("ineligible" as const),
  };
}

export function workViewAtInspectionTime(
  workView: WorkView,
  approvals: ResearchApproval[],
  inspectedAt: string,
): WorkView {
  let renewalAvailable = false;
  const opportunities = workView.opportunities?.map((opportunity) => {
    if (
      opportunity.marketSafety === undefined ||
      opportunity.exclusionGates === undefined
    ) {
      return opportunity;
    }
    const elevatedRiskApprovalUnavailable = isElevatedRiskApprovalUnavailable(
      opportunity.marketSafety.classification,
      approvals,
      opportunity.id,
      inspectedAt,
    );
    renewalAvailable ||=
      elevatedRiskApprovalUnavailable &&
      opportunity.exclusionGates.every((gate) => gate.state !== "failed");
    return {
      ...opportunity,
      ...opportunityDispositionFor(
        opportunity.exclusionGates,
        elevatedRiskApprovalUnavailable,
      ),
    };
  });
  const nextPermittedActions = workView.nextPermittedActions.filter(
    (action) => action !== "request-elevated-risk-research-approval",
  );
  if (renewalAvailable && workView.pause === null) {
    nextPermittedActions.push("request-elevated-risk-research-approval");
  }
  return { ...workView, nextPermittedActions, opportunities };
}

export function publicResearchApprovalScopeMismatch(
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

export type ResearchExpenditurePolicyViolation =
  | "scope"
  | "duration"
  | "approval-budget"
  | "campaign-budget";

export function researchExpenditurePolicyViolation({
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

export function invalidAuthoritativeRecord(sequence: number): never {
  throw new Error(`authoritative record ${sequence} is invalid`);
}

export type ReasoningState = Omit<EvidenceLedger, "campaignId" | "campaignDecisions">;

export function invalidatedEvidenceIds(state: ReasoningState): Set<string> {
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

export function allReasoningEntryIds(state: ReasoningState): Set<string> {
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

export function availableAffirmativeEvidenceIds(state: ReasoningState): Set<string> {
  const invalidatedIds = invalidatedEvidenceIds(state);
  return new Set([
    ...state.observations
      .filter((observation) => !invalidatedIds.has(observation.id))
      .map((observation) => observation.id),
    ...state.inferences
      .filter((inference) => !invalidatedIds.has(inference.id))
      .map((inference) => inference.id),
  ]);
}

export function applyReasoningEntries(
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

export function discoveryTrancheViolation(
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

export function applyDiscoveryTranche(
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

export function opportunityFormationViolation(
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

export function applyOpportunityFormation(
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

export function formedOpportunities(history: AuthoritativeHistoryRebuild) {
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

export function breadthGateViolation(
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

export function applyBreadthGate(
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

export function opportunityExclusionEvaluationViolation(
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
  const hardConstraintsById = new Map(
    history.intake.statements
    .filter((statement) => statement.classification === "hard-constraint")
      .map((statement) => [statement.id, statement.text] as const),
  );
  const hardConstraintIds = [...hardConstraintsById.keys()];
  const availableEvidenceIds = availableAffirmativeEvidenceIds(history);
  const availableInferencesById = new Map(
    history.inferences
      .filter((inference) => availableEvidenceIds.has(inference.id))
      .map((inference) => [inference.id, inference] as const),
  );
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
    for (const constraint of assessment.hardConstraints) {
      if (
        constraint.gate.decision.applicableRule !==
        hardConstraintsById.get(constraint.hardConstraintId)
      ) {
        return `Hard Constraint gate ${constraint.gate.id} must use the exact confirmed Hard Constraint text`;
      }
    }
    const gates = exclusionGatesFor(assessment);
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
        (entryId) => !availableEvidenceIds.has(entryId),
      );
      if (unavailableEvidenceId !== undefined) {
        return `Campaign Decision ${decision.id} links unavailable affirmative evidence ${unavailableEvidenceId}`;
      }
      const unscopedSupportingEvidenceId =
        decision.supportingEvidenceEntryIds.find(
          (entryId) =>
            availableInferencesById.get(entryId)?.scope !==
            decision.opportunityId,
        );
      if (unscopedSupportingEvidenceId !== undefined) {
        return `Campaign Decision ${decision.id} must cite Opportunity-scoped Inferences as supporting evidence; ${unscopedSupportingEvidenceId} is not an Inference scoped to ${decision.opportunityId}`;
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
      const affectedOpenGapIds = history.evidenceGaps
        .filter(
          (gap) =>
            gap.status === "open" && gap.affectedDecisionIds.includes(decision.id),
        )
        .map((gap) => gap.id);
      if (
        affectedOpenGapIds.length !== decision.evidenceGapIds.length ||
        affectedOpenGapIds.some(
          (gapId) => !decision.evidenceGapIds.includes(gapId),
        )
      ) {
        return `Campaign Decision ${decision.id} must record every open Evidence Gap that affects it`;
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
      const decisionEvidenceIds = new Set([
        ...decision.supportingEvidenceEntryIds,
        ...decision.challengingEvidenceEntryIds,
      ]);
      const involvedUnresolvedContradictionIds = history.contradictions
        .filter(
          (contradiction) =>
            contradiction.resolutionStatus !== "resolved" &&
            contradiction.entryIds.some((entryId) =>
              decisionEvidenceIds.has(entryId),
            ),
        )
        .map((contradiction) => contradiction.id);
      if (
        involvedUnresolvedContradictionIds.length !==
          decision.contradictionIds.length ||
        involvedUnresolvedContradictionIds.some(
          (contradictionId) =>
            !decision.contradictionIds.includes(contradictionId),
        )
      ) {
        return `Campaign Decision ${decision.id} must record every unresolved Contradiction involving its evidence`;
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

export function applyOpportunityExclusionEvaluation(
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

export const authoritativeOperationDescriptors = {
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

export function authoritativeOperationDescriptor(
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

export function initialWorkView(campaignId: string): WorkView {
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

export function campaignRecordPair({
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

export function campaignOperationRecords(operation: CampaignOperation) {
  return campaignRecordPair({
    ...operation,
    intent: {
      coordinatorId: operation.coordinatorId,
      leaseExpiresAt: operation.leaseExpiresAt,
    },
    outcome: {},
  });
}

export function campaignIntakeRecords(
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

export function publicResearchReservationRecords(
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

export function publicResearchObservationRecords(
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

export function evidenceReasoningRecords(
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

export function discoveryTrancheRecords(
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

export function opportunityFormationRecords(
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

export function breadthGateRecords(
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

export function opportunityExclusionGateRecords(
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

export function researchApprovalRequestRecords(
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

export function researchApprovalInformationRecords(
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

export function researchApprovalResponseRecords(
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

export function researchExpenditureRecords(
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

export async function readJson(targetPath: string): Promise<unknown> {
  return JSON.parse(await readFile(targetPath, "utf8"));
}

export async function readCampaignRecords(campaignPath: string): Promise<unknown[]> {
  return (await readFile(path.join(campaignPath, "records.jsonl"), "utf8"))
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as unknown);
}

export function matchesContracts(value: Record<string, unknown>): boolean {
  const entries = Object.entries(contracts);
  return (
    Object.keys(value).length === entries.length &&
    entries.every(([name, version]) => value[name] === version)
  );
}

export type CampaignManifest = {
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

export function parseCampaignManifest(value: unknown): CampaignManifest | undefined {
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

export async function rebuildCampaignFromAuthority(campaignPath: string) {
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
  const latestRecord = records.at(-1);
  if (!isRecord(latestRecord) || !isIsoInstant(latestRecord.recordedAt)) {
    throw new Error("latest authoritative record is invalid");
  }
  const workViewAsOf = latestRecord.recordedAt;

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
          isElevatedRiskApprovalUnavailable(
            assessment.marketSafety.classification,
            researchApprovals,
            assessment.opportunityId,
            workViewAsOf,
          ) &&
          exclusionGatesFor(assessment).every(
            (gate) => gate.state !== "failed",
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
      const elevatedRiskApprovalUnavailable = isElevatedRiskApprovalUnavailable(
        assessment.marketSafety.classification,
        researchApprovals,
        assessment.opportunityId,
        workViewAsOf,
      );
      const disposition = opportunityDispositionFor(
        gates,
        elevatedRiskApprovalUnavailable,
      );
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
        ...disposition,
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
      ...workView.nextPermittedActions.filter(
        (action) => action !== "request-elevated-risk-research-approval",
      ),
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

export function matchesPersistedWorkView(
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

export async function loadCampaign(campaignPath: string) {
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

export async function persistDerivedCampaignState(
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

export async function appendCampaignRecordsAndPersist(
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

export async function hasCampaignManifest(campaignPath: string): Promise<boolean> {
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

export async function locateCampaign(locator: CampaignLocator) {
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

export async function inspectCampaign(
  command: InspectCampaignCommand,
  currentTime: string,
) {
  try {
    const { campaignPath, locatedBy } = await locateCampaign(command.payload);
    const campaign = await loadCampaign(campaignPath);
    return {
      envelopeVersion: contracts.commandEnvelope,
      requestId: command.requestId,
      command: command.command,
      ok: true as const,
      result: {
        locatedBy,
        ...campaign,
        workView: workViewAtInspectionTime(
          campaign.workView,
          campaign.researchApprovals ?? [],
          currentTime,
        ),
      },
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

export function evidenceEntriesById(evidenceLedger: EvidenceLedger) {
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

export async function inspectEvidence(command: InspectEvidenceCommand) {
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
