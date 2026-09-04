import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import contracts from "../../release/contracts.json" with { type: "json" };
import { CampaignAuthorityError } from "./campaign-errors.js";
import { authoritativeOperations } from "./types.js";
import type { AuthoritativeOperation } from "./types.js";

export type RecoveredOperation = {
  requestId: string;
  operation: AuthoritativeOperation;
  resolution:
    | "completed-from-durable-intent"
    | "authoritative-records-present";
};

export type InterruptedOperationRecovery = {
  journalPath: string;
  operation: RecoveredOperation;
  authoritativeRecordsChanged: boolean;
};

type OperationJournal = {
  journalVersion: string;
  status: "intent-recorded";
  requestId: string;
  operation: AuthoritativeOperation;
  commandDigest: string;
  firstSequence: number;
  records: [Record<string, unknown>, Record<string, unknown>];
};

const journalDirectoryName = ".operation-journal";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function commandDigest(command: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(command)))
    .digest("hex");
}

export function recordDigest(record: Record<string, unknown>): string {
  const { recordDigest: _recordDigest, ...unsignedRecord } = record;
  return commandDigest(unsignedRecord);
}

export function manifestDigest(manifest: Record<string, unknown>): string {
  const { manifestDigest: _manifestDigest, ...unsignedManifest } = manifest;
  return commandDigest(unsignedManifest);
}

export function addManifestDigest(
  manifest: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...manifest,
    manifestDigest: manifestDigest(manifest),
  };
}

export function addRecordDigests(
  records: Record<string, unknown>[],
): Record<string, unknown>[] {
  return records.map((record) => ({
    ...record,
    recordDigest: recordDigest(record),
  }));
}

export function authoritativeHistoryDigest(records: unknown[]): string {
  return commandDigest(records);
}

export function parseAuthoritativeRecordText(text: string): unknown[] {
  if (text.trim() === "") {
    throw new CampaignAuthorityError("damaged", "authoritative history is empty");
  }
  return text
    .trimEnd()
    .split("\n")
    .map((line, index) => {
      try {
        return JSON.parse(line) as unknown;
      } catch {
        throw new CampaignAuthorityError(
          "damaged",
          `authoritative record line ${index + 1} is not valid JSON; damaged tail was preserved`,
        );
      }
    });
}

export function injectPersistenceFault(point: string): void {
  if (
    process.env.NODE_ENV === "test" &&
    process.env.SVS_FAULT_INJECTION === point
  ) {
    throw new Error(`injected persistence fault: ${point}`);
  }
}

async function syncDirectory(directoryPath: string): Promise<void> {
  const directory = await open(directoryPath, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

async function writeDurablePrivateText(
  targetPath: string,
  value: string,
): Promise<void> {
  const file = await open(targetPath, "w", 0o600);
  try {
    await file.writeFile(value, "utf8");
    await file.sync();
  } finally {
    await file.close();
  }
  await chmod(targetPath, 0o600);
}

async function replaceDurablePrivateText(
  targetPath: string,
  value: string,
): Promise<void> {
  const parentPath = path.dirname(targetPath);
  const temporaryDirectory = await mkdtemp(path.join(parentPath, ".svs-commit-"));
  await chmod(temporaryDirectory, 0o700);
  try {
    const temporaryPath = path.join(temporaryDirectory, path.basename(targetPath));
    await writeDurablePrivateText(temporaryPath, value);
    await rename(temporaryPath, targetPath);
    await syncDirectory(parentPath);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function parseOperationJournal(value: unknown): OperationJournal | undefined {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return undefined;
  }
  const journal = value as Partial<OperationJournal>;
  if (
    journal.journalVersion !== contracts.records ||
    journal.status !== "intent-recorded" ||
    typeof journal.requestId !== "string" ||
    journal.requestId.trim() === "" ||
    typeof journal.operation !== "string" ||
    !authoritativeOperations.includes(
      journal.operation as AuthoritativeOperation,
    ) ||
    typeof journal.commandDigest !== "string" ||
    !/^[a-f0-9]{64}$/.test(journal.commandDigest) ||
    !Number.isSafeInteger(journal.firstSequence) ||
    Number(journal.firstSequence) < 1 ||
    !Array.isArray(journal.records) ||
    journal.records.length !== 2 ||
    journal.records.some(
      (record) =>
        record === null || typeof record !== "object" || Array.isArray(record),
    )
  ) {
    return undefined;
  }
  const [intent, outcome] = journal.records;
  if (
    intent?.type !== "operation-intent" ||
    intent.operation !== journal.operation ||
    intent.requestId !== journal.requestId ||
    intent.commandDigest !== journal.commandDigest ||
    intent.sequence !== journal.firstSequence ||
    outcome?.requestId !== journal.requestId ||
    outcome.sequence !== Number(journal.firstSequence) + 1
  ) {
    return undefined;
  }
  return journal as OperationJournal;
}

function journalFileName(requestId: string): string {
  return `${createHash("sha256").update(requestId).digest("hex")}.json`;
}

async function readAuthoritativeRecords(
  campaignPath: string,
): Promise<{ text: string; records: unknown[] }> {
  let text: string;
  try {
    text = await readFile(path.join(campaignPath, "records.jsonl"), "utf8");
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
  return {
    text,
    records: parseAuthoritativeRecordText(text),
  };
}

function recordsMatch(
  existing: unknown[],
  firstSequence: number,
  expected: Record<string, unknown>[],
): boolean {
  const offset = firstSequence - 1;
  return expected.every(
    (record, index) =>
      JSON.stringify(existing[offset + index]) === JSON.stringify(record),
  );
}

type AnchoredManifest = Record<string, unknown> & {
  authority: Record<string, unknown> & {
    records: "records.jsonl";
    recordCount: number;
    historyDigest: string;
  };
};

async function readAnchoredManifest(
  campaignPath: string,
): Promise<AnchoredManifest> {
  let value: unknown;
  try {
    value = JSON.parse(
      await readFile(path.join(campaignPath, "manifest.json"), "utf8"),
    ) as unknown;
  } catch (error) {
    throw new CampaignAuthorityError(
      "damaged",
      error instanceof Error ? error.message : "manifest is not valid JSON",
    );
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new CampaignAuthorityError("damaged", "manifest is invalid");
  }
  const manifest = value as Record<string, unknown>;
  if (
    typeof manifest.manifestDigest !== "string" ||
    manifest.manifestDigest !== manifestDigest(manifest)
  ) {
    throw new CampaignAuthorityError(
      "reconciliation",
      "manifest integrity digest does not match",
    );
  }
  const authority = manifest.authority;
  if (
    authority === null ||
    typeof authority !== "object" ||
    Array.isArray(authority)
  ) {
    throw new CampaignAuthorityError(
      "damaged",
      "manifest authority anchor is invalid",
    );
  }
  const anchor = authority as Record<string, unknown>;
  if (
    anchor.records !== "records.jsonl" ||
    !Number.isSafeInteger(anchor.recordCount) ||
    Number(anchor.recordCount) < 2 ||
    typeof anchor.historyDigest !== "string" ||
    !/^[a-f0-9]{64}$/.test(anchor.historyDigest)
  ) {
    throw new CampaignAuthorityError(
      "damaged",
      "manifest authority anchor is invalid",
    );
  }
  return manifest as AnchoredManifest;
}

function manifestAnchorMatches(
  manifest: AnchoredManifest,
  records: unknown[],
): boolean {
  return (
    manifest.authority.recordCount === records.length &&
    manifest.authority.historyDigest === authoritativeHistoryDigest(records)
  );
}

async function updateManifestAnchor(
  campaignPath: string,
  manifest: AnchoredManifest,
  records: unknown[],
): Promise<void> {
  const { manifestDigest: _manifestDigest, ...manifestFields } = manifest;
  const updatedManifest = addManifestDigest({
    ...manifestFields,
    authority: {
      ...manifest.authority,
      recordCount: records.length,
      historyDigest: authoritativeHistoryDigest(records),
    },
  });
  await replaceDurablePrivateText(
    path.join(campaignPath, "manifest.json"),
    `${JSON.stringify(updatedManifest, null, 2)}\n`,
  );
}

export async function stageOperationIntent(
  campaignPath: string,
  records: Record<string, unknown>[],
): Promise<string> {
  const intent = records[0];
  if (
    records.length !== 2 ||
    intent?.type !== "operation-intent" ||
    typeof intent.requestId !== "string" ||
    typeof intent.operation !== "string" ||
    typeof intent.commandDigest !== "string" ||
    typeof intent.sequence !== "number"
  ) {
    throw new Error("operation cannot be journaled without complete durable intent");
  }
  const journalDirectory = path.join(campaignPath, journalDirectoryName);
  await mkdir(journalDirectory, { recursive: true, mode: 0o700 });
  await chmod(journalDirectory, 0o700);
  const journalPath = path.join(journalDirectory, journalFileName(intent.requestId));
  const journal: OperationJournal = {
    journalVersion: contracts.records,
    status: "intent-recorded",
    requestId: intent.requestId,
    operation: intent.operation as AuthoritativeOperation,
    commandDigest: intent.commandDigest,
    firstSequence: intent.sequence,
    records: [records[0], records[1]],
  };
  const temporaryPath = `${journalPath}.${process.pid}.tmp`;
  await writeDurablePrivateText(
    temporaryPath,
    `${JSON.stringify(journal, null, 2)}\n`,
  );
  try {
    await rename(temporaryPath, journalPath);
    await syncDirectory(journalDirectory);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  return journalPath;
}

async function commitJournal(
  campaignPath: string,
  journalPath: string,
  journal: OperationJournal,
): Promise<InterruptedOperationRecovery> {
  const authoritative = await readAuthoritativeRecords(campaignPath);
  const manifest = await readAnchoredManifest(campaignPath);
  for (const [index, value] of authoritative.records.entries()) {
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      throw new CampaignAuthorityError(
        "damaged",
        `authoritative record ${index + 1} is invalid`,
      );
    }
    const record = value as Record<string, unknown>;
    if (
      record.recordVersion === contracts.records &&
      (typeof record.recordDigest !== "string" ||
        record.recordDigest !== recordDigest(record))
    ) {
      throw new CampaignAuthorityError(
        "reconciliation",
        `authoritative record ${index + 1} integrity digest does not match`,
      );
    }
  }
  const journalRecordsPresent = recordsMatch(
    authoritative.records,
    journal.firstSequence,
    journal.records,
  );
  const anchoredPrefix = authoritative.records.slice(
    0,
    journal.firstSequence - 1,
  );
  const recoverableUnanchoredCommit =
    journalRecordsPresent &&
    authoritative.records.length === journal.firstSequence + 1 &&
    manifestAnchorMatches(manifest, anchoredPrefix);
  if (
    !manifestAnchorMatches(manifest, authoritative.records) &&
    !recoverableUnanchoredCommit
  ) {
    throw new CampaignAuthorityError(
      "reconciliation",
      "authoritative history does not match its manifest anchor",
    );
  }
  if (journalRecordsPresent) {
    if (recoverableUnanchoredCommit) {
      await updateManifestAnchor(campaignPath, manifest, authoritative.records);
    }
    return {
      journalPath,
      operation: {
        requestId: journal.requestId,
        operation: journal.operation,
        resolution: "authoritative-records-present",
      },
      authoritativeRecordsChanged: false,
    };
  }
  if (authoritative.records.length !== journal.firstSequence - 1) {
    throw new CampaignAuthorityError(
      "reconciliation",
      `interrupted operation ${journal.requestId} conflicts with authoritative history`,
    );
  }
  const prefix = authoritative.text.endsWith("\n")
    ? authoritative.text
    : `${authoritative.text}\n`;
  const appended = `${journal.records.map((record) => JSON.stringify(record)).join("\n")}\n`;
  await replaceDurablePrivateText(
    path.join(campaignPath, "records.jsonl"),
    `${prefix}${appended}`,
  );
  injectPersistenceFault("after-authoritative-records");
  const updatedRecords = [...authoritative.records, ...journal.records];
  await updateManifestAnchor(campaignPath, manifest, updatedRecords);
  return {
    journalPath,
    operation: {
      requestId: journal.requestId,
      operation: journal.operation,
      resolution: "completed-from-durable-intent",
    },
    authoritativeRecordsChanged: true,
  };
}

export async function commitStagedOperation(
  campaignPath: string,
  journalPath: string,
): Promise<InterruptedOperationRecovery> {
  const journal = parseOperationJournal(
    JSON.parse(await readFile(journalPath, "utf8")) as unknown,
  );
  if (journal === undefined) {
    throw new CampaignAuthorityError(
      "damaged",
      "durable operation intent is invalid",
    );
  }
  return commitJournal(campaignPath, journalPath, journal);
}

export async function recoverInterruptedOperations(
  campaignPath: string,
): Promise<InterruptedOperationRecovery[]> {
  const journalDirectory = path.join(campaignPath, journalDirectoryName);
  let entries;
  try {
    entries = await readdir(journalDirectory, { withFileTypes: true });
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return [];
    }
    throw error;
  }
  const journals = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const journalPath = path.join(journalDirectory, entry.name);
        const journal = parseOperationJournal(
          JSON.parse(await readFile(journalPath, "utf8")) as unknown,
        );
        if (journal === undefined) {
          throw new CampaignAuthorityError(
            "damaged",
            `durable operation intent ${entry.name} is invalid`,
          );
        }
        return { journalPath, journal };
      }),
  );
  journals.sort(
    (left, right) =>
      left.journal.firstSequence - right.journal.firstSequence ||
      left.journal.requestId.localeCompare(right.journal.requestId),
  );
  const recovered: InterruptedOperationRecovery[] = [];
  for (const { journalPath, journal } of journals) {
    recovered.push(await commitJournal(campaignPath, journalPath, journal));
  }
  return recovered;
}

export async function completeOperationRecovery(
  recovery: InterruptedOperationRecovery,
): Promise<void> {
  await rm(recovery.journalPath);
  await syncDirectory(path.dirname(recovery.journalPath));
}
