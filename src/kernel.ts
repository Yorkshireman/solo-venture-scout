import { mkdtemp, rm } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import contracts from "../release/contracts.json" with { type: "json" };
const supportedNodeMajor = 24;
import type {
  PreflightCommand,
  CreateCampaignCommand,
  InspectCampaignCommand,
  InspectEvidenceCommand,
  ResumeCampaignCommand,
  ConfirmCampaignIntakeCommand,
  ReservePublicResearchCommand,
  ReserveApprovedResearchCommand,
  RecordPublicResearchObservationCommand,
  RecordApprovedResearchObservationCommand,
  RecordEvidenceReasoningCommand,
  RecordDiscoveryTrancheCommand,
  RecordOpportunityExclusionGatesCommand,
  RecordOpportunityQualificationGatesCommand,
  ConcludeNoQualifyingOpportunityCommand,
  ConcludeLeadingOpportunityCommand,
  ConcludeInconclusiveComparisonCommand,
  RespondInconclusiveComparisonCommand,
  RecordOpportunityFormationCommand,
  PassBreadthGateCommand,
  RequestResearchApprovalCommand,
  RecordResearchApprovalInformationCommand,
  RespondResearchApprovalCommand,
  RespondInterruptedResearchCommand,
  RecordResearchExpenditureCommand,
  ReevaluateCampaignCommand,
} from "./kernel/types.js";
import {
  validateConfirmCampaignIntakeFields,
  validateCreateCampaignFields,
  validateInspectCampaignFields,
  validateInspectEvidenceFields,
  validatePassBreadthGateFields,
  validatePreflightFields,
  validateRecordDiscoveryTrancheFields,
  validateRecordEvidenceReasoningFields,
  validateRecordOpportunityExclusionGatesFields,
  validateRecordOpportunityQualificationGatesFields,
  validateConcludeNoQualifyingOpportunityFields,
  validateConcludeLeadingOpportunityFields,
  validateConcludeInconclusiveComparisonFields,
  validateRespondInconclusiveComparisonFields,
  validateRecordOpportunityFormationFields,
  validateRecordPublicResearchObservationFields,
  validateRecordApprovedResearchObservationFields,
  validateRecordResearchApprovalInformationFields,
  validateRecordResearchExpenditureFields,
  validateRequestResearchApprovalFields,
  validateReservePublicResearchFields,
  validateReserveApprovedResearchFields,
  validateRespondResearchApprovalFields,
  validateRespondInterruptedResearchFields,
  validateReevaluateCampaignFields,
  validateResumeCampaignFields,
  isRecord,
} from "./kernel/validation.js";
import {
  confirmCampaignIntake,
  createCampaign,
  passBreadthGate,
  recordDiscoveryTranche,
  recordEvidenceReasoning,
  recordOpportunityExclusionGates,
  recordOpportunityQualificationGates,
  concludeNoQualifyingOpportunity,
  concludeLeadingOpportunity,
  concludeInconclusiveComparison,
  respondInconclusiveComparison,
  recordOpportunityFormation,
  recordPublicResearchObservation,
  recordApprovedResearchObservation,
  recordResearchApprovalInformation,
  recordResearchExpenditure,
  requestResearchApproval,
  reevaluateCampaign,
  reservePublicResearch,
  reserveApprovedResearch,
  respondResearchApproval,
  respondInterruptedResearch,
  resumeCampaign,
} from "./kernel/commands.js";
import { inspectCampaign, inspectEvidence } from "./kernel/authority.js";

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
      "reserveApprovedResearch",
      "recordPublicResearchObservation",
      "recordApprovedResearchObservation",
      "recordEvidenceReasoning",
      "recordDiscoveryTranche",
      "recordOpportunityFormation",
      "passBreadthGate",
      "recordOpportunityExclusionGates",
      "recordOpportunityQualificationGates",
      "concludeNoQualifyingOpportunity",
      "concludeLeadingOpportunity",
      "concludeInconclusiveComparison",
      "respondInconclusiveComparison",
      "reevaluateCampaign",
      "requestResearchApproval",
      "recordResearchApprovalInformation",
      "respondResearchApproval",
      "respondInterruptedResearch",
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
    return inspectCampaign(
      command as unknown as InspectCampaignCommand,
      effects.now?.() ?? new Date().toISOString(),
    );
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

  if (command.command === "reserveApprovedResearch") {
    const invalidFields = validateReserveApprovedResearchFields(command);
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
          code: "SVS-APPROVED-RESEARCH-INVALID",
          message: "Approved Research reservation is invalid.",
          action:
            "Correct the reported fields and reserve the exact approved scope before Source access.",
          details: invalidFields,
        },
      };
    }
    return reserveApprovedResearch(
      command as unknown as ReserveApprovedResearchCommand,
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

  if (command.command === "recordApprovedResearchObservation") {
    const invalidFields =
      validateRecordApprovedResearchObservationFields(command);
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
          code: "SVS-APPROVED-RESEARCH-INVALID",
          message: "Approved Research result is invalid.",
          action:
            "Correct the inert provenance and explicit charge resolution; do not repeat Source access or payment.",
          details: invalidFields,
        },
      };
    }
    return recordApprovedResearchObservation(
      command as unknown as RecordApprovedResearchObservationCommand,
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

  if (command.command === "recordOpportunityQualificationGates") {
    const invalidFields = validateRecordOpportunityQualificationGatesFields(command);
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
          code: "SVS-OPPORTUNITY-QUALIFICATION-GATES-INVALID",
          message: "Opportunity Qualification Gate evidence is invalid.",
          action:
            "Correct every Qualification Gate, commercial range, evidence basis, and research decision before retrying.",
          details: invalidFields,
        },
      };
    }
    return recordOpportunityQualificationGates(
      command as unknown as RecordOpportunityQualificationGatesCommand,
      effects.now?.() ?? new Date().toISOString(),
    );
  }

  if (command.command === "concludeNoQualifyingOpportunity") {
    const invalidFields = validateConcludeNoQualifyingOpportunityFields(command);
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
          code: "SVS-NO-QUALIFYING-OPPORTUNITY-INVALID",
          message: "No Qualifying Opportunity conclusion is invalid.",
          action:
            "Correct the report identity and traceable continuation conditions before retrying.",
          details: invalidFields,
        },
      };
    }
    return concludeNoQualifyingOpportunity(
      command as unknown as ConcludeNoQualifyingOpportunityCommand,
      effects.now?.() ?? new Date().toISOString(),
    );
  }

  if (command.command === "concludeLeadingOpportunity") {
    const invalidFields = validateConcludeLeadingOpportunityFields(command);
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
          code: "SVS-LEADING-OPPORTUNITY-INVALID",
          message: "Leading Opportunity comparison or Opportunity Brief input is invalid.",
          action:
            "Correct every unscored comparison dimension, dominance assessment, leader condition, adversarial result, and provisional handoff field before retrying.",
          details: invalidFields,
        },
      };
    }
    return concludeLeadingOpportunity(
      command as unknown as ConcludeLeadingOpportunityCommand,
      effects.now?.() ?? new Date().toISOString(),
    );
  }

  if (command.command === "concludeInconclusiveComparison") {
    const invalidFields = validateConcludeInconclusiveComparisonFields(command);
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
          code: "SVS-INCONCLUSIVE-COMPARISON-INVALID",
          message: "Inconclusive Opportunity comparison input is invalid.",
          action:
            "Correct the unscored profiles, decisive trade-offs, explicit contender blockers, and Campaign Decision before retrying.",
          details: invalidFields,
        },
      };
    }
    return concludeInconclusiveComparison(
      command as unknown as ConcludeInconclusiveComparisonCommand,
      effects.now?.() ?? new Date().toISOString(),
    );
  }

  if (command.command === "respondInconclusiveComparison") {
    const invalidFields = validateRespondInconclusiveComparisonFields(command);
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
          code: "SVS-INCONCLUSIVE-COMPARISON-RESPONSE-INVALID",
          message: "Inconclusive Comparison response is invalid.",
          action:
            "Choose one explicit Stop, targeted Extend, or Select response and correct the reported fields.",
          details: invalidFields,
        },
      };
    }
    return respondInconclusiveComparison(
      command as unknown as RespondInconclusiveComparisonCommand,
      effects.now?.() ?? new Date().toISOString(),
    );
  }

  if (command.command === "reevaluateCampaign") {
    const invalidFields = validateReevaluateCampaignFields(command);
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
          code: "SVS-CAMPAIGN-REEVALUATION-INVALID",
          message: "Campaign re-evaluation input is invalid.",
          action:
            "Record one explicit challenge or revision with stable links and a complete Campaign Decision.",
          details: invalidFields,
        },
      };
    }
    return reevaluateCampaign(
      command as unknown as ReevaluateCampaignCommand,
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

  if (command.command === "respondInterruptedResearch") {
    const invalidFields = validateRespondInterruptedResearchFields(command);
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
          code: "SVS-INTERRUPTED-RESEARCH-RESPONSE-INVALID",
          message: "Interrupted Approved Research response is invalid.",
          action:
            "Explicitly confirm that no Source work or charge completed for every reservation in the Pending Decision.",
          details: invalidFields,
        },
      };
    }
    return respondInterruptedResearch(
      command as unknown as RespondInterruptedResearchCommand,
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
