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

type CampaignLocator = {
  campaignPath?: string;
  searchPath?: string;
};

type WorkView = {
  campaignId: string;
  recordSequence: number;
  phase: "campaign-created";
  pause: null;
  completedWork: string[];
  nextPermittedActions: string[];
};

type CoordinatorLease = {
  coordinatorId: string;
  acquiredAt: string;
  expiresAt: string;
};

type CampaignOperation = {
  campaignId: string;
  requestId: string;
  recordedAt: string;
  firstSequence: number;
  operation: "create-campaign" | "resume-campaign";
  outcome: "campaign-created" | "campaign-resumed";
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

function initialWorkView(campaignId: string): WorkView {
  return {
    campaignId,
    recordSequence: 2,
    phase: "campaign-created",
    pause: null,
    completedWork: ["Scouting Campaign created"],
    nextPermittedActions: ["confirm-campaign-intake"],
  };
}

function campaignOperationRecords(operation: CampaignOperation) {
  const recordBase = {
    recordVersion: contracts.records,
    campaignId: operation.campaignId,
    requestId: operation.requestId,
    recordedAt: operation.recordedAt,
  };
  return [
    {
      ...recordBase,
      recordId: `${operation.campaignId}:record:${String(operation.firstSequence).padStart(12, "0")}`,
      sequence: operation.firstSequence,
      type: "operation-intent",
      operation: operation.operation,
      coordinatorId: operation.coordinatorId,
      leaseExpiresAt: operation.leaseExpiresAt,
    },
    {
      ...recordBase,
      recordId: `${operation.campaignId}:record:${String(operation.firstSequence + 1).padStart(12, "0")}`,
      sequence: operation.firstSequence + 1,
      type: operation.outcome,
    },
  ];
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
  projections: { workView: "work-view.json" };
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
    value.projections.workView !== "work-view.json"
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
  for (const [index, record] of records.entries()) {
    const sequence = index + 1;
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
    if (sequence % 2 === 1) {
      const expectedOperation = sequence === 1 ? "create-campaign" : "resume-campaign";
      if (
        record.type !== "operation-intent" ||
        record.operation !== expectedOperation ||
        typeof record.coordinatorId !== "string" ||
        record.coordinatorId.trim() === "" ||
        !isIsoInstant(record.leaseExpiresAt) ||
        record.leaseExpiresAt <= record.recordedAt ||
        operationRequests.has(record.requestId)
      ) {
        throw new Error(`authoritative record ${sequence} is invalid`);
      }
      operationRequests.add(record.requestId);
      continue;
    }
    const intent = records[index - 1];
    const expectedType = sequence === 2 ? "campaign-created" : "campaign-resumed";
    if (
      !isRecord(intent) ||
      record.type !== expectedType ||
      record.requestId !== intent.requestId ||
      record.recordedAt !== intent.recordedAt
    ) {
      throw new Error(`authoritative record ${sequence} is invalid`);
    }
  }
  const creationIntent = records[0];
  if (!isRecord(creationIntent) || manifest.createdAt !== creationIntent.recordedAt) {
    throw new Error("manifest creation time does not match authoritative history");
  }

  const workView = initialWorkView(manifest.campaignId);
  workView.recordSequence = records.length;
  const latestIntent = records.findLast(
    (record) => isRecord(record) && record.type === "operation-intent",
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
      recordedAt: latestIntent.recordedAt,
    },
    validation: {
      valid: true,
      recordCount: records.length,
      checkpointSequence,
    },
  };
}

async function loadCampaign(campaignPath: string) {
  const rebuiltCampaign = await rebuildCampaignFromAuthority(campaignPath);
  const persistedWorkView = await readJson(
    path.join(rebuiltCampaign.campaign.path, "work-view.json"),
  );
  if (
    JSON.stringify(persistedWorkView) !== JSON.stringify(rebuiltCampaign.workView)
  ) {
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

  return {
    campaign: rebuiltCampaign.campaign,
    workView: rebuiltCampaign.workView,
    lease: rebuiltCampaign.lease,
    validation: rebuiltCampaign.validation,
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

async function resumeCampaign(command: ResumeCampaignCommand, currentTime: string) {
  let coordinatorLock: CoordinatorOperationLock | undefined;
  try {
    const { campaignPath } = await locateCampaign(command.payload);
    coordinatorLock = await acquireCoordinatorOperationLock(
      campaignPath,
      command.requestId,
      command.payload.coordinatorId,
      currentTime,
    );
    if (coordinatorLock === undefined) {
      return {
        envelopeVersion: contracts.commandEnvelope,
        requestId: command.requestId,
        command: command.command,
        ok: false as const,
        error: {
          code: "SVS-CAMPAIGN-LOCKED",
          message: "Scouting Campaign is being changed by another coordinator.",
          action: "Do not resume concurrently; retry after the active operation finishes.",
        },
      };
    }
    const rebuiltCampaign = await rebuildCampaignFromAuthority(campaignPath);
    const existingRecords = rebuiltCampaign.records;
    const matchingIntent = existingRecords.some(
      (record) =>
        isRecord(record) &&
        record.type === "operation-intent" &&
        record.operation === "resume-campaign" &&
        record.requestId === command.requestId &&
        record.recordedAt === command.payload.resumedAt &&
        record.coordinatorId === command.payload.coordinatorId &&
        record.leaseExpiresAt === command.payload.leaseExpiresAt,
    );
    const matchingOutcome = existingRecords.some(
      (record) =>
        isRecord(record) &&
        record.type === "campaign-resumed" &&
        record.requestId === command.requestId,
    );
    if (matchingIntent && matchingOutcome) {
      await persistDerivedCampaignState(campaignPath, rebuiltCampaign);
      const replayed = await loadCampaign(campaignPath);
      return {
        envelopeVersion: contracts.commandEnvelope,
        requestId: command.requestId,
        command: command.command,
        ok: true as const,
        result: {
          resumed: false,
          campaign: replayed.campaign,
          summary: {
            completedWork: replayed.workView.completedWork,
            currentPhase: replayed.workView.phase,
            currentPause: replayed.workView.pause,
            nextPermittedActions: replayed.workView.nextPermittedActions,
          },
          workView: replayed.workView,
          lease: replayed.lease,
          validation: replayed.validation,
        },
      };
    }
    const before = await loadCampaign(campaignPath);
    if (
      existingRecords.some(
        (record) => isRecord(record) && record.requestId === command.requestId,
      )
    ) {
      return {
        envelopeVersion: contracts.commandEnvelope,
        requestId: command.requestId,
        command: command.command,
        ok: false as const,
        error: {
          code: "SVS-CAMPAIGN-REQUEST-CONFLICT",
          message: "Resume request identity was already used with different input.",
          action:
            "Reuse the original request payload or provide a new stable request identity.",
        },
      };
    }
    if (
      before.lease.coordinatorId !== command.payload.coordinatorId &&
      before.lease.expiresAt > currentTime
    ) {
      return {
        envelopeVersion: contracts.commandEnvelope,
        requestId: command.requestId,
        command: command.command,
        ok: false as const,
        error: {
          code: "SVS-CAMPAIGN-LEASE-HELD",
          message: `Scouting Campaign has an active lease held by ${before.lease.coordinatorId}.`,
          action:
            "Do not resume concurrently; use the active coordinator or wait until the recorded lease expires.",
        },
      };
    }

    const firstSequence = before.validation.recordCount + 1;
    const records = campaignOperationRecords({
      campaignId: before.campaign.id,
      requestId: command.requestId,
      recordedAt: command.payload.resumedAt,
      firstSequence,
      operation: "resume-campaign",
      outcome: "campaign-resumed",
      coordinatorId: command.payload.coordinatorId,
      leaseExpiresAt: command.payload.leaseExpiresAt,
    });
    await appendFile(
      path.join(campaignPath, "records.jsonl"),
      `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
      { encoding: "utf8", mode: 0o600 },
    );

    const updatedCampaign = await rebuildCampaignFromAuthority(campaignPath);
    await persistDerivedCampaignState(campaignPath, updatedCampaign);
    const after = await loadCampaign(campaignPath);
    return {
      envelopeVersion: contracts.commandEnvelope,
      requestId: command.requestId,
      command: command.command,
      ok: true as const,
      result: {
        resumed: true,
        campaign: after.campaign,
        summary: {
          completedWork: after.workView.completedWork,
          currentPhase: after.workView.phase,
          currentPause: after.workView.pause,
          nextPermittedActions: after.workView.nextPermittedActions,
        },
        workView: after.workView,
        lease: after.lease,
        validation: after.validation,
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
        message: "Scouting Campaign could not be located and validated for resume.",
        action:
          "Preserve the Campaign contents for recovery and do not continue until validation succeeds.",
        details: [error instanceof Error ? error.message : "unknown validation error"],
      },
    };
  } finally {
    if (coordinatorLock !== undefined) {
      await releaseCoordinatorOperationLock(coordinatorLock);
    }
  }
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
      outcome: "campaign-created",
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
      projections: { workView: "work-view.json" },
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
    !["preflight", "createCampaign", "inspectCampaign", "resumeCampaign"].includes(
      receivedCommand,
    )
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
