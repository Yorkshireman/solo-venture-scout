import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import path from "node:path";
import contracts from "../../release/contracts.json" with { type: "json" };
import type { MigrateCampaignCommand } from "./types.js";
import { isRecord } from "./validation.js";
import {
  acquireCoordinatorOperationLock,
  loadCampaign,
  matchesContracts,
  newerContractDetails,
  persistDerivedCampaignState,
  readCampaignRecords,
  readJson,
  rebuildCampaignFromAuthority,
  releaseCoordinatorOperationLock,
  replacePrivateJson,
  replacePrivateText,
  writePrivateJson,
  writePrivateText,
} from "./authority.js";
import {
  addManifestDigest,
  addRecordDigests,
  authoritativeHistoryDigest,
  assertManifestDigest,
  campaignAuthorityDigest,
  injectPersistenceFault,
} from "./recovery.js";
import {
  AmbiguousCampaignDiscoveryError,
  campaignAuthorityFailure,
  NewerCampaignContractsError,
} from "./campaign-errors.js";

export const supportedOlderCampaignVersions = {
  release: "0.1.0",
  campaignFormat: "0.1.0",
  records: "0.1.0",
  commandEnvelope: "0.1.0",
  researchPackages: "0.1.0",
  renderTemplates: "0.1.0",
} as const;

export const campaignMigrationId = "campaign-format-0.1.0-to-0.2.0";
export const campaignMigrationSteps = [
  "snapshot-authoritative-artifacts",
  "upgrade-record-integrity",
  "validate-complete-campaign",
  "advance-manifest-versions",
] as const;

type CampaignMigrationStep = (typeof campaignMigrationSteps)[number];
type CampaignMigrationStepStatus = "pending" | "completed";

type CampaignMigrationJournal = {
  journalVersion: string;
  requestId: string;
  migrationId: typeof campaignMigrationId;
  direction: "forward-only";
  status: "in-progress" | "completed" | "failed";
  coordinatorId: string;
  confirmedAt: string;
  sourceAuthorityDigest: string;
  fromVersions: typeof supportedOlderCampaignVersions;
  toVersions: typeof contracts;
  steps: Array<{
    name: CampaignMigrationStep;
    status: CampaignMigrationStepStatus;
  }>;
  failure?: string;
};

export async function unsupportedNewerCampaignContracts(
  campaignPath: string,
): Promise<string[] | undefined> {
  const manifest = JSON.parse(
    await readFile(path.join(campaignPath, "manifest.json"), "utf8"),
  ) as unknown;
  if (!isRecord(manifest) || !isRecord(manifest.versions)) {
    return undefined;
  }
  if (manifest.manifestDigest !== undefined) {
    assertManifestDigest(manifest);
  }
  const details = newerContractDetails(manifest.versions);
  return details.length === 0 ? undefined : details;
}

export async function supportedCampaignMigrationPlan(campaignPath: string) {
  const manifest = JSON.parse(
    await readFile(path.join(campaignPath, "manifest.json"), "utf8"),
  ) as unknown;
  if (
    !isRecord(manifest) ||
    typeof manifest.campaignId !== "string" ||
    !isRecord(manifest.versions) ||
    !matchesContracts(manifest.versions, supportedOlderCampaignVersions)
  ) {
    return undefined;
  }
  const rebuiltCampaign = await rebuildCampaignFromAuthority(
    campaignPath,
    supportedOlderCampaignVersions,
  );
  const sourceAuthorityDigest = campaignAuthorityDigest(
    manifest,
    rebuiltCampaign.records,
  );
  return {
    campaign: {
      id: manifest.campaignId,
      path: campaignPath,
      versions: supportedOlderCampaignVersions,
    },
    migration: {
      required: true as const,
      id: campaignMigrationId,
      direction: "forward-only" as const,
      sourceAuthorityDigest,
      fromVersions: supportedOlderCampaignVersions,
      toVersions: contracts,
      steps: [...campaignMigrationSteps],
      confirmation: {
        required: true as const,
        command: "migrateCampaign" as const,
        sourceAuthorityDigest,
      },
    },
  };
}

async function optionalCampaignManifest(campaignPath: string) {
  try {
    const manifest = await readJson(path.join(campaignPath, "manifest.json"));
    return isRecord(manifest) &&
      typeof manifest.campaignId === "string" &&
      isRecord(manifest.versions) &&
      isRecord(manifest.authority) &&
      manifest.authority.records === "records.jsonl"
      ? manifest
      : undefined;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT" &&
      error.message.includes("manifest.json")
    ) {
      return undefined;
    }
    throw error;
  }
}

export async function discoverSupportedCampaignMigration(searchPath: string) {
  const resolvedSearchPath = path.resolve(searchPath);
  const candidates = [resolvedSearchPath];
  for (const entry of await readdir(resolvedSearchPath, {
    withFileTypes: true,
  })) {
    if (entry.isDirectory()) {
      candidates.push(path.join(resolvedSearchPath, entry.name));
    }
  }
  const discovered = [];
  for (const candidate of candidates) {
    const manifest = await optionalCampaignManifest(candidate);
    if (manifest !== undefined) {
      discovered.push({ candidate, manifest });
    }
  }
  if (discovered.length > 1) {
    throw new AmbiguousCampaignDiscoveryError(
      discovered.map(({ candidate }) => candidate).sort(),
    );
  }
  const match = discovered[0];
  if (match === undefined) {
    return undefined;
  }
  const newerContracts = await unsupportedNewerCampaignContracts(
    match.candidate,
  );
  if (newerContracts !== undefined) {
    throw new NewerCampaignContractsError(newerContracts);
  }
  return supportedCampaignMigrationPlan(match.candidate);
}

function migrationResponse(
  command: MigrateCampaignCommand,
  result:
    | { ok: true; value: Record<string, unknown> }
    | {
        ok: false;
        code: string;
        message: string;
        action: string;
        details?: string[];
      },
) {
  return result.ok
    ? {
        envelopeVersion: contracts.commandEnvelope,
        requestId: command.requestId,
        command: command.command,
        ok: true as const,
        result: result.value,
      }
    : {
        envelopeVersion: contracts.commandEnvelope,
        requestId: command.requestId,
        command: command.command,
        ok: false as const,
        error: {
          code: result.code,
          message: result.message,
          action: result.action,
          ...(result.details === undefined ? {} : { details: result.details }),
        },
      };
}

function completedStep(
  journal: CampaignMigrationJournal,
  name: CampaignMigrationStep,
): CampaignMigrationJournal {
  return {
    ...journal,
    steps: journal.steps.map((step) =>
      step.name === name ? { ...step, status: "completed" } : step,
    ),
  };
}

export async function migrateCampaign(command: MigrateCampaignCommand) {
  const campaignPath = path.resolve(command.payload.campaignPath);
  if (command.payload.migrationId !== campaignMigrationId) {
    return migrationResponse(command, {
      ok: false,
      code: "SVS-CAMPAIGN-MIGRATION-UNSUPPORTED",
      message: `Campaign migration ${command.payload.migrationId} is not supported.`,
      action:
        "Resume the Campaign to obtain its exact migration plan; never reinterpret it with another migration.",
    });
  }

  const migrationPath = path.join(campaignPath, "migrations", campaignMigrationId);
  const snapshotPath = path.join(migrationPath, "snapshot");
  const journalPath = path.join(migrationPath, "journal.json");
  try {
    const completedJournal = await readJson(journalPath);
    if (isRecord(completedJournal) && completedJournal.status === "completed") {
      if (
        completedJournal.requestId !== command.requestId ||
        completedJournal.coordinatorId !== command.payload.coordinatorId ||
        completedJournal.confirmedAt !== command.payload.confirmedAt ||
        completedJournal.sourceAuthorityDigest !==
          command.payload.sourceAuthorityDigest
      ) {
        return migrationResponse(command, {
          ok: false,
          code: "SVS-CAMPAIGN-MIGRATION-REQUEST-CONFLICT",
          message:
            "The completed migration journal belongs to a different confirmation request.",
          action:
            "Reuse the exact original migration request or inspect the already migrated Campaign without running another migration.",
        });
      }
      const expectedSteps = campaignMigrationSteps.map((name) => ({
        name,
        status: "completed",
      }));
      if (
        completedJournal.migrationId !== campaignMigrationId ||
        completedJournal.direction !== "forward-only" ||
        JSON.stringify(completedJournal.steps) !== JSON.stringify(expectedSteps)
      ) {
        return migrationResponse(command, {
          ok: false,
          code: "SVS-CAMPAIGN-MIGRATION-JOURNAL-DAMAGED",
          message: "The completed Campaign migration journal is invalid.",
          action:
            "Preserve the Campaign, journal, and snapshot; reconcile the journal against the migrated Campaign before continuing.",
        });
      }
      await readFile(path.join(snapshotPath, "manifest.json"));
      await readFile(path.join(snapshotPath, "records.jsonl"));
      const campaign = await loadCampaign(campaignPath);
      return migrationResponse(command, {
        ok: true,
        value: {
          migrated: false,
          campaign: campaign.campaign,
          migration: {
            id: campaignMigrationId,
            direction: "forward-only",
            status: "completed",
            snapshotPath,
            journalPath,
            steps: expectedSteps,
          },
          workView: campaign.workView,
          validation: campaign.validation,
        },
      });
    }
  } catch (error) {
    if (
      !(
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      )
    ) {
      return migrationResponse(command, {
        ok: false,
        code: "SVS-CAMPAIGN-MIGRATION-JOURNAL-DAMAGED",
        message: "The Campaign migration journal could not be validated.",
        action:
          "Preserve the Campaign, journal, and snapshot; resolve the reported journal or Campaign damage before continuing.",
        details: [
          error instanceof Error ? error.message : "unknown validation error",
        ],
      });
    }
  }

  let plan;
  try {
    plan = await supportedCampaignMigrationPlan(campaignPath);
  } catch (error) {
    const authorityFailure = campaignAuthorityFailure(error);
    if (authorityFailure !== undefined) {
      return migrationResponse(command, {
        ok: false,
        ...authorityFailure,
      });
    }
    throw error;
  }
  if (plan === undefined) {
    return migrationResponse(command, {
      ok: false,
      code: "SVS-CAMPAIGN-MIGRATION-SOURCE-INVALID",
      message:
        "The Campaign does not match the supported older contract required by this migration.",
      action:
        "Preserve the Campaign contents and use the compatibility diagnostic from resume; do not force or reverse a migration.",
    });
  }
  if (
    plan.migration.sourceAuthorityDigest !==
    command.payload.sourceAuthorityDigest
  ) {
    return migrationResponse(command, {
      ok: false,
      code: "SVS-CAMPAIGN-MIGRATION-SOURCE-CHANGED",
      message:
        "The Campaign authority no longer matches the migration plan that was confirmed.",
      action:
        "Resume the Campaign again, review the new source authority digest and complete plan, and confirm that exact state before migration.",
      details: [
        `confirmed ${command.payload.sourceAuthorityDigest}; current ${plan.migration.sourceAuthorityDigest}.`,
      ],
    });
  }

  const lock = await acquireCoordinatorOperationLock(
    campaignPath,
    command.requestId,
    command.payload.coordinatorId,
    command.payload.confirmedAt,
  );
  if (lock === undefined) {
    return migrationResponse(command, {
      ok: false,
      code: "SVS-CAMPAIGN-LOCKED",
      message: "Scouting Campaign is being changed by another coordinator.",
      action:
        "Do not migrate concurrently; retry after the active operation finishes.",
    });
  }

  let journal: CampaignMigrationJournal = {
    journalVersion: contracts.campaignFormat,
    requestId: command.requestId,
    migrationId: campaignMigrationId,
    direction: "forward-only",
    status: "in-progress",
    coordinatorId: command.payload.coordinatorId,
    confirmedAt: command.payload.confirmedAt,
    sourceAuthorityDigest: command.payload.sourceAuthorityDigest,
    fromVersions: supportedOlderCampaignVersions,
    toVersions: contracts,
    steps: campaignMigrationSteps.map((name) => ({
      name,
      status: "pending",
    })),
  };
  let candidatePath: string | undefined;
  let snapshotCreated = false;
  try {
    const lockedPlan = await supportedCampaignMigrationPlan(campaignPath);
    if (
      lockedPlan === undefined ||
      lockedPlan.migration.sourceAuthorityDigest !==
        command.payload.sourceAuthorityDigest
    ) {
      return migrationResponse(command, {
        ok: false,
        code: "SVS-CAMPAIGN-MIGRATION-SOURCE-CHANGED",
        message:
          "The Campaign authority changed after the migration confirmation was checked.",
        action:
          "Resume the Campaign again, review the new source authority digest and complete plan, and confirm that exact state before migration.",
      });
    }
    await mkdir(snapshotPath, { recursive: true, mode: 0o700 });
    await chmod(path.join(campaignPath, "migrations"), 0o700);
    await chmod(migrationPath, 0o700);
    await writePrivateJson(journalPath, journal);

    const manifestText = await readFile(
      path.join(campaignPath, "manifest.json"),
      "utf8",
    );
    const recordsText = await readFile(
      path.join(campaignPath, "records.jsonl"),
      "utf8",
    );
    await writePrivateText(path.join(snapshotPath, "manifest.json"), manifestText);
    await writePrivateText(path.join(snapshotPath, "records.jsonl"), recordsText);
    snapshotCreated = true;
    journal = completedStep(journal, "snapshot-authoritative-artifacts");
    await replacePrivateJson(journalPath, journal);
    injectPersistenceFault("after-migration-snapshot");

    const olderManifest = await readJson(
      path.join(snapshotPath, "manifest.json"),
    );
    if (!isRecord(olderManifest)) {
      throw new Error("snapshot manifest is invalid");
    }
    const upgradedRecords = addRecordDigests(
      (await readCampaignRecords(snapshotPath)).map((record) => {
        if (!isRecord(record)) {
          throw new Error("snapshot contains a non-object authoritative record");
        }
        return { ...record, recordVersion: contracts.records };
      }),
    );
    const { manifestDigest: _olderDigest, ...olderManifestFields } =
      olderManifest;
    const upgradedManifest = addManifestDigest({
      ...olderManifestFields,
      versions: contracts,
      authority: {
        records: "records.jsonl",
        recordCount: upgradedRecords.length,
        historyDigest: authoritativeHistoryDigest(upgradedRecords),
      },
    });
    journal = completedStep(journal, "upgrade-record-integrity");
    await replacePrivateJson(journalPath, journal);

    candidatePath = await mkdtemp(path.join(migrationPath, ".candidate-"));
    await chmod(candidatePath, 0o700);
    await mkdir(path.join(candidatePath, "checkpoints"), { mode: 0o700 });
    await writePrivateJson(
      path.join(candidatePath, "manifest.json"),
      upgradedManifest,
    );
    await writePrivateText(
      path.join(candidatePath, "records.jsonl"),
      `${upgradedRecords.map((record) => JSON.stringify(record)).join("\n")}\n`,
    );
    const rebuiltCandidate = await rebuildCampaignFromAuthority(candidatePath);
    await persistDerivedCampaignState(candidatePath, rebuiltCandidate);
    await loadCampaign(candidatePath);
    journal = completedStep(journal, "validate-complete-campaign");
    await replacePrivateJson(journalPath, journal);
    injectPersistenceFault("after-migration-validation");

    await replacePrivateText(
      path.join(campaignPath, "records.jsonl"),
      `${upgradedRecords.map((record) => JSON.stringify(record)).join("\n")}\n`,
    );
    injectPersistenceFault("after-migration-records");
    await replacePrivateJson(
      path.join(campaignPath, "manifest.json"),
      upgradedManifest,
    );
    const rebuiltCampaign = await rebuildCampaignFromAuthority(campaignPath);
    await persistDerivedCampaignState(campaignPath, rebuiltCampaign);
    const campaign = await loadCampaign(campaignPath);
    journal = completedStep(journal, "advance-manifest-versions");
    journal = { ...journal, status: "completed" };
    await replacePrivateJson(journalPath, journal);

    return migrationResponse(command, {
      ok: true,
      value: {
        migrated: true,
        campaign: campaign.campaign,
        migration: {
          id: campaignMigrationId,
          direction: "forward-only",
          status: "completed",
          snapshotPath,
          journalPath,
          steps: journal.steps,
        },
        workView: campaign.workView,
        validation: campaign.validation,
      },
    });
  } catch (error) {
    const failure = error instanceof Error ? error.message : "unknown migration error";
    if (snapshotCreated) {
      await replacePrivateText(
        path.join(campaignPath, "records.jsonl"),
        await readFile(path.join(snapshotPath, "records.jsonl"), "utf8"),
      );
      await replacePrivateText(
        path.join(campaignPath, "manifest.json"),
        await readFile(path.join(snapshotPath, "manifest.json"), "utf8"),
      );
    }
    journal = { ...journal, status: "failed", failure };
    await replacePrivateJson(journalPath, journal).catch(() => undefined);
    return migrationResponse(command, {
      ok: false,
      code: "SVS-CAMPAIGN-MIGRATION-FAILED",
      message: "The confirmed Campaign migration did not complete.",
      action:
        snapshotCreated
          ? `The prior authoritative Campaign remains recoverable at ${snapshotPath}; inspect the journal and retry the same forward migration after resolving the reported failure.`
          : "The original Campaign authority was not changed; preserve it, inspect the failed journal intent, and retry only after resolving the reported failure.",
      details: [failure],
    });
  } finally {
    if (candidatePath !== undefined) {
      await rm(candidatePath, { recursive: true, force: true });
    }
    await releaseCoordinatorOperationLock(lock);
  }
}
