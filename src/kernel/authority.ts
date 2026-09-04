import {
  chmod,
  link,
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
  CampaignResearchReservation,
  ReservePublicResearchCommand,
  ReserveApprovedResearchCommand,
  Source,
  Observation,
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
  RecordApprovedResearchObservationCommand,
  RecordEvidenceReasoningCommand,
  DiscoverySweep,
  DiscoveryTranche,
  RecordDiscoveryTrancheCommand,
  CampaignDecision,
  OpportunityExclusionAssessment,
  OpportunityExclusionEvaluation,
  RecordOpportunityExclusionGatesCommand,
  OpportunityQualificationEvaluation,
  RecordOpportunityQualificationGatesCommand,
  NoQualifyingOpportunityReport,
  NoQualifyingOpportunityContinuationCondition,
  ConcludeNoQualifyingOpportunityCommand,
  OpportunityComparison,
  OpportunityBrief,
  ConcludeLeadingOpportunityCommand,
  InconclusiveComparisonReport,
  InconclusiveOpportunityComparison,
  ConcludeInconclusiveComparisonCommand,
  RespondInconclusiveComparisonCommand,
  InconclusiveComparisonResponseRecord,
  ReevaluateCampaignCommand,
  CampaignReevaluation,
  CampaignIntakeRevision,
  DeveloperOpportunitySelection,
  OpportunityFormation,
  RecordOpportunityFormationCommand,
  BreadthGate,
  PassBreadthGateCommand,
  ResearchApprovalRequest,
  PendingResearchApprovalDecision,
  PendingDecision,
  PendingInterruptedResearchDecision,
  InterruptedResearchResponse,
  RespondInterruptedResearchCommand,
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
  QualificationGate,
} from "./types.js";
import { qualificationGateKinds } from "./types.js";
import {
  createLeadingOpportunityModule,
  renderOpportunityBrief,
} from "./leading-opportunity.js";
export { renderOpportunityBrief } from "./leading-opportunity.js";
import {
  createInconclusiveComparisonModule,
  renderInconclusiveComparisonReport,
} from "./inconclusive-comparison.js";
export { renderInconclusiveComparisonReport } from "./inconclusive-comparison.js";
import {
  hasOnlyFields,
  isIsoInstant,
  isRecord,
  validateBreadthGate,
  validateCampaignIntake,
  validateCampaignResearchReservation,
  validateDiscoveryTranche,
  validatePersistableText,
  validatePublicObservation,
  validatePublicResearchReservation,
  validatePublicSource,
  validateReasoningEntry,
  validateRecordOpportunityExclusionGatesFields,
  validateRecordOpportunityQualificationGatesFields,
  validateConcludeNoQualifyingOpportunityFields,
  validateConcludeLeadingOpportunityFields,
  validateConcludeInconclusiveComparisonFields,
  validateRespondInconclusiveComparisonFields,
  validateReevaluateCampaignFields,
  validateRecordOpportunityFormationFields,
  validateResearchApprovalRequest,
  validateRespondInterruptedResearchFields,
  validateRecordApprovedResearchObservationFields,
} from "./validation.js";
import {
  commitStagedOperation,
  completeOperationRecovery,
  authoritativeHistoryDigest,
  manifestDigest,
  parseAuthoritativeRecordText,
  recordDigest,
  injectPersistenceFault,
  recoverInterruptedOperations,
  stageOperationIntent,
} from "./recovery.js";
import {
  CampaignAuthorityError,
  campaignAuthorityFailure,
  NewerCampaignContractsError,
} from "./campaign-errors.js";
import type {
  InterruptedOperationRecovery,
  RecoveredOperation,
} from "./recovery.js";

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

export async function writePrivateText(
  targetPath: string,
  value: string,
): Promise<void> {
  await writeFile(targetPath, value, { mode: 0o600 });
  await chmod(targetPath, 0o600);
}

async function replacePrivate(
  targetPath: string,
  writeTemporaryFile: (temporaryPath: string) => Promise<void>,
): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
  const temporaryDirectory = await mkdtemp(
    path.join(path.dirname(targetPath), ".svs-write-"),
  );
  await chmod(temporaryDirectory, 0o700);
  try {
    const temporaryPath = path.join(temporaryDirectory, path.basename(targetPath));
    await writeTemporaryFile(temporaryPath);
    await rename(temporaryPath, targetPath);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function replacePrivateJson(targetPath: string, value: unknown): Promise<void> {
  await replacePrivate(targetPath, (temporaryPath) =>
    writePrivateJson(temporaryPath, value),
  );
}

export async function replacePrivateText(
  targetPath: string,
  value: string,
): Promise<void> {
  await replacePrivate(targetPath, (temporaryPath) =>
    writePrivateText(temporaryPath, value),
  );
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
  const lockPath = path.join(lockDirectory, "active.json");
  const candidatePath = path.join(lockDirectory, `.${token}.candidate`);
  const expiresAt = new Date(
    new Date(acquiredAt).valueOf() + 5 * 60 * 1_000,
  ).toISOString();
  await writePrivateJson(candidatePath, {
    version: contracts.records,
    token,
    processId: process.pid,
    requestId,
    coordinatorId,
    acquiredAt,
    expiresAt,
  });
  try {
    for (;;) {
      try {
        await link(candidatePath, lockPath);
        return { path: lockPath, token };
      } catch (error) {
        if (!isRecord(error) || error.code !== "EEXIST") {
          throw error;
        }
      }

      let owner: unknown;
      try {
        owner = await readJson(lockPath);
      } catch (error) {
        if (isRecord(error) && error.code === "ENOENT") {
          continue;
        }
        throw error;
      }
      if (
        isRecord(owner) &&
        Number.isSafeInteger(owner.processId) &&
        Number(owner.processId) > 0
      ) {
        try {
          process.kill(Number(owner.processId), 0);
          return undefined;
        } catch (error) {
          if (!isRecord(error) || error.code !== "ESRCH") {
            return undefined;
          }
        }
      }

      const stalePath = path.join(lockDirectory, `.stale-${token}`);
      try {
        await rename(lockPath, stalePath);
        await rm(stalePath, { force: true });
      } catch (error) {
        if (!isRecord(error) || error.code !== "ENOENT") {
          throw error;
        }
      }
    }
  } finally {
    await rm(candidatePath, { force: true });
  }
}

export async function releaseCoordinatorOperationLock(
  lock: CoordinatorOperationLock,
): Promise<void> {
  try {
    const owner = await readJson(lock.path);
    if (isRecord(owner) && owner.token === lock.token) {
      await rm(lock.path, { force: true });
    }
  } catch (error) {
    if (!isRecord(error) || error.code !== "ENOENT") {
      throw error;
    }
  }
}

export type AuthoritativeHistoryRebuild = {
  campaignId: string;
  intake?: ConfirmedCampaignIntake;
  reservations: Map<string, CampaignResearchReservation>;
  reservationRecordedAt: Map<string, string>;
  reservationObservationIds: Map<string, string>;
  reservationOutcomeSequence: Map<string, number>;
  settledReservationIds: Set<string>;
  closedResearchReservationIds: Set<string>;
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
  discoveryTranches: DiscoveryTranche[];
  opportunityFormations: OpportunityFormation[];
  breadthGates: BreadthGate[];
  opportunityExclusionEvaluations: OpportunityExclusionEvaluation[];
  opportunityQualificationEvaluations: OpportunityQualificationEvaluation[];
  noQualifyingOpportunityReports: NoQualifyingOpportunityReport[];
  opportunityComparisons: OpportunityComparison[];
  opportunityBriefs: OpportunityBrief[];
  inconclusiveComparisonReports: InconclusiveComparisonReport[];
  inconclusiveComparisonResponses: InconclusiveComparisonResponseRecord[];
  developerSelectedOpportunityBriefs: OpportunityBrief[];
  reevaluations: CampaignReevaluation[];
  campaignDecisions: CampaignDecision[];
  researchApprovalDecisions: PendingResearchApprovalDecision[];
  researchApprovalInformation: RecordedResearchApprovalInformation[];
  researchApprovalResponses: RecordedResearchApprovalResponse[];
  researchApprovals: ResearchApproval[];
  researchExpenditures: ResearchExpenditure[];
  resumeOutcomes: Array<{
    requestId: string;
    recordedAt: string;
    outcomeSequence: number;
  }>;
  interruptedResearchResponses: InterruptedResearchResponse[];
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

export function interruptedApprovedResearchDecision(
  history: Pick<
    AuthoritativeHistoryRebuild,
    | "reservations"
    | "reservationOutcomeSequence"
    | "settledReservationIds"
    | "researchApprovals"
    | "resumeOutcomes"
  >,
): PendingInterruptedResearchDecision | undefined {
  const interrupted = [...history.reservations.values()]
    .flatMap((reservation) => {
      if (
        history.settledReservationIds.has(reservation.id) ||
        reservation.approvalId === undefined
      ) {
        return [];
      }
      const reservationSequence = history.reservationOutcomeSequence.get(
        reservation.id,
      );
      const firstResume = history.resumeOutcomes.find(
        (resume) =>
          reservationSequence !== undefined &&
          resume.outcomeSequence > reservationSequence,
      );
      const approval = history.researchApprovals.find(
        (candidate) => candidate.id === reservation.approvalId,
      );
      if (
        firstResume === undefined ||
        approval === undefined ||
        !["restricted", "paid", "restricted-and-paid"].includes(
          approval.scope.access,
        )
      ) {
        return [];
      }
      return [
        {
          reservationId: reservation.id,
          approvalId: approval.id,
          access: approval.scope.access as
            | "restricted"
            | "paid"
            | "restricted-and-paid",
          sourceId: approval.scope.source.id,
          purpose: reservation.purpose,
          maximumCost: approval.scope.maximumCost,
          interruptedAt: firstResume.recordedAt,
        },
      ];
    })
    .sort((left, right) =>
      left.reservationId.localeCompare(right.reservationId),
    );
  if (interrupted.length === 0) {
    return undefined;
  }
  const requestedAt = interrupted.reduce(
    (latest, reservation) =>
      reservation.interruptedAt > latest ? reservation.interruptedAt : latest,
    interrupted[0]!.interruptedAt,
  );
  const reservations = interrupted.map(
    ({ interruptedAt: _interruptedAt, ...reservation }) => reservation,
  );
  return {
    id: `interrupted-approved-research:${reservations.map((reservation) => reservation.reservationId).join(",")}`,
    type: "interrupted-approved-research",
    requestedAt,
    question:
      "Did the approved Source work complete, and was a charge incurred before interruption? Do not repeat access or payment.",
    reservations,
    options: [
      {
        kind: "record-completed-result",
        action: "recordApprovedResearchObservation",
      },
      {
        kind: "resolve-without-result",
        action: "respondInterruptedResearch",
      },
    ],
  };
}

export function latestInconclusiveResearchExtension(
  history: Pick<AuthoritativeHistoryRebuild, "inconclusiveComparisonResponses">,
) {
  return history.inconclusiveComparisonResponses
    .filter((entry) => entry.response.kind === "extend")
    .at(-1);
}

export function activeInconclusiveResearchExtension(
  history: Pick<
    AuthoritativeHistoryRebuild,
    "inconclusiveComparisonReports" | "inconclusiveComparisonResponses"
  >,
) {
  const report = history.inconclusiveComparisonReports.at(-1);
  if (report === undefined) {
    return undefined;
  }
  const response = latestInconclusiveResearchExtension(history);
  return response?.reportId === report.id && response.response.kind === "extend"
    ? response
    : undefined;
}

export function reservationMatchesInconclusiveExtension(
  reservation: Pick<
    CampaignResearchReservation,
    "researchClass" | "opportunityId" | "evidenceGapId"
  >,
  extension: {
    affectedOpportunityIds: string[];
    targetedEvidenceGapIds: string[];
  },
): boolean {
  return (
    reservation.researchClass === "deepening" &&
    extension.affectedOpportunityIds.includes(reservation.opportunityId ?? "") &&
    extension.targetedEvidenceGapIds.includes(reservation.evidenceGapId ?? "")
  );
}

export function inconclusiveResearchExtensionViolation(
  history: AuthoritativeHistoryRebuild,
  operation: AuthoritativeOperation,
  outcome: Record<string, unknown>,
): string | undefined {
  const extension = activeInconclusiveResearchExtension(history);
  if (extension?.response.kind !== "extend") {
    return undefined;
  }
  const extensionScope = extension.response;
  const affectedOpportunityIds = extensionScope.affectedOpportunityIds;
  const targetedEvidenceGapIds = extensionScope.targetedEvidenceGapIds;
  const scopedReservations = [...history.reservations.values()].filter(
    (reservation) =>
      history.reservationRecordedAt.get(reservation.id)! >= extension.respondedAt &&
      reservationMatchesInconclusiveExtension(reservation, extensionScope),
  );
  const scopedReservationIds = new Set(
    scopedReservations.map((reservation) => reservation.id),
  );
  const scopedObservationIds = new Set(
    scopedReservations
      .map((reservation) => history.reservationObservationIds.get(reservation.id))
      .filter((id): id is string => id !== undefined),
  );
  const scopedSourceIds = new Set(
    history.observations
      .filter((observation) => scopedObservationIds.has(observation.id))
      .map((observation) => observation.sourceId),
  );
  const pendingApproval = activeResearchApprovalDecision(history);
  const approvalIsScoped =
    pendingApproval !== undefined &&
    affectedOpportunityIds.includes(pendingApproval.request.opportunityId ?? "");

  switch (operation) {
    case "resume-campaign":
    case "conclude-leading-opportunity":
    case "conclude-inconclusive-comparison":
      return undefined;
    case "reserve-public-research":
    case "reserve-approved-research": {
      const reservation = isRecord(outcome.reservation)
        ? outcome.reservation
        : {};
      return reservationMatchesInconclusiveExtension(
        reservation,
        extensionScope,
      )
        ? undefined
        : "research reservation is outside the targeted extension";
    }
    case "record-public-research-observation":
    case "record-approved-research-observation":
      return scopedReservationIds.has(String(outcome.reservationId))
        ? undefined
        : "research observation is outside the targeted extension";
    case "respond-interrupted-research": {
      const response = isRecord(outcome.response) ? outcome.response : {};
      const reservationIds = Array.isArray(response.reservations)
        ? response.reservations.map((resolution) =>
            isRecord(resolution) ? String(resolution.reservationId) : "",
          )
        : [];
      return reservationIds.length > 0 &&
        reservationIds.every((id) => scopedReservationIds.has(id))
        ? undefined
        : "interrupted Approved Research is outside the targeted extension";
    }
    case "record-evidence-reasoning": {
      if (!Array.isArray(outcome.entries) || outcome.entries.length === 0) {
        return "evidence reasoning is outside the targeted extension";
      }
      const entryIsScoped = (entry: unknown): boolean => {
        if (!isRecord(entry)) {
          return false;
        }
        switch (entry.type) {
          case "source-lineage":
            return (
              Array.isArray(entry.sourceIds) &&
              entry.sourceIds.length > 0 &&
              entry.sourceIds.every((id) => scopedSourceIds.has(String(id)))
            );
          case "source-credibility":
          case "source-freshness":
            return scopedObservationIds.has(String(entry.observationId));
          case "evidence-gap":
            return targetedEvidenceGapIds.includes(String(entry.id));
          case "assumption":
            return (
              affectedOpportunityIds.includes(String(entry.scope)) &&
              targetedEvidenceGapIds.includes(String(entry.evidenceGapId))
            );
          case "inference":
            return affectedOpportunityIds.includes(String(entry.scope));
          case "contradiction":
            return affectedOpportunityIds.includes(String(entry.disputedScope));
          case "correction":
            return targetedEvidenceGapIds.includes(String(entry.targetEntryId));
          default:
            return false;
        }
      };
      return outcome.entries.every(entryIsScoped)
        ? undefined
        : "evidence reasoning is outside the targeted extension";
    }
    case "record-opportunity-exclusion-gates": {
      const opportunityIds = Array.isArray(outcome.assessments)
        ? outcome.assessments.map((assessment) =>
            isRecord(assessment) ? String(assessment.opportunityId) : "",
          )
        : [];
      return opportunityIds.length > 0 &&
        opportunityIds.every((id) => affectedOpportunityIds.includes(id))
        ? undefined
        : "Opportunity exclusion work is outside the targeted extension";
    }
    case "record-opportunity-qualification-gates": {
      const evaluation = isRecord(outcome.evaluation) ? outcome.evaluation : {};
      const opportunityIds = Array.isArray(evaluation.assessments)
        ? evaluation.assessments.map((assessment) =>
            isRecord(assessment) ? String(assessment.opportunityId) : "",
          )
        : [];
      return opportunityIds.length > 0 &&
        opportunityIds.every((id) => affectedOpportunityIds.includes(id))
        ? undefined
        : "Opportunity qualification work is outside the targeted extension";
    }
    case "request-research-approval": {
      const decision = isRecord(outcome.pendingDecision)
        ? outcome.pendingDecision
        : {};
      const request = isRecord(decision.request) ? decision.request : {};
      return affectedOpportunityIds.includes(String(request.opportunityId ?? ""))
        ? undefined
        : "Research Approval is outside the targeted extension";
    }
    case "record-research-approval-information":
    case "respond-research-approval":
      return approvalIsScoped
        ? undefined
        : "Research Approval work is outside the targeted extension";
    case "record-research-expenditure": {
      const expenditure = isRecord(outcome.expenditure)
        ? outcome.expenditure
        : {};
      const approval = history.researchApprovals.find(
        (entry) => entry.id === expenditure.approvalId,
      );
      return approval !== undefined &&
        affectedOpportunityIds.includes(approval.scope.opportunityId ?? "")
        ? undefined
        : "research expenditure is outside the targeted extension";
    }
    default:
      return "operation is outside the targeted extension";
  }
}

export type PublicResearchAllocationViolation =
  | "required"
  | "not-available"
  | "imbalanced";

export function campaignResearchAllocationViolation(
  history: AuthoritativeHistoryRebuild,
  reservation: CampaignResearchReservation,
): PublicResearchAllocationViolation | undefined {
  const breadthGatePassed = history.breadthGates.length > 0;
  if (reservation.researchClass === "adversarial") {
    return breadthGatePassed ? undefined : "not-available";
  }
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

export type ResearchDecisionValueViolation = "required" | "scope" | "stopped";

export function researchDecisionValueViolation(
  history: AuthoritativeHistoryRebuild,
  reservation: CampaignResearchReservation,
): ResearchDecisionValueViolation | undefined {
  const evaluation = history.opportunityQualificationEvaluations.at(-1);
  if (
    evaluation === undefined ||
    reservation.researchClass === undefined ||
    reservation.researchClass === "adversarial"
  ) {
    return undefined;
  }
  if (evaluation.researchDecision.outcome === "stop") {
    return "stopped";
  }
  if (reservation.decisionValuePriorityId === undefined) {
    return "required";
  }
  const priority = evaluation.researchDecision.decisionValuePriorities.find(
    (candidate) => candidate.id === reservation.decisionValuePriorityId,
  );
  if (priority === undefined) {
    return "scope";
  }
  if (
    priority.target.kind !== "gate" ||
    reservation.purpose !== priority.permittedAction.purpose ||
    reservation.retrievalRoute !== priority.permittedAction.retrievalRoute ||
    reservation.researchClass !== priority.permittedAction.researchClass ||
    reservation.opportunityId !== priority.permittedAction.opportunityId
  ) {
    return "scope";
  }
  const assessment = evaluation.assessments.find((candidate) =>
    candidate.gates.some((gate) => gate.id === priority.target.id),
  );
  if (assessment?.opportunityId !== reservation.opportunityId) {
    return "scope";
  }
  return undefined;
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
  reservation: CampaignResearchReservation,
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
  if (!targetsElevatedRisk) {
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

export type AdversarialResearchViolation =
  | "qualification-required"
  | "ineligible";

export function adversarialResearchViolation(
  history: AuthoritativeHistoryRebuild,
  reservation: CampaignResearchReservation,
  reservedAt: string,
): AdversarialResearchViolation | undefined {
  if (reservation.researchClass !== "adversarial") {
    return undefined;
  }
  if (
    history.opportunityQualificationEvaluations.at(-1)?.researchDecision
      .stopReason !== "qualification-complete"
  ) {
    return "qualification-required";
  }
  if (
    reservation.opportunityId === undefined ||
    noQualifyingOpportunityDisposition(
      history,
      reservation.opportunityId,
      reservedAt,
    ).status !== "eligible"
  ) {
    return "ineligible";
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

export type QualificationGateView = NonNullable<
  NonNullable<WorkView["opportunities"]>[number]["qualificationGates"]
>[number];

export type GateDispositionView = {
  state: "passed" | "failed" | "unresolved";
  decisionId: string;
};

export function gateDispositionFor(
  gates: GateDispositionView[],
  additionalUnresolvedDecisionId?: string,
) {
  const failedGates = gates.filter((gate) => gate.state === "failed");
  const unresolvedGates = gates.filter((gate) => gate.state === "unresolved");
  return failedGates.length > 0
    ? {
        status: "rejected" as const,
        decisionIds: failedGates.map((gate) => gate.decisionId),
      }
    : unresolvedGates.length > 0 ||
        additionalUnresolvedDecisionId !== undefined
      ? {
          status: "unresolved" as const,
          decisionIds:
            unresolvedGates.length > 0
              ? unresolvedGates.map((gate) => gate.decisionId)
              : [additionalUnresolvedDecisionId!],
        }
      : {
          status: "active" as const,
          decisionIds: gates.map((gate) => gate.decisionId),
        };
}

export function qualificationDispositionFor(
  gates: QualificationGateView[],
  elevatedRiskDecisionId?: string,
) {
  const disposition = gateDispositionFor(gates, elevatedRiskDecisionId);
  return {
    disposition,
    eligibility:
      disposition.status === "active"
        ? ("eligible" as const)
        : ("ineligible" as const),
  };
}

export function opportunityDispositionFor(
  gates: OpportunityGateView[],
  elevatedRiskApprovalUnavailable: boolean,
) {
  const disposition = gateDispositionFor(
    gates,
    elevatedRiskApprovalUnavailable
      ? gates.find((gate) => gate.kind === "market-safety")!.decisionId
      : undefined,
  );
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
    const exclusionDisposition = opportunityDispositionFor(
      opportunity.exclusionGates,
      elevatedRiskApprovalUnavailable,
    );
    if (
      opportunity.exclusionGates.some((gate) => gate.state !== "passed") ||
      opportunity.qualificationGates === undefined
    ) {
      return {
        ...opportunity,
        ...exclusionDisposition,
      };
    }
    return {
      ...opportunity,
      ...qualificationDispositionFor(
        opportunity.qualificationGates,
        elevatedRiskApprovalUnavailable
          ? opportunity.exclusionGates.find(
              (gate) => gate.kind === "market-safety",
            )?.decisionId
          : undefined,
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

export function researchApprovalScopeMismatch(
  history: AuthoritativeHistoryRebuild,
  reservationId: string,
  source: Source,
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
    state.corrections
      .filter((correction) => correction.action !== "reaffirm")
      .map((correction) => correction.targetEntryId),
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
    state.corrections
      .filter((correction) => correction.action !== "reaffirm")
      .map((correction) => correction.targetEntryId),
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
        if (entry.action !== "reaffirm") {
          correctedEntryIds.add(entry.targetEntryId);
        }
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

function mergedReevaluatedExclusionEvaluation(
  history: AuthoritativeHistoryRebuild,
  evaluation: OpportunityExclusionEvaluation,
  reevaluationId?: string,
): OpportunityExclusionEvaluation | string {
  const previous = history.opportunityExclusionEvaluations.at(-1);
  if (previous === undefined) {
    return reevaluationId === undefined
      ? evaluation
      : `Campaign Re-evaluation ${reevaluationId} has no prior Exclusion Gates`;
  }
  const reevaluation = history.reevaluations.at(-1);
  const invalidatedIds = invalidatedCampaignDecisionIds(history);
  const confirmedHardConstraintIds = new Set(
    history.intake!.statements.flatMap((statement) =>
      statement.classification === "hard-constraint" ? [statement.id] : [],
    ),
  );
  for (const assessment of evaluation.assessments) {
    const previousAssessment = previous.assessments.find(
      (candidate) => candidate.opportunityId === assessment.opportunityId,
    );
    const previousDecisionIds =
      previousAssessment === undefined
        ? []
        : [
            previousAssessment.marketSafety.gate.decision.id,
            ...previousAssessment.hardConstraints.map(
              ({ gate }) => gate.decision.id,
            ),
          ];
    const previousHardConstraintIds = new Set(
      previousAssessment?.hardConstraints.map(
        ({ hardConstraintId }) => hardConstraintId,
      ) ?? [],
    );
    const addsConfirmedHardConstraint = assessment.hardConstraints.some(
      ({ hardConstraintId }) =>
        confirmedHardConstraintIds.has(hardConstraintId) &&
        !previousHardConstraintIds.has(hardConstraintId),
    );
    if (
      reevaluation?.decision.outcome !== "resume" ||
      reevaluation.id !== reevaluationId ||
      previousAssessment === undefined ||
      !reevaluation.decision.affectedOpportunityIds.includes(
        assessment.opportunityId,
      ) ||
      !previousDecisionIds.some((id) => invalidatedIds.has(id)) &&
      !addsConfirmedHardConstraint
    ) {
      return `Opportunity ${assessment.opportunityId} has no superseded Exclusion Gate to re-evaluate`;
    }
    const gatePairs: Array<
      [
        ReturnType<typeof exclusionGatesFor>[number],
        ReturnType<typeof exclusionGatesFor>[number] | undefined,
      ]
    > = [[previousAssessment.marketSafety.gate, assessment.marketSafety.gate]];
    for (const { hardConstraintId, gate } of previousAssessment.hardConstraints) {
      gatePairs.push([
        gate,
        assessment.hardConstraints.find(
          (candidate) => candidate.hardConstraintId === hardConstraintId,
        )?.gate,
      ]);
    }
    for (const [previousGate, replacementGate] of gatePairs) {
      if (replacementGate === undefined) {
        if (invalidatedIds.has(previousGate.decision.id)) {
          continue;
        }
        return `Opportunity ${assessment.opportunityId} must retain every unaffected Exclusion Gate`;
      }
      const invalidated = invalidatedIds.has(previousGate.decision.id);
      if (
        (invalidated &&
          replacementGate.decision.id === previousGate.decision.id) ||
        (!invalidated &&
          JSON.stringify(replacementGate) !== JSON.stringify(previousGate))
      ) {
        return `Opportunity ${assessment.opportunityId} must replace exactly its superseded Exclusion Gates`;
      }
    }
  }
  const replacements = new Map(
    evaluation.assessments.map((assessment) => [
      assessment.opportunityId,
      assessment,
    ]),
  );
  return {
    assessments: previous.assessments.map(
      (assessment) => replacements.get(assessment.opportunityId) ?? assessment,
    ),
  };
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
  const previousBreadthGate = history.breadthGates.at(-1);
  if (
    previousBreadthGate !== undefined &&
    !invalidatedCampaignDecisionIds(history).has(
      previousBreadthGate.decision.id,
    )
  ) {
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
  recordedAt?: string,
  reevaluationId?: string,
): string | undefined {
  if (history.intake === undefined || history.breadthGates.length === 0) {
    return "Opportunity Exclusion Gates require a passed Breadth Gate";
  }
  const mergedEvaluation = mergedReevaluatedExclusionEvaluation(
    history,
    evaluation,
    reevaluationId,
  );
  if (typeof mergedEvaluation === "string") {
    return mergedEvaluation;
  }
  evaluation = mergedEvaluation;
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
        const existingGate = history.opportunityExclusionEvaluations
          .flatMap((candidate) => candidate.assessments)
          .flatMap((candidate) => exclusionGatesFor(candidate))
          .find((candidate) => candidate.decision.id === decision.id);
        if (JSON.stringify(existingGate) !== JSON.stringify(gate)) {
          return `Campaign Decision identity ${decision.id} is already present`;
        }
        continue;
      }
      if (recordedAt !== undefined && decision.decidedAt !== recordedAt) {
        return `new Campaign Decision ${decision.id} must be decided at the operation time`;
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
        ...supportingObservationIds(history, [
          ...decision.supportingEvidenceEntryIds,
          ...decision.challengingEvidenceEntryIds,
        ]),
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
  recordedAt?: string,
  reevaluationId?: string,
): string | undefined {
  const violation = opportunityExclusionEvaluationViolation(
    history,
    evaluation,
    recordedAt,
    reevaluationId,
  );
  if (violation !== undefined) {
    return violation;
  }
  const mergedEvaluation = mergedReevaluatedExclusionEvaluation(
    history,
    evaluation,
    reevaluationId,
  );
  if (typeof mergedEvaluation === "string") {
    return mergedEvaluation;
  }
  const existingDecisionIds = new Set(
    history.campaignDecisions.map((decision) => decision.id),
  );
  for (const assessment of evaluation.assessments) {
    for (const decision of [
      assessment.marketSafety.gate.decision,
      ...assessment.hardConstraints.map(({ gate }) => gate.decision),
    ]) {
      if (!existingDecisionIds.has(decision.id)) {
        history.campaignDecisions.push(decision);
        existingDecisionIds.add(decision.id);
      }
    }
  }
  history.opportunityExclusionEvaluations.push(mergedEvaluation);
  return undefined;
}

const behaviorEvidenceQualificationGateKinds = new Set<QualificationGate["kind"]>([
  "costly-problem",
  "buyer-economics",
  "customer-access",
  "competitive-viability",
  "commercial-plausibility",
]);

const timeSensitiveQualificationGateKinds = new Set<QualificationGate["kind"]>([
  "costly-problem",
  "buyer-economics",
  "customer-access",
  "competitive-viability",
  "legal-operational-feasibility",
  "commercial-plausibility",
]);

export function supportingObservationIds(
  history: AuthoritativeHistoryRebuild,
  entryIds: string[],
): Set<string> {
  const observationIds = new Set(
    history.observations.map((observation) => observation.id),
  );
  const inferencesById = new Map(
    history.inferences.map((inference) => [inference.id, inference] as const),
  );
  const result = new Set<string>();
  const visited = new Set<string>();
  const visit = (entryId: string) => {
    if (visited.has(entryId)) {
      return;
    }
    visited.add(entryId);
    if (observationIds.has(entryId)) {
      result.add(entryId);
      return;
    }
    const inference = inferencesById.get(entryId);
    if (inference !== undefined) {
      for (const supportingEntryId of inference.supportingEntryIds) {
        visit(supportingEntryId);
      }
    }
  };
  for (const entryId of entryIds) {
    visit(entryId);
  }
  return result;
}

export function qualificationEvidenceViolation(
  history: AuthoritativeHistoryRebuild,
  gate: QualificationGate,
): string | undefined {
  if (gate.state === "unresolved") {
    return undefined;
  }
  const supportingObservationIdSet = supportingObservationIds(
    history,
    gate.decision.supportingEvidenceEntryIds,
  );
  const invalidatedIds = invalidatedEvidenceIds(history);
  if (behaviorEvidenceQualificationGateKinds.has(gate.kind)) {
    if (gate.evidenceBasis.behavioralEvidenceEntryIds.length === 0) {
      return `Qualification Gate ${gate.id} requires explicit behavioral evidence`;
    }
    const behavioralObservationIds = supportingObservationIds(
      history,
      gate.evidenceBasis.behavioralEvidenceEntryIds,
    );
    const behavioralSourceIds = new Set(
      history.observations
        .filter((observation) => behavioralObservationIds.has(observation.id))
        .map((observation) => observation.sourceId),
    );
    const lineages = gate.evidenceBasis.independentSourceLineages;
    if (lineages.length < 2) {
      return `Qualification Gate ${gate.id} requires independent behavior evidence from at least two Source Lineages`;
    }
    const declaredSourceIds = lineages.flatMap((lineage) => lineage.sourceIds);
    if (
      new Set(declaredSourceIds).size !== declaredSourceIds.length ||
      declaredSourceIds.some((sourceId) => !behavioralSourceIds.has(sourceId))
    ) {
      return `Qualification Gate ${gate.id} Source Lineages must be distinct and traceable to its behavioral evidence`;
    }
    const lineageIndexBySourceId = new Map<string, number>();
    lineages.forEach((lineage, index) => {
      for (const sourceId of lineage.sourceIds) {
        lineageIndexBySourceId.set(sourceId, index);
      }
    });
    const dependentAcrossLineages = history.sourceLineages
      .filter((lineage) => !invalidatedIds.has(lineage.id))
      .some((lineage) => {
      const declaredLineageIndexes = new Set(
        lineage.sourceIds
          .map((sourceId) => lineageIndexBySourceId.get(sourceId))
          .filter((index): index is number => index !== undefined),
      );
      return declaredLineageIndexes.size > 1;
      });
    if (dependentAcrossLineages) {
      return `Qualification Gate ${gate.id} cannot count dependent Sources as independent behavior evidence`;
    }
  }
  if (timeSensitiveQualificationGateKinds.has(gate.kind)) {
    if (gate.evidenceBasis.sourceFreshnessIds.length === 0) {
      return `Qualification Gate ${gate.id} requires current evidence for its time-sensitive claim`;
    }
    const currentAssessments = gate.evidenceBasis.sourceFreshnessIds.map(
      (entryId) =>
        history.sourceFreshnesses.find(
          (freshness) =>
            freshness.id === entryId && !invalidatedIds.has(freshness.id),
        ),
    );
    if (
      currentAssessments.some(
        (freshness) =>
          freshness === undefined ||
          !["medium", "high"].includes(freshness.assessment) ||
          !supportingObservationIdSet.has(freshness.observationId),
      )
    ) {
      return `Qualification Gate ${gate.id} current evidence must cite medium- or high-freshness assessments for its supporting Observations`;
    }
    const assessedObservationIds = new Set(
      currentAssessments.map((freshness) => freshness!.observationId),
    );
    if (
      [...supportingObservationIdSet].some(
        (observationId) => !assessedObservationIds.has(observationId),
      )
    ) {
      return `Qualification Gate ${gate.id} must assess the freshness of every supporting Observation for its time-sensitive claim`;
    }
  }
  if (gate.kind === "commercial-plausibility") {
    if (gate.commercialRanges === null || gate.commercialRanges === undefined) {
      return `Qualification Gate ${gate.id} requires traceable commercial ranges`;
    }
    const untracedRange = Object.entries(gate.commercialRanges).find(
      ([, range]) =>
        range.evidenceEntryIds.some(
          (entryId) =>
            !gate.decision.supportingEvidenceEntryIds.includes(entryId),
        ),
    );
    if (untracedRange !== undefined) {
      return `Qualification Gate ${gate.id} commercial range ${untracedRange[0]} must trace to supporting evidence`;
    }
  }
  return undefined;
}

function mergedReevaluatedQualificationEvaluation(
  history: AuthoritativeHistoryRebuild,
  evaluation: OpportunityQualificationEvaluation,
  reevaluationId?: string,
): OpportunityQualificationEvaluation | string {
  const previous = history.opportunityQualificationEvaluations.at(-1);
  if (previous === undefined) {
    return reevaluationId === undefined
      ? evaluation
      : `Campaign Re-evaluation ${reevaluationId} has no prior Qualification Gates`;
  }
  const reevaluation = history.reevaluations.at(-1);
  const invalidatedIds = invalidatedCampaignDecisionIds(history);
  for (const assessment of evaluation.assessments) {
    const previousAssessment = previous.assessments.find(
      (candidate) => candidate.opportunityId === assessment.opportunityId,
    );
    if (
      reevaluation?.decision.outcome !== "resume" ||
      reevaluation.id !== reevaluationId ||
      !reevaluation.decision.affectedOpportunityIds.includes(
        assessment.opportunityId,
      ) ||
      previousAssessment === undefined ||
      !previousAssessment.gates.some((gate) =>
        invalidatedIds.has(gate.decision.id),
      )
    ) {
      return `Opportunity ${assessment.opportunityId} has no superseded Qualification Gate to re-evaluate`;
    }
    for (const previousGate of previousAssessment.gates) {
      const replacementGate = assessment.gates.find(
        (candidate) => candidate.kind === previousGate.kind,
      );
      if (replacementGate === undefined) {
        return `Opportunity ${assessment.opportunityId} must retain every unaffected Qualification Gate`;
      }
      const invalidated = invalidatedIds.has(previousGate.decision.id);
      if (
        (invalidated &&
          replacementGate.decision.id === previousGate.decision.id) ||
        (!invalidated &&
          JSON.stringify(replacementGate) !== JSON.stringify(previousGate))
      ) {
        return `Opportunity ${assessment.opportunityId} must replace exactly its superseded Qualification Gates`;
      }
    }
  }
  const replacements = new Map(
    evaluation.assessments.map((assessment) => [
      assessment.opportunityId,
      assessment,
    ]),
  );
  return {
    ...evaluation,
    assessments: previous.assessments.map(
      (assessment) => replacements.get(assessment.opportunityId) ?? assessment,
    ),
  };
}

export function opportunityQualificationEvaluationViolation(
  history: AuthoritativeHistoryRebuild,
  evaluation: OpportunityQualificationEvaluation,
  recordedAt?: string,
  reevaluationId?: string,
): string | undefined {
  if (
    history.intake === undefined ||
    history.opportunityExclusionEvaluations.length === 0
  ) {
    return "Qualification Gates require recorded Opportunity Exclusion Gates";
  }
  if (history.reservations.size !== history.settledReservationIds.size) {
    return "Qualification Gates require every reserved Source examination to be settled";
  }
  const mergedEvaluation = mergedReevaluatedQualificationEvaluation(
    history,
    evaluation,
    reevaluationId,
  );
  if (typeof mergedEvaluation === "string") {
    return mergedEvaluation;
  }
  evaluation = mergedEvaluation;
  const exclusionEvaluation = history.opportunityExclusionEvaluations.at(-1)!;
  const survivingOpportunityIds = new Set(
    exclusionEvaluation.assessments
      .filter((assessment) =>
        exclusionGatesFor(assessment).every((gate) => gate.state === "passed"),
      )
      .map((assessment) => assessment.opportunityId),
  );
  const assessedOpportunityIds = evaluation.assessments.map(
    (assessment) => assessment.opportunityId,
  );
  if (
    new Set(assessedOpportunityIds).size !== assessedOpportunityIds.length ||
    assessedOpportunityIds.length !== survivingOpportunityIds.size ||
    assessedOpportunityIds.some(
      (opportunityId) => !survivingOpportunityIds.has(opportunityId),
    )
  ) {
    return "every surviving Opportunity must receive exactly one qualification assessment";
  }
  const existingEvaluationIds = new Set(
    history.opportunityQualificationEvaluations.map((candidate) => candidate.id),
  );
  if (existingEvaluationIds.has(evaluation.id)) {
    return `Opportunity qualification evaluation identity ${evaluation.id} is already present`;
  }
  const assessmentIds = new Set<string>();
  const gateIds = new Set<string>();
  const availableEvidenceIds = availableAffirmativeEvidenceIds(history);
  const availableInferencesById = new Map(
    history.inferences
      .filter((inference) => availableEvidenceIds.has(inference.id))
      .map((inference) => [inference.id, inference] as const),
  );
  const decisionIds = new Set(
    history.campaignDecisions.map((decision) => decision.id),
  );
  for (const assessment of evaluation.assessments) {
    if (assessmentIds.has(assessment.id)) {
      return `Opportunity qualification assessment identity ${assessment.id} is duplicated`;
    }
    assessmentIds.add(assessment.id);
    const kinds = assessment.gates.map((gate) => gate.kind);
    if (
      new Set(kinds).size !== kinds.length ||
      kinds.length !== qualificationGateKinds.length ||
      qualificationGateKinds.some((kind) => !kinds.includes(kind))
    ) {
      return `Opportunity ${assessment.opportunityId} must assess every Qualification Gate exactly once`;
    }
    for (const gate of assessment.gates) {
      const decision = gate.decision;
      if (gateIds.has(gate.id)) {
        return `Qualification Gate identity ${gate.id} is duplicated`;
      }
      gateIds.add(gate.id);
      if (decisionIds.has(decision.id)) {
        const existingGate = history.opportunityQualificationEvaluations
          .flatMap((candidate) => candidate.assessments)
          .flatMap((candidate) => candidate.gates)
          .find((candidate) => candidate.decision.id === decision.id);
        if (JSON.stringify(existingGate) !== JSON.stringify(gate)) {
          return `Campaign Decision identity ${decision.id} is already present`;
        }
        continue;
      }
      if (recordedAt !== undefined && decision.decidedAt !== recordedAt) {
        return `new Campaign Decision ${decision.id} must be decided at the operation time`;
      }
      decisionIds.add(decision.id);
      if (decision.intakeVersion !== history.intake.version) {
        return `Campaign Decision ${decision.id} does not use the current Campaign Intake version`;
      }
      const unavailableEvidenceId = [
        ...decision.supportingEvidenceEntryIds,
        ...decision.challengingEvidenceEntryIds,
      ].find((entryId) => !availableEvidenceIds.has(entryId));
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
      const unavailableBehaviorEvidenceId =
        gate.evidenceBasis.behavioralEvidenceEntryIds.find(
          (entryId) => !decision.supportingEvidenceEntryIds.includes(entryId),
        );
      if (unavailableBehaviorEvidenceId !== undefined) {
        return `Qualification Gate ${gate.id} behavioral evidence ${unavailableBehaviorEvidenceId} must be cited as supporting evidence`;
      }
      const evidenceViolation = qualificationEvidenceViolation(history, gate);
      if (evidenceViolation !== undefined) {
        return evidenceViolation;
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
        ...supportingObservationIds(history, [
          ...decision.supportingEvidenceEntryIds,
          ...decision.challengingEvidenceEntryIds,
        ]),
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
        return `unresolved Qualification Gate ${gate.id} requires an explicit Evidence Gap when evidence is missing`;
      }
    }
  }
  const researchDecision = evaluation.researchDecision;
  if (decisionIds.has(researchDecision.id)) {
    return `Campaign Decision identity ${researchDecision.id} is already present`;
  }
  if (researchDecision.intakeVersion !== history.intake.version) {
    return `Campaign Decision ${researchDecision.id} does not use the current Campaign Intake version`;
  }
  const availableDecisionEvidenceIds = new Set([
    ...availableAffirmativeEvidenceIds(history),
    ...history.evidenceGaps
      .filter((gap) => gap.status === "open")
      .map((gap) => gap.id),
  ]);
  const unavailableResearchEvidence = researchDecision.evidenceEntryIds.find(
    (entryId) => !availableDecisionEvidenceIds.has(entryId),
  );
  if (unavailableResearchEvidence !== undefined) {
    return `Qualification-related Campaign Decision ${researchDecision.id} links unavailable evidence ${unavailableResearchEvidence}`;
  }
  const ordinarySourceCap =
    history.intake.researchBudget.sourceCap -
    history.intake.researchBudget.adversarialSourceReserve;
  const remainingOrdinarySourceUnits =
    ordinarySourceCap -
    [...history.reservations.values()].reduce(
      (total, reservation) => total + reservation.sourceUnits,
      0,
    );
  if (
    researchDecision.outcome === "continue" &&
    remainingOrdinarySourceUnits <= 0
  ) {
    return "Campaign Research for Qualification Gates cannot continue after the ordinary Research Budget is exhausted";
  }
  if (
    researchDecision.stopReason === "ordinary-budget-exhausted" &&
    remainingOrdinarySourceUnits !== 0
  ) {
    return "Campaign Research for Qualification Gates cannot claim ordinary budget exhaustion while capacity remains";
  }
  const unresolvedGateIds = new Set(
    evaluation.assessments.flatMap((assessment) =>
      assessment.gates
        .filter((gate) => gate.state === "unresolved")
        .map((gate) => gate.id),
    ),
  );
  if (
    researchDecision.outcome === "continue" &&
    unresolvedGateIds.size === 0
  ) {
    return "Campaign Research can continue only to resolve an unresolved Qualification Gate";
  }
  const priorityIds = researchDecision.decisionValuePriorities.map(
    (priority) => priority.id,
  );
  if (new Set(priorityIds).size !== priorityIds.length) {
    return "Qualification-related Campaign Decision Value priority identities must be unique";
  }
  const unavailablePriority = researchDecision.decisionValuePriorities.find(
    (priority) =>
      priority.target.kind !== "gate" ||
      !unresolvedGateIds.has(priority.target.id) ||
      evaluation.assessments.find((assessment) =>
        assessment.gates.some((gate) => gate.id === priority.target.id),
      )?.opportunityId !== priority.permittedAction.opportunityId,
  );
  if (unavailablePriority !== undefined) {
    return `Decision Value priority ${unavailablePriority.id} does not target an unresolved Qualification Gate`;
  }
  const exclusionAssessmentsByOpportunityId = new Map(
    exclusionEvaluation.assessments.map((assessment) => [
      assessment.opportunityId,
      assessment,
    ]),
  );
  const everyGateTerminal = evaluation.assessments.every((assessment) =>
    assessment.gates.every((gate) => gate.state !== "unresolved"),
  );
  const hasEligibleOpportunity = evaluation.assessments.some((assessment) => {
    const exclusion = exclusionAssessmentsByOpportunityId.get(
      assessment.opportunityId,
    )!;
    return (
      assessment.gates.every((gate) => gate.state === "passed") &&
      !isElevatedRiskApprovalUnavailable(
        exclusion.marketSafety.classification,
        history.researchApprovals,
        assessment.opportunityId,
        researchDecision.decidedAt,
      )
    );
  });
  if (
    researchDecision.stopReason === "qualification-complete" &&
    (!everyGateTerminal || !hasEligibleOpportunity)
  ) {
    return "Campaign Research for Qualification Gates is complete only when all gates are terminal and an Opportunity is eligible";
  }
  return undefined;
}

export function applyOpportunityQualificationEvaluation(
  history: AuthoritativeHistoryRebuild,
  evaluation: OpportunityQualificationEvaluation,
  recordedAt?: string,
  reevaluationId?: string,
): string | undefined {
  const violation = opportunityQualificationEvaluationViolation(
    history,
    evaluation,
    recordedAt,
    reevaluationId,
  );
  if (violation !== undefined) {
    return violation;
  }
  const mergedEvaluation = mergedReevaluatedQualificationEvaluation(
    history,
    evaluation,
    reevaluationId,
  );
  if (typeof mergedEvaluation === "string") {
    return mergedEvaluation;
  }
  const existingDecisionIds = new Set(
    history.campaignDecisions.map((decision) => decision.id),
  );
  for (const assessment of evaluation.assessments) {
    for (const decision of assessment.gates.map((gate) => gate.decision)) {
      if (!existingDecisionIds.has(decision.id)) {
        history.campaignDecisions.push(decision);
        existingDecisionIds.add(decision.id);
      }
    }
  }
  history.campaignDecisions.push(evaluation.researchDecision);
  history.opportunityQualificationEvaluations.push(mergedEvaluation);
  return undefined;
}

export function researchBudgetViewForHistory(
  history: AuthoritativeHistoryRebuild,
): ResearchBudgetView {
  const intake = history.intake!;
  const activeExtension = latestInconclusiveResearchExtension(history);
  const activeReservations = [...history.reservations.values()].filter(
    (reservation) =>
      activeExtension === undefined ||
      history.reservationRecordedAt.get(reservation.id)! >=
        activeExtension.respondedAt,
  );
  const ordinarySourceCap =
    intake.researchBudget.sourceCap -
    intake.researchBudget.adversarialSourceReserve;
  const reservedSourceUnits = activeReservations.reduce(
    (total, reservation) =>
      total +
      (history.settledReservationIds.has(reservation.id)
        ? 0
        : reservation.sourceUnits),
    0,
  );
  const settledSourceUnits = activeReservations.reduce(
    (total, reservation) =>
      total +
      (history.settledReservationIds.has(reservation.id)
        ? reservation.sourceUnits
        : 0),
    0,
  );
  const usedOrdinarySourceUnits = activeReservations
    .filter((reservation) => reservation.researchClass !== "adversarial")
    .reduce((total, reservation) => total + reservation.sourceUnits, 0);
  const recordedPaidSpend = history.researchExpenditures
    .filter(
      (expenditure) =>
        activeExtension === undefined ||
        expenditure.incurredAt >= activeExtension.respondedAt,
    )
    .reduce((total, expenditure) => total + expenditure.amount, 0);
  return {
    sourceCap: intake.researchBudget.sourceCap,
    adversarialSourceReserve: intake.researchBudget.adversarialSourceReserve,
    ordinarySourceCap,
    reservedSourceUnits,
    settledSourceUnits,
    remainingOrdinarySourceUnits: ordinarySourceCap - usedOrdinarySourceUnits,
    remainingAdversarialSourceUnits:
      intake.researchBudget.adversarialSourceReserve -
      activeReservations.filter(
        (reservation) => reservation.researchClass === "adversarial",
      ).length,
    paidSpendCap: intake.researchBudget.paidSpendCap,
    recordedPaidSpend: {
      amount: recordedPaidSpend,
      currency: intake.researchBudget.paidSpendCap.currency,
    },
    remainingPaidSpend: {
      amount: intake.researchBudget.paidSpendCap.amount - recordedPaidSpend,
      currency: intake.researchBudget.paidSpendCap.currency,
    },
  };
}

export function noQualifyingOpportunityDisposition(
  history: AuthoritativeHistoryRebuild,
  opportunityId: string,
  concludedAt: string,
) {
  const exclusion = history.opportunityExclusionEvaluations
    .at(-1)!
    .assessments.find((assessment) => assessment.opportunityId === opportunityId)!;
  const qualification = history.opportunityQualificationEvaluations
    .at(-1)
    ?.assessments.find((assessment) => assessment.opportunityId === opportunityId);
  const exclusionGates = exclusionGatesFor(exclusion);
  const qualificationGates = qualification?.gates ?? [];
  const allGates = [...exclusionGates, ...qualificationGates];
  const failedGates = allGates.filter((gate) => gate.state === "failed");
  const unresolvedGates = allGates.filter(
    (gate) => gate.state === "unresolved",
  );
  const elevatedRiskApprovalUnavailable = isElevatedRiskApprovalUnavailable(
    exclusion.marketSafety.classification,
    history.researchApprovals,
    opportunityId,
    concludedAt,
  );
  const eligible =
    failedGates.length === 0 &&
    unresolvedGates.length === 0 &&
    qualification !== undefined &&
    qualification.gates.length === qualificationGateKinds.length &&
    !elevatedRiskApprovalUnavailable;
  const status =
    failedGates.length > 0
      ? ("rejected" as const)
      : eligible
        ? ("eligible" as const)
        : ("unresolved" as const);
  const relevantGates =
    status === "rejected"
      ? failedGates
      : status === "unresolved"
        ? unresolvedGates
        : allGates;
  const decisionIds = relevantGates.map((gate) => gate.decision.id);
  if (
    status === "unresolved" &&
    elevatedRiskApprovalUnavailable &&
    !decisionIds.includes(exclusion.marketSafety.gate.decision.id)
  ) {
    decisionIds.push(exclusion.marketSafety.gate.decision.id);
  }
  const reasons = relevantGates.map((gate) => gate.decision.rationale);
  if (status === "unresolved" && elevatedRiskApprovalUnavailable) {
    reasons.push(
      "Deep research or recommendation for this Elevated-Risk Market lacks current Opportunity-specific Research Approval.",
    );
  }
  return {
    status,
    decisionIds,
    evidenceGapIds: relevantGates.flatMap(
      (gate) => gate.decision.evidenceGapIds,
    ),
    reasons,
  };
}

export function buildNoQualifyingOpportunityReport(
  history: AuthoritativeHistoryRebuild,
  reportId: string,
  concludedAt: string,
  continuationConditions: NoQualifyingOpportunityContinuationCondition[],
): NoQualifyingOpportunityReport {
  const opportunities = formedOpportunities(history);
  const dispositions = opportunities.map((opportunity) => ({
    opportunity,
    disposition: noQualifyingOpportunityDisposition(
      history,
      opportunity.id,
      concludedAt,
    ),
  }));
  const rejectedOpportunities = dispositions
    .filter(({ disposition }) => disposition.status === "rejected")
    .map(({ opportunity, disposition }) => ({
      id: opportunity.id,
      customer: opportunity.customer,
      situation: opportunity.situation,
      decisionIds: disposition.decisionIds,
      reasons: disposition.reasons,
    }));
  const unresolvedOpportunities = dispositions
    .filter(({ disposition }) => disposition.status === "unresolved")
    .map(({ opportunity, disposition }) => ({
      id: opportunity.id,
      customer: opportunity.customer,
      situation: opportunity.situation,
      decisionIds: disposition.decisionIds,
      evidenceGapIds: disposition.evidenceGapIds,
      reasons: disposition.reasons,
    }));
  const qualificationEvaluation =
    history.opportunityQualificationEvaluations.at(-1)!;
  const exclusionEvaluation = history.opportunityExclusionEvaluations.at(-1)!;
  const breadthGate = history.breadthGates.at(-1)!;
  const sweeps = history.discoveryTranches.flatMap((tranche) => tranche.sweeps);
  const limitations = [
    ...history.opportunityFormations.flatMap((formation) =>
      formation.assessments.flatMap(
        (assessment) => assessment.decision.limitations,
      ),
    ),
    ...breadthGate.decision.limitations,
    ...exclusionEvaluation.assessments.flatMap((assessment) =>
      exclusionGatesFor(assessment).flatMap(
        (gate) => gate.decision.limitations,
      ),
    ),
    ...qualificationEvaluation.assessments.flatMap((assessment) =>
      assessment.gates.flatMap((gate) => gate.decision.limitations),
    ),
    ...qualificationEvaluation.researchDecision.limitations,
  ].filter((limitation, index, all) => all.indexOf(limitation) === index);
  return {
    reportVersion: contracts.renderTemplates,
    id: reportId,
    kind: "no-qualifying-opportunity-report",
    campaignId: history.campaignId,
    concludedAt,
    intakeVersion: history.intake!.version,
    supersedes: latestSupersededArtifactId(history),
    outcome: "no-qualifying-opportunity",
    summary: `No Opportunity became eligible: ${rejectedOpportunities.length} rejected and ${unresolvedOpportunities.length} unresolved. This is a valid campaign outcome, not an error.`,
    rejectedOpportunities,
    unresolvedOpportunities,
    coverage: {
      discoveryTranches: history.discoveryTranches.length,
      discoverySweeps: sweeps.length,
      sourceFamilies: [
        ...new Set(sweeps.map((sweep) => sweep.sourceFamily.id)),
      ],
      formedOpportunities: opportunities.length,
      breadthGate: { id: breadthGate.id, status: "passed" },
    },
    researchBudget: researchBudgetViewForHistory(history),
    limitations,
    continuationConditions,
    audit: {
      authoritativeRecordsPath: "records.jsonl",
      evidenceLedgerPath: "evidence-ledger.json",
      qualificationEvaluationId: qualificationEvaluation.id,
      researchDecisionId: qualificationEvaluation.researchDecision.id,
    },
    completeness: {
      allSurvivingOpportunitiesEvaluated: true,
      noEligibleOpportunities: true,
      researchExhausted: true,
    },
  };
}

export function noQualifyingOpportunityViolation(
  history: AuthoritativeHistoryRebuild,
  reportId: string,
  concludedAt: string,
  continuationConditions: NoQualifyingOpportunityContinuationCondition[],
): string | undefined {
  if (
    history.intake === undefined ||
    history.breadthGates.length === 0 ||
    history.opportunityExclusionEvaluations.length === 0 ||
    history.opportunityQualificationEvaluations.length === 0
  ) {
    return "No Qualifying Opportunity requires completed Opportunity gates";
  }
  if (hasActiveTerminalOutcome(history)) {
    return "the Scouting Campaign already has a terminal report";
  }
  if (invalidatedTerminalPrerequisiteDecisionId(history) !== undefined) {
    return "No Qualifying Opportunity requires new Campaign Decisions for re-evaluated gates";
  }
  if (history.reservations.size !== history.settledReservationIds.size) {
    return "No Qualifying Opportunity requires every reserved Source examination to be settled";
  }
  if (
    activeResearchApprovalDecision({
      researchApprovalDecisions: history.researchApprovalDecisions,
      researchApprovalResponses: history.researchApprovalResponses,
    }) !== undefined
  ) {
    return "No Qualifying Opportunity cannot conclude with a pending Research Approval decision";
  }
  const evaluation = history.opportunityQualificationEvaluations.at(-1)!;
  if (
    evaluation.researchDecision.outcome !== "stop" ||
    evaluation.researchDecision.stopReason === "qualification-complete"
  ) {
    return "No Qualifying Opportunity requires exhausted permitted research";
  }
  const budget = researchBudgetViewForHistory(history);
  if (
    evaluation.researchDecision.stopReason === "ordinary-budget-exhausted" &&
    budget.remainingOrdinarySourceUnits !== 0
  ) {
    return "ordinary Research Budget exhaustion must match recorded budget use";
  }
  const dispositions = formedOpportunities(history).map((opportunity) => ({
    opportunity,
    disposition: noQualifyingOpportunityDisposition(
      history,
      opportunity.id,
      concludedAt,
    ),
  }));
  if (
    dispositions.some(
      ({ disposition }) => disposition.status === "eligible",
    )
  ) {
    return "No Qualifying Opportunity cannot conclude while an Opportunity is eligible";
  }
  const unresolvedOpportunityIds = new Set(
    dispositions
      .filter(({ disposition }) => disposition.status === "unresolved")
      .map(({ opportunity }) => opportunity.id),
  );
  const conditionIds = continuationConditions.map((condition) => condition.id);
  if (new Set(conditionIds).size !== conditionIds.length) {
    return "continuation condition identities must be unique";
  }
  const coveredOpportunityIds = new Set(
    continuationConditions.map((condition) => condition.opportunityId),
  );
  if (
    coveredOpportunityIds.size !== unresolvedOpportunityIds.size ||
    [...unresolvedOpportunityIds].some(
      (opportunityId) => !coveredOpportunityIds.has(opportunityId),
    ) ||
    [...coveredOpportunityIds].some(
      (opportunityId) => !unresolvedOpportunityIds.has(opportunityId),
    )
  ) {
    return "continuation conditions must cover every unresolved Opportunity and no rejected Opportunity";
  }
  for (const condition of continuationConditions) {
    const disposition = noQualifyingOpportunityDisposition(
      history,
      condition.opportunityId,
      concludedAt,
    );
    const unavailableGapId = condition.evidenceGapIds.find(
      (gapId) =>
        !disposition.evidenceGapIds.includes(gapId) ||
        !history.evidenceGaps.some(
          (gap) => gap.id === gapId && gap.status === "open",
        ),
    );
    if (unavailableGapId !== undefined) {
      return `continuation condition ${condition.id} links unavailable Opportunity Evidence Gap ${unavailableGapId}`;
    }
  }
  if (reportId.trim() === "") {
    return "No Qualifying Opportunity Report identity is required";
  }
  return undefined;
}

export function applyNoQualifyingOpportunityReport(
  history: AuthoritativeHistoryRebuild,
  report: NoQualifyingOpportunityReport,
): string | undefined {
  const violation = noQualifyingOpportunityViolation(
    history,
    report.id,
    report.concludedAt,
    report.continuationConditions,
  );
  if (violation !== undefined) {
    return violation;
  }
  const expected = buildNoQualifyingOpportunityReport(
    history,
    report.id,
    report.concludedAt,
    report.continuationConditions,
  );
  if (JSON.stringify(report) !== JSON.stringify(expected)) {
    return "No Qualifying Opportunity Report does not match authoritative Campaign history";
  }
  history.noQualifyingOpportunityReports.push(report);
  return undefined;
}

const leadingOpportunityModule = createLeadingOpportunityModule({
  activeResearchApprovalDecision,
  availableAffirmativeEvidenceIds,
  formedOpportunities,
  noQualifyingOpportunityDisposition,
  supportingObservationIds,
  researchBudgetViewForHistory,
  hasActiveTerminalOutcome,
  latestSupersededArtifactId,
  invalidatedTerminalPrerequisiteDecisionId,
  opportunityBriefArtifactPath,
});

export const leadingOpportunityViolation =
  leadingOpportunityModule.leadingOpportunityViolation;
export const buildLeadingOpportunityBrief =
  leadingOpportunityModule.buildLeadingOpportunityBrief;

const inconclusiveComparisonModule = createInconclusiveComparisonModule({
  opportunityComparisonViolation:
    leadingOpportunityModule.opportunityComparisonViolation,
  availableAffirmativeEvidenceIds,
  unresolvedOpportunityIds: leadingOpportunityModule.unresolvedOpportunityIds,
  buildOpportunityBrief: leadingOpportunityModule.buildOpportunityBrief,
  latestSupersededArtifactId,
});

export const inconclusiveComparisonViolation =
  inconclusiveComparisonModule.inconclusiveComparisonViolation;
export const buildInconclusiveComparisonReport =
  inconclusiveComparisonModule.buildInconclusiveComparisonReport;
export const buildDeveloperSelectedOpportunityBrief =
  inconclusiveComparisonModule.buildDeveloperSelectedOpportunityBrief;

export function buildDeveloperSelectedOpportunityBriefs(
  history: AuthoritativeHistoryRebuild,
  report: InconclusiveComparisonReport,
  selections: DeveloperOpportunitySelection[],
  selectedAt: string,
): OpportunityBrief[] {
  return selections.map((selection) =>
    buildDeveloperSelectedOpportunityBrief(
      history,
      report,
      selection,
      selectedAt,
    ),
  );
}

export function leadingOpportunityRecords(
  history: AuthoritativeHistoryRebuild,
  command: ConcludeLeadingOpportunityCommand,
  firstSequence: number,
) {
  const brief = buildLeadingOpportunityBrief(history, command);
  return campaignRecordPair({
    campaignId: history.campaignId,
    requestId: command.requestId,
    recordedAt: command.payload.concludedAt,
    firstSequence,
    operation: "conclude-leading-opportunity",
    intent: {
      coordinatorId: command.payload.coordinatorId,
      comparisonId: command.payload.comparison.id,
      briefId: command.payload.brief.id,
    },
    outcome: { comparison: command.payload.comparison, brief },
  });
}

export function applyLeadingOpportunity(
  history: AuthoritativeHistoryRebuild,
  comparison: OpportunityComparison,
  brief: OpportunityBrief,
  concludedAt: string,
): string | undefined {
  const briefInput = {
    id: brief.id,
    buyerEconomics: brief.buyerEconomics,
    customerAccess: brief.customerAccess,
    alternatives: brief.alternatives,
    risks: brief.risks,
    valueHypothesis: brief.valueHypothesis,
  };
  const violation = leadingOpportunityViolation(
    history,
    comparison,
    concludedAt,
    briefInput,
  );
  if (violation !== undefined) {
    return violation;
  }
  const expected = buildLeadingOpportunityBrief(history, {
    envelopeVersion: contracts.commandEnvelope,
    requestId: "authoritative-rebuild",
    command: "concludeLeadingOpportunity",
    payload: {
      campaignPath: "/authoritative-rebuild",
      coordinatorId: "authoritative-rebuild",
      concludedAt,
      comparison,
      brief: briefInput,
    },
  });
  if (JSON.stringify(brief) !== JSON.stringify(expected)) {
    return "Opportunity Brief does not match authoritative Campaign history";
  }
  history.campaignDecisions.push(comparison.decision);
  history.opportunityComparisons.push(comparison);
  history.opportunityBriefs.push(brief);
  return undefined;
}

export function inconclusiveComparisonRecords(
  history: AuthoritativeHistoryRebuild,
  command: ConcludeInconclusiveComparisonCommand,
  firstSequence: number,
) {
  const report = buildInconclusiveComparisonReport(history, command);
  return campaignRecordPair({
    campaignId: history.campaignId,
    requestId: command.requestId,
    recordedAt: command.payload.concludedAt,
    firstSequence,
    operation: "conclude-inconclusive-comparison",
    intent: {
      coordinatorId: command.payload.coordinatorId,
      comparisonId: command.payload.comparison.id,
      reportId: command.payload.reportId,
    },
    outcome: { report },
  });
}

export function applyInconclusiveComparisonReport(
  history: AuthoritativeHistoryRebuild,
  report: InconclusiveComparisonReport,
): string | undefined {
  const violation = inconclusiveComparisonViolation(
    history,
    report.comparison,
    report.concludedAt,
  );
  if (violation !== undefined) {
    return violation;
  }
  const expected = buildInconclusiveComparisonReport(history, {
    envelopeVersion: contracts.commandEnvelope,
    requestId: "authoritative-rebuild",
    command: "concludeInconclusiveComparison",
    payload: {
      campaignPath: "/authoritative-rebuild",
      coordinatorId: "authoritative-rebuild",
      concludedAt: report.concludedAt,
      reportId: report.id,
      comparison: report.comparison,
    },
  });
  if (JSON.stringify(report) !== JSON.stringify(expected)) {
    return "Inconclusive Comparison Report does not match authoritative Campaign history";
  }
  history.campaignDecisions.push(report.comparison.decision);
  history.inconclusiveComparisonReports.push(report);
  return undefined;
}

export function inconclusiveComparisonResponseRecords(
  history: AuthoritativeHistoryRebuild,
  command: RespondInconclusiveComparisonCommand,
  firstSequence: number,
) {
  const responseRecord: InconclusiveComparisonResponseRecord = {
    reportId: command.payload.reportId,
    respondedAt: command.payload.respondedAt,
    response: command.payload.response,
  };
  const report = history.inconclusiveComparisonReports.at(-1)!;
  const briefs =
    command.payload.response.kind === "select"
      ? buildDeveloperSelectedOpportunityBriefs(
          history,
          report,
          command.payload.response.selections,
          command.payload.respondedAt,
        )
      : [];
  return campaignRecordPair({
    campaignId: history.campaignId,
    requestId: command.requestId,
    recordedAt: command.payload.respondedAt,
    firstSequence,
    operation: "respond-inconclusive-comparison",
    intent: {
      coordinatorId: command.payload.coordinatorId,
      reportId: command.payload.reportId,
      responseKind: command.payload.response.kind,
    },
    outcome: { responseRecord, briefs },
  });
}

export function applyInconclusiveComparisonResponse(
  history: AuthoritativeHistoryRebuild,
  responseRecord: InconclusiveComparisonResponseRecord,
  briefs: OpportunityBrief[] = [],
): string | undefined {
  const activeReport = history.inconclusiveComparisonReports.at(-1);
  if (activeReport === undefined || activeReport.id !== responseRecord.reportId) {
    return "the response must target the active Inconclusive Comparison Report";
  }
  if (
    history.inconclusiveComparisonResponses.some(
      (response) => response.reportId === activeReport.id,
    )
  ) {
    return "the Inconclusive Comparison Report already has a terminal response";
  }
  if (responseRecord.respondedAt <= activeReport.concludedAt) {
    return "the Inconclusive Comparison response must follow the report";
  }
  if (responseRecord.response.kind === "extend") {
    const targetedGapIds = responseRecord.response.targetedEvidenceGapIds;
    const blockerGaps = new Set(
      activeReport.comparison.blockers.flatMap(
        (blocker) => blocker.evidenceGapIds,
      ),
    );
    if (
      targetedGapIds.some(
        (gapId) =>
          !blockerGaps.has(gapId) ||
          !history.evidenceGaps.some(
            (gap) => gap.id === gapId && gap.status === "open",
          ),
      )
    ) {
      return "a research extension may target only open Evidence Gaps named by the report blockers";
    }
    const derivedAffectedIds = new Set(
      activeReport.comparison.blockers
        .filter((blocker) =>
          blocker.evidenceGapIds.some((gapId) => targetedGapIds.includes(gapId)),
        )
        .flatMap((blocker) => [
          blocker.contenderOpportunityId,
          ...blocker.couldDisplaceOpportunityIds,
        ]),
    );
    if (
      derivedAffectedIds.size !== responseRecord.response.affectedOpportunityIds.length ||
      responseRecord.response.affectedOpportunityIds.some(
        (id) => !derivedAffectedIds.has(id),
      )
    ) {
      return "affected work must contain exactly the Opportunities named by the targeted blockers";
    }
    if (
      responseRecord.response.researchBudget.paidSpendCap.currency !==
      history.intake!.commercialOutcomeTarget.currency
    ) {
      return "the extension Research Budget currency must match the Commercial Outcome Target";
    }
    history.intake = {
      ...history.intake!,
      version: history.intake!.version + 1,
      confirmedAt: responseRecord.respondedAt,
      researchBudget: responseRecord.response.researchBudget,
    };
  } else if (responseRecord.response.kind === "select") {
    const selectedOpportunityIds = responseRecord.response.selections.map(
      (selection) => selection.opportunityId,
    );
    if (
      new Set(selectedOpportunityIds).size !== selectedOpportunityIds.length ||
      selectedOpportunityIds.some(
        (id) => !activeReport.comparison.nonDominatedOpportunityIds.includes(id),
      )
    ) {
      return "Select accepts one or more distinct Eligible Non-Dominated Opportunities only";
    }
    for (const selection of responseRecord.response.selections) {
      const briefViolation =
        leadingOpportunityModule.opportunityBriefInputViolation(
          history,
          selection.opportunityId,
          selection.brief,
        );
      if (briefViolation !== undefined) {
        return briefViolation;
      }
    }
    if (
      briefs.length !== responseRecord.response.selections.length ||
      new Set(briefs.map((brief) => brief.id)).size !== briefs.length
    ) {
      return "each selected Opportunity requires one separately identified Opportunity Brief";
    }
    for (const [index, selection] of responseRecord.response.selections.entries()) {
      const expected = buildDeveloperSelectedOpportunityBrief(
        history,
        activeReport,
        selection,
        responseRecord.respondedAt,
      );
      if (JSON.stringify(briefs[index]) !== JSON.stringify(expected)) {
        return "Developer-Selected Opportunity Brief does not match authoritative Campaign history";
      }
    }
    history.developerSelectedOpportunityBriefs.push(...briefs);
  } else if (briefs.length > 0) {
    return "Stop and Extend must not create an Opportunity Brief";
  }
  history.inconclusiveComparisonResponses.push(responseRecord);
  return undefined;
}

export function terminalArtifactIds(
  history: Pick<
    AuthoritativeHistoryRebuild,
    | "noQualifyingOpportunityReports"
    | "opportunityBriefs"
    | "inconclusiveComparisonReports"
    | "developerSelectedOpportunityBriefs"
  >,
): string[] {
  return terminalArtifacts(history).map((artifact) => artifact.id);
}

function terminalArtifacts(
  history: Pick<
    AuthoritativeHistoryRebuild,
    | "noQualifyingOpportunityReports"
    | "opportunityBriefs"
    | "inconclusiveComparisonReports"
    | "developerSelectedOpportunityBriefs"
  >,
) {
  return [
    ...history.noQualifyingOpportunityReports,
    ...history.opportunityBriefs,
    ...history.inconclusiveComparisonReports,
    ...history.developerSelectedOpportunityBriefs,
  ];
}

export function activeTerminalArtifactIds(
  history: Pick<
    AuthoritativeHistoryRebuild,
    | "noQualifyingOpportunityReports"
    | "opportunityBriefs"
    | "inconclusiveComparisonReports"
    | "developerSelectedOpportunityBriefs"
    | "reevaluations"
  >,
): string[] {
  const supersededIds = new Set(
    [
      ...history.reevaluations.flatMap((entry) => entry.supersededArtifactIds),
      ...history.noQualifyingOpportunityReports.flatMap((report) =>
        report.supersedes === null ? [] : [report.supersedes],
      ),
      ...history.opportunityBriefs.flatMap((brief) =>
        brief.supersedes === null ? [] : [brief.supersedes],
      ),
      ...history.inconclusiveComparisonReports.flatMap((report) =>
        report.supersedes === null ? [] : [report.supersedes],
      ),
    ],
  );
  return terminalArtifactIds(history).filter((id) => !supersededIds.has(id));
}

export function invalidatedCampaignDecisionIds(
  history: Pick<AuthoritativeHistoryRebuild, "reevaluations">,
): Set<string> {
  return new Set(
    history.reevaluations.flatMap((entry) => entry.invalidatedDecisionIds),
  );
}

export function invalidatedTerminalPrerequisiteDecisionId(
  history: AuthoritativeHistoryRebuild,
): string | undefined {
  const latestExclusion = history.opportunityExclusionEvaluations.at(-1)!;
  const latestQualification =
    history.opportunityQualificationEvaluations.at(-1)!;
  const prerequisiteDecisionIds = [
    history.breadthGates.at(-1)!.decision.id,
    ...latestExclusion.assessments.flatMap((assessment) => [
      assessment.marketSafety.gate.decision.id,
      ...assessment.hardConstraints.map(({ gate }) => gate.decision.id),
    ]),
    latestQualification.researchDecision.id,
    ...latestQualification.assessments.flatMap((assessment) =>
      assessment.gates.map((gate) => gate.decision.id),
    ),
  ];
  const invalidatedIds = invalidatedCampaignDecisionIds(history);
  return prerequisiteDecisionIds.find((id) => invalidatedIds.has(id));
}

export function hasActiveTerminalOutcome(
  history: AuthoritativeHistoryRebuild,
): boolean {
  const activeIds = new Set(activeTerminalArtifactIds(history));
  const latestReevaluation = history.reevaluations.at(-1);
  if (
    latestReevaluation?.decision.outcome === "resume" &&
    latestReevaluation.supersededArtifactIds.length > 0
  ) {
    const replacementTerminalExists = terminalArtifacts(history).some(
      (artifact) =>
        activeIds.has(artifact.id) &&
        artifact.concludedAt > latestReevaluation.decision.decidedAt,
    );
    if (!replacementTerminalExists) {
      return false;
    }
  }
  return (
    history.noQualifyingOpportunityReports.some((report) =>
      activeIds.has(report.id),
    ) ||
    history.opportunityBriefs.some((brief) => activeIds.has(brief.id)) ||
    history.developerSelectedOpportunityBriefs.some((brief) =>
      activeIds.has(brief.id),
    ) ||
    history.inconclusiveComparisonResponses.some(
      (response) =>
        response.response.kind === "stop" && activeIds.has(response.reportId),
    )
  );
}

export function latestSupersededArtifactId(
  history: AuthoritativeHistoryRebuild,
): string | null {
  const latestReevaluation = history.reevaluations.at(-1);
  if (
    latestReevaluation?.decision.outcome === "resume" &&
    latestReevaluation.supersededArtifactIds.length > 0
  ) {
    const replacementTerminalExists = terminalArtifacts(history).some(
      (artifact) =>
        artifact.concludedAt > latestReevaluation.decision.decidedAt,
    );
    if (!replacementTerminalExists) {
      return latestReevaluation.supersededArtifactIds.at(-1)!;
    }
  }
  const activeArtifactId = activeTerminalArtifactIds(history).at(-1);
  if (activeArtifactId !== undefined) {
    return activeArtifactId;
  }
  return (
    history.reevaluations
      .findLast((entry) => entry.supersededArtifactIds.length > 0)
      ?.supersededArtifactIds.at(-1) ?? null
  );
}

function safeArtifactIdentity(id: string): string {
  return encodeURIComponent(id).replaceAll("%", "-");
}

export function noQualifyingOpportunityArtifactPath(
  report: NoQualifyingOpportunityReport,
): string {
  return report.supersedes === null
    ? "no-qualifying-opportunity-report.md"
    : `no-qualifying-opportunity-report-${safeArtifactIdentity(report.id)}.md`;
}

export function opportunityBriefArtifactPath(
  brief: Pick<OpportunityBrief, "id" | "supersedes">,
): string {
  return brief.supersedes === null
    ? "opportunity-brief.md"
    : `opportunity-brief-${safeArtifactIdentity(brief.id)}.md`;
}

export function inconclusiveComparisonArtifactPath(
  report: InconclusiveComparisonReport,
): string {
  return report.supersedes === null
    ? "inconclusive-comparison-report.md"
    : `inconclusive-comparison-report-${safeArtifactIdentity(report.id)}.md`;
}

function campaignDecisionEvidenceIds(decision: CampaignDecision): string[] {
  if (decision.kind === "campaign-re-evaluation") {
    return decision.triggerEntryIds;
  }
  if ("evidenceEntryIds" in decision) {
    return decision.evidenceEntryIds;
  }
  return [
    ...decision.supportingEvidenceEntryIds,
    ...decision.challengingEvidenceEntryIds,
    ...decision.evidenceGapIds,
    ...decision.contradictionIds,
  ];
}

export function campaignReevaluationViolation(
  history: AuthoritativeHistoryRebuild,
  command: ReevaluateCampaignCommand,
): string | undefined {
  const operation = command.payload.operation;
  if (history.intake === undefined) {
    return "Campaign re-evaluation requires a confirmed Campaign Intake";
  }
  const hasReasoningType = (type: ReasoningEntry["type"]) =>
    operation.reasoningEntries.some((entry) => entry.type === type);
  if (operation.kind === "intake-revision" && operation.intakeRevision === null) {
    return "an intake-revision re-evaluation requires a Campaign Intake revision";
  }
  if (
    operation.kind === "source-correction" &&
    !operation.reasoningEntries.some(
      (entry) => entry.type === "correction" && entry.action !== "retract",
    )
  ) {
    return "a source-correction re-evaluation requires a reaffirming or superseding Correction";
  }
  if (
    operation.kind === "source-redaction" &&
    !operation.reasoningEntries.some(
      (entry) => entry.type === "correction" && entry.action === "retract",
    )
  ) {
    return "a source-redaction re-evaluation requires a retracting Correction";
  }
  if (
    operation.kind === "freshness-change" &&
    !hasReasoningType("source-freshness")
  ) {
    return "a freshness-change re-evaluation requires a Source Freshness entry";
  }
  if (operation.kind === "contradiction" && !hasReasoningType("contradiction")) {
    return "a contradiction re-evaluation requires a Contradiction entry";
  }
  if (
    operation.kind === "new-evidence" &&
    operation.reasoningEntries.length === 0
  ) {
    return "a new-evidence re-evaluation requires a new Evidence Ledger entry";
  }
  if (operation.kind === "resume-refresh") {
    if (operation.decision.outcome !== "resume") {
      return "a resume-refresh re-evaluation must resume affected work";
    }
    const triggeredFreshness = history.sourceFreshnesses.filter(
      (freshness) =>
        operation.decision.triggerEntryIds.includes(freshness.id) &&
        freshness.refreshAfter !== undefined &&
        freshness.refreshAfter !== null &&
        freshness.refreshAfter <= command.payload.reevaluatedAt,
    );
    if (triggeredFreshness.length === 0) {
      return "a resume-refresh re-evaluation requires triggered evidence whose refresh time has arrived";
    }
    const previouslyInvalidatedDecisionIds =
      invalidatedCampaignDecisionIds(history);
    const canChangeActiveDecision = history.campaignDecisions.some((decision) => {
      if (previouslyInvalidatedDecisionIds.has(decision.id)) {
        return false;
      }
      const evidenceEntryIds = campaignDecisionEvidenceIds(decision);
      const observationIds = supportingObservationIds(history, evidenceEntryIds);
      return triggeredFreshness.some(
        (freshness) =>
          evidenceEntryIds.includes(freshness.id) ||
          observationIds.has(freshness.observationId),
      );
    });
    if (!canChangeActiveDecision) {
      return "a resume-refresh re-evaluation requires time-sensitive evidence capable of changing an active Campaign Decision";
    }
  }
  if (
    operation.decision.outcome === "resume" &&
    operation.reasoningEntries.length === 0 &&
    operation.intakeRevision === null &&
    operation.decision.affectedOpportunityIds.length === 0 &&
    operation.decision.supersededDecisionIds.length === 0
  ) {
    return "resuming a Campaign requires an explicit affected record or Intake revision";
  }
  if (history.reevaluations.some((entry) => entry.id === operation.id)) {
    return `Campaign re-evaluation identity ${operation.id} is already present`;
  }
  const revisedVersion = operation.intakeRevision?.intake.version;
  const expectedVersion = history.intake.version + 1;
  if (
    operation.intakeRevision !== null &&
    revisedVersion !== expectedVersion
  ) {
    return `Campaign Intake revision must be version ${expectedVersion}`;
  }
  const decisionVersion = revisedVersion ?? history.intake.version;
  if (operation.decision.intakeVersion !== decisionVersion) {
    return "the re-evaluation Campaign Decision must name the resulting Campaign Intake version";
  }
  if (
    operation.decision.outcome === "resume" &&
    operation.decision.confidence.level === "unknown"
  ) {
    return "resuming affected work requires a reasoned Campaign Decision";
  }
  const stagedHistory: AuthoritativeHistoryRebuild = {
    ...history,
    sourceLineages: [...history.sourceLineages],
    sourceCredibilities: [...history.sourceCredibilities],
    sourceFreshnesses: [...history.sourceFreshnesses],
    evidenceGaps: [...history.evidenceGaps],
    assumptions: [...history.assumptions],
    inferences: [...history.inferences],
    contradictions: [...history.contradictions],
    corrections: [...history.corrections],
  };
  const invalidLink = applyReasoningEntries(
    stagedHistory,
    operation.reasoningEntries,
  );
  if (invalidLink !== undefined) {
    return `re-evaluation reasoning uses an unknown or duplicate identity ${invalidLink}`;
  }
  const availableEntryIds = new Set([
    ...stagedHistory.sources.map((entry) => entry.id),
    ...stagedHistory.observations.map((entry) => entry.id),
    ...stagedHistory.sourceLineages.map((entry) => entry.id),
    ...stagedHistory.sourceCredibilities.map((entry) => entry.id),
    ...stagedHistory.sourceFreshnesses.map((entry) => entry.id),
    ...stagedHistory.evidenceGaps.map((entry) => entry.id),
    ...stagedHistory.assumptions.map((entry) => entry.id),
    ...stagedHistory.inferences.map((entry) => entry.id),
    ...stagedHistory.contradictions.map((entry) => entry.id),
    ...stagedHistory.corrections.map((entry) => entry.id),
  ]);
  const unknownTrigger = operation.decision.triggerEntryIds.find(
    (id) => !availableEntryIds.has(id),
  );
  if (unknownTrigger !== undefined) {
    return `re-evaluation trigger ${unknownTrigger} is not in the Evidence Ledger`;
  }
  const decisionIds = new Set(history.campaignDecisions.map((entry) => entry.id));
  const unknownDecision = operation.decision.supersededDecisionIds.find(
    (id) => !decisionIds.has(id),
  );
  if (unknownDecision !== undefined) {
    return `re-evaluation cannot supersede unknown Campaign Decision ${unknownDecision}`;
  }
  const formedIds = new Set(
    history.opportunityFormations.flatMap((formation) =>
      formation.assessments.flatMap((assessment) =>
        assessment.result.kind === "opportunity"
          ? [assessment.result.opportunityId]
          : [],
      ),
    ),
  );
  const unknownOpportunity = operation.decision.affectedOpportunityIds.find(
    (id) => !formedIds.has(id),
  );
  if (unknownOpportunity !== undefined) {
    return `re-evaluation cannot affect unknown Opportunity ${unknownOpportunity}`;
  }
  const invalidatedEntryIds = new Set(
    operation.reasoningEntries.flatMap((entry) =>
      entry.type === "correction" && entry.action !== "reaffirm"
        ? [entry.targetEntryId]
        : [],
    ),
  );
  let foundDependentInference = true;
  while (foundDependentInference) {
    foundDependentInference = false;
    for (const inference of stagedHistory.inferences) {
      if (
        !invalidatedEntryIds.has(inference.id) &&
        [...inference.supportingEntryIds, ...inference.challengingEntryIds].some(
          (id) => invalidatedEntryIds.has(id),
        )
      ) {
        invalidatedEntryIds.add(inference.id);
        foundDependentInference = true;
      }
    }
  }
  const triggerEntryIds = new Set([
    ...operation.decision.triggerEntryIds,
    ...invalidatedEntryIds,
  ]);
  const affectedOpportunityIds = new Set(
    operation.decision.affectedOpportunityIds,
  );
  const decisionOpportunityIds = (decision: CampaignDecision): string[] => {
    if (
      decision.kind === "exclusion-gate" ||
      decision.kind === "qualification-gate"
    ) {
      return [decision.opportunityId];
    }
    if (decision.kind === "campaign-re-evaluation") {
      return decision.affectedOpportunityIds;
    }
    if (decision.kind === "breadth-gate") {
      return (
        history.breadthGates.find(
          (gate) => gate.decision.id === decision.id,
        )?.comparisonOpportunityIds ?? []
      );
    }
    if (decision.kind === "opportunity-comparison") {
      const comparison = history.opportunityComparisons.find(
        (entry) => entry.decision.id === decision.id,
      );
      const inconclusive = history.inconclusiveComparisonReports.find(
        (entry) => entry.comparison.decision.id === decision.id,
      );
      return (
        comparison?.profiles ?? inconclusive?.comparison.profiles ?? []
      ).map((profile) => profile.opportunityId);
    }
    if (decision.kind === "qualification-research") {
      return (
        history.opportunityQualificationEvaluations.find(
          (entry) => entry.researchDecision.id === decision.id,
        )?.assessments ?? []
      ).map((assessment) => assessment.opportunityId);
    }
    if (decision.kind === "opportunity-formation") {
      return history.opportunityFormations.flatMap((formation) =>
        formation.assessments.flatMap((assessment) =>
          assessment.decision.id === decision.id &&
          assessment.result.kind === "opportunity"
            ? [assessment.result.opportunityId]
            : [],
        ),
      );
    }
    return [];
  };
  const intakeRevisionAffectsDecision = (decision: CampaignDecision) => {
    if (operation.intakeRevision === null) {
      return false;
    }
    const revisedIntake = operation.intakeRevision.intake;
    const researchBudgetChanged =
      JSON.stringify(revisedIntake.researchBudget) !==
      JSON.stringify(history.intake!.researchBudget);
    if (decision.kind === "breadth-gate") {
      return researchBudgetChanged;
    }
    if (decision.kind === "qualification-research") {
      return researchBudgetChanged;
    }
    if (
      decision.kind === "opportunity-formation" ||
      decision.kind === "campaign-re-evaluation"
    ) {
      return false;
    }
    if (
      !decisionOpportunityIds(decision).some((id) =>
        affectedOpportunityIds.has(id),
      )
    ) {
      return false;
    }
    const priorProfile = history.intake!.developerProfileSnapshot;
    const revisedProfile = revisedIntake.developerProfileSnapshot;
    const profileChanged = (
      field: keyof Omit<typeof priorProfile, "capturedAt">,
    ) =>
      JSON.stringify(priorProfile[field]) !==
      JSON.stringify(revisedProfile[field]);
    const commercialTargetChanged =
      JSON.stringify(revisedIntake.commercialOutcomeTarget) !==
      JSON.stringify(history.intake!.commercialOutcomeTarget);
    const priorStatements = new Map(
      history.intake!.statements.map((statement) => [statement.id, statement]),
    );
    const revisedStatements = new Map(
      revisedIntake.statements.map((statement) => [statement.id, statement]),
    );
    const changedStatementIds = new Set(
      [...new Set([...priorStatements.keys(), ...revisedStatements.keys()])]
        .filter(
          (id) =>
            JSON.stringify(priorStatements.get(id)) !==
            JSON.stringify(revisedStatements.get(id)),
        ),
    );
    if (decision.kind === "opportunity-comparison") {
      return (
        commercialTargetChanged ||
        changedStatementIds.size > 0 ||
        profileChanged("capacity") ||
        profileChanged("capabilities") ||
        profileChanged("access") ||
        profileChanged("boundaries") ||
        profileChanged("operatingPreferences") ||
        profileChanged("riskTolerance")
      );
    }
    if (decision.kind === "exclusion-gate") {
      const exclusionGate = history.opportunityExclusionEvaluations
        .flatMap((evaluation) => evaluation.assessments)
        .flatMap((assessment) => [
          { kind: "market-safety" as const, gate: assessment.marketSafety.gate },
          ...assessment.hardConstraints.map(({ hardConstraintId, gate }) => ({
            kind: "hard-constraint" as const,
            hardConstraintId,
            gate,
          })),
        ])
        .find(({ gate }) => gate.decision.id === decision.id);
      return exclusionGate?.kind === "market-safety"
        ? profileChanged("boundaries")
        : exclusionGate !== undefined &&
            (profileChanged("boundaries") ||
              changedStatementIds.has(exclusionGate.hardConstraintId));
    }
    const qualificationGate = history.opportunityQualificationEvaluations
      .flatMap((evaluation) => evaluation.assessments)
      .flatMap((assessment) => assessment.gates)
      .find((gate) => gate.decision.id === decision.id);
    switch (qualificationGate?.kind) {
      case "buyer-economics":
      case "value-feasibility":
      case "commercial-plausibility":
        return commercialTargetChanged;
      case "customer-access":
        return profileChanged("access");
      case "solo-feasibility":
        return profileChanged("capacity") || profileChanged("capabilities");
      case "legal-operational-feasibility":
        return profileChanged("boundaries");
      case "costly-problem":
      case "competitive-viability":
      case undefined:
        return false;
    }
  };
  const alreadySuperseded = new Set(
    history.reevaluations.flatMap(
      (entry) => entry.decision.supersededDecisionIds,
    ),
  );
  const availableDecisions = history.campaignDecisions.filter(
    (decision) => !alreadySuperseded.has(decision.id),
  );
  const dependentDecisionIds = new Set(
    availableDecisions
      .filter(
        (decision) => {
          const evidenceEntryIds = campaignDecisionEvidenceIds(decision);
          const evidenceObservationIds = supportingObservationIds(
            history,
            evidenceEntryIds,
          );
          const triggeredObservationIds = stagedHistory.sourceFreshnesses
            .filter((freshness) => triggerEntryIds.has(freshness.id))
            .map((freshness) => freshness.observationId);
          return (
            evidenceEntryIds.some((entryId) => triggerEntryIds.has(entryId)) ||
            triggeredObservationIds.some((observationId) =>
              evidenceObservationIds.has(observationId),
            ) ||
            intakeRevisionAffectsDecision(decision)
          );
        },
      )
      .map((decision) => decision.id),
  );
  const decisionStage = (decision: CampaignDecision): number => {
    switch (decision.kind) {
      case "opportunity-formation": return 1;
      case "breadth-gate": return 2;
      case "exclusion-gate": return 3;
      case "qualification-gate": return 4;
      case "qualification-research": return 5;
      case "opportunity-comparison": return 6;
      case "campaign-re-evaluation": return 7;
    }
  };
  let foundDownstreamDecision = true;
  while (foundDownstreamDecision) {
    foundDownstreamDecision = false;
    for (const [index, decision] of availableDecisions.entries()) {
      if (dependentDecisionIds.has(decision.id)) {
        continue;
      }
      const opportunityIds = decisionOpportunityIds(decision);
      const dependsOnEarlierDecision = availableDecisions
        .slice(0, index)
        .some(
          (earlier) =>
            dependentDecisionIds.has(earlier.id) &&
            decisionStage(earlier) < decisionStage(decision) &&
            decisionOpportunityIds(earlier).some((id) =>
              opportunityIds.includes(id),
            ),
        );
      if (dependsOnEarlierDecision) {
        dependentDecisionIds.add(decision.id);
        foundDownstreamDecision = true;
      }
    }
  }
  for (const decision of availableDecisions) {
    if (decision.kind === "opportunity-formation") {
      dependentDecisionIds.delete(decision.id);
    }
  }
  if (operation.intakeRevision !== null) {
    const revisedIntake = operation.intakeRevision.intake;
    const priorProfile = history.intake!.developerProfileSnapshot;
    const revisedProfile = revisedIntake.developerProfileSnapshot;
    const substantiveIntakeChanged =
      JSON.stringify({ ...priorProfile, capturedAt: undefined }) !==
        JSON.stringify({ ...revisedProfile, capturedAt: undefined }) ||
      JSON.stringify(history.intake!.commercialOutcomeTarget) !==
        JSON.stringify(revisedIntake.commercialOutcomeTarget) ||
      JSON.stringify(history.intake!.statements) !==
        JSON.stringify(revisedIntake.statements) ||
      JSON.stringify(history.intake!.researchBudget) !==
        JSON.stringify(revisedIntake.researchBudget);
    const expectedAffectedOpportunityIds = substantiveIntakeChanged
      ? formedIds
      : new Set<string>();
    if (
      affectedOpportunityIds.size !== expectedAffectedOpportunityIds.size ||
      [...expectedAffectedOpportunityIds].some(
        (id) => !affectedOpportunityIds.has(id),
      )
    ) {
      return "a Campaign Intake revision must name exactly the Opportunities affected by its substantive baseline changes";
    }
  }
  const submittedDecisionIds = operation.decision.supersededDecisionIds;
  const invalidationMismatch =
    submittedDecisionIds.length !== dependentDecisionIds.size ||
    submittedDecisionIds.some((id) => !dependentDecisionIds.has(id));
  return invalidationMismatch
    ? `Campaign re-evaluation must supersede exactly the dependent Campaign Decisions (${[...dependentDecisionIds].join(", ") || "none"})`
    : undefined;
}

export function campaignReevaluationRecords(
  history: AuthoritativeHistoryRebuild,
  command: ReevaluateCampaignCommand,
  firstSequence: number,
) {
  const operation = command.payload.operation;
  const intakeRevision: CampaignIntakeRevision | null =
    operation.intakeRevision === null
      ? null
      : {
          reason: operation.intakeRevision.reason,
          previousVersion: history.intake!.version,
          intake: {
            campaignId: history.campaignId,
            confirmedAt: command.payload.reevaluatedAt,
            ...operation.intakeRevision.intake,
          },
        };
  const supersededArtifactIds = (() => {
    if (operation.decision.outcome !== "resume") {
      return [];
    }
    const activeIds = new Set(activeTerminalArtifactIds(history));
    const affectedOpportunityIds = new Set(
      operation.decision.affectedOpportunityIds,
    );
    const invalidatedDecisionIds = new Set(
      operation.decision.supersededDecisionIds,
    );
    const opportunityIsAffected = (opportunityId: string) =>
      affectedOpportunityIds.has(opportunityId);
    const decisionIsInvalidated = (decisionId: string) =>
      invalidatedDecisionIds.has(decisionId);
    return [
      ...history.noQualifyingOpportunityReports
        .filter(
          (report) =>
            report.rejectedOpportunities.some(
              (opportunity) =>
                opportunityIsAffected(opportunity.id) ||
                opportunity.decisionIds.some(decisionIsInvalidated),
            ) ||
            report.unresolvedOpportunities.some(
              (opportunity) =>
                opportunityIsAffected(opportunity.id) ||
                opportunity.decisionIds.some(decisionIsInvalidated),
            ),
        )
        .map((report) => report.id),
      ...history.opportunityBriefs
        .filter(
          (brief) =>
            opportunityIsAffected(brief.opportunity.id) ||
            decisionIsInvalidated(brief.comparisonContext.decisionId),
        )
        .map((brief) => brief.id),
      ...history.inconclusiveComparisonReports
        .filter(
          (report) =>
            decisionIsInvalidated(report.comparison.decision.id) ||
            report.comparison.profiles.some((profile) =>
              opportunityIsAffected(profile.opportunityId),
            ),
        )
        .map((report) => report.id),
      ...history.developerSelectedOpportunityBriefs
        .filter(
          (brief) =>
            opportunityIsAffected(brief.opportunity.id) ||
            (affectedOpportunityIds.size === 0 &&
              decisionIsInvalidated(brief.comparisonContext.decisionId)),
        )
        .map((brief) => brief.id),
    ].filter((artifactId) => activeIds.has(artifactId));
  })();
  const reevaluation: CampaignReevaluation = {
    id: operation.id,
    kind: operation.kind,
    reason: operation.reason,
    reasoningEntryIds: operation.reasoningEntries.map((entry) => entry.id),
    intakeRevision,
    decision: operation.decision,
    invalidatedDecisionIds: operation.decision.supersededDecisionIds,
    supersededArtifactIds,
  };
  return campaignRecordPair({
    campaignId: history.campaignId,
    requestId: command.requestId,
    recordedAt: command.payload.reevaluatedAt,
    firstSequence,
    operation: "reevaluate-campaign",
    intent: {
      coordinatorId: command.payload.coordinatorId,
      reevaluationId: operation.id,
    },
    outcome: {
      reevaluation,
      reasoningEntries: operation.reasoningEntries,
      ...(intakeRevision === null ? {} : { intake: intakeRevision.intake }),
    },
  });
}

export function applyCampaignReevaluation(
  history: AuthoritativeHistoryRebuild,
  reevaluation: CampaignReevaluation,
  reasoningEntries: ReasoningEntry[],
  intake: ConfirmedCampaignIntake | undefined,
): string | undefined {
  if (applyReasoningEntries(history, reasoningEntries) !== undefined) {
    return "Campaign re-evaluation reasoning cannot be applied";
  }
  if (reevaluation.intakeRevision === null) {
    if (intake !== undefined) {
      return "Campaign re-evaluation cannot replace Intake without an Intake revision";
    }
  } else {
    if (
      intake === undefined ||
      JSON.stringify(intake) !== JSON.stringify(reevaluation.intakeRevision.intake)
    ) {
      return "Campaign Intake revision does not match the authoritative re-evaluation";
    }
    history.intake = intake;
  }
  history.campaignDecisions.push(reevaluation.decision);
  history.reevaluations.push(reevaluation);
  return undefined;
}

function reportText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function renderNoQualifyingOpportunityReport(
  report: NoQualifyingOpportunityReport,
): string {
  const opportunitySection = (
    title: string,
    opportunities: Array<{
      id: string;
      customer: string;
      situation: string;
      decisionIds: string[];
      reasons: string[];
      evidenceGapIds?: string[];
    }>,
  ) => [
    `## ${title}`,
    "",
    ...(opportunities.length === 0
      ? ["None.", ""]
      : opportunities.flatMap((opportunity) => [
          `### ${reportText(opportunity.id)}`,
          "",
          `- Customer: ${reportText(opportunity.customer)}`,
          `- Situation: ${reportText(opportunity.situation)}`,
          `- Decision IDs: ${opportunity.decisionIds.map(reportText).join(", ")}`,
          ...(opportunity.evidenceGapIds === undefined
            ? []
            : [
                `- Evidence Gap IDs: ${opportunity.evidenceGapIds.map(reportText).join(", ") || "none"}`,
              ]),
          ...opportunity.reasons.map(
            (reason) => `- Reason: ${reportText(reason)}`,
          ),
          "",
        ])),
  ];
  return [
    "# No Qualifying Opportunity Report",
    "",
    `**Outcome:** No Qualifying Opportunity (valid terminal outcome, not an error)`,
    "",
    `- Report ID: ${reportText(report.id)}`,
    `- Campaign ID: ${reportText(report.campaignId)}`,
    `- Concluded at: ${report.concludedAt}`,
    `- Campaign Intake version: ${report.intakeVersion}`,
    `- Supersedes: ${report.supersedes === null ? "none" : reportText(report.supersedes)}`,
    "",
    report.summary,
    "",
    ...opportunitySection("Affirmatively rejected Opportunities", report.rejectedOpportunities),
    ...opportunitySection("Unresolved Opportunities", report.unresolvedOpportunities),
    "## Coverage and Breadth Gate",
    "",
    `- Discovery Tranches: ${report.coverage.discoveryTranches}`,
    `- Discovery Sweeps: ${report.coverage.discoverySweeps}`,
    `- Source Families: ${report.coverage.sourceFamilies.join(", ")}`,
    `- Formed Opportunities: ${report.coverage.formedOpportunities}`,
    `- Breadth Gate: ${report.coverage.breadthGate.id} (${report.coverage.breadthGate.status})`,
    "",
    "## Research Budget use",
    "",
    `- Source cap: ${report.researchBudget.sourceCap}`,
    `- Ordinary Source cap: ${report.researchBudget.ordinarySourceCap}`,
    `- Settled Source units: ${report.researchBudget.settledSourceUnits}`,
    `- Reserved unsettled Source units: ${report.researchBudget.reservedSourceUnits}`,
    `- Remaining ordinary Source units: ${report.researchBudget.remainingOrdinarySourceUnits}`,
    `- Adversarial Source reserve: ${report.researchBudget.adversarialSourceReserve}`,
    ...(report.researchBudget.paidSpendCap === undefined ||
    report.researchBudget.recordedPaidSpend === undefined ||
    report.researchBudget.remainingPaidSpend === undefined
      ? []
      : [
          `- Paid spend cap: ${report.researchBudget.paidSpendCap.amount} ${report.researchBudget.paidSpendCap.currency}`,
          `- Recorded paid spend: ${report.researchBudget.recordedPaidSpend.amount} ${report.researchBudget.recordedPaidSpend.currency}`,
          `- Remaining paid spend: ${report.researchBudget.remainingPaidSpend.amount} ${report.researchBudget.remainingPaidSpend.currency}`,
        ]),
    "",
    "## Limitations",
    "",
    ...(report.limitations.length === 0
      ? ["None recorded."]
      : report.limitations.map((limitation) => `- ${reportText(limitation)}`)),
    "",
    "## Continuation conditions",
    "",
    ...(report.continuationConditions.length === 0
      ? ["None: every Opportunity was affirmatively rejected."]
      : report.continuationConditions.map(
          (condition) =>
            `- ${reportText(condition.opportunityId)}: ${reportText(condition.condition)} (Evidence Gaps: ${condition.evidenceGapIds.map(reportText).join(", ")})`,
        )),
    "",
    "## Audit pointers",
    "",
    `- Authoritative history: ${report.audit.authoritativeRecordsPath}`,
    `- Evidence Ledger: ${report.audit.evidenceLedgerPath}`,
    `- Qualification evaluation: ${report.audit.qualificationEvaluationId}`,
    `- Qualification-related Campaign Decision: ${report.audit.researchDecisionId}`,
    "",
  ].join("\n");
}

function validateAndApplyResearchReservation(
  { intent, outcome, outcomeSequence, history }: AuthoritativeRecordPair,
  researchKind: "public" | "approved",
): void {
  if (
    history.intake === undefined ||
    typeof outcome.recordedAt !== "string" ||
    outcome.recordedAt < history.intake.confirmedAt ||
    !isRecord(outcome.reservation) ||
    validateCampaignResearchReservation(outcome.reservation, "reservation")
      .length > 0 ||
    intent.reservationId !== outcome.reservation.id ||
    history.reservations.has(String(outcome.reservation.id))
  ) {
    invalidAuthoritativeRecord(outcomeSequence);
  }
  const reservation =
    outcome.reservation as unknown as CampaignResearchReservation;
  const approval = history.researchApprovals.find(
    (candidate) => candidate.id === reservation.approvalId,
  );
  const approvedAccess =
    approval !== undefined &&
    ["restricted", "paid", "restricted-and-paid"].includes(
      approval.scope.access,
    );
  if (
    researchKind === "public" &&
    reservation.approvalId !== undefined &&
    (approval === undefined ||
      approval.scope.access !== "elevated-risk" ||
      approval.scope.purpose !== reservation.purpose ||
      approval.scope.accessMethod !== reservation.retrievalRoute ||
      approval.scope.opportunityId !== reservation.opportunityId ||
      reservation.researchClass !== "deepening" ||
      outcome.recordedAt < approval.approvedAt ||
      outcome.recordedAt < approval.scope.duration.startsAt ||
      outcome.recordedAt > approval.scope.duration.expiresAt)
  ) {
    invalidAuthoritativeRecord(outcomeSequence);
  }
  if (
    (researchKind === "approved" &&
      (!approvedAccess ||
        approval.scope.purpose !== reservation.purpose ||
        approval.scope.accessMethod !== reservation.retrievalRoute ||
        approval.scope.opportunityId !== reservation.opportunityId ||
        outcome.recordedAt < approval.approvedAt ||
        outcome.recordedAt < approval.scope.duration.startsAt ||
        outcome.recordedAt > approval.scope.duration.expiresAt ||
        [...history.reservations.values()].some(
          (existing) => existing.approvalId === approval.id,
        )))
  ) {
    invalidAuthoritativeRecord(outcomeSequence);
  }
  const activeExtension = activeInconclusiveResearchExtension(history);
  if (
    activeExtension?.response.kind === "extend" &&
    !reservationMatchesInconclusiveExtension(reservation, activeExtension.response)
  ) {
    invalidAuthoritativeRecord(outcomeSequence);
  }
  const sameClassReserved =
    [...history.reservations.values()]
      .filter(
        (existing) =>
          activeExtension === undefined ||
          history.reservationRecordedAt.get(existing.id)! >=
            activeExtension.respondedAt,
      )
      .filter((existing) =>
        reservation.researchClass === "adversarial"
          ? existing.researchClass === "adversarial"
          : existing.researchClass !== "adversarial",
      )
      .reduce((total, existing) => total + existing.sourceUnits, 0) +
    reservation.sourceUnits;
  const classCap =
    reservation.researchClass === "adversarial"
      ? history.intake.researchBudget.adversarialSourceReserve
      : history.intake.researchBudget.sourceCap -
        history.intake.researchBudget.adversarialSourceReserve;
  if (sameClassReserved > classCap) {
    throw new Error(
      `authoritative record ${outcomeSequence} exceeds the Research Budget`,
    );
  }
  if (
    activeExtension === undefined &&
    campaignResearchAllocationViolation(history, reservation) !== undefined
  ) {
    invalidAuthoritativeRecord(outcomeSequence);
  }
  if (
    opportunityDeepeningViolation(
      history,
      reservation,
      outcome.recordedAt,
    ) !== undefined ||
    adversarialResearchViolation(
      history,
      reservation,
      outcome.recordedAt,
    ) !== undefined
  ) {
    invalidAuthoritativeRecord(outcomeSequence);
  }
  if (
    researchKind === "approved" &&
    approval !== undefined &&
    ["paid", "restricted-and-paid"].includes(approval.scope.access)
  ) {
    const recordedSpend = history.researchExpenditures.reduce(
      (total, expenditure) => total + expenditure.amount,
      0,
    );
    const reservedSpend = [...history.reservations.values()].reduce(
      (total, existing) => {
        if (
          history.settledReservationIds.has(existing.id) ||
          existing.approvalId === undefined
        ) {
          return total;
        }
        const existingApproval = history.researchApprovals.find(
          (candidate) => candidate.id === existing.approvalId,
        );
        if (
          existingApproval === undefined ||
          !["paid", "restricted-and-paid"].includes(
            existingApproval.scope.access,
          )
        ) {
          return total;
        }
        const spentForApproval = history.researchExpenditures
          .filter(
            (expenditure) => expenditure.approvalId === existingApproval.id,
          )
          .reduce((subtotal, expenditure) => subtotal + expenditure.amount, 0);
        return (
          total +
          Math.max(
            0,
            existingApproval.scope.maximumCost.amount - spentForApproval,
          )
        );
      },
      0,
    );
    const spentForApproval = history.researchExpenditures
      .filter((expenditure) => expenditure.approvalId === approval.id)
      .reduce((total, expenditure) => total + expenditure.amount, 0);
    if (
      recordedSpend +
        reservedSpend +
        Math.max(0, approval.scope.maximumCost.amount - spentForApproval) >
      history.intake.researchBudget.paidSpendCap.amount
    ) {
      invalidAuthoritativeRecord(outcomeSequence);
    }
  }
  history.reservations.set(reservation.id, reservation);
  history.reservationRecordedAt.set(
    reservation.id,
    outcome.recordedAt,
  );
  history.reservationOutcomeSequence.set(reservation.id, outcomeSequence);
}

function validateAndApplyResearchObservation(
  { intent, outcome, outcomeSequence, history }: AuthoritativeRecordPair,
  researchKind: "public" | "approved",
): void {
  const reservationId = String(outcome.reservationId);
  if (!isRecord(outcome.source) || !isRecord(outcome.observation)) {
    invalidAuthoritativeRecord(outcomeSequence);
  }
  const source = outcome.source;
  const observation = outcome.observation;
  const reservation = history.reservations.get(reservationId);
  const approval = history.researchApprovals.find(
    (candidate) => candidate.id === reservation?.approvalId,
  );
  const approvedAccess =
    approval !== undefined &&
    ["restricted", "paid", "restricted-and-paid"].includes(
      approval.scope.access,
    );
  const validationCommand = {
    payload: {
      campaignPath: "/authoritative-rebuild",
      coordinatorId: intent.coordinatorId,
      recordedAt: outcome.recordedAt,
      reservationId,
      source,
      observation,
      ...(researchKind === "approved" ? { charge: outcome.charge } : {}),
    },
  };
  if (
    history.intake === undefined ||
    intent.reservationId !== outcome.reservationId ||
    reservation === undefined ||
    history.settledReservationIds.has(reservationId) ||
    (researchKind === "approved"
      ? validateRecordApprovedResearchObservationFields(validationCommand)
          .length > 0 || !approvedAccess
      : !approvedAccess &&
        (validatePublicSource(source, outcome.recordedAt).length > 0 ||
          validatePublicObservation(observation, source).length > 0)) ||
    (researchKind === "public" && approvedAccess) ||
    typeof source.accessedAt !== "string" ||
    typeof outcome.recordedAt !== "string" ||
    source.accessedAt < history.reservationRecordedAt.get(reservationId)! ||
    outcome.recordedAt < history.reservationRecordedAt.get(reservationId)! ||
    researchApprovalScopeMismatch(
      history,
      reservationId,
      source as unknown as Source,
    ) ||
    history.sources.some((existingSource) => existingSource.id === source.id) ||
    history.observations.some(
      (existingObservation) => existingObservation.id === observation.id,
    )
  ) {
    invalidAuthoritativeRecord(outcomeSequence);
  }
  if (researchKind === "approved") {
    const charge = isRecord(outcome.charge) ? outcome.charge : {};
    const expenditure = history.researchExpenditures.find(
      (candidate) => candidate.id === charge.expenditureId,
    );
    if (
      charge.incurred === true &&
      (expenditure === undefined || expenditure.approvalId !== approval!.id)
    ) {
      invalidAuthoritativeRecord(outcomeSequence);
    }
  }
  history.settledReservationIds.add(reservationId);
  history.reservationObservationIds.set(
    reservationId,
    String(observation.id),
  );
  history.sources.push(source as unknown as Source);
  history.observations.push(observation as unknown as Observation);
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
    validateAndApply({ outcome, outcomeSequence, history }) {
      history.resumeOutcomes.push({
        requestId: String(outcome.requestId),
        recordedAt: String(outcome.recordedAt),
        outcomeSequence,
      });
    },
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
    validateAndApply(pair) {
      validateAndApplyResearchReservation(pair, "public");
    },
  },
  "reserve-approved-research": {
    outcome: "approved-research-reserved",
    position: "subsequent",
    establishesLease: false,
    validateAndApply(pair) {
      validateAndApplyResearchReservation(pair, "approved");
    },
  },
  "record-public-research-observation": {
    outcome: "public-research-observation-recorded",
    position: "subsequent",
    establishesLease: false,
    validateAndApply(pair) {
      validateAndApplyResearchObservation(pair, "public");
    },
  },
  "record-approved-research-observation": {
    outcome: "approved-research-observation-recorded",
    position: "subsequent",
    establishesLease: false,
    validateAndApply(pair) {
      validateAndApplyResearchObservation(pair, "approved");
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
            ...(typeof intent.reevaluationId === "string"
              ? { reevaluationId: intent.reevaluationId }
              : {}),
            assessments: outcome.assessments,
          },
        }).length > 0 ||
        applyOpportunityExclusionEvaluation(
          history,
          evaluation as OpportunityExclusionEvaluation,
          String(outcome.recordedAt),
          typeof intent.reevaluationId === "string"
            ? intent.reevaluationId
            : undefined,
        ) !== undefined
      ) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
    },
  },
  "record-opportunity-qualification-gates": {
    outcome: "opportunity-qualification-gates-recorded",
    position: "subsequent",
    establishesLease: false,
    validateAndApply({ intent, outcome, outcomeSequence, history }) {
      if (
        history.intake === undefined ||
        !isRecord(outcome.evaluation) ||
        intent.evaluationId !== outcome.evaluation.id ||
        validateRecordOpportunityQualificationGatesFields({
          payload: {
            campaignPath: "/authoritative-rebuild",
            coordinatorId: intent.coordinatorId,
            recordedAt: outcome.recordedAt,
            ...(typeof intent.reevaluationId === "string"
              ? { reevaluationId: intent.reevaluationId }
              : {}),
            evaluation: outcome.evaluation,
          },
        }).length > 0 ||
        applyOpportunityQualificationEvaluation(
          history,
          outcome.evaluation as unknown as OpportunityQualificationEvaluation,
          String(outcome.recordedAt),
          typeof intent.reevaluationId === "string"
            ? intent.reevaluationId
            : undefined,
        ) !== undefined
      ) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
    },
  },
  "conclude-no-qualifying-opportunity": {
    outcome: "no-qualifying-opportunity-concluded",
    position: "subsequent",
    establishesLease: false,
    validateAndApply({ intent, outcome, outcomeSequence, history }) {
      if (
        history.intake === undefined ||
        !isRecord(outcome.report) ||
        intent.reportId !== outcome.report.id ||
        !Array.isArray(intent.continuationConditions) ||
        validateConcludeNoQualifyingOpportunityFields({
          payload: {
            campaignPath: "/authoritative-rebuild",
            coordinatorId: intent.coordinatorId,
            concludedAt: outcome.recordedAt,
            reportId: intent.reportId,
            continuationConditions: intent.continuationConditions,
          },
        }).length > 0 ||
        JSON.stringify(intent.continuationConditions) !==
          JSON.stringify(outcome.report.continuationConditions) ||
        applyNoQualifyingOpportunityReport(
          history,
          outcome.report as unknown as NoQualifyingOpportunityReport,
        ) !== undefined
      ) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
    },
  },
  "conclude-leading-opportunity": {
    outcome: "leading-opportunity-concluded",
    position: "subsequent",
    establishesLease: false,
    validateAndApply({ intent, outcome, outcomeSequence, history }) {
      if (!isRecord(outcome.comparison) || !isRecord(outcome.brief)) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
      const comparison = outcome.comparison as unknown as OpportunityComparison;
      const brief = outcome.brief as unknown as OpportunityBrief;
      const briefInput = {
        id: brief.id,
        buyerEconomics: brief.buyerEconomics,
        customerAccess: brief.customerAccess,
        alternatives: brief.alternatives,
        risks: brief.risks,
        valueHypothesis: brief.valueHypothesis,
      };
      if (
        intent.comparisonId !== comparison.id ||
        intent.briefId !== brief.id ||
        validateConcludeLeadingOpportunityFields({
          payload: {
            campaignPath: "/authoritative-rebuild",
            coordinatorId: intent.coordinatorId,
            concludedAt: outcome.recordedAt,
            comparison,
            brief: briefInput,
          },
        }).length > 0 ||
        applyLeadingOpportunity(
          history,
          comparison,
          brief,
          String(outcome.recordedAt),
        ) !== undefined
      ) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
    },
  },
  "conclude-inconclusive-comparison": {
    outcome: "inconclusive-comparison-concluded",
    position: "subsequent",
    establishesLease: false,
    validateAndApply({ intent, outcome, outcomeSequence, history }) {
      if (!isRecord(outcome.report)) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
      const report = outcome.report as unknown as InconclusiveComparisonReport;
      if (
        intent.comparisonId !== report.comparison.id ||
        intent.reportId !== report.id ||
        validateConcludeInconclusiveComparisonFields({
          payload: {
            campaignPath: "/authoritative-rebuild",
            coordinatorId: intent.coordinatorId,
            concludedAt: outcome.recordedAt,
            reportId: intent.reportId,
            comparison: report.comparison,
          },
        }).length > 0 ||
        applyInconclusiveComparisonReport(history, report) !== undefined
      ) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
    },
  },
  "respond-inconclusive-comparison": {
    outcome: "inconclusive-comparison-response-recorded",
    position: "subsequent",
    establishesLease: false,
    validateAndApply({ intent, outcome, outcomeSequence, history }) {
      if (!isRecord(outcome.responseRecord) || !Array.isArray(outcome.briefs)) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
      const responseRecord =
        outcome.responseRecord as unknown as InconclusiveComparisonResponseRecord;
      if (
        intent.reportId !== responseRecord.reportId ||
        intent.responseKind !== responseRecord.response.kind ||
        validateRespondInconclusiveComparisonFields({
          payload: {
            campaignPath: "/authoritative-rebuild",
            coordinatorId: intent.coordinatorId,
            respondedAt: outcome.recordedAt,
            reportId: responseRecord.reportId,
            response: responseRecord.response,
          },
        }).length > 0 ||
        applyInconclusiveComparisonResponse(
          history,
          responseRecord,
          outcome.briefs as OpportunityBrief[],
        ) !== undefined
      ) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
    },
  },
  "reevaluate-campaign": {
    outcome: "campaign-reevaluated",
    position: "subsequent",
    establishesLease: false,
    validateAndApply({ intent, outcome, outcomeSequence, history }) {
      const reevaluation = outcome.reevaluation;
      const reasoningEntries = outcome.reasoningEntries;
      if (
        !isRecord(reevaluation) ||
        !Array.isArray(reasoningEntries) ||
        intent.reevaluationId !== reevaluation.id
      ) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
      const operation = {
        id: reevaluation.id,
        kind: reevaluation.kind,
        reason: reevaluation.reason,
        reasoningEntries,
        intakeRevision: reevaluation.intakeRevision === null
          ? null
          : {
              reason: isRecord(reevaluation.intakeRevision)
                ? reevaluation.intakeRevision.reason
                : undefined,
              intake: isRecord(outcome.intake)
                ? (() => {
                    const {
                      campaignId: _campaignId,
                      confirmedAt: _confirmedAt,
                      ...intakeValue
                    } = outcome.intake;
                    return intakeValue;
                  })()
                : outcome.intake,
            },
        decision: reevaluation.decision,
      };
      const command = {
        envelopeVersion: contracts.commandEnvelope,
        requestId: String(outcome.requestId),
        command: "reevaluateCampaign" as const,
        payload: {
          campaignPath: "/authoritative-rebuild",
          coordinatorId: String(intent.coordinatorId),
          reevaluatedAt: String(outcome.recordedAt),
          operation,
        },
      };
      const expectedOutcome = campaignReevaluationRecords(
        history,
        command as ReevaluateCampaignCommand,
        outcomeSequence - 1,
      )[1];
      const { recordDigest: _recordDigest, ...outcomeWithoutDigest } = outcome;
      if (
        validateReevaluateCampaignFields(command).length > 0 ||
        campaignReevaluationViolation(history, command as ReevaluateCampaignCommand) !==
          undefined ||
        JSON.stringify(outcomeWithoutDigest) !== JSON.stringify(expectedOutcome) ||
        applyCampaignReevaluation(
          history,
          reevaluation as unknown as CampaignReevaluation,
          reasoningEntries as ReasoningEntry[],
          isRecord(outcome.intake)
            ? (outcome.intake as unknown as ConfirmedCampaignIntake)
            : undefined,
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
  "respond-interrupted-research": {
    outcome: "interrupted-research-responded",
    position: "subsequent",
    establishesLease: false,
    validateAndApply({ intent, outcome, outcomeSequence, history }) {
      const activeDecision = interruptedApprovedResearchDecision(history);
      const response = outcome.response;
      const command = {
        payload: {
          campaignPath: "/authoritative-rebuild",
          coordinatorId: intent.coordinatorId,
          respondedAt: outcome.recordedAt,
          decisionId: outcome.decisionId,
          response,
        },
      };
      if (
        activeResearchApprovalDecision(history) !== undefined ||
        activeDecision === undefined ||
        outcome.decisionId !== intent.pendingDecisionId ||
        outcome.decisionId !== activeDecision.id ||
        validateRespondInterruptedResearchFields(command).length > 0 ||
        !isRecord(response) ||
        JSON.stringify(
          Array.isArray(response.reservations)
            ? response.reservations.map((resolution) =>
                isRecord(resolution) ? resolution.reservationId : undefined,
              )
            : undefined,
        ) !==
          JSON.stringify(
            activeDecision.reservations.map(
              (reservation) => reservation.reservationId,
            ),
          )
      ) {
        invalidAuthoritativeRecord(outcomeSequence);
      }
      const responseRecord: InterruptedResearchResponse = {
        decisionId: activeDecision.id,
        respondedAt: String(outcome.recordedAt),
        response:
          response as unknown as InterruptedResearchResponse["response"],
      };
      for (const resolution of responseRecord.response.reservations) {
        const reservation = history.reservations.get(resolution.reservationId)!;
        const expenditureId = resolution.charge.incurred
          ? resolution.charge.expenditureId
          : undefined;
        const expenditure = history.researchExpenditures.find(
          (candidate) => candidate.id === expenditureId,
        );
        if (
          resolution.charge.incurred &&
          (expenditure === undefined ||
            expenditure.approvalId !== reservation.approvalId)
        ) {
          invalidAuthoritativeRecord(outcomeSequence);
        }
        history.settledReservationIds.add(resolution.reservationId);
        history.closedResearchReservationIds.add(resolution.reservationId);
      }
      history.interruptedResearchResponses.push(responseRecord);
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
  if (!isAuthoritativeOperation(operation)) {
    return undefined;
  }
  return authoritativeOperationDescriptors[operation];
}

export function isAuthoritativeOperation(
  operation: unknown,
): operation is AuthoritativeOperation {
  return (
    typeof operation === "string" &&
    Object.hasOwn(authoritativeOperationDescriptors, operation)
  );
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
      ...(operation.commandDigest === undefined
        ? {}
        : { commandDigest: operation.commandDigest }),
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

export function approvedResearchReservationRecords(
  campaignId: string,
  command: ReserveApprovedResearchCommand,
  firstSequence: number,
) {
  return campaignRecordPair({
    campaignId,
    requestId: command.requestId,
    recordedAt: command.payload.reservedAt,
    firstSequence,
    operation: "reserve-approved-research",
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

export function approvedResearchObservationRecords(
  campaignId: string,
  command: RecordApprovedResearchObservationCommand,
  firstSequence: number,
) {
  return campaignRecordPair({
    campaignId,
    requestId: command.requestId,
    recordedAt: command.payload.recordedAt,
    firstSequence,
    operation: "record-approved-research-observation",
    intent: {
      coordinatorId: command.payload.coordinatorId,
      reservationId: command.payload.reservationId,
    },
    outcome: {
      reservationId: command.payload.reservationId,
      source: command.payload.source,
      observation: command.payload.observation,
      charge: command.payload.charge,
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
      ...(command.payload.reevaluationId === undefined
        ? {}
        : { reevaluationId: command.payload.reevaluationId }),
    },
    outcome: { assessments: command.payload.assessments },
  });
}

export function opportunityQualificationGateRecords(
  campaignId: string,
  command: RecordOpportunityQualificationGatesCommand,
  firstSequence: number,
) {
  return campaignRecordPair({
    campaignId,
    requestId: command.requestId,
    recordedAt: command.payload.recordedAt,
    firstSequence,
    operation: "record-opportunity-qualification-gates",
    intent: {
      coordinatorId: command.payload.coordinatorId,
      evaluationId: command.payload.evaluation.id,
      ...(command.payload.reevaluationId === undefined
        ? {}
        : { reevaluationId: command.payload.reevaluationId }),
    },
    outcome: { evaluation: command.payload.evaluation },
  });
}

export function noQualifyingOpportunityRecords(
  history: AuthoritativeHistoryRebuild,
  command: ConcludeNoQualifyingOpportunityCommand,
  firstSequence: number,
) {
  const report = buildNoQualifyingOpportunityReport(
    history,
    command.payload.reportId,
    command.payload.concludedAt,
    command.payload.continuationConditions,
  );
  return campaignRecordPair({
    campaignId: history.campaignId,
    requestId: command.requestId,
    recordedAt: command.payload.concludedAt,
    firstSequence,
    operation: "conclude-no-qualifying-opportunity",
    intent: {
      coordinatorId: command.payload.coordinatorId,
      reportId: command.payload.reportId,
      continuationConditions: command.payload.continuationConditions,
    },
    outcome: { report },
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

export function interruptedResearchResponseRecords(
  campaignId: string,
  command: RespondInterruptedResearchCommand,
  firstSequence: number,
) {
  return campaignRecordPair({
    campaignId,
    requestId: command.requestId,
    recordedAt: command.payload.respondedAt,
    firstSequence,
    operation: "respond-interrupted-research",
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
  try {
    return parseAuthoritativeRecordText(
      await readFile(path.join(campaignPath, "records.jsonl"), "utf8"),
    );
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw new CampaignAuthorityError("missing", "records.jsonl was not found.");
    }
    throw error;
  }
}

export function matchesContracts(
  value: Record<string, unknown>,
  expectedContracts: Record<string, string> = contracts,
): boolean {
  const entries = Object.entries(expectedContracts);
  return (
    Object.keys(value).length === entries.length &&
    entries.every(([name, version]) => value[name] === version)
  );
}

function semanticVersionParts(version: unknown): number[] | undefined {
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
    return undefined;
  }
  return version.split(".").map(Number);
}

function isNewerVersion(found: unknown, supported: string): boolean {
  const foundParts = semanticVersionParts(found);
  const supportedParts = semanticVersionParts(supported)!;
  if (foundParts === undefined) {
    return false;
  }
  for (let index = 0; index < supportedParts.length; index += 1) {
    if (foundParts[index]! !== supportedParts[index]!) {
      return foundParts[index]! > supportedParts[index]!;
    }
  }
  return false;
}

export function newerContractDetails(
  foundVersions: Record<string, unknown>,
  supportedVersions: Record<string, string> = contracts,
): string[] {
  return Object.entries(supportedVersions).flatMap(([name, supported]) => {
    const found = foundVersions[name];
    return isNewerVersion(found, supported)
      ? [`${name}: found ${String(found)}; supported ${supported}.`]
      : [];
  });
}

export type CampaignManifest = {
  campaignId: string;
  createdAt: string;
  manifestDigest?: string;
  versions: Record<string, unknown>;
  authority: {
    records: "records.jsonl";
    recordCount?: number;
    historyDigest?: string;
  };
  projections: {
    workView: "work-view.json";
    campaignIntake?: "campaign-intake.json";
    researchBudget?: "research-budget.json";
    evidenceLedger?: "evidence-ledger.json";
    noQualifyingOpportunityReport?: "no-qualifying-opportunity-report.md";
    opportunityBrief?: "opportunity-brief.md";
  };
};

export function parseCampaignManifest(
  value: unknown,
  expectedContracts: Record<string, string> = contracts,
): CampaignManifest | undefined {
  if (
    expectedContracts.campaignFormat === contracts.campaignFormat &&
    isRecord(value) &&
    value.manifestDigest !== undefined &&
    (typeof value.manifestDigest !== "string" ||
      value.manifestDigest !== manifestDigest(value))
  ) {
    throw new CampaignAuthorityError(
      "reconciliation",
      "manifest integrity digest does not match",
    );
  }
  if (
    expectedContracts.campaignFormat === contracts.campaignFormat &&
    isRecord(value) &&
    isRecord(value.versions) &&
    matchesContracts(value.versions, expectedContracts) &&
    typeof value.manifestDigest !== "string"
  ) {
    throw new CampaignAuthorityError(
      "reconciliation",
      "manifest integrity digest does not match",
    );
  }
  if (
    expectedContracts.campaignFormat === contracts.campaignFormat &&
    isRecord(value) &&
    isRecord(value.versions)
  ) {
    const newerContracts = newerContractDetails(value.versions);
    if (newerContracts.length > 0) {
      throw new NewerCampaignContractsError(newerContracts);
    }
  }
  if (
    !isRecord(value) ||
    typeof value.campaignId !== "string" ||
    value.campaignId.trim() === "" ||
    !isIsoInstant(value.createdAt) ||
    !isRecord(value.versions) ||
    !matchesContracts(value.versions, expectedContracts) ||
    !isRecord(value.authority) ||
    value.authority.records !== "records.jsonl" ||
    (expectedContracts.campaignFormat === contracts.campaignFormat &&
      (!Number.isSafeInteger(value.authority.recordCount) ||
        Number(value.authority.recordCount) < 2 ||
        typeof value.authority.historyDigest !== "string" ||
        !/^[a-f0-9]{64}$/.test(value.authority.historyDigest))) ||
    !isRecord(value.projections) ||
    value.projections.workView !== "work-view.json" ||
    (value.projections.campaignIntake !== undefined &&
      value.projections.campaignIntake !== "campaign-intake.json") ||
    (value.projections.researchBudget !== undefined &&
      value.projections.researchBudget !== "research-budget.json") ||
    (value.projections.evidenceLedger !== undefined &&
      value.projections.evidenceLedger !== "evidence-ledger.json") ||
    (value.projections.noQualifyingOpportunityReport !== undefined &&
      value.projections.noQualifyingOpportunityReport !==
        "no-qualifying-opportunity-report.md") ||
    (value.projections.opportunityBrief !== undefined &&
      value.projections.opportunityBrief !== "opportunity-brief.md")
  ) {
    return undefined;
  }
  return value as unknown as CampaignManifest;
}

async function rebuildCampaignFromAuthorityUnchecked(
  campaignPath: string,
  expectedContracts: Record<string, string> = contracts,
) {
  const resolvedPath = path.resolve(campaignPath);
  const manifest = parseCampaignManifest(
    await readJson(path.join(resolvedPath, "manifest.json")),
    expectedContracts,
  );
  if (manifest === undefined) {
    throw new Error("manifest is missing identity or supported contract versions");
  }

  const records = await readCampaignRecords(resolvedPath);
  if (records.length < 2 || records.length % 2 !== 0) {
    throw new CampaignAuthorityError(
      "damaged",
      "authoritative history is incomplete",
    );
  }
  const operationRequests = new Set<string>();
  const authoritativeHistory: AuthoritativeHistoryRebuild = {
    campaignId: manifest.campaignId,
    reservations: new Map(),
    reservationRecordedAt: new Map(),
    reservationObservationIds: new Map(),
    reservationOutcomeSequence: new Map(),
    settledReservationIds: new Set(),
    closedResearchReservationIds: new Set(),
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
    opportunityQualificationEvaluations: [],
    noQualifyingOpportunityReports: [],
    opportunityComparisons: [],
    opportunityBriefs: [],
    inconclusiveComparisonReports: [],
    inconclusiveComparisonResponses: [],
    developerSelectedOpportunityBriefs: [],
    reevaluations: [],
    campaignDecisions: [],
    researchApprovalDecisions: [],
    researchApprovalInformation: [],
    researchApprovalResponses: [],
    researchApprovals: [],
    researchExpenditures: [],
    resumeOutcomes: [],
    interruptedResearchResponses: [],
  };
  for (let index = 0; index < records.length; index += 2) {
    const sequence = index + 1;
    const record = records[index];
    const expectedRecordId = `${manifest.campaignId}:record:${String(sequence).padStart(12, "0")}`;
    if (
      !isRecord(record) ||
      record.sequence !== sequence ||
      record.campaignId !== manifest.campaignId ||
      record.recordVersion !== expectedContracts.records ||
      record.recordId !== expectedRecordId ||
      typeof record.requestId !== "string" ||
      record.requestId.trim() === "" ||
      (record.commandDigest !== undefined &&
        (typeof record.commandDigest !== "string" ||
          !/^[a-f0-9]{64}$/.test(record.commandDigest))) ||
      !isIsoInstant(record.recordedAt)
    ) {
      throw new Error(`authoritative record ${sequence} is invalid`);
    }
    if (
      expectedContracts.records === contracts.records &&
      (typeof record.recordDigest !== "string" ||
        record.recordDigest !== recordDigest(record))
    ) {
      throw new CampaignAuthorityError(
        "reconciliation",
        `authoritative record ${sequence} integrity digest does not match`,
      );
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
      outcome.recordVersion !== expectedContracts.records ||
      outcome.recordId !== expectedOutcomeId ||
      outcome.requestId !== record.requestId ||
      outcome.recordedAt !== record.recordedAt ||
      outcome.type !== operationDescriptor.outcome
    ) {
      throw new Error(`authoritative record ${outcomeSequence} is invalid`);
    }
    if (
      expectedContracts.records === contracts.records &&
      (typeof outcome.recordDigest !== "string" ||
        outcome.recordDigest !== recordDigest(outcome))
    ) {
      throw new CampaignAuthorityError(
        "reconciliation",
        `authoritative record ${outcomeSequence} integrity digest does not match`,
      );
    }
    if (
      !isAuthoritativeOperation(record.operation) ||
      inconclusiveResearchExtensionViolation(
        authoritativeHistory,
        record.operation,
        outcome,
      ) !== undefined
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
  if (
    expectedContracts.campaignFormat === contracts.campaignFormat &&
    (manifest.authority.recordCount !== records.length ||
      manifest.authority.historyDigest !== authoritativeHistoryDigest(records))
  ) {
    throw new CampaignAuthorityError(
      "reconciliation",
      "authoritative history does not match its manifest anchor",
    );
  }
  const {
    intake,
    reservations,
    settledReservationIds,
    closedResearchReservationIds,
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
    opportunityQualificationEvaluations,
    noQualifyingOpportunityReports,
    opportunityComparisons,
    opportunityBriefs,
    inconclusiveComparisonReports,
    inconclusiveComparisonResponses,
    developerSelectedOpportunityBriefs,
    reevaluations,
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
  for (const reservation of [...reservations.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    workView.completedWork.push(
      closedResearchReservationIds.has(reservation.id)
        ? `Approved Research reservation ${reservation.id} closed without retry`
        : settledReservationIds.has(reservation.id)
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
      corrections
        .filter((correction) => correction.action !== "reaffirm")
        .map((correction) => correction.targetEntryId),
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
  if (opportunityQualificationEvaluations.length > 0) {
    const evaluation = opportunityQualificationEvaluations.at(-1)!;
    const assessmentsByOpportunityId = new Map(
      evaluation.assessments.map((assessment) => [
        assessment.opportunityId,
        assessment,
      ]),
    );
    workView.completedWork.push(
      `${evaluation.assessments.length} Opportunity qualification assessment${evaluation.assessments.length === 1 ? "" : "s"} recorded`,
    );
    workView.qualificationResearch = {
      state: evaluation.researchDecision.outcome,
      decisionValuePriorities:
        evaluation.researchDecision.decisionValuePriorities,
      stopReason: evaluation.researchDecision.stopReason,
      decisionId: evaluation.researchDecision.id,
    };
    if (evaluation.researchDecision.outcome === "stop") {
      workView.publicResearchAvailable = false;
    }
    workView.nextPermittedActions =
      evaluation.researchDecision.outcome === "continue"
        ? [
            "reserve-public-research",
            "record-evidence-reasoning",
            "evaluate-qualification-gates",
          ]
        : evaluation.researchDecision.stopReason === "qualification-complete"
          ? ["compare-eligible-opportunities"]
          : ["conclude-no-qualifying-opportunity"];
    workView.opportunities = workView.opportunities!.map((opportunity) => {
      const assessment = assessmentsByOpportunityId.get(opportunity.id);
      if (
        assessment === undefined ||
        opportunity.disposition?.status !== "active"
      ) {
        return opportunity;
      }
      const qualificationGates = assessment.gates.map((gate) => ({
        id: gate.id,
        kind: gate.kind,
        state: gate.state,
        applicableRule: gate.decision.applicableRule,
        decisionId: gate.decision.id,
      }));
      return {
        ...opportunity,
        qualificationGates,
        ...qualificationDispositionFor(
          qualificationGates,
          opportunity.marketSafety?.classification === "elevated-risk" &&
            isElevatedRiskApprovalUnavailable(
              opportunity.marketSafety.classification,
              researchApprovals,
              opportunity.id,
              workViewAsOf,
            )
            ? opportunity.exclusionGates?.find(
                (gate) => gate.kind === "market-safety",
              )?.decisionId
            : undefined,
        ),
      };
    });
  }
  const activeTerminalIds = new Set(
    activeTerminalArtifactIds(authoritativeHistory),
  );
  const currentNoQualifyingOpportunityReport =
    noQualifyingOpportunityReports.findLast((report) =>
      activeTerminalIds.has(report.id),
    );
  const currentOpportunityBrief = opportunityBriefs.findLast((brief) =>
    activeTerminalIds.has(brief.id),
  );
  const currentOpportunityComparison =
    currentOpportunityBrief === undefined
      ? undefined
      : opportunityComparisons[opportunityBriefs.indexOf(currentOpportunityBrief)];
  const currentInconclusiveComparisonReport =
    inconclusiveComparisonReports.findLast((report) =>
      activeTerminalIds.has(report.id),
    );
  if (currentNoQualifyingOpportunityReport !== undefined) {
    const report = currentNoQualifyingOpportunityReport;
    workView.phase = "terminal";
    workView.publicResearchAvailable = false;
    workView.completedWork.push(
      `No Qualifying Opportunity Report ${report.id} produced`,
    );
    workView.nextPermittedActions = [
      "inspect-no-qualifying-opportunity-report",
      "explain-no-qualifying-opportunity",
      "start-separate-campaign",
      "finish",
    ];
    workView.terminal = {
      outcome: "no-qualifying-opportunity",
      reportId: report.id,
      artifactPath: noQualifyingOpportunityArtifactPath(report),
      immutable: true,
      concludedAt: report.concludedAt,
    };
  }
  if (currentOpportunityBrief !== undefined) {
    const brief = currentOpportunityBrief;
    workView.phase = "terminal";
    workView.publicResearchAvailable = false;
    workView.completedWork.push(
      `Opportunity Brief ${brief.id} produced for Leading Opportunity ${brief.opportunity.id}`,
    );
    workView.nextPermittedActions = [
      "inspect-opportunity-brief",
      "explain-leading-opportunity",
      "optionally-invoke-wayfinder-separately",
      "finish",
    ];
    workView.opportunities = workView.opportunities?.map((opportunity) => ({
      ...opportunity,
      terminalRole:
        opportunity.id === brief.opportunity.id
          ? ("leading-opportunity" as const)
          : opportunity.terminalRole,
    }));
    workView.terminal = {
      outcome: "leading-opportunity",
      briefId: brief.id,
      opportunityId: brief.opportunity.id,
      artifactPath: opportunityBriefArtifactPath(brief),
      immutable: true,
      concludedAt: brief.concludedAt,
    };
  }
  if (currentInconclusiveComparisonReport !== undefined) {
    const report = currentInconclusiveComparisonReport;
    workView.phase = "inconclusive-comparison";
    workView.publicResearchAvailable = false;
    workView.completedWork.push(
      `Inconclusive Comparison Report ${report.id} produced`,
    );
    workView.nextPermittedActions = [
      "stop-inconclusive-comparison",
      "extend-targeted-research",
      "select-non-dominated-opportunities",
    ];
    workView.inconclusiveComparison = {
      reportId: report.id,
      artifactPath: inconclusiveComparisonArtifactPath(report),
      immutable: true,
      concludedAt: report.concludedAt,
      availableActions: report.availableActions,
    };
    const response = inconclusiveComparisonResponses.findLast(
      (entry) => entry.reportId === report.id,
    );
    if (response?.response.kind === "stop") {
      workView.phase = "terminal";
      workView.completedWork.push(
        `Developer stopped after Inconclusive Comparison Report ${report.id}`,
      );
      workView.nextPermittedActions = [
        "inspect-inconclusive-comparison-report",
        "explain-inconclusive-comparison",
        "finish",
      ];
      workView.terminal = {
        outcome: "inconclusive-comparison",
        reportId: report.id,
        artifactPath: inconclusiveComparisonArtifactPath(report),
        action: "stopped",
        immutable: true,
        concludedAt: response.respondedAt,
      };
    } else if (response?.response.kind === "extend") {
      workView.phase = "opportunity-deepening";
      workView.publicResearchAvailable = true;
      workView.completedWork.push(
        `Targeted research extension created Campaign Intake version ${intake!.version}`,
      );
      workView.nextPermittedActions = ["reserve-targeted-research"];
      workView.researchExtension = {
        reportId: report.id,
        intakeVersion: intake!.version,
        targetedEvidenceGapIds: response.response.targetedEvidenceGapIds,
        affectedOpportunityIds: response.response.affectedOpportunityIds,
      };
    } else if (response?.response.kind === "select") {
      const selectedIds = response.response.selections.map(
        (selection) => selection.opportunityId,
      );
      const artifactPaths = developerSelectedOpportunityBriefs.map(
        (brief) => brief.wayfinderHandoff.briefPath,
      );
      workView.phase = "terminal";
      workView.publicResearchAvailable = false;
      workView.completedWork.push(
        `${selectedIds.length} Developer-Selected Opportunity Briefs produced from ${report.id}`,
      );
      workView.nextPermittedActions = [
        "inspect-developer-selected-opportunity-briefs",
        "optionally-invoke-wayfinder-separately-for-each-brief",
        "finish",
      ];
      workView.opportunities = workView.opportunities?.map((opportunity) => ({
        ...opportunity,
        terminalRole: selectedIds.includes(opportunity.id)
          ? ("developer-selected-opportunity" as const)
          : opportunity.terminalRole,
      }));
      workView.terminal = {
        outcome: "developer-selected-opportunities",
        reportId: report.id,
        briefIds: developerSelectedOpportunityBriefs.map((brief) => brief.id),
        artifactPaths,
        immutable: true,
        concludedAt: response.respondedAt,
      };
    }
  }
  const pendingResearchApprovalDecision = activeResearchApprovalDecision({
    researchApprovalDecisions,
    researchApprovalResponses,
  });
  let pendingDecision: PendingDecision | undefined =
    pendingResearchApprovalDecision;
  if (pendingResearchApprovalDecision !== undefined) {
    const pendingInformation = researchApprovalInformation.filter(
      (information) =>
        information.decisionId === pendingResearchApprovalDecision.id,
    );
    workView.pause = {
      reason: "pending-decision",
      pendingDecisionId: pendingResearchApprovalDecision.id,
      decisionType: "research-approval",
      requestedAction: pendingResearchApprovalDecision.request.action,
      resumable: true,
    };
    workView.completedWork.push(
      `Research Approval ${pendingResearchApprovalDecision.id} requested`,
    );
    if (pendingInformation.length > 0) {
      workView.completedWork.push(
        `${pendingInformation.length} Research Approval explanation${pendingInformation.length === 1 ? "" : "s"} recorded for ${pendingResearchApprovalDecision.id}`,
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
    const approvedResearchCanBeReserved =
      workView.phase !== "terminal" &&
      ["restricted", "paid", "restricted-and-paid"].includes(
        approval.scope.access,
      ) &&
      ![...reservations.values()].some(
        (reservation) => reservation.approvalId === approval.id,
      );
    workView.nextPermittedActions = [
      "verify-research-approval-scope-and-duration",
      ...(approvedResearchCanBeReserved
        ? ["reserve-approved-research"]
        : []),
      ...workView.nextPermittedActions,
    ];
  }
  for (const expenditure of researchExpenditures) {
    workView.completedWork.push(
      `Research Expenditure ${expenditure.id} recorded against approval ${expenditure.approvalId}`,
    );
  }
  const interruptedResearchDecision =
    interruptedApprovedResearchDecision(authoritativeHistory);
  if (
    pendingDecision === undefined &&
    interruptedResearchDecision !== undefined
  ) {
    pendingDecision = interruptedResearchDecision;
    workView.pause = {
      reason: "pending-decision",
      pendingDecisionId: pendingDecision.id,
      decisionType: "interrupted-approved-research",
      requestedAction: "record-completed-result-or-resolve-without-result",
      resumable: true,
    };
    workView.completedWork.push(
      `${interruptedResearchDecision.reservations.length} Approved Research reservation${interruptedResearchDecision.reservations.length === 1 ? "" : "s"} require interruption reconciliation`,
    );
    workView.nextPermittedActions = [
      "record-completed-approved-research",
      "respond-interrupted-research",
    ];
  }
  const unsettledReservations = [...reservations.values()].filter(
    (reservation) => !settledReservationIds.has(reservation.id),
  );
  if (unsettledReservations.length > 0) {
    if (workView.pause?.decisionType !== "interrupted-approved-research") {
      workView.nextPermittedActions = [
        ...new Set(
          unsettledReservations.map((reservation) => {
            const approval = researchApprovals.find(
              (candidate) => candidate.id === reservation.approvalId,
            );
            return approval !== undefined &&
              ["restricted", "paid", "restricted-and-paid"].includes(
                approval.scope.access,
              )
              ? "record-approved-research-observation"
              : "record-public-research-observation";
          }),
        ),
      ];
    }
  }
  const latestReevaluation = reevaluations.at(-1);
  if (latestReevaluation !== undefined) {
    const currentDecisionIds = new Set([
      breadthGates.at(-1)?.decision.id,
      ...(
        opportunityExclusionEvaluations.at(-1)?.assessments ?? []
      ).flatMap((assessment) =>
        exclusionGatesFor(assessment).map((gate) => gate.decision.id),
      ),
      opportunityQualificationEvaluations.at(-1)?.researchDecision.id,
      ...(
        opportunityQualificationEvaluations.at(-1)?.assessments ?? []
      ).flatMap((assessment) =>
        assessment.gates.map((gate) => gate.decision.id),
      ),
      opportunityComparisons.at(-1)?.decision.id,
      inconclusiveComparisonReports.at(-1)?.comparison.decision.id,
    ].filter((id): id is string => id !== undefined));
    const awaitsReplacementDecision =
      latestReevaluation.invalidatedDecisionIds.length === 0
        ? campaignDecisions.at(-1)?.id === latestReevaluation.decision.id
        : latestReevaluation.invalidatedDecisionIds.some((id) =>
            currentDecisionIds.has(id),
          );
    workView.completedWork.push(
      `Campaign re-evaluation ${latestReevaluation.id} recorded`,
    );
    workView.reevaluation = {
      id: latestReevaluation.id,
      kind: latestReevaluation.kind,
      intakeVersion: latestReevaluation.decision.intakeVersion,
      affectedOpportunityIds:
        latestReevaluation.decision.affectedOpportunityIds,
      invalidatedDecisionIds: latestReevaluation.invalidatedDecisionIds,
      supersededArtifactIds: latestReevaluation.supersededArtifactIds,
    };
    if (
      latestReevaluation.decision.outcome === "resume" &&
      (activeTerminalIds.size === 0 ||
        latestReevaluation.supersededArtifactIds.length > 0) &&
      awaitsReplacementDecision
    ) {
      if (
        latestReevaluation.supersededArtifactIds.length > 0
      ) {
        delete workView.terminal;
        delete workView.inconclusiveComparison;
      }
      workView.phase = workView.opportunities?.length
        ? "opportunity-deepening"
        : "campaign-intake-confirmed";
      workView.publicResearchAvailable = true;
      workView.nextPermittedActions = [
        "re-evaluate-affected-work",
        "reserve-public-research",
        "record-evidence-reasoning",
      ];
      workView.opportunities = workView.opportunities?.map((opportunity) =>
        latestReevaluation.decision.affectedOpportunityIds.includes(
          opportunity.id,
        )
          ? {
              ...opportunity,
              disposition: {
                status:
                  opportunity.disposition?.status === "rejected"
                    ? ("active" as const)
                    : ("unresolved" as const),
                decisionIds: [latestReevaluation.decision.id],
              },
              eligibility: "pending-qualification" as const,
              terminalRole: null,
            }
          : opportunity,
      );
    }
  }
  const supersededDecisionIds = new Set(
    reevaluations.flatMap((entry) => entry.invalidatedDecisionIds),
  );
  const unavailableFreshnessIds = invalidatedEvidenceIds({
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
  const activeDecisions = campaignDecisions.filter(
    (decision) => !supersededDecisionIds.has(decision.id),
  );
  const staleDecisionLinks = sourceFreshnesses.flatMap((freshness) => {
    if (
      freshness.refreshAfter === undefined ||
      freshness.refreshAfter === null ||
      freshness.refreshAfter > workViewAsOf ||
      unavailableFreshnessIds.has(freshness.id)
    ) {
      return [];
    }
    const affectedDecisionIds = activeDecisions
      .filter((decision) => {
        const evidenceIds = campaignDecisionEvidenceIds(decision);
        return (
          evidenceIds.includes(freshness.id) ||
          supportingObservationIds(authoritativeHistory, evidenceIds).has(
            freshness.observationId,
          )
        );
      })
      .map((decision) => decision.id);
    return affectedDecisionIds.length === 0
      ? []
      : [{ freshness, affectedDecisionIds }];
  });
  if (staleDecisionLinks.length > 0 && workView.phase !== "terminal") {
    workView.evidenceRefresh = {
      freshnessIds: staleDecisionLinks.map(({ freshness }) => freshness.id),
      observationIds: [
        ...new Set(
          staleDecisionLinks.map(({ freshness }) => freshness.observationId),
        ),
      ],
      affectedDecisionIds: [
        ...new Set(
          staleDecisionLinks.flatMap(({ affectedDecisionIds }) =>
            affectedDecisionIds,
          ),
        ),
      ],
    };
    workView.nextPermittedActions = [
      "refresh-time-sensitive-evidence",
      ...workView.nextPermittedActions.filter(
        (action) => action !== "refresh-time-sensitive-evidence",
      ),
    ];
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
  const activeResearchExtension = latestInconclusiveResearchExtension({
    inconclusiveComparisonResponses,
  });
  const budgetReservations = [...reservations.values()].filter(
    (reservation) =>
      activeResearchExtension === undefined ||
      authoritativeHistory.reservationRecordedAt.get(reservation.id)! >=
        activeResearchExtension.respondedAt,
  );
  const budgetExpenditures = researchExpenditures.filter(
    (expenditure) =>
      activeResearchExtension === undefined ||
      expenditure.incurredAt >= activeResearchExtension.respondedAt,
  );
  const reservedPaidSpendAmount = budgetReservations
    .filter(
      (reservation) =>
        !settledReservationIds.has(reservation.id) &&
        reservation.approvalId !== undefined,
    )
    .reduce((total, reservation) => {
      const approval = researchApprovals.find(
        (candidate) => candidate.id === reservation.approvalId,
      );
      if (
        approval === undefined ||
        !["paid", "restricted-and-paid"].includes(approval.scope.access)
      ) {
        return total;
      }
      const recordedForApproval = budgetExpenditures
        .filter((expenditure) => expenditure.approvalId === approval.id)
        .reduce((subtotal, expenditure) => subtotal + expenditure.amount, 0);
      return (
        total +
        Math.max(0, approval.scope.maximumCost.amount - recordedForApproval)
      );
    }, 0);
  const recordedPaidSpendAmount = budgetExpenditures.reduce(
    (total, expenditure) => total + expenditure.amount,
    0,
  );
  const researchBudget: ResearchBudgetView | undefined =
    intake === undefined
      ? undefined
      : {
          sourceCap: intake.researchBudget.sourceCap,
          adversarialSourceReserve: intake.researchBudget.adversarialSourceReserve,
          ordinarySourceCap:
            intake.researchBudget.sourceCap -
            intake.researchBudget.adversarialSourceReserve,
          reservedSourceUnits: budgetReservations.reduce(
            (total, reservation) =>
              total +
              (settledReservationIds.has(reservation.id)
                ? 0
                : reservation.sourceUnits),
            0,
          ),
          settledSourceUnits: budgetReservations.reduce(
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
            budgetReservations
              .filter(
                (reservation) => reservation.researchClass !== "adversarial",
              )
              .reduce(
                (total, reservation) => total + reservation.sourceUnits,
                0,
              ),
          remainingAdversarialSourceUnits:
            intake.researchBudget.adversarialSourceReserve -
            budgetReservations.filter(
              (reservation) => reservation.researchClass === "adversarial",
            ).length,
          ...(budgetExpenditures.length === 0 && reservedPaidSpendAmount === 0
            ? {}
            : {
                paidSpendCap: intake.researchBudget.paidSpendCap,
                recordedPaidSpend: {
                  amount: recordedPaidSpendAmount,
                  currency: intake.researchBudget.paidSpendCap.currency,
                },
                ...(reservedPaidSpendAmount === 0
                  ? {}
                  : {
                      reservedPaidSpend: {
                        amount: reservedPaidSpendAmount,
                        currency: intake.researchBudget.paidSpendCap.currency,
                      },
                    }),
                remainingPaidSpend: {
                  amount:
                    intake.researchBudget.paidSpendCap.amount -
                    recordedPaidSpendAmount -
                    reservedPaidSpendAmount,
                  currency: intake.researchBudget.paidSpendCap.currency,
                },
              }),
        };
  return {
    authoritativeHistory,
    campaign: {
      id: manifest.campaignId,
      path: resolvedPath,
      versions: manifest.versions,
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
    ...(currentNoQualifyingOpportunityReport === undefined
      ? {}
      : {
          noQualifyingOpportunityReport: currentNoQualifyingOpportunityReport,
        }),
    ...(currentOpportunityBrief === undefined
      ? {}
      : {
          opportunityComparison: currentOpportunityComparison,
          opportunityBrief: currentOpportunityBrief,
        }),
    ...(currentInconclusiveComparisonReport === undefined
      ? {}
      : {
          inconclusiveComparisonReport: currentInconclusiveComparisonReport,
        }),
    ...(developerSelectedOpportunityBriefs.length === 0
      ? {}
      : { opportunityBriefs: developerSelectedOpportunityBriefs }),
    ...(latestReevaluation === undefined
      ? {}
      : {
          reevaluation: latestReevaluation,
          intakeRevision: latestReevaluation.intakeRevision,
        }),
  };
}

export async function rebuildCampaignFromAuthority(
  campaignPath: string,
  expectedContracts: Record<string, string> = contracts,
) {
  try {
    return await rebuildCampaignFromAuthorityUnchecked(
      campaignPath,
      expectedContracts,
    );
  } catch (error) {
    if (
      error instanceof CampaignAuthorityError ||
      error instanceof NewerCampaignContractsError
    ) {
      throw error;
    }
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT" &&
      error.message.includes("records.jsonl")
    ) {
      throw new CampaignAuthorityError("missing", "records.jsonl was not found.");
    }
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT" &&
      error.message.includes("manifest.json")
    ) {
      throw error;
    }
    throw new CampaignAuthorityError(
      "damaged",
      error instanceof Error ? error.message : "unknown validation error",
    );
  }
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
  if (
    rebuiltCampaign.authoritativeHistory.noQualifyingOpportunityReports.length ===
      0 &&
    (await pathExists(
      path.join(
        rebuiltCampaign.campaign.path,
        "no-qualifying-opportunity-report.md",
      ),
    ))
  ) {
    throw new Error(
      "No Qualifying Opportunity Report has no authoritative terminal record",
    );
  }
  for (const report of rebuiltCampaign.authoritativeHistory
    .noQualifyingOpportunityReports) {
    injectPersistenceFault("during-terminal-rendering");
    const reportPath = path.join(
      rebuiltCampaign.campaign.path,
      noQualifyingOpportunityArtifactPath(report),
    );
    if (
      (await readFile(reportPath, "utf8")) !==
      renderNoQualifyingOpportunityReport(report)
    ) {
      throw new Error(
        "No Qualifying Opportunity Report does not match authoritative history",
      );
    }
  }
  if (
    rebuiltCampaign.authoritativeHistory.opportunityBriefs.length === 0 &&
    (await pathExists(
      path.join(rebuiltCampaign.campaign.path, "opportunity-brief.md"),
    ))
  ) {
    throw new Error("Opportunity Brief has no authoritative terminal record");
  }
  for (const brief of rebuiltCampaign.authoritativeHistory.opportunityBriefs) {
    injectPersistenceFault("during-terminal-rendering");
    const briefPath = path.join(
      rebuiltCampaign.campaign.path,
      opportunityBriefArtifactPath(brief),
    );
    if ((await readFile(briefPath, "utf8")) !== renderOpportunityBrief(brief)) {
      throw new Error("Opportunity Brief does not match authoritative history");
    }
  }
  if (
    rebuiltCampaign.authoritativeHistory.inconclusiveComparisonReports.length ===
      0 &&
    (await pathExists(
      path.join(
        rebuiltCampaign.campaign.path,
        "inconclusive-comparison-report.md",
      ),
    ))
  ) {
    throw new Error(
      "Inconclusive Comparison Report has no authoritative record",
    );
  }
  for (const report of rebuiltCampaign.authoritativeHistory
    .inconclusiveComparisonReports) {
    injectPersistenceFault("during-terminal-rendering");
    const reportPath = path.join(
      rebuiltCampaign.campaign.path,
      inconclusiveComparisonArtifactPath(report),
    );
    if (
      (await readFile(reportPath, "utf8")) !==
      renderInconclusiveComparisonReport(report)
    ) {
      throw new Error(
        "Inconclusive Comparison Report does not match authoritative history",
      );
    }
  }
  for (const brief of rebuiltCampaign.opportunityBriefs ?? []) {
    injectPersistenceFault("during-terminal-rendering");
    const briefPath = path.join(
      rebuiltCampaign.campaign.path,
      brief.wayfinderHandoff.briefPath,
    );
    if (
      (await readFile(briefPath, "utf8")) !== renderOpportunityBrief(brief)
    ) {
      throw new Error(
        "Developer-Selected Opportunity Brief does not match authoritative history",
      );
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
    ...(rebuiltCampaign.noQualifyingOpportunityReport === undefined
      ? {}
      : {
          noQualifyingOpportunityReport:
            rebuiltCampaign.noQualifyingOpportunityReport,
        }),
    ...(rebuiltCampaign.opportunityBrief === undefined
      ? {}
      : {
          opportunityComparison: rebuiltCampaign.opportunityComparison,
          opportunityBrief: rebuiltCampaign.opportunityBrief,
        }),
    ...(rebuiltCampaign.inconclusiveComparisonReport === undefined
      ? {}
      : {
          inconclusiveComparisonReport:
            rebuiltCampaign.inconclusiveComparisonReport,
        }),
    ...(rebuiltCampaign.opportunityBriefs === undefined
      ? {}
      : { opportunityBriefs: rebuiltCampaign.opportunityBriefs }),
    ...(rebuiltCampaign.reevaluation === undefined
      ? {}
      : {
          reevaluation: rebuiltCampaign.reevaluation,
          intakeRevision: rebuiltCampaign.intakeRevision,
        }),
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
  injectPersistenceFault("after-work-view-projection");
  await replacePrivateJson(
    path.join(campaignPath, "lease.json"),
    rebuiltCampaign.lease,
  );
  injectPersistenceFault("after-lease-projection");
  await replacePrivateJson(
    path.join(
      campaignPath,
      "checkpoints",
      `${String(rebuiltCampaign.validation.checkpointSequence).padStart(12, "0")}.json`,
    ),
    rebuiltCampaign.checkpoint,
  );
  injectPersistenceFault("after-checkpoint");
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
    injectPersistenceFault("after-research-budget-projection");
    await replacePrivateJson(
      path.join(campaignPath, "evidence-ledger.json"),
      rebuiltCampaign.evidenceLedger,
    );
  }
  for (const report of rebuiltCampaign.authoritativeHistory
    .noQualifyingOpportunityReports) {
    await replacePrivateText(
      path.join(campaignPath, noQualifyingOpportunityArtifactPath(report)),
      renderNoQualifyingOpportunityReport(report),
    );
  }
  for (const brief of rebuiltCampaign.authoritativeHistory.opportunityBriefs) {
    await replacePrivateText(
      path.join(campaignPath, opportunityBriefArtifactPath(brief)),
      renderOpportunityBrief(brief),
    );
  }
  for (const report of rebuiltCampaign.authoritativeHistory
    .inconclusiveComparisonReports) {
    await replacePrivateText(
      path.join(campaignPath, inconclusiveComparisonArtifactPath(report)),
      renderInconclusiveComparisonReport(report),
    );
  }
  for (const brief of rebuiltCampaign.opportunityBriefs ?? []) {
    await replacePrivateText(
      path.join(campaignPath, brief.wayfinderHandoff.briefPath),
      renderOpportunityBrief(brief),
    );
  }
}

export type CampaignRecovery = {
  recoveredOperations: RecoveredOperation[];
  projectionsRegenerated: boolean;
};

export async function recoverCampaign(campaignPath: string): Promise<{
  rebuiltCampaign: Awaited<ReturnType<typeof rebuildCampaignFromAuthority>>;
  recovery: CampaignRecovery;
}> {
  const interrupted = await recoverInterruptedOperations(campaignPath);
  const rebuiltCampaign = await rebuildCampaignFromAuthority(campaignPath);
  let projectionsRegenerated = interrupted.some(
    (entry) => entry.authoritativeRecordsChanged,
  );
  try {
    await loadCampaign(campaignPath);
  } catch {
    await persistDerivedCampaignState(campaignPath, rebuiltCampaign);
    await loadCampaign(campaignPath);
    projectionsRegenerated = true;
  }
  for (const operation of interrupted) {
    await completeOperationRecovery(operation);
  }
  return {
    rebuiltCampaign,
    recovery: {
      recoveredOperations: interrupted.map((entry) => entry.operation),
      projectionsRegenerated,
    },
  };
}

export async function appendCampaignRecordsAndPersist(
  campaignPath: string,
  records: Record<string, unknown>[],
) {
  const journalPath = await stageOperationIntent(campaignPath, records);
  injectPersistenceFault("after-operation-intent");
  const committedOperation = await commitStagedOperation(
    campaignPath,
    journalPath,
  );
  injectPersistenceFault("after-authoritative-commit");
  const updatedCampaign = await rebuildCampaignFromAuthority(campaignPath);
  await persistDerivedCampaignState(campaignPath, updatedCampaign);
  const campaign = await loadCampaign(campaignPath);
  await completeOperationRecovery(committedOperation);
  return campaign;
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
    const authorityFailure = campaignAuthorityFailure(error);
    return {
      envelopeVersion: contracts.commandEnvelope,
      requestId: command.requestId,
      command: command.command,
      ok: false as const,
      error:
        authorityFailure ??
        {
          code: "SVS-CAMPAIGN-INVALID",
          message: "Scouting Campaign could not be located and validated.",
          action:
            "Check the explicit Campaign path and preserve its contents for recovery; do not continue the Campaign.",
          details: [
            error instanceof Error ? error.message : "unknown validation error",
          ],
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
