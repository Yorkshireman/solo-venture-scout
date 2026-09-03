import path from "node:path";
import {
  comparisonDimensions,
  potentialOutputComparisonFields,
  qualificationGateKinds,
  requiredInputComparisonFields,
} from "./types.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validatePreflightFields(command: unknown): string[] {
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

export function isIsoInstant(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateCreateCampaignFields(command: Record<string, unknown>): string[] {
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

export function validateInspectCampaignFields(command: Record<string, unknown>): string[] {
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

export function validateResumeCampaignFields(command: Record<string, unknown>): string[] {
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

export function validateInspectEvidenceFields(command: Record<string, unknown>): string[] {
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

export function hasOnlyFields(value: Record<string, unknown>, fields: string[]): boolean {
  return (
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field))
  );
}

export function validateIntakeValue(value: unknown, field: string): string[] {
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

export function validateResearchBudget(
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

export function validateCampaignIntake(value: unknown, confirmedAt: unknown): string[] {
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

export function validateConfirmCampaignIntakeFields(
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

export function validatePublicResearchCommandBase(
  payload: Record<string, unknown>,
  instantField:
    | "reservedAt"
    | "recordedAt"
    | "requestedAt"
    | "respondedAt"
    | "incurredAt"
    | "concludedAt"
    | "reevaluatedAt",
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

export function validateCampaignResearchReservation(
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
      ...(value.decisionValuePriorityId === undefined
        ? []
        : ["decisionValuePriorityId"]),
      ...(value.evidenceGapId === undefined ? [] : ["evidenceGapId"]),
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
    !["deepening", "open-world-discovery", "adversarial"].includes(
      String(value.researchClass),
    )
  ) {
    details.push(
      `${field}.researchClass must be deepening, open-world-discovery, or adversarial when present.`,
    );
  }
  for (const optionalIdentity of [
    "opportunityId",
    "approvalId",
    "decisionValuePriorityId",
    "evidenceGapId",
  ] as const) {
    if (
      value[optionalIdentity] !== undefined &&
      (typeof value[optionalIdentity] !== "string" ||
        value[optionalIdentity].trim() === "")
    ) {
      details.push(`${field}.${optionalIdentity} must be a non-empty string when present.`);
    }
  }
  if (
    value.researchClass !== "deepening" &&
    value.researchClass !== "adversarial" &&
    value.opportunityId !== undefined
  ) {
    details.push(`${field}.opportunityId is available only for Opportunity deepening or adversarial challenge.`);
  }
  return details;
}

export const validatePublicResearchReservation =
  validateCampaignResearchReservation;

export function validateReservePublicResearchFields(
  command: Record<string, unknown>,
): string[] {
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  return [
    ...validatePublicResearchCommandBase(command.payload, "reservedAt"),
    ...validateCampaignResearchReservation(command.payload.reservation),
  ];
}

export function validateReserveApprovedResearchFields(
  command: Record<string, unknown>,
): string[] {
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  const details = [
    ...validatePublicResearchCommandBase(command.payload, "reservedAt"),
    ...validateCampaignResearchReservation(command.payload.reservation),
  ];
  if (
    !isRecord(command.payload.reservation) ||
    typeof command.payload.reservation.approvalId !== "string" ||
    command.payload.reservation.approvalId.trim() === ""
  ) {
    details.push(
      "payload.reservation.approvalId must identify the granted Research Approval.",
    );
  }
  return details;
}

export function isNullableNonEmptyString(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.trim() !== "");
}

export function containsProhibitedPersistedContent(value: string): boolean {
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

export function validatePersistableText(value: unknown, field: string): string[] {
  return typeof value === "string" && containsProhibitedPersistedContent(value)
    ? [
        `${field} must not contain sensitive, personal, payment, active-instruction, or raw content.`,
      ]
    : [];
}

export function validateSource(value: unknown, recordedAt: unknown): string[] {
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
      `${field} must contain only identity, retrieval provenance, dates, access time, and an exact locator.`,
    ];
  }
  const details: string[] = [];
  for (const textField of ["id", "retrievalMode", "exactLocator"] as const) {
    if (typeof value[textField] !== "string" || value[textField].trim() === "") {
      details.push(`${field}.${textField} must be a non-empty string.`);
    }
  }
  if (typeof value.url !== "string") {
    details.push(`${field}.url must be an HTTP or HTTPS URL.`);
  } else {
    try {
      const sourceUrl = new URL(value.url);
      if (
        !["http:", "https:"].includes(sourceUrl.protocol) ||
        sourceUrl.username !== "" ||
        sourceUrl.password !== ""
      ) {
        details.push(`${field}.url must be an HTTP or HTTPS URL without credentials.`);
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
      details.push(`${field}.url must be a valid HTTP or HTTPS URL.`);
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

export const validatePublicSource = validateSource;

export function validateObservation(value: unknown, source: unknown): string[] {
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

export const validatePublicObservation = validateObservation;

export function validateRecordPublicResearchObservationFields(
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
    ...validateSource(command.payload.source, command.payload.recordedAt),
    ...validateObservation(command.payload.observation, command.payload.source),
  );
  return details;
}

function validateResearchChargeResolution(
  value: unknown,
  field: string,
): string[] {
  if (!isRecord(value) || typeof value.incurred !== "boolean") {
    return [`${field} must explicitly state whether a charge was incurred.`];
  }
  if (value.incurred === false) {
    return hasOnlyFields(value, ["incurred"])
      ? []
      : [`${field} must contain only incurred when no charge occurred.`];
  }
  return hasOnlyFields(value, ["incurred", "expenditureId"]) &&
    typeof value.expenditureId === "string" &&
    value.expenditureId.trim() !== ""
    ? []
    : [
        `${field}.expenditureId must identify the recorded Research Expenditure when a charge occurred.`,
      ];
}

export function validateRecordApprovedResearchObservationFields(
  command: Record<string, unknown>,
): string[] {
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  const payload = command.payload;
  const details = validatePublicResearchCommandBase(payload, "recordedAt");
  if (
    !hasOnlyFields(payload, [
      "campaignPath",
      "coordinatorId",
      "recordedAt",
      "reservationId",
      "source",
      "observation",
      "charge",
    ])
  ) {
    details.push(
      "payload must contain only Campaign identity, Approved Research result provenance, and charge resolution.",
    );
  }
  if (
    typeof payload.reservationId !== "string" ||
    payload.reservationId.trim() === ""
  ) {
    details.push("payload.reservationId must be a non-empty string.");
  }
  details.push(
    ...validateSource(payload.source, payload.recordedAt),
    ...validateObservation(payload.observation, payload.source),
    ...validateResearchChargeResolution(payload.charge, "payload.charge"),
  );
  return details;
}

export function validateEntryIdList(
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

export function validateReasoningTextFields(
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

export function validateAssessmentLimitations(
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

export function validateEvidenceConfidence(value: unknown, field: string): string[] {
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

export function validateSourceLineage(value: unknown, field: string): string[] {
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

export function validateSourceCredibility(value: unknown, field: string): string[] {
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

export function validateSourceFreshness(value: unknown, field: string): string[] {
  const allowedFields = [
    "type",
    "id",
    "sourceId",
    "observationId",
    "intendedUse",
    "assessment",
    "timeSensitivity",
    "rationale",
    "limitations",
  ];
  if (
    !isRecord(value) ||
    (!hasOnlyFields(value, allowedFields) &&
      !hasOnlyFields(value, [...allowedFields, "refreshAfter"])) ||
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
  if (
    value.refreshAfter !== undefined &&
    value.refreshAfter !== null &&
    !isIsoInstant(value.refreshAfter)
  ) {
    details.push(`${field}.refreshAfter must be an ISO 8601 UTC instant or null.`);
  }
  details.push(...validateAssessmentLimitations(value.limitations, field));
  return details;
}

export function validateEvidenceGap(value: unknown, field: string): string[] {
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

export function validateAssumption(value: unknown, field: string): string[] {
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

export function validateInference(value: unknown, field: string): string[] {
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

export function validateContradiction(value: unknown, field: string): string[] {
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

export function validateCorrection(value: unknown, field: string): string[] {
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
  if (!(["reaffirm", "supersede", "retract"] as unknown[]).includes(value.action)) {
    details.push(`${field}.action must be reaffirm, supersede, or retract.`);
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
  if (
    (value.action === "reaffirm" || value.action === "retract") &&
    value.replacementEntryId !== null
  ) {
    details.push(`${field}.replacementEntryId must be null when reaffirming or retracting.`);
  }
  details.push(
    ...validatePersistableText(
      value.replacementEntryId,
      `${field}.replacementEntryId`,
    ),
  );
  return details;
}

export function validateReasoningEntry(value: unknown, field: string): string[] {
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

export function validateRecordEvidenceReasoningFields(
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

export function validateDiscoverySampling(
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

export function validateDiscoverySweep(value: unknown, field: string): string[] {
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

export function validateProblemSignal(value: unknown, field: string): string[] {
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

export function validateExplorationThread(value: unknown, field: string): string[] {
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

export function validateDiscoveryTranche(value: unknown, field = "payload.tranche"): string[] {
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

export function validateRecordDiscoveryTrancheFields(
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

export function validateCampaignDecision(
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

export function validateOpportunityFormationAssessment(
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

export function validateRecordOpportunityFormationFields(command: Record<string, unknown>): string[] {
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

export function validateBreadthGate(value: unknown, recordedAt: unknown, field = "payload.gate"): string[] {
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

export function validatePassBreadthGateFields(command: Record<string, unknown>): string[] {
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  return [
    ...validatePublicResearchCommandBase(command.payload, "recordedAt"),
    ...validateBreadthGate(command.payload.gate, command.payload.recordedAt),
  ];
}

export function validateGateDecision(
  value: unknown,
  recordedAt: unknown,
  field: string,
  expectedKind: "exclusion-gate" | "qualification-gate",
  label: "Exclusion Gate" | "Qualification Gate",
  allowPriorDecision = false,
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
    value.kind !== expectedKind
  ) {
    return [`${field} must be a complete ${label} Campaign Decision.`];
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
  if (
    !isIsoInstant(value.decidedAt) ||
    (!allowPriorDecision && value.decidedAt !== recordedAt) ||
    (allowPriorDecision &&
      isIsoInstant(recordedAt) &&
      value.decidedAt > recordedAt)
  ) {
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

export function validateOpportunityGateDecision(
  value: unknown,
  recordedAt: unknown,
  field: string,
  allowPriorDecision = false,
): string[] {
  return validateGateDecision(
    value,
    recordedAt,
    field,
    "exclusion-gate",
    "Exclusion Gate",
    allowPriorDecision,
  );
}

export function validateExclusionGate(
  value: unknown,
  opportunityId: unknown,
  recordedAt: unknown,
  field: string,
  allowPriorDecision = false,
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
    ...validateOpportunityGateDecision(
      value.decision,
      recordedAt,
      `${field}.decision`,
      allowPriorDecision,
    ),
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

export function validateOpportunityExclusionAssessment(
  value: unknown,
  recordedAt: unknown,
  field: string,
  allowPriorDecisions = false,
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
        allowPriorDecisions,
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
          allowPriorDecisions,
        ),
      );
    }
  }
  return details;
}

export function validateRecordOpportunityExclusionGatesFields(
  command: Record<string, unknown>,
): string[] {
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  const details = validatePublicResearchCommandBase(command.payload, "recordedAt");
  const allowPriorDecisions = command.payload.reevaluationId !== undefined;
  if (
    allowPriorDecisions &&
    (typeof command.payload.reevaluationId !== "string" ||
      command.payload.reevaluationId.trim() === "")
  ) {
    details.push("payload.reevaluationId must be a stable non-empty identity.");
  }
  if (!Array.isArray(command.payload.assessments) || command.payload.assessments.length === 0) {
    details.push("payload.assessments must contain every formed Opportunity.");
  } else {
    for (const [index, assessment] of command.payload.assessments.entries()) {
      details.push(
        ...validateOpportunityExclusionAssessment(
          assessment,
          command.payload.recordedAt,
          `payload.assessments[${index}]`,
          allowPriorDecisions,
        ),
      );
    }
  }
  return details;
}

export function validateQualificationEvidenceBasis(
  value: unknown,
  field: string,
): string[] {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, [
      "behavioralEvidenceEntryIds",
      "independentSourceLineages",
      "sourceFreshnessIds",
    ])
  ) {
    return [`${field} must contain the complete Qualification Gate evidence basis.`];
  }
  const details = [
    ...validateEntryIdList(
      value.behavioralEvidenceEntryIds,
      `${field}.behavioralEvidenceEntryIds`,
      true,
    ),
    ...validateEntryIdList(
      value.sourceFreshnessIds,
      `${field}.sourceFreshnessIds`,
      true,
    ),
  ];
  if (!Array.isArray(value.independentSourceLineages)) {
    details.push(`${field}.independentSourceLineages must be an array.`);
  } else {
    for (const [index, lineage] of value.independentSourceLineages.entries()) {
      const lineageField = `${field}.independentSourceLineages[${index}]`;
      if (
        !isRecord(lineage) ||
        !hasOnlyFields(lineage, ["sourceIds", "rationale"])
      ) {
        details.push(`${lineageField} must identify one Source Lineage and rationale.`);
        continue;
      }
      details.push(
        ...validateEntryIdList(lineage.sourceIds, `${lineageField}.sourceIds`, false),
        ...validateReasoningTextFields(lineage, lineageField, ["rationale"]),
      );
    }
  }
  return details;
}

export function validateTraceableCommercialRange(
  value: unknown,
  field: string,
): string[] {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, ["low", "high", "unit", "evidenceEntryIds"])
  ) {
    return [`${field} must be a complete traceable range.`];
  }
  const details = validateReasoningTextFields(value, field, ["unit"]);
  if (
    typeof value.low !== "number" ||
    !Number.isFinite(value.low) ||
    typeof value.high !== "number" ||
    !Number.isFinite(value.high) ||
    value.low >= value.high
  ) {
    details.push(`${field} must have finite low and high values with low less than high.`);
  }
  details.push(
    ...validateEntryIdList(
      value.evidenceEntryIds,
      `${field}.evidenceEntryIds`,
      false,
    ),
  );
  return details;
}

export function validateCommercialPlausibilityRanges(
  value: unknown,
  field: string,
): string[] {
  const rangeNames = [
    "price",
    "customerVolume",
    "costs",
    "acquisition",
    "capacity",
    "timing",
  ];
  if (!isRecord(value) || !hasOnlyFields(value, rangeNames)) {
    return [`${field} must contain every traceable commercial range.`];
  }
  return rangeNames.flatMap((rangeName) =>
    validateTraceableCommercialRange(value[rangeName], `${field}.${rangeName}`),
  );
}

export function validateQualificationGateDecision(
  value: unknown,
  recordedAt: unknown,
  field: string,
  allowPriorDecision = false,
): string[] {
  return validateGateDecision(
    value,
    recordedAt,
    field,
    "qualification-gate",
    "Qualification Gate",
    allowPriorDecision,
  );
}

export function validateQualificationGate(
  value: unknown,
  opportunityId: unknown,
  recordedAt: unknown,
  field: string,
  allowPriorDecision = false,
): string[] {
  if (!isRecord(value)) {
    return [`${field} must be a complete Qualification Gate.`];
  }
  const commercial = value.kind === "commercial-plausibility";
  const expectedFields = [
    "id",
    "kind",
    "state",
    "evidenceBasis",
    ...(commercial ? ["commercialRanges"] : []),
    "decision",
  ];
  if (!hasOnlyFields(value, expectedFields)) {
    return [`${field} must be a complete Qualification Gate.`];
  }
  const details = validateReasoningTextFields(value, field, ["id"]);
  if (!(qualificationGateKinds as readonly unknown[]).includes(value.kind)) {
    details.push(`${field}.kind must name a supported Qualification Gate.`);
  }
  if (!(["passed", "failed", "unresolved"] as unknown[]).includes(value.state)) {
    details.push(`${field}.state must be passed, failed, or unresolved.`);
  }
  details.push(
    ...validateQualificationEvidenceBasis(
      value.evidenceBasis,
      `${field}.evidenceBasis`,
    ),
    ...validateQualificationGateDecision(
      value.decision,
      recordedAt,
      `${field}.decision`,
      allowPriorDecision,
    ),
  );
  if (
    isRecord(value.decision) &&
    (value.decision.outcome !== value.state ||
      value.decision.opportunityId !== opportunityId)
  ) {
    details.push(`${field}.decision must match the gate state and Opportunity.`);
  }
  if (commercial) {
    if (value.commercialRanges === null && value.state !== "unresolved") {
      details.push(`${field}.commercialRanges may be null only while the gate is unresolved.`);
    } else if (value.commercialRanges !== null) {
      details.push(
        ...validateCommercialPlausibilityRanges(
          value.commercialRanges,
          `${field}.commercialRanges`,
        ),
      );
    }
  }
  return details;
}

export function validateQualificationCampaignDecision(
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
      "decisionValuePriorities",
      "stopReason",
      "rationale",
      "confidence",
      "limitations",
      "decidedAt",
    ]) ||
    value.type !== "campaign-decision" ||
    value.kind !== "qualification-research"
  ) {
    return [`${field} must be a complete qualification-related Campaign Decision.`];
  }
  const details = validateReasoningTextFields(value, field, [
    "id",
    "applicableRule",
    "rationale",
  ]);
  if (!(["continue", "stop"] as unknown[]).includes(value.outcome)) {
    details.push(`${field}.outcome must be continue or stop.`);
  }
  if (!Number.isSafeInteger(value.intakeVersion) || Number(value.intakeVersion) <= 0) {
    details.push(`${field}.intakeVersion must be a positive safe integer.`);
  }
  details.push(
    ...validateEntryIdList(value.evidenceEntryIds, `${field}.evidenceEntryIds`, true),
    ...validateEvidenceConfidence(value.confidence, `${field}.confidence`),
    ...validateAssessmentLimitations(value.limitations, field),
  );
  if (!isIsoInstant(value.decidedAt) || value.decidedAt !== recordedAt) {
    details.push(`${field}.decidedAt must equal the operation's recordedAt instant.`);
  }
  if (!Array.isArray(value.decisionValuePriorities)) {
    details.push(`${field}.decisionValuePriorities must be an array.`);
  } else {
    for (const [index, priority] of value.decisionValuePriorities.entries()) {
      const priorityField = `${field}.decisionValuePriorities[${index}]`;
      if (
        !isRecord(priority) ||
        !hasOnlyFields(priority, [
          "id",
          "researchQuestion",
          "target",
          "permittedAction",
          "rationale",
        ])
      ) {
        details.push(`${priorityField} must be a complete qualitative Decision Value priority.`);
        continue;
      }
      details.push(
        ...validateReasoningTextFields(priority, priorityField, [
          "id",
          "researchQuestion",
          "rationale",
        ]),
      );
      if (
        !isRecord(priority.target) ||
        !hasOnlyFields(priority.target, ["kind", "id"]) ||
        !["formation", "gate", "contradiction", "comparison"].includes(
          String(priority.target.kind),
        )
      ) {
        details.push(`${priorityField}.target must name one supported decision target.`);
      } else {
        details.push(
          ...validateReasoningTextFields(priority.target, `${priorityField}.target`, ["id"]),
        );
      }
      if (
        !isRecord(priority.permittedAction) ||
        !hasOnlyFields(priority.permittedAction, [
          "purpose",
          "retrievalRoute",
          "researchClass",
          "opportunityId",
        ])
      ) {
        details.push(
          `${priorityField}.permittedAction must describe the exact permitted research action.`,
        );
      } else {
        details.push(
          ...validateReasoningTextFields(
            priority.permittedAction,
            `${priorityField}.permittedAction`,
            ["purpose", "retrievalRoute", "opportunityId"],
          ),
        );
        if (priority.permittedAction.researchClass !== "deepening") {
          details.push(
            `${priorityField}.permittedAction.researchClass must be deepening.`,
          );
        }
      }
    }
  }
  const validStopReasons = [
    "ordinary-budget-exhausted",
    "no-permitted-positive-decision-value",
    "qualification-complete",
  ];
  if (
    (value.outcome === "continue" &&
      (value.stopReason !== null ||
        !Array.isArray(value.decisionValuePriorities) ||
        value.decisionValuePriorities.length === 0)) ||
    (value.outcome === "stop" &&
      (!validStopReasons.includes(String(value.stopReason)) ||
        !Array.isArray(value.decisionValuePriorities) ||
        value.decisionValuePriorities.length !== 0))
  ) {
    details.push(`${field} must pair continued research with priorities or stopped research with one stop reason.`);
  }
  return details;
}

export function validateOpportunityQualificationAssessment(
  value: unknown,
  recordedAt: unknown,
  field: string,
  allowPriorDecisions = false,
): string[] {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, ["id", "opportunityId", "gates"])
  ) {
    return [`${field} must be a complete Opportunity qualification assessment.`];
  }
  const details = validateReasoningTextFields(value, field, ["id", "opportunityId"]);
  if (!Array.isArray(value.gates) || value.gates.length === 0) {
    details.push(`${field}.gates must contain the complete Qualification Gate contract.`);
  } else {
    for (const [index, gate] of value.gates.entries()) {
      details.push(
        ...validateQualificationGate(
          gate,
          value.opportunityId,
          recordedAt,
          `${field}.gates[${index}]`,
          allowPriorDecisions,
        ),
      );
    }
  }
  return details;
}

export function validateRecordOpportunityQualificationGatesFields(
  command: Record<string, unknown>,
): string[] {
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  const details = validatePublicResearchCommandBase(command.payload, "recordedAt");
  const allowPriorDecisions = command.payload.reevaluationId !== undefined;
  if (
    allowPriorDecisions &&
    (typeof command.payload.reevaluationId !== "string" ||
      command.payload.reevaluationId.trim() === "")
  ) {
    details.push("payload.reevaluationId must be a stable non-empty identity.");
  }
  if (
    !isRecord(command.payload.evaluation) ||
    !hasOnlyFields(command.payload.evaluation, [
      "id",
      "assessments",
      "researchDecision",
    ])
  ) {
    details.push("payload.evaluation must contain the complete Qualification Gate evaluation.");
    return details;
  }
  const evaluation = command.payload.evaluation;
  details.push(
    ...validateReasoningTextFields(evaluation, "payload.evaluation", ["id"]),
  );
  if (!Array.isArray(evaluation.assessments)) {
    details.push("payload.evaluation.assessments must contain every surviving Opportunity.");
  } else {
    for (const [index, assessment] of evaluation.assessments.entries()) {
      details.push(
        ...validateOpportunityQualificationAssessment(
          assessment,
          command.payload.recordedAt,
          `payload.evaluation.assessments[${index}]`,
          allowPriorDecisions,
        ),
      );
    }
  }
  details.push(
    ...validateQualificationCampaignDecision(
      evaluation.researchDecision,
      command.payload.recordedAt,
      "payload.evaluation.researchDecision",
    ),
  );
  return details;
}

export function validateConcludeNoQualifyingOpportunityFields(
  command: Record<string, unknown>,
): string[] {
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  const details = validatePublicResearchCommandBase(
    command.payload,
    "concludedAt",
  );
  details.push(
    ...validateReasoningTextFields(command.payload, "payload", ["reportId"]),
  );
  if (!Array.isArray(command.payload.continuationConditions)) {
    details.push("payload.continuationConditions must be an array.");
  } else {
    for (const [index, condition] of command.payload.continuationConditions.entries()) {
      const field = `payload.continuationConditions[${index}]`;
      if (
        !isRecord(condition) ||
        !hasOnlyFields(condition, [
          "id",
          "opportunityId",
          "condition",
          "evidenceGapIds",
        ])
      ) {
        details.push(`${field} must be a complete continuation condition.`);
        continue;
      }
      details.push(
        ...validateReasoningTextFields(condition, field, [
          "id",
          "opportunityId",
          "condition",
        ]),
        ...validateEntryIdList(
          condition.evidenceGapIds,
          `${field}.evidenceGapIds`,
          true,
        ),
      );
    }
  }
  return details;
}

function containsFalsePrecision(value: string): boolean {
  return /(?:\b\d+(?:\.\d+)?\s*%|\b(?:probability|chance|likelihood)\s+(?:of\s+)?\d|\b(?:score|rating)\s*(?:of|:)?\s*\d)/i.test(
    value,
  );
}

export function validateEvidenceBackedComparison(
  value: unknown,
  field: string,
): string[] {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, ["summary", "evidenceEntryIds", "confidence"])
  ) {
    return [`${field} must contain a qualitative summary, evidence identities, and Evidence Confidence.`];
  }
  const details = [
    ...validateReasoningTextFields(value, field, ["summary"]),
    ...validateEntryIdList(value.evidenceEntryIds, `${field}.evidenceEntryIds`, false),
    ...validateEvidenceConfidence(value.confidence, `${field}.confidence`),
  ];
  if (
    typeof value.summary === "string" &&
    containsFalsePrecision(value.summary)
  ) {
    details.push(`${field}.summary must not contain an invented probability or numeric score.`);
  }
  return details;
}

function validateNoFalsePrecision(value: unknown, field: string): string[] {
  if (typeof value === "string") {
    return containsFalsePrecision(value)
      ? [`${field} must not contain an invented probability or numeric score.`]
      : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      validateNoFalsePrecision(entry, `${field}[${index}]`),
    );
  }
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([name, entry]) =>
      name === "summary"
        ? []
        : validateNoFalsePrecision(entry, `${field}.${name}`),
    );
  }
  return [];
}

function validateComparisonProfile(value: unknown, field: string): string[] {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, [
      "opportunityId",
      "requiredInput",
      "potentialOutput",
      "outcomeUncertainty",
      "inputOutputAsymmetry",
      "riskToleranceFit",
      "preferences",
      "advantages",
    ])
  ) {
    return [`${field} must contain the complete unscored Opportunity comparison profile.`];
  }
  const details = validateReasoningTextFields(value, field, ["opportunityId"]);
  for (const [groupName, fields] of [
    ["requiredInput", requiredInputComparisonFields],
    ["potentialOutput", potentialOutputComparisonFields],
  ] as const) {
    const group = value[groupName];
    if (!isRecord(group) || !hasOnlyFields(group, [...fields])) {
      details.push(`${field}.${groupName} must contain every qualitative comparison dimension without a total.`);
      continue;
    }
    for (const dimension of fields) {
      details.push(
        ...validateEvidenceBackedComparison(
          group[dimension],
          `${field}.${groupName}.${dimension}`,
        ),
      );
    }
  }
  details.push(
    ...validateEvidenceBackedComparison(
      value.outcomeUncertainty,
      `${field}.outcomeUncertainty`,
    ),
    ...validateEvidenceBackedComparison(
      value.inputOutputAsymmetry,
      `${field}.inputOutputAsymmetry`,
    ),
  );
  if (
    !isRecord(value.riskToleranceFit) ||
    !hasOnlyFields(value.riskToleranceFit, [
      "fit",
      "summary",
      "evidenceEntryIds",
      "confidence",
    ]) ||
    !["within", "material-disadvantage"].includes(String(value.riskToleranceFit.fit))
  ) {
    details.push(`${field}.riskToleranceFit must record whether the Opportunity is within the declared Risk Tolerance.`);
  } else {
    const { fit: _fit, ...evidenceBacked } = value.riskToleranceFit;
    details.push(
      ...validateEvidenceBackedComparison(
        evidenceBacked,
        `${field}.riskToleranceFit`,
      ),
    );
  }
  for (const listName of ["preferences", "advantages"] as const) {
    const entries = value[listName];
    if (!Array.isArray(entries)) {
      details.push(`${field}.${listName} must be an array.`);
      continue;
    }
    for (const [index, entry] of entries.entries()) {
      const entryField = `${field}.${listName}[${index}]`;
      const fields = listName === "preferences"
        ? ["statementId", "effect", "materiality", "rationale", "evidenceEntryIds", "confidence"]
        : ["statementId", "effect", "rationale", "evidenceEntryIds", "confidence"];
      if (!isRecord(entry) || !hasOnlyFields(entry, fields)) {
        details.push(`${entryField} must be a complete demonstrated ${listName === "preferences" ? "Preference fit" : "Advantage"}.`);
        continue;
      }
      details.push(
        ...validateReasoningTextFields(entry, entryField, ["statementId", "rationale"]),
        ...validateEntryIdList(
          entry.evidenceEntryIds,
          `${entryField}.evidenceEntryIds`,
          listName === "advantages" && entry.effect === "not-demonstrated",
        ),
        ...validateEvidenceConfidence(entry.confidence, `${entryField}.confidence`),
      );
      if (
        listName === "preferences" &&
        !["advantage", "neutral", "disadvantage"].includes(String(entry.effect))
      ) {
        details.push(`${entryField}.effect must be advantage, neutral, or disadvantage.`);
      }
      if (
        listName === "preferences" &&
        !["minor", "material"].includes(String(entry.materiality))
      ) {
        details.push(`${entryField}.materiality must be minor or material.`);
      }
      if (
        listName === "advantages" &&
        !["reduces-input", "increases-output", "improves-access", "reduces-risk", "not-demonstrated"].includes(String(entry.effect))
      ) {
        details.push(`${entryField}.effect must describe concrete leverage or explicitly record that it is not demonstrated.`);
      }
      if (
        listName === "advantages" &&
        entry.effect === "not-demonstrated" &&
        Array.isArray(entry.evidenceEntryIds) &&
        entry.evidenceEntryIds.length > 0
      ) {
        details.push(`${entryField}.evidenceEntryIds must be empty when the Advantage is not demonstrated.`);
      }
    }
  }
  return details;
}

function validateComparisonCampaignDecision(
  value: unknown,
  concludedAt: unknown,
  field: string,
): string[] {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, [
      "type", "id", "kind", "outcome", "leaderOpportunityId",
      "intakeVersion", "applicableRule", "evidenceEntryIds", "rationale",
      "confidence", "limitations", "decidedAt",
    ]) ||
    value.type !== "campaign-decision" ||
    value.kind !== "opportunity-comparison" ||
    value.outcome !== "leading-opportunity"
  ) {
    return [`${field} must be a complete Leading Opportunity comparison Campaign Decision.`];
  }
  const details = validateReasoningTextFields(value, field, [
    "id", "leaderOpportunityId", "applicableRule", "rationale",
  ]);
  if (!Number.isSafeInteger(value.intakeVersion) || Number(value.intakeVersion) <= 0) {
    details.push(`${field}.intakeVersion must be a positive safe integer.`);
  }
  if (!isIsoInstant(value.decidedAt) || value.decidedAt !== concludedAt) {
    details.push(`${field}.decidedAt must equal payload.concludedAt.`);
  }
  details.push(
    ...validateEntryIdList(value.evidenceEntryIds, `${field}.evidenceEntryIds`, false),
    ...validateEvidenceConfidence(value.confidence, `${field}.confidence`),
    ...validateAssessmentLimitations(value.limitations, field),
  );
  return details;
}

export function validateConcludeLeadingOpportunityFields(
  command: Record<string, unknown>,
): string[] {
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  const details = validatePublicResearchCommandBase(command.payload, "concludedAt");
  const comparison = command.payload.comparison;
  if (
    !isRecord(comparison) ||
    !hasOnlyFields(comparison, [
      "id", "profiles", "dominanceAssessments", "nonDominatedOpportunityIds",
      "leadingAssessment", "decision",
    ])
  ) {
    details.push("payload.comparison must be a complete unscored Opportunity comparison.");
    return details;
  }
  details.push(...validateReasoningTextFields(comparison, "payload.comparison", ["id"]));
  details.push(
    ...validateNoFalsePrecision(comparison, "payload.comparison"),
  );
  if (!Array.isArray(comparison.profiles) || comparison.profiles.length === 0) {
    details.push("payload.comparison.profiles must contain every Eligible Opportunity.");
  } else {
    for (const [index, profile] of comparison.profiles.entries()) {
      details.push(...validateComparisonProfile(profile, `payload.comparison.profiles[${index}]`));
    }
  }
  if (!Array.isArray(comparison.dominanceAssessments)) {
    details.push("payload.comparison.dominanceAssessments must be an array.");
  } else {
    for (const [index, assessment] of comparison.dominanceAssessments.entries()) {
      const field = `payload.comparison.dominanceAssessments[${index}]`;
      if (
        !isRecord(assessment) ||
        !hasOnlyFields(assessment, [
          "challengerOpportunityId", "alternativeOpportunityId", "outcome",
          "criteria", "rationale", "evidenceEntryIds", "confidence",
        ]) ||
        !isRecord(assessment.criteria) ||
        !hasOnlyFields(assessment.criteria, [
          "requiresNoMoreMaterialInput", "offersNoLessCredibleOutput",
          "fitsDeveloperProfileAtLeastAsWell", "materiallyBetterOn",
        ])
      ) {
        details.push(`${field} must be a complete pairwise dominance assessment.`);
        continue;
      }
      details.push(
        ...validateReasoningTextFields(assessment, field, ["challengerOpportunityId", "alternativeOpportunityId", "rationale"]),
        ...validateEntryIdList(assessment.evidenceEntryIds, `${field}.evidenceEntryIds`, false),
        ...validateEvidenceConfidence(assessment.confidence, `${field}.confidence`),
      );
      if (!["dominates", "does-not-dominate"].includes(String(assessment.outcome))) {
        details.push(`${field}.outcome must be dominates or does-not-dominate.`);
      }
      for (const criterion of ["requiresNoMoreMaterialInput", "offersNoLessCredibleOutput", "fitsDeveloperProfileAtLeastAsWell"] as const) {
        if (typeof assessment.criteria[criterion] !== "boolean") {
          details.push(`${field}.criteria.${criterion} must be a boolean.`);
        }
      }
      details.push(...validateEntryIdList(assessment.criteria.materiallyBetterOn, `${field}.criteria.materiallyBetterOn`, assessment.outcome !== "dominates"));
      if (
        Array.isArray(assessment.criteria.materiallyBetterOn) &&
        assessment.criteria.materiallyBetterOn.some(
          (dimension) =>
            !(comparisonDimensions as readonly unknown[]).includes(dimension),
        )
      ) {
        details.push(`${field}.criteria.materiallyBetterOn contains an unknown comparison dimension.`);
      }
    }
  }
  details.push(
    ...validateEntryIdList(comparison.nonDominatedOpportunityIds, "payload.comparison.nonDominatedOpportunityIds", false),
    ...validateComparisonCampaignDecision(comparison.decision, command.payload.concludedAt, "payload.comparison.decision"),
  );
  const leading = comparison.leadingAssessment;
  if (
    !isRecord(leading) ||
    !hasOnlyFields(leading, [
      "opportunityId", "advantagesOverAlternatives", "noMaterialDisadvantage",
      "robustAcrossCredibleRanges", "unresolvedContenderOpportunityIds",
      "decisionChangingEvidenceGapIds", "decisionChangingContradictionIds",
      "adversarialChallenge",
    ])
  ) {
    details.push("payload.comparison.leadingAssessment must contain the complete robust-leader contract.");
  } else {
    details.push(...validateReasoningTextFields(leading, "payload.comparison.leadingAssessment", ["opportunityId"]));
    for (const emptyList of ["unresolvedContenderOpportunityIds", "decisionChangingEvidenceGapIds", "decisionChangingContradictionIds"] as const) {
      if (!Array.isArray(leading[emptyList])) {
        details.push(`payload.comparison.leadingAssessment.${emptyList} must be an array.`);
      }
    }
    if (!Array.isArray(leading.advantagesOverAlternatives)) {
      details.push("payload.comparison.leadingAssessment.advantagesOverAlternatives must be an array.");
    } else {
      for (const [index, advantage] of leading.advantagesOverAlternatives.entries()) {
        const field = `payload.comparison.leadingAssessment.advantagesOverAlternatives[${index}]`;
        if (!isRecord(advantage)) {
          details.push(`${field} must be an object.`);
          continue;
        }
        const expectedFields = ["alternativeOpportunityId", "basis", ...(advantage.preferenceStatementId === undefined ? [] : ["preferenceStatementId"]), "rationale", "evidenceEntryIds", "confidence"];
        if (!hasOnlyFields(advantage, expectedFields)) {
          details.push(`${field} must be a complete material advantage.`);
          continue;
        }
        details.push(
          ...validateReasoningTextFields(advantage, field, ["alternativeOpportunityId", "rationale", ...(advantage.preferenceStatementId === undefined ? [] : ["preferenceStatementId"])]),
          ...validateEntryIdList(advantage.evidenceEntryIds, `${field}.evidenceEntryIds`, false),
          ...validateEvidenceConfidence(advantage.confidence, `${field}.confidence`),
        );
        if (!["input-output-asymmetry", "major-preference"].includes(String(advantage.basis))) {
          details.push(`${field}.basis must be input-output-asymmetry or major-preference.`);
        }
      }
    }
    for (const [name, assessment] of [
      ["noMaterialDisadvantage", leading.noMaterialDisadvantage],
      ["robustAcrossCredibleRanges", leading.robustAcrossCredibleRanges],
    ] as const) {
      if (!isRecord(assessment) || assessment.established !== true) {
        details.push(`payload.comparison.leadingAssessment.${name}.established must be true.`);
      } else {
        const { established: _established, ...evidenceBacked } = assessment;
        details.push(...validateEvidenceBackedComparison(evidenceBacked, `payload.comparison.leadingAssessment.${name}`));
      }
    }
    const challenge = leading.adversarialChallenge;
    if (
      !isRecord(challenge) ||
      challenge.outcome !== "leader-remains-eligible" ||
      !Array.isArray(challenge.reservationIds)
    ) {
      details.push("payload.comparison.leadingAssessment.adversarialChallenge must record the completed protected challenge.");
    } else {
      const { reservationIds: _reservationIds, outcome: _outcome, ...evidenceBacked } = challenge;
      details.push(
        ...validateEntryIdList(challenge.reservationIds, "payload.comparison.leadingAssessment.adversarialChallenge.reservationIds", false),
        ...validateEvidenceBackedComparison(evidenceBacked, "payload.comparison.leadingAssessment.adversarialChallenge"),
      );
    }
  }
  const brief = command.payload.brief;
  if (
    !isRecord(brief) ||
    !hasOnlyFields(brief, ["id", "buyerEconomics", "customerAccess", "alternatives", "risks", "valueHypothesis"])
  ) {
    details.push("payload.brief must contain the complete Opportunity Brief input without product specification fields.");
    return details;
  }
  details.push(...validateReasoningTextFields(brief, "payload.brief", ["id"]));
  for (const field of ["buyerEconomics", "customerAccess", "alternatives"] as const) {
    details.push(...validateEvidenceBackedComparison(brief[field], `payload.brief.${field}`));
  }
  if (!Array.isArray(brief.risks) || brief.risks.length === 0) {
    details.push("payload.brief.risks must contain at least one evidence-backed risk or limitation.");
  } else {
    for (const [index, risk] of brief.risks.entries()) {
      details.push(...validateEvidenceBackedComparison(risk, `payload.brief.risks[${index}]`));
    }
  }
  const hypothesis = brief.valueHypothesis;
  if (
    !isRecord(hypothesis) ||
    !hasOnlyFields(hypothesis, [
      "status", "customer", "situation", "smallestDesiredCustomerOutcome",
      "supportedReason", "confidence", "supportingEvidenceEntryIds",
      "challengingEvidenceEntryIds", "assumptionIds", "evidenceGapIds",
      "disconfirmationConditions",
    ]) ||
    hypothesis.status !== "provisional-not-a-product-specification"
  ) {
    details.push("payload.brief.valueHypothesis must be explicitly provisional and contain no product specification fields.");
  } else {
    details.push(
      ...validateReasoningTextFields(hypothesis, "payload.brief.valueHypothesis", ["customer", "situation", "smallestDesiredCustomerOutcome", "supportedReason"]),
      ...validateEvidenceConfidence(hypothesis.confidence, "payload.brief.valueHypothesis.confidence"),
      ...validateEntryIdList(hypothesis.supportingEvidenceEntryIds, "payload.brief.valueHypothesis.supportingEvidenceEntryIds", false),
      ...validateEntryIdList(hypothesis.challengingEvidenceEntryIds, "payload.brief.valueHypothesis.challengingEvidenceEntryIds", true),
      ...validateEntryIdList(hypothesis.assumptionIds, "payload.brief.valueHypothesis.assumptionIds", true),
      ...validateEntryIdList(hypothesis.evidenceGapIds, "payload.brief.valueHypothesis.evidenceGapIds", true),
    );
    if (!Array.isArray(hypothesis.disconfirmationConditions) || hypothesis.disconfirmationConditions.length === 0) {
      details.push("payload.brief.valueHypothesis.disconfirmationConditions must not be empty.");
    } else {
      for (const [index, condition] of hypothesis.disconfirmationConditions.entries()) {
        details.push(...validatePersistableText(condition, `payload.brief.valueHypothesis.disconfirmationConditions[${index}]`));
      }
    }
    const productSpecificationLanguage =
      /\b(?:features?|interfaces?|architecture|roadmap|backlog|estimates?|mvp|delivery design|settled mechanisms?|settled positioning)\b/i;
    const hypothesisText = [
      hypothesis.customer,
      hypothesis.situation,
      hypothesis.smallestDesiredCustomerOutcome,
      hypothesis.supportedReason,
      ...(Array.isArray(hypothesis.disconfirmationConditions)
        ? hypothesis.disconfirmationConditions
        : []),
      ...(isRecord(hypothesis.confidence) &&
      Array.isArray(hypothesis.confidence.limitingFactors)
        ? hypothesis.confidence.limitingFactors
        : []),
    ];
    if (
      hypothesisText.some(
        (value) =>
          typeof value === "string" && productSpecificationLanguage.test(value),
      )
    ) {
      details.push(
        "payload.brief.valueHypothesis contains product specification language.",
      );
    }
  }
  return details;
}

export function validateResearchApprovalTextList(
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

export function validateResearchApprovalRequest(
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

export function validateRequestResearchApprovalFields(
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

export function validateRecordResearchApprovalInformationFields(
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

export function validateRespondResearchApprovalFields(
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

export function validateRespondInterruptedResearchFields(
  command: Record<string, unknown>,
): string[] {
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  const payload = command.payload;
  const details = validatePublicResearchCommandBase(payload, "respondedAt");
  if (
    !hasOnlyFields(payload, [
      "campaignPath",
      "coordinatorId",
      "respondedAt",
      "decisionId",
      "response",
    ])
  ) {
    details.push(
      "payload must contain only Campaign identity, response time, Pending Decision identity, and response.",
    );
  }
  if (
    typeof payload.decisionId !== "string" ||
    payload.decisionId.trim() === ""
  ) {
    details.push("payload.decisionId must be a non-empty string.");
  }
  if (
    !isRecord(payload.response) ||
    !hasOnlyFields(payload.response, [
      "kind",
      "reservations",
      "explicitlyConfirmed",
      "rationale",
    ])
  ) {
    details.push(
      "payload.response must contain the complete explicit interrupted-research decision.",
    );
    return details;
  }
  const response = payload.response;
  if (response.kind !== "resolve-without-result") {
    details.push("payload.response.kind must be resolve-without-result.");
  }
  if (!Array.isArray(response.reservations) || response.reservations.length === 0) {
    details.push(
      "payload.response.reservations must be a non-empty array of exact reservation resolutions.",
    );
  } else {
    const reservationIds = new Set<string>();
    for (const [index, resolution] of response.reservations.entries()) {
      const field = `payload.response.reservations[${index}]`;
      if (
        !isRecord(resolution) ||
        !hasOnlyFields(resolution, [
          "reservationId",
          "externalWorkCompleted",
          "charge",
        ])
      ) {
        details.push(
          `${field} must contain only reservationId, externalWorkCompleted, and charge.`,
        );
        continue;
      }
      if (
        typeof resolution.reservationId !== "string" ||
        resolution.reservationId.trim() === ""
      ) {
        details.push(`${field}.reservationId must be a non-empty string.`);
      } else if (reservationIds.has(resolution.reservationId)) {
        details.push("payload.response.reservations must not contain duplicates.");
      } else {
        reservationIds.add(resolution.reservationId);
      }
      if (typeof resolution.externalWorkCompleted !== "boolean") {
        details.push(
          `${field}.externalWorkCompleted must explicitly state whether Source work completed.`,
        );
      }
      details.push(
        ...validateResearchChargeResolution(resolution.charge, `${field}.charge`),
      );
    }
  }
  if (response.explicitlyConfirmed !== true) {
    details.push("payload.response.explicitlyConfirmed must be true.");
  }
  if (
    typeof response.rationale !== "string" ||
    response.rationale.trim() === ""
  ) {
    details.push("payload.response.rationale must be a non-empty string.");
  }
  details.push(
    ...validatePersistableText(
      response.rationale,
      "payload.response.rationale",
    ),
  );
  return details;
}

export function validateRecordResearchExpenditureFields(
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

export function validateConcludeInconclusiveComparisonFields(
  command: Record<string, unknown>,
): string[] {
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  const details = validatePublicResearchCommandBase(command.payload, "concludedAt");
  details.push(
    ...validateReasoningTextFields(command.payload, "payload", ["reportId"]),
  );
  const comparison = command.payload.comparison;
  if (
    !isRecord(comparison) ||
    !hasOnlyFields(comparison, [
      "id",
      "profiles",
      "dominanceAssessments",
      "nonDominatedOpportunityIds",
      "decisiveTradeOffs",
      "apparentLeaderOpportunityId",
      "blockers",
      "decision",
    ])
  ) {
    details.push("payload.comparison must be a complete unscored inconclusive Opportunity comparison.");
    return details;
  }
  details.push(
    ...validateReasoningTextFields(comparison, "payload.comparison", ["id"]),
    ...validateNoFalsePrecision(comparison, "payload.comparison"),
  );
  if (!Array.isArray(comparison.profiles) || comparison.profiles.length === 0) {
    details.push("payload.comparison.profiles must contain every Eligible Opportunity.");
  } else {
    comparison.profiles.forEach((profile, index) => {
      details.push(
        ...validateComparisonProfile(
          profile,
          `payload.comparison.profiles[${index}]`,
        ),
      );
    });
  }
  if (!Array.isArray(comparison.dominanceAssessments)) {
    details.push("payload.comparison.dominanceAssessments must be an array.");
  } else {
    comparison.dominanceAssessments.forEach((assessment, index) => {
      const field = `payload.comparison.dominanceAssessments[${index}]`;
      if (
        !isRecord(assessment) ||
        !hasOnlyFields(assessment, [
          "challengerOpportunityId",
          "alternativeOpportunityId",
          "outcome",
          "criteria",
          "rationale",
          "evidenceEntryIds",
          "confidence",
        ]) ||
        !isRecord(assessment.criteria) ||
        !hasOnlyFields(assessment.criteria, [
          "requiresNoMoreMaterialInput",
          "offersNoLessCredibleOutput",
          "fitsDeveloperProfileAtLeastAsWell",
          "materiallyBetterOn",
        ])
      ) {
        details.push(`${field} must be a complete pairwise dominance assessment.`);
        return;
      }
      details.push(
        ...validateReasoningTextFields(assessment, field, [
          "challengerOpportunityId",
          "alternativeOpportunityId",
          "rationale",
        ]),
        ...validateEntryIdList(
          assessment.evidenceEntryIds,
          `${field}.evidenceEntryIds`,
          false,
        ),
        ...validateEvidenceConfidence(assessment.confidence, `${field}.confidence`),
      );
      if (!(assessment.outcome === "dominates" || assessment.outcome === "does-not-dominate")) {
        details.push(`${field}.outcome must be dominates or does-not-dominate.`);
      }
      for (const criterion of [
        "requiresNoMoreMaterialInput",
        "offersNoLessCredibleOutput",
        "fitsDeveloperProfileAtLeastAsWell",
      ] as const) {
        if (typeof assessment.criteria[criterion] !== "boolean") {
          details.push(`${field}.criteria.${criterion} must be a boolean.`);
        }
      }
      details.push(
        ...validateEntryIdList(
          assessment.criteria.materiallyBetterOn,
          `${field}.criteria.materiallyBetterOn`,
          assessment.outcome !== "dominates",
        ),
      );
      if (
        Array.isArray(assessment.criteria.materiallyBetterOn) &&
        assessment.criteria.materiallyBetterOn.some(
          (dimension) =>
            !(comparisonDimensions as readonly unknown[]).includes(dimension),
        )
      ) {
        details.push(`${field}.criteria.materiallyBetterOn contains an unknown comparison dimension.`);
      }
    });
  }
  details.push(
    ...validateEntryIdList(
      comparison.nonDominatedOpportunityIds,
      "payload.comparison.nonDominatedOpportunityIds",
      false,
    ),
  );
  if (!Array.isArray(comparison.decisiveTradeOffs) || comparison.decisiveTradeOffs.length === 0) {
    details.push("payload.comparison.decisiveTradeOffs must name at least one evidence-backed trade-off.");
  } else {
    comparison.decisiveTradeOffs.forEach((tradeOff, index) => {
      const field = `payload.comparison.decisiveTradeOffs[${index}]`;
      if (
        !isRecord(tradeOff) ||
        !hasOnlyFields(tradeOff, [
          "opportunityIds",
          "summary",
          "evidenceEntryIds",
          "confidence",
        ])
      ) {
        details.push(`${field} must be a complete evidence-backed decisive trade-off.`);
        return;
      }
      details.push(
        ...validateEntryIdList(tradeOff.opportunityIds, `${field}.opportunityIds`, false),
        ...validateEvidenceBackedComparison(
          {
            summary: tradeOff.summary,
            evidenceEntryIds: tradeOff.evidenceEntryIds,
            confidence: tradeOff.confidence,
          },
          field,
        ),
      );
    });
  }
  if (
    comparison.apparentLeaderOpportunityId !== null &&
    (typeof comparison.apparentLeaderOpportunityId !== "string" ||
      comparison.apparentLeaderOpportunityId.trim() === "")
  ) {
    details.push("payload.comparison.apparentLeaderOpportunityId must be null or a non-empty Opportunity identity.");
  }
  if (!Array.isArray(comparison.blockers)) {
    details.push("payload.comparison.blockers must be an array of explicit unresolved-contender blockers.");
  } else {
    comparison.blockers.forEach((blocker, index) => {
      const field = `payload.comparison.blockers[${index}]`;
      if (
        !isRecord(blocker) ||
        !hasOnlyFields(blocker, [
          "contenderOpportunityId",
          "couldDisplaceOpportunityIds",
          "summary",
          "evidenceGapIds",
          "contradictionIds",
          "evidenceEntryIds",
        ])
      ) {
        details.push(`${field} must be a complete explicit contender blocker.`);
        return;
      }
      details.push(
        ...validateReasoningTextFields(blocker, field, [
          "contenderOpportunityId",
          "summary",
        ]),
        ...validateEntryIdList(
          blocker.couldDisplaceOpportunityIds,
          `${field}.couldDisplaceOpportunityIds`,
          false,
        ),
        ...validateEntryIdList(blocker.evidenceGapIds, `${field}.evidenceGapIds`, true),
        ...validateEntryIdList(blocker.contradictionIds, `${field}.contradictionIds`, true),
        ...validateEntryIdList(blocker.evidenceEntryIds, `${field}.evidenceEntryIds`, false),
      );
      if (
        Array.isArray(blocker.evidenceGapIds) &&
        Array.isArray(blocker.contradictionIds) &&
        blocker.evidenceGapIds.length + blocker.contradictionIds.length === 0
      ) {
        details.push(`${field} must link an unresolved Evidence Gap or Contradiction.`);
      }
    });
  }
  const decision = comparison.decision;
  if (
    !isRecord(decision) ||
    !hasOnlyFields(decision, [
      "type",
      "id",
      "kind",
      "outcome",
      "leaderOpportunityId",
      "intakeVersion",
      "applicableRule",
      "evidenceEntryIds",
      "rationale",
      "confidence",
      "limitations",
      "decidedAt",
    ]) ||
    decision.type !== "campaign-decision" ||
    decision.kind !== "opportunity-comparison" ||
    decision.outcome !== "inconclusive-comparison" ||
    decision.leaderOpportunityId !== null
  ) {
    details.push("payload.comparison.decision must be an Inconclusive Comparison Campaign Decision without a leader.");
  } else {
    details.push(
      ...validateReasoningTextFields(decision, "payload.comparison.decision", [
        "id",
        "applicableRule",
        "rationale",
      ]),
      ...validateEntryIdList(
        decision.evidenceEntryIds,
        "payload.comparison.decision.evidenceEntryIds",
        false,
      ),
      ...validateEvidenceConfidence(
        decision.confidence,
        "payload.comparison.decision.confidence",
      ),
      ...validateAssessmentLimitations(
        decision.limitations,
        "payload.comparison.decision",
      ),
    );
    if (!Number.isSafeInteger(decision.intakeVersion) || Number(decision.intakeVersion) <= 0) {
      details.push("payload.comparison.decision.intakeVersion must be a positive safe integer.");
    }
    if (!isIsoInstant(decision.decidedAt) || decision.decidedAt !== command.payload.concludedAt) {
      details.push("payload.comparison.decision.decidedAt must equal payload.concludedAt.");
    }
  }
  return details;
}

export function validateRespondInconclusiveComparisonFields(
  command: Record<string, unknown>,
): string[] {
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  const details = validatePublicResearchCommandBase(command.payload, "respondedAt");
  details.push(
    ...validateReasoningTextFields(command.payload, "payload", ["reportId"]),
  );
  const response = command.payload.response;
  if (
    isRecord(response) &&
    response.kind === "extend" &&
    hasOnlyFields(response, [
      "kind",
      "rationale",
      "targetedEvidenceGapIds",
      "affectedOpportunityIds",
      "researchBudget",
    ])
  ) {
    details.push(
      ...validateReasoningTextFields(response, "payload.response", ["rationale"]),
      ...validateEntryIdList(
        response.targetedEvidenceGapIds,
        "payload.response.targetedEvidenceGapIds",
        false,
      ),
      ...validateEntryIdList(
        response.affectedOpportunityIds,
        "payload.response.affectedOpportunityIds",
        false,
      ),
      ...validateResearchBudget(
        response.researchBudget,
        isRecord(response.researchBudget) &&
          isRecord(response.researchBudget.paidSpendCap)
          ? response.researchBudget.paidSpendCap.currency
          : undefined,
      ),
    );
    return details;
  }
  if (
    isRecord(response) &&
    response.kind === "select" &&
    hasOnlyFields(response, ["kind", "selections"])
  ) {
    if (!Array.isArray(response.selections) || response.selections.length === 0) {
      details.push("payload.response.selections must contain at least one Developer-Selected Opportunity.");
      return details;
    }
    response.selections.forEach((selection, selectionIndex) => {
      const selectionField = `payload.response.selections[${selectionIndex}]`;
      if (
        !isRecord(selection) ||
        !hasOnlyFields(selection, ["opportunityId", "rationale", "brief"])
      ) {
        details.push(`${selectionField} must contain one Opportunity, developer rationale, and brief input.`);
        return;
      }
      details.push(
        ...validateReasoningTextFields(selection, selectionField, [
          "opportunityId",
          "rationale",
        ]),
      );
      const brief = selection.brief;
      if (
        !isRecord(brief) ||
        !hasOnlyFields(brief, [
          "id",
          "buyerEconomics",
          "customerAccess",
          "alternatives",
          "risks",
          "valueHypothesis",
        ])
      ) {
        details.push(`${selectionField}.brief must contain the complete Opportunity Brief input without product specification fields.`);
        return;
      }
      details.push(
        ...validateReasoningTextFields(brief, `${selectionField}.brief`, ["id"]),
      );
      for (const field of ["buyerEconomics", "customerAccess", "alternatives"] as const) {
        details.push(
          ...validateEvidenceBackedComparison(
            brief[field],
            `${selectionField}.brief.${field}`,
          ),
        );
      }
      if (!Array.isArray(brief.risks) || brief.risks.length === 0) {
        details.push(`${selectionField}.brief.risks must contain at least one evidence-backed risk or limitation.`);
      } else {
        brief.risks.forEach((risk, riskIndex) => {
          details.push(
            ...validateEvidenceBackedComparison(
              risk,
              `${selectionField}.brief.risks[${riskIndex}]`,
            ),
          );
        });
      }
      const hypothesis = brief.valueHypothesis;
      if (
        !isRecord(hypothesis) ||
        !hasOnlyFields(hypothesis, [
          "status",
          "customer",
          "situation",
          "smallestDesiredCustomerOutcome",
          "supportedReason",
          "confidence",
          "supportingEvidenceEntryIds",
          "challengingEvidenceEntryIds",
          "assumptionIds",
          "evidenceGapIds",
          "disconfirmationConditions",
        ]) ||
        hypothesis.status !== "provisional-not-a-product-specification"
      ) {
        details.push(`${selectionField}.brief.valueHypothesis must be explicitly provisional and contain no product specification fields.`);
        return;
      }
      details.push(
        ...validateReasoningTextFields(
          hypothesis,
          `${selectionField}.brief.valueHypothesis`,
          [
            "customer",
            "situation",
            "smallestDesiredCustomerOutcome",
            "supportedReason",
          ],
        ),
        ...validateEvidenceConfidence(
          hypothesis.confidence,
          `${selectionField}.brief.valueHypothesis.confidence`,
        ),
        ...validateEntryIdList(
          hypothesis.supportingEvidenceEntryIds,
          `${selectionField}.brief.valueHypothesis.supportingEvidenceEntryIds`,
          false,
        ),
        ...validateEntryIdList(
          hypothesis.challengingEvidenceEntryIds,
          `${selectionField}.brief.valueHypothesis.challengingEvidenceEntryIds`,
          true,
        ),
        ...validateEntryIdList(
          hypothesis.assumptionIds,
          `${selectionField}.brief.valueHypothesis.assumptionIds`,
          true,
        ),
        ...validateEntryIdList(
          hypothesis.evidenceGapIds,
          `${selectionField}.brief.valueHypothesis.evidenceGapIds`,
          true,
        ),
        ...validateEntryIdList(
          hypothesis.disconfirmationConditions,
          `${selectionField}.brief.valueHypothesis.disconfirmationConditions`,
          false,
        ),
        ...validateNoFalsePrecision(brief, `${selectionField}.brief`),
      );
    });
    return details;
  }
  if (
    !isRecord(response) ||
    !hasOnlyFields(response, ["kind", "rationale"]) ||
    response.kind !== "stop"
  ) {
    details.push("payload.response must be an explicit stop, targeted extension, or developer selection.");
    return details;
  }
  details.push(
    ...validateReasoningTextFields(response, "payload.response", ["rationale"]),
  );
  return details;
}

export function validateReevaluateCampaignFields(
  command: Record<string, unknown>,
): string[] {
  if (!isRecord(command.payload)) {
    return ["payload must be an object."];
  }
  const details = validatePublicResearchCommandBase(
    command.payload,
    "reevaluatedAt",
  );
  if (
    !hasOnlyFields(command.payload, [
      "campaignPath",
      "coordinatorId",
      "reevaluatedAt",
      "operation",
    ]) ||
    !isRecord(command.payload.operation)
  ) {
    details.push("payload must contain one complete re-evaluation operation.");
    return details;
  }
  const operation = command.payload.operation;
  if (
    !hasOnlyFields(operation, [
      "id",
      "kind",
      "reason",
      "reasoningEntries",
      "intakeRevision",
      "decision",
    ])
  ) {
    details.push("payload.operation must contain the complete explicit re-evaluation operation.");
    return details;
  }
  details.push(
    ...validateReasoningTextFields(operation, "payload.operation", ["id", "reason"]),
    ...validatePersistableText(operation.reason, "payload.operation.reason"),
  );
  if (
    ![
      "developer-challenge",
      "intake-revision",
      "source-correction",
      "source-redaction",
      "freshness-change",
      "contradiction",
      "new-evidence",
      "resume-refresh",
    ].includes(String(operation.kind))
  ) {
    details.push("payload.operation.kind is not a supported re-evaluation trigger.");
  }
  if (!Array.isArray(operation.reasoningEntries)) {
    details.push("payload.operation.reasoningEntries must be an array.");
  } else {
    operation.reasoningEntries.forEach((entry, index) => {
      details.push(
        ...validateReasoningEntry(
          entry,
          `payload.operation.reasoningEntries[${index}]`,
        ),
      );
    });
  }
  if (operation.intakeRevision !== null) {
    if (
      !isRecord(operation.intakeRevision) ||
      !hasOnlyFields(operation.intakeRevision, ["reason", "intake"])
    ) {
      details.push("payload.operation.intakeRevision must contain a reason and complete confirmed Campaign Intake.");
    } else {
      details.push(
        ...validateReasoningTextFields(
          operation.intakeRevision,
          "payload.operation.intakeRevision",
          ["reason"],
        ),
        ...validatePersistableText(
          operation.intakeRevision.reason,
          "payload.operation.intakeRevision.reason",
        ),
        ...validateCampaignIntake(
          isRecord(operation.intakeRevision.intake)
            ? { ...operation.intakeRevision.intake, version: 1 }
            : operation.intakeRevision.intake,
          command.payload.reevaluatedAt,
        ),
      );
    }
  }
  const decision = operation.decision;
  if (
    !isRecord(decision) ||
    !hasOnlyFields(decision, [
      "type",
      "id",
      "kind",
      "outcome",
      "intakeVersion",
      "applicableRule",
      "triggerEntryIds",
      "affectedOpportunityIds",
      "supersededDecisionIds",
      "rationale",
      "confidence",
      "limitations",
      "decidedAt",
    ]) ||
    decision.type !== "campaign-decision" ||
    decision.kind !== "campaign-re-evaluation" ||
    !["resume", "reaffirm"].includes(String(decision.outcome))
  ) {
    details.push("payload.operation.decision must be a complete campaign re-evaluation Campaign Decision.");
    return details;
  }
  details.push(
    ...validateReasoningTextFields(decision, "payload.operation.decision", [
      "id",
      "applicableRule",
      "rationale",
    ]),
    ...validateEntryIdList(
      decision.triggerEntryIds,
      "payload.operation.decision.triggerEntryIds",
      true,
    ),
    ...validateEntryIdList(
      decision.affectedOpportunityIds,
      "payload.operation.decision.affectedOpportunityIds",
      true,
    ),
    ...validateEntryIdList(
      decision.supersededDecisionIds,
      "payload.operation.decision.supersededDecisionIds",
      true,
    ),
    ...validateEvidenceConfidence(
      decision.confidence,
      "payload.operation.decision.confidence",
    ),
    ...validateAssessmentLimitations(
      decision.limitations,
      "payload.operation.decision",
    ),
  );
  if (!Number.isSafeInteger(decision.intakeVersion) || Number(decision.intakeVersion) <= 0) {
    details.push("payload.operation.decision.intakeVersion must be a positive safe integer.");
  }
  if (
    !isIsoInstant(decision.decidedAt) ||
    decision.decidedAt !== command.payload.reevaluatedAt
  ) {
    details.push("payload.operation.decision.decidedAt must equal payload.reevaluatedAt.");
  }
  return details;
}
