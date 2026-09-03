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
  const text = await readFile(path.join(campaignPath, "records.jsonl"), "utf8");
  const lines = text.trimEnd().split("\n");
  return {
    text,
    records: lines.map((line) => JSON.parse(line) as unknown),
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
  if (
    recordsMatch(
      authoritative.records,
      journal.firstSequence,
      journal.records,
    )
  ) {
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
    throw new Error(
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
    throw new Error("durable operation intent is invalid");
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
          throw new Error(`durable operation intent ${entry.name} is invalid`);
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
