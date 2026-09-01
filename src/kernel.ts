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

type ResearchBudgetView = {
  sourceCap: number;
  adversarialSourceReserve: number;
  ordinarySourceCap: number;
  reservedSourceUnits: number;
  settledSourceUnits: number;
  remainingOrdinarySourceUnits: number;
};

type EvidenceLedger = {
  campaignId: string;
  sources: PublicSource[];
  observations: PublicObservation[];
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
    | "public-research-active";
  pause: null;
  completedWork: string[];
  nextPermittedActions: string[];
  publicResearchAvailable: boolean;
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
  | "record-public-research-observation";

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
  instantField: "reservedAt" | "recordedAt",
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
    !hasOnlyFields(value, ["id", "sourceUnits", "purpose", "retrievalRoute"])
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

function invalidAuthoritativeRecord(sequence: number): never {
  throw new Error(`authoritative record ${sequence} is invalid`);
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
        };
  return {
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

type CoordinatorCommand =
  | ResumeCampaignCommand
  | ConfirmCampaignIntakeCommand
  | ReservePublicResearchCommand
  | RecordPublicResearchObservationCommand;

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
    validateBeforeLease({ before }) {
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
      "resumeCampaign",
      "confirmCampaignIntake",
      "reservePublicResearch",
      "recordPublicResearchObservation",
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
