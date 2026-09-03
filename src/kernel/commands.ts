import { chmod, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import contracts from "../../release/contracts.json" with { type: "json" };
import type {
  CreateCampaignCommand,
  ResumeCampaignCommand,
  ConfirmedCampaignIntake,
  ConfirmCampaignIntakeCommand,
  ReservePublicResearchCommand,
  PublicSource,
  PublicObservation,
  RecordPublicResearchObservationCommand,
  RecordEvidenceReasoningCommand,
  RecordDiscoveryTrancheCommand,
  RecordOpportunityExclusionGatesCommand,
  RecordOpportunityQualificationGatesCommand,
  ConcludeNoQualifyingOpportunityCommand,
  ConcludeLeadingOpportunityCommand,
  RecordOpportunityFormationCommand,
  PassBreadthGateCommand,
  RequestResearchApprovalCommand,
  RecordResearchApprovalInformationCommand,
  RespondResearchApprovalCommand,
  RecordResearchExpenditureCommand,
  CoordinatorLease,
} from "./types.js";
import { isIsoInstant, isRecord } from "./validation.js";
import {
  acquireCoordinatorOperationLock,
  applyReasoningEntries,
  appendCampaignRecordsAndPersist,
  authoritativeOperationDescriptors,
  breadthGateRecords,
  breadthGateViolation,
  campaignIntakeRecords,
  campaignOperationRecords,
  discoveryTrancheRecords,
  discoveryTrancheViolation,
  evidenceReasoningRecords,
  hasCampaignManifest,
  initialWorkView,
  loadCampaign,
  locateCampaign,
  opportunityExclusionEvaluationViolation,
  opportunityExclusionGateRecords,
  opportunityQualificationEvaluationViolation,
  opportunityQualificationGateRecords,
  noQualifyingOpportunityRecords,
  noQualifyingOpportunityViolation,
  leadingOpportunityRecords,
  leadingOpportunityViolation,
  opportunityFormationRecords,
  opportunityFormationViolation,
  opportunityDeepeningViolation,
  pathExists,
  persistDerivedCampaignState,
  publicResearchObservationRecords,
  publicResearchAllocationViolation,
  researchDecisionValueViolation,
  publicResearchApprovalScopeMismatch,
  publicResearchReservationRecords,
  readCampaignRecords,
  rebuildCampaignFromAuthority,
  researchApprovalInformationRecords,
  researchApprovalRequestRecords,
  researchApprovalResponseRecords,
  researchExpenditureRecords,
  releaseCoordinatorOperationLock,
  researchExpenditurePolicyViolation,
  writePrivateJson,
  elevatedRiskApprovalRequestViolation,
  adversarialResearchViolation,
} from "./authority.js";
import type { CoordinatorOperationLock } from "./authority.js";

export type CoordinatorCommand =
  | ResumeCampaignCommand
  | ConfirmCampaignIntakeCommand
  | ReservePublicResearchCommand
  | RecordPublicResearchObservationCommand
  | RecordEvidenceReasoningCommand
  | RecordDiscoveryTrancheCommand
  | RecordOpportunityFormationCommand
  | PassBreadthGateCommand
  | RecordOpportunityExclusionGatesCommand
  | RecordOpportunityQualificationGatesCommand
  | ConcludeNoQualifyingOpportunityCommand
  | ConcludeLeadingOpportunityCommand
  | RequestResearchApprovalCommand
  | RecordResearchApprovalInformationCommand
  | RespondResearchApprovalCommand
  | RecordResearchExpenditureCommand;

export type CoordinatorOperationFailure = {
  code: string;
  message: string;
  action: string;
  details?: string[];
};

export type RebuiltCampaign = Awaited<ReturnType<typeof rebuildCampaignFromAuthority>>;
export type LoadedCampaign = Awaited<ReturnType<typeof loadCampaign>>;

export type CoordinatorOperationContext<Command extends CoordinatorCommand> = {
  command: Command;
  currentTime: string;
  campaignPath: string;
  rebuiltCampaign: RebuiltCampaign;
  before?: LoadedCampaign;
};

export type CoordinatorOperationDescriptor<
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

export function coordinatorOperationSuccess<
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

export function coordinatorOperationFailure(
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

export async function runCoordinatorOperation<
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

    if (
      rebuiltCampaign.authoritativeHistory.noQualifyingOpportunityReports.length >
        0 ||
      rebuiltCampaign.authoritativeHistory.opportunityBriefs.length > 0
    ) {
      return coordinatorOperationFailure(command, {
        code: "SVS-CAMPAIGN-TERMINAL",
        message:
          "The Scouting Campaign has an immutable terminal record.",
        action:
          "Inspect or explain the terminal report; begin a separately authorised continuation rather than mutating this Campaign.",
      });
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

export async function resumeCampaign(command: ResumeCampaignCommand, currentTime: string) {
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
export async function confirmCampaignIntake(
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
export async function reservePublicResearch(
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
        command.payload.reservation.researchClass === "adversarial" &&
        campaign.researchBudget!.remainingAdversarialSourceUnits <
          command.payload.reservation.sourceUnits
      ) {
        return {
          code: "SVS-ADVERSARIAL-RESEARCH-BUDGET-EXHAUSTED",
          message:
            "The protected adversarial Source reserve has no unreserved capacity.",
          action:
            "Do not retrieve another adversarial Source; complete the reserved challenge and compare the Eligible Opportunities.",
        };
      }
      if (
        command.payload.reservation.researchClass !== "adversarial" &&
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
      if (command.payload.reservation.researchClass === "adversarial") {
        const adversarialViolation = adversarialResearchViolation(
          rebuiltCampaign.authoritativeHistory,
          command.payload.reservation,
          command.payload.reservedAt,
        );
        if (adversarialViolation !== undefined) {
          return {
            code:
              adversarialViolation === "qualification-required"
                ? "SVS-ADVERSARIAL-RESEARCH-NOT-AVAILABLE"
                : "SVS-OPPORTUNITY-INELIGIBLE",
            message:
              "Adversarial research requires a named Eligible Opportunity after qualification completes.",
            action:
              "Finish Qualification Gates, then reserve the protected capacity against the apparent leader.",
          };
        }
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
            deepeningViolation === "gates-required"
              ? "SVS-OPPORTUNITY-EXCLUSION-GATES-REQUIRED"
              : deepeningViolation === "ineligible"
              ? "SVS-OPPORTUNITY-INELIGIBLE"
              : deepeningViolation === "required"
              ? "SVS-ELEVATED-RISK-APPROVAL-REQUIRED"
              : "SVS-ELEVATED-RISK-APPROVAL-SCOPE-MISMATCH",
          message:
            deepeningViolation === "gates-required"
              ? "Deep research requires recorded Opportunity Exclusion Gates."
              : deepeningViolation === "ineligible"
              ? "Deep research requires a named Opportunity with every current Exclusion Gate passed."
              : deepeningViolation === "required"
              ? "Deep research for an Elevated-Risk Market requires Opportunity-specific Research Approval."
              : "The Research Approval does not match this Opportunity, purpose, depth, or time.",
          action:
            deepeningViolation === "gates-required"
              ? "Record every formed Opportunity's market-safety and Hard Constraint Exclusion Gates before reserving deep research."
              : "Keep the Opportunity unresolved and ineligible; request explicit scoped approval or continue only shallow classification and independent permitted work.",
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
      const decisionValueViolation = researchDecisionValueViolation(
        rebuiltCampaign.authoritativeHistory,
        command.payload.reservation,
      );
      if (decisionValueViolation !== undefined) {
        return {
          code:
            decisionValueViolation === "required"
              ? "SVS-RESEARCH-DECISION-VALUE-REQUIRED"
              : decisionValueViolation === "scope"
                ? "SVS-RESEARCH-DECISION-VALUE-SCOPE-MISMATCH"
                : "SVS-QUALIFICATION-RESEARCH-STOPPED",
          message:
            decisionValueViolation === "required"
              ? "Qualification research must name a current positive Decision Value priority."
              : decisionValueViolation === "scope"
                ? "The research reservation does not match a current Decision Value priority for this Opportunity."
                : "The latest qualification-related Campaign Decision stopped further research.",
          action:
            decisionValueViolation === "stopped"
              ? "Do not reserve more research; follow the latest terminal or comparison action."
              : "Use one current Decision Value priority and keep the reservation within its target Opportunity and research allocation.",
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

export async function requestResearchApproval(
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

export async function recordResearchApprovalInformation(
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

export async function respondResearchApproval(
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

export async function recordResearchExpenditure(
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
export async function recordPublicResearchObservation(
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

export async function recordEvidenceReasoning(
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

export async function recordDiscoveryTranche(
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

export async function recordOpportunityFormation(
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

export async function passBreadthGate(
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

export async function recordOpportunityExclusionGates(
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
              "Complete formation and the Breadth Gate before recording Opportunity Exclusion Gates.",
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

export async function recordOpportunityQualificationGates(
  command: RecordOpportunityQualificationGatesCommand,
  currentTime: string,
) {
  const result = (recorded: boolean, campaign: LoadedCampaign) => ({
    recorded,
    evaluation: command.payload.evaluation,
    workView: campaign.workView,
    evidenceLedger: campaign.evidenceLedger,
  });
  return runCoordinatorOperation(command, currentTime, {
    async locateCampaign(command) {
      return path.resolve(command.payload.campaignPath);
    },
    lockedAction:
      "Do not record Opportunity Qualification Gates concurrently; retry after the active operation finishes.",
    requestConflict: {
      code: "SVS-CAMPAIGN-REQUEST-CONFLICT",
      message:
        "Opportunity Qualification Gate request identity was already used with different input.",
      action:
        "Reuse the original request payload or provide a new stable request identity.",
    },
    invalidCampaign: {
      code: "SVS-CAMPAIGN-INVALID",
      message:
        "Opportunity Qualification Gates could not be recorded against valid authoritative Campaign history.",
      action:
        "Preserve the Campaign contents and inspect its Work View before retrying.",
    },
    loadBeforeValidation: true,
    isReplay({ rebuiltCampaign }) {
      return rebuiltCampaign.records.some(
        (record) =>
          isRecord(record) &&
          record.type ===
            authoritativeOperationDescriptors[
              "record-opportunity-qualification-gates"
            ].outcome &&
          record.requestId === command.requestId &&
          JSON.stringify(record.evaluation) ===
            JSON.stringify(command.payload.evaluation),
      );
    },
    replayResult(_command, campaign) {
      return result(false, campaign);
    },
    validateBeforeLease({ rebuiltCampaign }) {
      return rebuiltCampaign.authoritativeHistory.opportunityExclusionEvaluations
        .length === 0
        ? {
            code: "SVS-OPPORTUNITY-QUALIFICATION-GATES-NOT-AVAILABLE",
            message:
              "Opportunity Qualification Gates require recorded Opportunity Exclusion Gates.",
            action:
              "Complete every Exclusion Gate before recording Qualification Gate decisions.",
          }
        : undefined;
    },
    lease: {
      mode: "active",
      failure() {
        return {
          code: "SVS-CAMPAIGN-LEASE-NOT-HELD",
          message:
            "Opportunity Qualification Gates require the active coordinator lease.",
          action:
            "Resume the Scouting Campaign with this coordinator before recording gate decisions.",
        };
      },
    },
    validateAfterLease({ rebuiltCampaign }) {
      const violation = opportunityQualificationEvaluationViolation(
        rebuiltCampaign.authoritativeHistory,
        command.payload.evaluation,
      );
      return violation === undefined
        ? undefined
        : {
            code: "SVS-OPPORTUNITY-QUALIFICATION-GATE-INVARIANT-VIOLATION",
            message: `Opportunity Qualification Gates violate a campaign invariant: ${violation}.`,
            action:
              "Assess every surviving Opportunity against the complete Qualification Gate contract using traceable affirmative evidence or an explicit unresolved state.",
          };
    },
    records({ before }) {
      return opportunityQualificationGateRecords(
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

export async function concludeNoQualifyingOpportunity(
  command: ConcludeNoQualifyingOpportunityCommand,
  currentTime: string,
) {
  const result = (completed: boolean, campaign: LoadedCampaign) => ({
    completed,
    terminalOutcome: "no-qualifying-opportunity" as const,
    report: campaign.noQualifyingOpportunityReport,
    artifact: {
      path: path.join(
        campaign.campaign.path,
        "no-qualifying-opportunity-report.md",
      ),
      format: "markdown" as const,
      immutable: true as const,
    },
    workView: campaign.workView,
  });
  return runCoordinatorOperation(command, currentTime, {
    async locateCampaign(command) {
      return path.resolve(command.payload.campaignPath);
    },
    lockedAction:
      "Do not conclude the Scouting Campaign concurrently; retry after the active operation finishes.",
    requestConflict: {
      code: "SVS-CAMPAIGN-REQUEST-CONFLICT",
      message:
        "No Qualifying Opportunity request identity was already used with different input.",
      action:
        "Reuse the original request payload or provide a new stable request identity.",
    },
    invalidCampaign: {
      code: "SVS-CAMPAIGN-INVALID",
      message:
        "No Qualifying Opportunity could not be concluded against valid authoritative Campaign history.",
      action:
        "Preserve the Campaign contents and inspect its Work View before retrying.",
    },
    loadBeforeValidation: true,
    isReplay({ rebuiltCampaign }) {
      return rebuiltCampaign.records.some(
        (record) =>
          isRecord(record) &&
          record.type ===
            authoritativeOperationDescriptors[
              "conclude-no-qualifying-opportunity"
            ].outcome &&
          record.requestId === command.requestId &&
          isRecord(record.report) &&
          record.report.id === command.payload.reportId &&
          JSON.stringify(record.report.continuationConditions) ===
            JSON.stringify(command.payload.continuationConditions),
      );
    },
    replayResult(_command, campaign) {
      return result(false, campaign);
    },
    validateBeforeLease({ rebuiltCampaign }) {
      const violation = noQualifyingOpportunityViolation(
        rebuiltCampaign.authoritativeHistory,
        command.payload.reportId,
        command.payload.concludedAt,
        command.payload.continuationConditions,
      );
      return violation === undefined
        ? undefined
        : {
            code: "SVS-NO-QUALIFYING-OPPORTUNITY-NOT-AVAILABLE",
            message: `No Qualifying Opportunity violates a campaign invariant: ${violation}.`,
            action:
              "Finish every surviving Opportunity's Qualification Gates and exhaust permitted positive-Decision-Value research before concluding.",
          };
    },
    lease: {
      mode: "active",
      failure() {
        return {
          code: "SVS-CAMPAIGN-LEASE-NOT-HELD",
          message:
            "No Qualifying Opportunity conclusion requires the active coordinator lease.",
          action:
            "Resume the Scouting Campaign with this coordinator before terminalizing it.",
        };
      },
    },
    records({ rebuiltCampaign }) {
      return noQualifyingOpportunityRecords(
        rebuiltCampaign.authoritativeHistory,
        command,
        rebuiltCampaign.records.length + 1,
      );
    },
    successResult(_command, campaign) {
      return result(true, campaign);
    },
  });
}

export async function concludeLeadingOpportunity(
  command: ConcludeLeadingOpportunityCommand,
  currentTime: string,
) {
  const result = (completed: boolean, campaign: LoadedCampaign) => ({
    completed,
    terminalOutcome: "leading-opportunity" as const,
    comparison: campaign.opportunityComparison,
    brief: campaign.opportunityBrief,
    artifact: {
      path: path.join(campaign.campaign.path, "opportunity-brief.md"),
      format: "markdown" as const,
      immutable: true as const,
    },
    workView: campaign.workView,
  });
  return runCoordinatorOperation(command, currentTime, {
    async locateCampaign(command) {
      return path.resolve(command.payload.campaignPath);
    },
    lockedAction:
      "Do not conclude the Leading Opportunity concurrently; retry after the active operation finishes.",
    requestConflict: {
      code: "SVS-CAMPAIGN-REQUEST-CONFLICT",
      message:
        "Leading Opportunity request identity was already used with different input.",
      action: "Reuse the original request payload or provide a new stable request identity.",
    },
    invalidCampaign: {
      code: "SVS-CAMPAIGN-INVALID",
      message:
        "Leading Opportunity could not be concluded against valid authoritative Campaign history.",
      action: "Preserve the Campaign contents and inspect its Work View before retrying.",
    },
    loadBeforeValidation: true,
    isReplay({ rebuiltCampaign }) {
      return rebuiltCampaign.records.some(
        (record) =>
          isRecord(record) &&
          record.type ===
            authoritativeOperationDescriptors["conclude-leading-opportunity"].outcome &&
          record.requestId === command.requestId &&
          isRecord(record.comparison) &&
          isRecord(record.brief) &&
          JSON.stringify(record.comparison) ===
            JSON.stringify(command.payload.comparison) &&
          JSON.stringify({
            id: record.brief.id,
            buyerEconomics: record.brief.buyerEconomics,
            customerAccess: record.brief.customerAccess,
            alternatives: record.brief.alternatives,
            risks: record.brief.risks,
            valueHypothesis: record.brief.valueHypothesis,
          }) === JSON.stringify(command.payload.brief),
      );
    },
    replayResult(_command, campaign) {
      return result(false, campaign);
    },
    validateBeforeLease({ rebuiltCampaign }) {
      const violation = leadingOpportunityViolation(
        rebuiltCampaign.authoritativeHistory,
        command.payload.comparison,
        command.payload.concludedAt,
        command.payload.brief,
      );
      return violation === undefined
        ? undefined
        : {
            code: "SVS-LEADING-OPPORTUNITY-NOT-DEFENSIBLE",
            message: `Leading Opportunity violates a campaign invariant: ${violation}.`,
            action:
              "Preserve every Eligible Non-Dominated Opportunity, complete the reserved adversarial challenge, and recommend only a robust evidence-backed stand-out.",
          };
    },
    lease: {
      mode: "active",
      failure() {
        return {
          code: "SVS-CAMPAIGN-LEASE-NOT-HELD",
          message: "Leading Opportunity conclusion requires the active coordinator lease.",
          action: "Resume the Scouting Campaign with this coordinator before concluding it.",
        };
      },
    },
    records({ rebuiltCampaign }) {
      return leadingOpportunityRecords(
        rebuiltCampaign.authoritativeHistory,
        command,
        rebuiltCampaign.records.length + 1,
      );
    },
    successResult(_command, campaign) {
      return result(true, campaign);
    },
  });
}

export async function createCampaign(command: CreateCampaignCommand) {
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
        noQualifyingOpportunityReport:
          "no-qualifying-opportunity-report.md",
        opportunityBrief: "opportunity-brief.md",
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
