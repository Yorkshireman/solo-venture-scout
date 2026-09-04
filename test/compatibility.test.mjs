import assert from "node:assert/strict";
import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildPackagedScout, runProcess } from "./support/packaged-scout.mjs";

const olderVersions = {
  release: "0.1.0",
  campaignFormat: "0.1.0",
  records: "0.1.0",
  commandEnvelope: "0.1.0",
  researchPackages: "0.1.0",
  renderTemplates: "0.1.0",
};

const currentVersions = {
  ...olderVersions,
  campaignFormat: "0.2.0",
  records: "0.2.0",
};

const fixturePath = path.resolve(
  import.meta.dirname,
  "fixtures/campaign-format-0.1.0",
);

/** @param {string} name */
async function copyOlderCampaign(name) {
  const storagePath = await mkdtemp(
    path.join(tmpdir(), "solo-venture-scout-compatibility-"),
  );
  const campaignPath = path.join(storagePath, name);
  await cp(fixturePath, campaignPath, { recursive: true });
  return campaignPath;
}

/**
 * @param {string} kernelPath
 * @param {Record<string, unknown>} command
 * @param {NodeJS.ProcessEnv} [environment]
 */
async function runKernel(kernelPath, command, environment = {}) {
  const result = await runProcess(process.execPath, [kernelPath], {
    input: `${JSON.stringify(command)}\n`,
    env: environment,
  });
  return { ...result, response: JSON.parse(result.stdout) };
}

test("resume presents a forward migration plan for a supported older Campaign without mutating it", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-migration-plan-",
  );
  const campaignPath = await copyOlderCampaign("migration-plan");
  const manifestBefore = await readFile(path.join(campaignPath, "manifest.json"));
  const recordsBefore = await readFile(path.join(campaignPath, "records.jsonl"));

  const result = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "resume-legacy-fixture-1",
    command: "resumeCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-current",
      resumedAt: "2026-09-04T09:00:00.000Z",
      leaseExpiresAt: "2026-09-04T09:30:00.000Z",
    },
  });

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.response, {
    envelopeVersion: "0.1.0",
    requestId: "resume-legacy-fixture-1",
    command: "resumeCampaign",
    ok: true,
    result: {
      resumed: false,
      campaign: {
        id: "campaign-legacy-fixture",
        path: campaignPath,
        versions: olderVersions,
      },
      migration: {
        required: true,
        id: "campaign-format-0.1.0-to-0.2.0",
        direction: "forward-only",
        fromVersions: olderVersions,
        toVersions: currentVersions,
        steps: [
          "snapshot-authoritative-artifacts",
          "upgrade-record-integrity",
          "validate-complete-campaign",
          "advance-manifest-versions",
        ],
        confirmation: {
          required: true,
          command: "migrateCampaign",
        },
      },
    },
  });
  assert.deepEqual(
    await readFile(path.join(campaignPath, "manifest.json")),
    manifestBefore,
  );
  assert.deepEqual(
    await readFile(path.join(campaignPath, "records.jsonl")),
    recordsBefore,
  );
  assert.deepEqual((await readdir(campaignPath)).sort(), [
    "checkpoints",
    "lease.json",
    "manifest.json",
    "records.jsonl",
    "work-view.json",
  ]);
});

test("migration refuses mutation without explicit confirmation", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-migration-unconfirmed-",
  );
  const campaignPath = await copyOlderCampaign("migration-unconfirmed");
  const manifestBefore = await readFile(path.join(campaignPath, "manifest.json"));
  const recordsBefore = await readFile(path.join(campaignPath, "records.jsonl"));

  const result = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "migrate-unconfirmed-1",
    command: "migrateCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-current",
      confirmedAt: "2026-09-04T09:02:00.000Z",
      migrationId: "campaign-format-0.1.0-to-0.2.0",
      confirmed: false,
    },
  });

  assert.equal(result.code, 3);
  assert.equal(result.response.error.code, "SVS-CAMPAIGN-MIGRATION-INVALID");
  assert.match(result.response.error.details.join("\n"), /explicit confirmation/i);
  assert.deepEqual(
    await readFile(path.join(campaignPath, "manifest.json")),
    manifestBefore,
  );
  assert.deepEqual(
    await readFile(path.join(campaignPath, "records.jsonl")),
    recordsBefore,
  );
  assert.equal((await readdir(campaignPath)).includes("migrations"), false);
});

test("explicit confirmation migrates an older Campaign through a recoverable snapshot and journal", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-migration-confirmed-",
  );
  const campaignPath = await copyOlderCampaign("migration-confirmed");

  const result = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "migrate-legacy-fixture-1",
    command: "migrateCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-current",
      confirmedAt: "2026-09-04T09:05:00.000Z",
      migrationId: "campaign-format-0.1.0-to-0.2.0",
      confirmed: true,
    },
  });

  const migrationPath = path.join(
    campaignPath,
    "migrations",
    "campaign-format-0.1.0-to-0.2.0",
  );
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.response, {
    envelopeVersion: "0.1.0",
    requestId: "migrate-legacy-fixture-1",
    command: "migrateCampaign",
    ok: true,
    result: {
      migrated: true,
      campaign: {
        id: "campaign-legacy-fixture",
        path: campaignPath,
        versions: currentVersions,
      },
      migration: {
        id: "campaign-format-0.1.0-to-0.2.0",
        direction: "forward-only",
        status: "completed",
        snapshotPath: path.join(migrationPath, "snapshot"),
        journalPath: path.join(migrationPath, "journal.json"),
        steps: [
          { name: "snapshot-authoritative-artifacts", status: "completed" },
          { name: "upgrade-record-integrity", status: "completed" },
          { name: "validate-complete-campaign", status: "completed" },
          { name: "advance-manifest-versions", status: "completed" },
        ],
      },
      workView: {
        campaignId: "campaign-legacy-fixture",
        recordSequence: 2,
        phase: "campaign-created",
        pause: null,
        completedWork: ["Scouting Campaign created"],
        nextPermittedActions: ["confirm-campaign-intake"],
        publicResearchAvailable: false,
      },
      validation: {
        valid: true,
        recordCount: 2,
        checkpointSequence: 2,
      },
    },
  });

  const manifest = JSON.parse(
    await readFile(path.join(campaignPath, "manifest.json"), "utf8"),
  );
  assert.deepEqual(manifest.versions, currentVersions);
  assert.match(manifest.manifestDigest, /^[a-f0-9]{64}$/);
  const migratedRecords = (await readFile(
    path.join(campaignPath, "records.jsonl"),
    "utf8",
  ))
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    migratedRecords.map((record) => record.recordVersion),
    ["0.2.0", "0.2.0"],
  );
  assert.equal(
    migratedRecords.every((record) => /^[a-f0-9]{64}$/.test(record.recordDigest)),
    true,
  );

  const snapshotManifest = JSON.parse(
    await readFile(path.join(migrationPath, "snapshot", "manifest.json"), "utf8"),
  );
  assert.deepEqual(snapshotManifest.versions, olderVersions);
  assert.deepEqual(
    await readFile(path.join(migrationPath, "snapshot", "records.jsonl"), "utf8"),
    await readFile(path.join(fixturePath, "records.jsonl"), "utf8"),
  );
  const journal = JSON.parse(
    await readFile(path.join(migrationPath, "journal.json"), "utf8"),
  );
  assert.equal(journal.status, "completed");
  assert.equal(journal.requestId, "migrate-legacy-fixture-1");
  assert.deepEqual(journal.steps, result.response.result.migration.steps);
});

test("replaying an already completed confirmed migration is idempotent", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-migration-replay-",
  );
  const campaignPath = await copyOlderCampaign("migration-replay");
  const command = {
    envelopeVersion: "0.1.0",
    requestId: "migrate-replay-1",
    command: "migrateCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-current",
      confirmedAt: "2026-09-04T09:10:00.000Z",
      migrationId: "campaign-format-0.1.0-to-0.2.0",
      confirmed: true,
    },
  };
  assert.equal((await runKernel(kernelPath, command)).code, 0);
  const manifestBeforeReplay = await readFile(
    path.join(campaignPath, "manifest.json"),
  );
  const recordsBeforeReplay = await readFile(
    path.join(campaignPath, "records.jsonl"),
  );

  const replay = await runKernel(kernelPath, command);

  assert.equal(replay.code, 0, replay.stderr);
  assert.equal(replay.response.result.migrated, false);
  assert.equal(replay.response.result.migration.status, "completed");
  assert.equal(
    replay.response.result.migration.id,
    "campaign-format-0.1.0-to-0.2.0",
  );
  assert.deepEqual(
    await readFile(path.join(campaignPath, "manifest.json")),
    manifestBeforeReplay,
  );
  assert.deepEqual(
    await readFile(path.join(campaignPath, "records.jsonl")),
    recordsBeforeReplay,
  );
});

test("resume fails closed without reinterpreting unsupported newer contracts", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-newer-contract-",
  );
  const campaignPath = await copyOlderCampaign("newer-contract");
  const manifestPath = path.join(campaignPath, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.versions.campaignFormat = "9.0.0";
  manifest.versions.records = "9.0.0";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const manifestBefore = await readFile(manifestPath);
  const recordsBefore = await readFile(path.join(campaignPath, "records.jsonl"));

  const result = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "resume-newer-contract-1",
    command: "resumeCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-current",
      resumedAt: "2026-09-04T10:00:00.000Z",
      leaseExpiresAt: "2026-09-04T10:30:00.000Z",
    },
  });

  assert.equal(result.code, 3);
  assert.deepEqual(result.response, {
    envelopeVersion: "0.1.0",
    requestId: "resume-newer-contract-1",
    command: "resumeCampaign",
    ok: false,
    error: {
      code: "SVS-CAMPAIGN-CONTRACT-NEWER",
      message:
        "Scouting Campaign uses contract versions newer than this release supports.",
      action:
        "Open it with a release that supports every listed version; do not reinterpret, edit, or migrate it backward.",
      details: [
        "campaignFormat: found 9.0.0; supported 0.2.0.",
        "records: found 9.0.0; supported 0.2.0.",
      ],
    },
  });
  assert.deepEqual(await readFile(manifestPath), manifestBefore);
  assert.deepEqual(
    await readFile(path.join(campaignPath, "records.jsonl")),
    recordsBefore,
  );
  assert.equal((await readdir(campaignPath)).includes(".coordinator-locks"), false);
});

test("inspection reports unsupported newer contracts with the same fail-closed diagnostic", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-inspect-newer-contract-",
  );
  const campaignPath = await copyOlderCampaign("inspect-newer-contract");
  const manifestPath = path.join(campaignPath, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.versions.renderTemplates = "1.0.0";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "inspect-newer-contract-1",
    command: "inspectCampaign",
    payload: { campaignPath },
  });

  assert.equal(result.code, 3);
  assert.equal(result.response.error.code, "SVS-CAMPAIGN-CONTRACT-NEWER");
  assert.deepEqual(result.response.error.details, [
    "renderTemplates: found 1.0.0; supported 0.1.0.",
  ]);
  assert.match(result.response.error.action, /do not reinterpret/i);
});

test("manual changes to authoritative records require reconciliation before resume", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-authority-reconciliation-",
  );
  const storagePath = await mkdtemp(
    path.join(tmpdir(), "solo-venture-scout-current-campaign-"),
  );
  const campaignPath = path.join(storagePath, "manual-authority-change");
  assert.equal(
    (
      await runKernel(kernelPath, {
        envelopeVersion: "0.1.0",
        requestId: "create-manual-authority-change-1",
        command: "createCampaign",
        payload: {
          campaignPath,
          campaignId: "campaign-manual-authority-change",
          coordinatorId: "coordinator-original",
          createdAt: "2026-09-04T10:40:00.000Z",
          leaseExpiresAt: "2026-09-04T10:50:00.000Z",
        },
      })
    ).code,
    0,
  );
  const recordsPath = path.join(campaignPath, "records.jsonl");
  const records = (await readFile(recordsPath, "utf8"))
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
  records[1].manualAnnotation = "continue from here";
  await writeFile(
    recordsPath,
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
  );
  const changedAuthority = await readFile(recordsPath);

  const result = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "resume-manual-authority-change-1",
    command: "resumeCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-current",
      resumedAt: "2026-09-04T11:00:00.000Z",
      leaseExpiresAt: "2026-09-04T11:30:00.000Z",
    },
  });

  assert.equal(result.code, 3);
  assert.deepEqual(result.response, {
    envelopeVersion: "0.1.0",
    requestId: "resume-manual-authority-change-1",
    command: "resumeCampaign",
    ok: false,
    error: {
      code: "SVS-CAMPAIGN-RECONCILIATION-REQUIRED",
      message:
        "Authoritative Campaign history changed outside the kernel and cannot be continued automatically.",
      action:
        "Reconcile the changed authoritative artifact against a trusted original or restore a migration snapshot; preserve the damaged copy and do not delete, rewrite, or drop its tail.",
      details: ["authoritative record 2 integrity digest does not match"],
    },
  });
  assert.deepEqual(await readFile(recordsPath), changedAuthority);
  assert.equal(records.length, 2);
});

test("manual changes to the Campaign manifest require reconciliation before resume", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-manifest-reconciliation-",
  );
  const storagePath = await mkdtemp(
    path.join(tmpdir(), "solo-venture-scout-current-campaign-"),
  );
  const campaignPath = path.join(storagePath, "manual-manifest-change");
  await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "create-manual-manifest-change-1",
    command: "createCampaign",
    payload: {
      campaignPath,
      campaignId: "campaign-manual-manifest-change",
      coordinatorId: "coordinator-original",
      createdAt: "2025-09-04T10:40:00.000Z",
      leaseExpiresAt: "2025-09-04T10:50:00.000Z",
    },
  });
  const manifestPath = path.join(campaignPath, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.manualAnnotation = "continue with a changed manifest";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const changedManifest = await readFile(manifestPath);
  const recordsBefore = await readFile(path.join(campaignPath, "records.jsonl"));

  const result = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "resume-manual-manifest-change-1",
    command: "resumeCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-current",
      resumedAt: "2025-09-04T11:00:00.000Z",
      leaseExpiresAt: "2025-09-04T11:30:00.000Z",
    },
  });

  assert.equal(result.code, 3);
  assert.deepEqual(result.response.error, {
    code: "SVS-CAMPAIGN-RECONCILIATION-REQUIRED",
    message:
      "Authoritative Campaign history changed outside the kernel and cannot be continued automatically.",
    action:
      "Reconcile the changed authoritative artifact against a trusted original or restore a migration snapshot; preserve the damaged copy and do not delete, rewrite, or drop its tail.",
    details: ["manifest integrity digest does not match"],
  });
  assert.deepEqual(await readFile(manifestPath), changedManifest);
  assert.deepEqual(
    await readFile(path.join(campaignPath, "records.jsonl")),
    recordsBefore,
  );
});

test("missing authoritative history stops with recovery choices instead of inventing records", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-missing-authority-",
  );
  const storagePath = await mkdtemp(
    path.join(tmpdir(), "solo-venture-scout-current-campaign-"),
  );
  const campaignPath = path.join(storagePath, "missing-authority");
  assert.equal(
    (
      await runKernel(kernelPath, {
        envelopeVersion: "0.1.0",
        requestId: "create-missing-authority-1",
        command: "createCampaign",
        payload: {
          campaignPath,
          campaignId: "campaign-missing-authority",
          coordinatorId: "coordinator-original",
          createdAt: "2026-09-04T11:40:00.000Z",
          leaseExpiresAt: "2026-09-04T11:50:00.000Z",
        },
      })
    ).code,
    0,
  );
  await rm(path.join(campaignPath, "records.jsonl"));

  const result = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "resume-missing-authority-1",
    command: "resumeCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-current",
      resumedAt: "2026-09-04T12:00:00.000Z",
      leaseExpiresAt: "2026-09-04T12:30:00.000Z",
    },
  });

  assert.equal(result.code, 3);
  assert.deepEqual(result.response, {
    envelopeVersion: "0.1.0",
    requestId: "resume-missing-authority-1",
    command: "resumeCampaign",
    ok: false,
    error: {
      code: "SVS-CAMPAIGN-AUTHORITY-MISSING",
      message: "Authoritative Campaign history is missing: records.jsonl.",
      action:
        "Choose one: restore records.jsonl from a trusted backup; restore a migration snapshot; or preserve this Campaign and start a new one. Never invent replacement records.",
      details: ["records.jsonl was not found."],
    },
  });
  assert.equal((await readdir(campaignPath)).includes("records.jsonl"), false);
});

test("a corrupt authoritative tail is preserved with precise recovery choices", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-corrupt-authority-",
  );
  const storagePath = await mkdtemp(
    path.join(tmpdir(), "solo-venture-scout-current-campaign-"),
  );
  const campaignPath = path.join(storagePath, "corrupt-authority");
  assert.equal(
    (
      await runKernel(kernelPath, {
        envelopeVersion: "0.1.0",
        requestId: "create-corrupt-authority-1",
        command: "createCampaign",
        payload: {
          campaignPath,
          campaignId: "campaign-corrupt-authority",
          coordinatorId: "coordinator-original",
          createdAt: "2026-09-04T12:40:00.000Z",
          leaseExpiresAt: "2026-09-04T12:50:00.000Z",
        },
      })
    ).code,
    0,
  );
  const recordsPath = path.join(campaignPath, "records.jsonl");
  const validPrefix = await readFile(recordsPath, "utf8");
  await writeFile(recordsPath, `${validPrefix}{"recordVersion":"0.2.0"`);
  const damagedAuthority = await readFile(recordsPath);

  const result = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "resume-corrupt-authority-1",
    command: "resumeCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-current",
      resumedAt: "2026-09-04T13:00:00.000Z",
      leaseExpiresAt: "2026-09-04T13:30:00.000Z",
    },
  });

  assert.equal(result.code, 3);
  assert.deepEqual(result.response, {
    envelopeVersion: "0.1.0",
    requestId: "resume-corrupt-authority-1",
    command: "resumeCampaign",
    ok: false,
    error: {
      code: "SVS-CAMPAIGN-AUTHORITY-DAMAGED",
      message: "Authoritative Campaign history is incomplete or corrupt.",
      action:
        "Choose one: restore records.jsonl from a trusted backup; restore a migration snapshot; or preserve this Campaign and start a new one. Do not invent records or discard the damaged tail.",
      details: [
        "authoritative record line 3 is not valid JSON; damaged tail was preserved",
      ],
    },
  });
  assert.deepEqual(await readFile(recordsPath), damagedAuthority);
});

test("a failed migration restores the prior authority and keeps its snapshot recoverable", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-migration-failure-",
  );
  const campaignPath = await copyOlderCampaign("migration-failure");
  const originalManifest = await readFile(path.join(campaignPath, "manifest.json"));
  const originalRecords = await readFile(path.join(campaignPath, "records.jsonl"));
  const command = {
    envelopeVersion: "0.1.0",
    requestId: "migrate-failure-1",
    command: "migrateCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-current",
      confirmedAt: "2026-09-04T14:00:00.000Z",
      migrationId: "campaign-format-0.1.0-to-0.2.0",
      confirmed: true,
    },
  };

  const result = await runKernel(kernelPath, command, {
    ...process.env,
    NODE_ENV: "test",
    SVS_FAULT_INJECTION: "after-migration-records",
  });

  const migrationPath = path.join(
    campaignPath,
    "migrations",
    "campaign-format-0.1.0-to-0.2.0",
  );
  assert.equal(result.code, 3);
  assert.equal(result.response.error.code, "SVS-CAMPAIGN-MIGRATION-FAILED");
  assert.match(result.response.error.details[0], /after-migration-records/);
  assert.match(result.response.error.action, /prior authoritative Campaign remains recoverable/i);
  assert.deepEqual(await readFile(path.join(campaignPath, "manifest.json")), originalManifest);
  assert.deepEqual(await readFile(path.join(campaignPath, "records.jsonl")), originalRecords);
  assert.deepEqual(
    await readFile(path.join(migrationPath, "snapshot", "manifest.json")),
    originalManifest,
  );
  assert.deepEqual(
    await readFile(path.join(migrationPath, "snapshot", "records.jsonl")),
    originalRecords,
  );
  const journal = JSON.parse(
    await readFile(path.join(migrationPath, "journal.json"), "utf8"),
  );
  assert.equal(journal.status, "failed");
  assert.deepEqual(journal.steps, [
    { name: "snapshot-authoritative-artifacts", status: "completed" },
    { name: "upgrade-record-integrity", status: "completed" },
    { name: "validate-complete-campaign", status: "completed" },
    { name: "advance-manifest-versions", status: "pending" },
  ]);

  const resumed = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "resume-after-migration-failure-1",
    command: "resumeCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-current",
      resumedAt: "2026-09-04T14:05:00.000Z",
      leaseExpiresAt: "2026-09-04T14:35:00.000Z",
    },
  });
  assert.equal(resumed.code, 0, resumed.stderr);
  assert.equal(resumed.response.result.migration.required, true);
});

test("interrupted work never appends onto a manually changed authoritative prefix", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-interrupted-reconciliation-",
  );
  const storagePath = await mkdtemp(
    path.join(tmpdir(), "solo-venture-scout-current-campaign-"),
  );
  const campaignPath = path.join(storagePath, "interrupted-reconciliation");
  await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "create-interrupted-reconciliation-1",
    command: "createCampaign",
    payload: {
      campaignPath,
      campaignId: "campaign-interrupted-reconciliation",
      coordinatorId: "coordinator-original",
      createdAt: "2025-09-04T14:40:00.000Z",
      leaseExpiresAt: "2025-09-04T14:50:00.000Z",
    },
  });
  const interrupted = await runKernel(
    kernelPath,
    {
      envelopeVersion: "0.1.0",
      requestId: "resume-interrupted-reconciliation-1",
      command: "resumeCampaign",
      payload: {
        campaignPath,
        coordinatorId: "coordinator-interrupted",
        resumedAt: "2025-09-04T15:00:00.000Z",
        leaseExpiresAt: "2025-09-04T15:30:00.000Z",
      },
    },
    {
      ...process.env,
      NODE_ENV: "test",
      SVS_FAULT_INJECTION: "after-operation-intent",
    },
  );
  assert.equal(interrupted.code, 3);

  const recordsPath = path.join(campaignPath, "records.jsonl");
  const records = (await readFile(recordsPath, "utf8"))
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
  records[1].manualAnnotation = "changed while interrupted";
  await writeFile(
    recordsPath,
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
  );
  const changedPrefix = await readFile(recordsPath);

  const result = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "resume-after-interrupted-reconciliation-1",
    command: "resumeCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-current",
      resumedAt: "2025-09-04T16:00:00.000Z",
      leaseExpiresAt: "2025-09-04T16:30:00.000Z",
    },
  });

  assert.equal(result.code, 3);
  assert.equal(
    result.response.error.code,
    "SVS-CAMPAIGN-RECONCILIATION-REQUIRED",
  );
  assert.deepEqual(await readFile(recordsPath), changedPrefix);
  assert.equal(
    (await readdir(path.join(campaignPath, ".operation-journal"))).length,
    1,
  );
});

test("an older Campaign with corrupt authority is rejected before migration is offered", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-corrupt-older-campaign-",
  );
  const campaignPath = await copyOlderCampaign("corrupt-older-campaign");
  const recordsPath = path.join(campaignPath, "records.jsonl");
  const validPrefix = await readFile(recordsPath, "utf8");
  await writeFile(recordsPath, `${validPrefix}{"recordVersion":"0.1.0"`);
  const damagedAuthority = await readFile(recordsPath);

  const result = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "resume-corrupt-older-campaign-1",
    command: "resumeCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-current",
      resumedAt: "2026-09-04T17:00:00.000Z",
      leaseExpiresAt: "2026-09-04T17:30:00.000Z",
    },
  });

  assert.equal(result.code, 3);
  assert.equal(result.response.error.code, "SVS-CAMPAIGN-AUTHORITY-DAMAGED");
  assert.deepEqual(result.response.error.details, [
    "authoritative record line 3 is not valid JSON; damaged tail was preserved",
  ]);
  assert.equal("migration" in (result.response.result ?? {}), false);
  assert.deepEqual(await readFile(recordsPath), damagedAuthority);
});

test("bounded manifest discovery can open one supported older Campaign for migration", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-discover-older-campaign-",
  );
  const storagePath = await mkdtemp(
    path.join(tmpdir(), "solo-venture-scout-compatibility-search-"),
  );
  const campaignPath = path.join(storagePath, "older-campaign");
  await cp(fixturePath, campaignPath, { recursive: true });

  const result = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "resume-discovered-older-campaign-1",
    command: "resumeCampaign",
    payload: {
      searchPath: storagePath,
      coordinatorId: "coordinator-current",
      resumedAt: "2026-09-04T18:00:00.000Z",
      leaseExpiresAt: "2026-09-04T18:30:00.000Z",
    },
  });

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.response.result.resumed, false);
  assert.equal(result.response.result.campaign.path, campaignPath);
  assert.deepEqual(result.response.result.campaign.versions, olderVersions);
  assert.equal(result.response.result.migration.required, true);
  assert.equal(
    (await readdir(campaignPath)).includes(".coordinator-locks"),
    false,
  );
});

test("bounded manifest discovery never hides a current Campaign behind an older one", async () => {
  const { kernelPath } = await buildPackagedScout(
    "solo-venture-scout-ambiguous-compatible-campaigns-",
  );
  const storagePath = await mkdtemp(
    path.join(tmpdir(), "solo-venture-scout-compatibility-search-"),
  );
  const olderCampaignPath = path.join(storagePath, "older-campaign");
  const currentCampaignPath = path.join(storagePath, "current-campaign");
  await cp(fixturePath, olderCampaignPath, { recursive: true });
  assert.equal(
    (
      await runKernel(kernelPath, {
        envelopeVersion: "0.1.0",
        requestId: "create-current-alongside-older-1",
        command: "createCampaign",
        payload: {
          campaignPath: currentCampaignPath,
          campaignId: "campaign-current-alongside-older",
          coordinatorId: "coordinator-current",
          createdAt: "2025-09-04T18:00:00.000Z",
          leaseExpiresAt: "2025-09-04T18:30:00.000Z",
        },
      })
    ).code,
    0,
  );

  const result = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "resume-ambiguous-compatible-campaigns-1",
    command: "resumeCampaign",
    payload: {
      searchPath: storagePath,
      coordinatorId: "coordinator-current",
      resumedAt: "2025-09-04T19:00:00.000Z",
      leaseExpiresAt: "2025-09-04T19:30:00.000Z",
    },
  });

  assert.equal(result.code, 3);
  assert.deepEqual(result.response.error, {
    code: "SVS-CAMPAIGN-DISCOVERY-AMBIGUOUS",
    message: "Manifest discovery found more than one Scouting Campaign.",
    action:
      "Provide one exact Campaign path; do not guess between compatible, older, or newer Campaigns.",
    details: [currentCampaignPath, olderCampaignPath],
  });
});
