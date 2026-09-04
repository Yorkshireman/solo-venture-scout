import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildPackagedScout, runProcess } from "./support/packaged-scout.mjs";

const contracts = {
  release: "1.0.0",
  campaignFormat: "0.2.0",
  records: "0.2.0",
  commandEnvelope: "0.1.0",
  researchPackages: "0.1.0",
  renderTemplates: "0.1.0",
};

/**
 * @param {string} kernelPath
 * @param {Record<string, unknown>} command
 */
async function runKernel(kernelPath, command) {
  const result = await runProcess(process.execPath, [kernelPath], {
    input: `${JSON.stringify(command)}\n`,
  });
  return { ...result, response: JSON.parse(result.stdout) };
}

test("packaged Scout creates a private durable Scouting Campaign", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-create-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "warehouse-operations");
  const command = {
    envelopeVersion: "0.1.0",
    requestId: "create-warehouse-operations-1",
    command: "createCampaign",
    payload: {
      campaignPath,
      campaignId: "campaign-warehouse-operations",
      coordinatorId: "coordinator-primary",
      createdAt: "2026-08-31T09:00:00.000Z",
      leaseExpiresAt: "2026-08-31T09:30:00.000Z",
    },
  };

  const result = await runKernel(kernelPath, command);

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.response, {
    envelopeVersion: "0.1.0",
    requestId: command.requestId,
    command: "createCampaign",
    ok: true,
    result: {
      created: true,
      campaign: {
        id: "campaign-warehouse-operations",
        path: campaignPath,
        versions: contracts,
      },
      workView: {
        campaignId: "campaign-warehouse-operations",
        recordSequence: 2,
        phase: "campaign-created",
        pause: null,
        completedWork: ["Scouting Campaign created"],
        nextPermittedActions: ["confirm-campaign-intake"],
        publicResearchAvailable: false,
      },
      lease: {
        coordinatorId: "coordinator-primary",
        acquiredAt: "2026-08-31T09:00:00.000Z",
        expiresAt: "2026-08-31T09:30:00.000Z",
      },
    },
  });

  assert.deepEqual((await readdir(campaignPath)).sort(), [
    "checkpoints",
    "lease.json",
    "manifest.json",
    "records.jsonl",
    "work-view.json",
  ]);
  assert.equal((await stat(campaignPath)).mode & 0o777, 0o700);
  for (const file of ["lease.json", "manifest.json", "records.jsonl", "work-view.json"]) {
    assert.equal((await stat(path.join(campaignPath, file))).mode & 0o777, 0o600);
  }

  const records = (await readFile(path.join(campaignPath, "records.jsonl"), "utf8"))
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    records.map(({ sequence, type, requestId }) => ({ sequence, type, requestId })),
    [
      { sequence: 1, type: "operation-intent", requestId: command.requestId },
      { sequence: 2, type: "campaign-created", requestId: command.requestId },
    ],
  );
  assert.deepEqual(
    JSON.parse(
      await readFile(
        path.join(campaignPath, "checkpoints", "000000000002.json"),
        "utf8",
      ),
    ),
    {
      campaignId: "campaign-warehouse-operations",
      recordSequence: 2,
      recordedAt: "2026-08-31T09:00:00.000Z",
    },
  );
});

test("packaged Scout inspects a Scouting Campaign from its explicit path", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-inspect-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "repair-workflows");
  const create = {
    envelopeVersion: "0.1.0",
    requestId: "create-repair-workflows-1",
    command: "createCampaign",
    payload: {
      campaignPath,
      campaignId: "campaign-repair-workflows",
      coordinatorId: "coordinator-primary",
      createdAt: "2026-08-31T10:00:00.000Z",
      leaseExpiresAt: "2026-08-31T10:30:00.000Z",
    },
  };
  assert.equal((await runKernel(kernelPath, create)).code, 0);
  const recordsBefore = await readFile(path.join(campaignPath, "records.jsonl"));
  const workViewBefore = await readFile(path.join(campaignPath, "work-view.json"));

  const result = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "inspect-repair-workflows-1",
    command: "inspectCampaign",
    payload: { campaignPath },
  });

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.response, {
    envelopeVersion: "0.1.0",
    requestId: "inspect-repair-workflows-1",
    command: "inspectCampaign",
    ok: true,
    result: {
      locatedBy: "campaignPath",
      campaign: {
        id: "campaign-repair-workflows",
        path: campaignPath,
        versions: contracts,
      },
      workView: {
        campaignId: "campaign-repair-workflows",
        recordSequence: 2,
        phase: "campaign-created",
        pause: null,
        completedWork: ["Scouting Campaign created"],
        nextPermittedActions: ["confirm-campaign-intake"],
        publicResearchAvailable: false,
      },
      lease: {
        coordinatorId: "coordinator-primary",
        acquiredAt: "2026-08-31T10:00:00.000Z",
        expiresAt: "2026-08-31T10:30:00.000Z",
      },
      validation: {
        valid: true,
        recordCount: 2,
        checkpointSequence: 2,
      },
    },
  });
  assert.deepEqual(await readFile(path.join(campaignPath, "records.jsonl")), recordsBefore);
  assert.deepEqual(await readFile(path.join(campaignPath, "work-view.json")), workViewBefore);
});

test("packaged Scout safely discovers one Scouting Campaign manifest", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-discover-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "field-maintenance");
  assert.equal(
    (
      await runKernel(kernelPath, {
        envelopeVersion: "0.1.0",
        requestId: "create-field-maintenance-1",
        command: "createCampaign",
        payload: {
          campaignPath,
          campaignId: "campaign-field-maintenance",
          coordinatorId: "coordinator-primary",
          createdAt: "2026-08-31T11:00:00.000Z",
          leaseExpiresAt: "2026-08-31T11:30:00.000Z",
        },
      })
    ).code,
    0,
  );

  const result = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "inspect-field-maintenance-1",
    command: "inspectCampaign",
    payload: { searchPath: storagePath },
  });

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.response.ok, true);
  assert.equal(result.response.result.locatedBy, "manifestDiscovery");
  assert.equal(result.response.result.campaign.id, "campaign-field-maintenance");
  assert.equal(result.response.result.campaign.path, campaignPath);
  assert.equal(result.response.result.validation.valid, true);
});

test("packaged Scout resumes validated state in a later session", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-resume-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "permit-coordination");
  assert.equal(
    (
      await runKernel(kernelPath, {
        envelopeVersion: "0.1.0",
        requestId: "create-permit-coordination-1",
        command: "createCampaign",
        payload: {
          campaignPath,
          campaignId: "campaign-permit-coordination",
          coordinatorId: "coordinator-first-session",
          createdAt: "2026-08-31T12:00:00.000Z",
          leaseExpiresAt: "2026-08-31T12:30:00.000Z",
        },
      })
    ).code,
    0,
  );

  const result = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "resume-permit-coordination-1",
    command: "resumeCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-later-session",
      resumedAt: "2026-08-31T13:00:00.000Z",
      leaseExpiresAt: "2026-08-31T13:30:00.000Z",
    },
  });

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.response, {
    envelopeVersion: "0.1.0",
    requestId: "resume-permit-coordination-1",
    command: "resumeCampaign",
    ok: true,
    result: {
      resumed: true,
      campaign: {
        id: "campaign-permit-coordination",
        path: campaignPath,
        versions: contracts,
      },
      summary: {
        completedWork: ["Scouting Campaign created"],
        currentPhase: "campaign-created",
        currentPause: null,
        nextPermittedActions: ["confirm-campaign-intake"],
      },
      workView: {
        campaignId: "campaign-permit-coordination",
        recordSequence: 4,
        phase: "campaign-created",
        pause: null,
        completedWork: ["Scouting Campaign created"],
        nextPermittedActions: ["confirm-campaign-intake"],
        publicResearchAvailable: false,
      },
      lease: {
        coordinatorId: "coordinator-later-session",
        acquiredAt: "2026-08-31T13:00:00.000Z",
        expiresAt: "2026-08-31T13:30:00.000Z",
      },
      validation: {
        valid: true,
        recordCount: 4,
        checkpointSequence: 4,
      },
    },
  });

  const inspected = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "inspect-after-resume-1",
    command: "inspectCampaign",
    payload: { campaignPath },
  });
  assert.equal(inspected.code, 0, inspected.stderr);
  assert.equal(inspected.response.result.workView.recordSequence, 4);
  assert.equal(inspected.response.result.lease.coordinatorId, "coordinator-later-session");
});

test("replaying Campaign creation is idempotent and never relocates it", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-create-replay-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "compliance-evidence");
  const command = {
    envelopeVersion: "0.1.0",
    requestId: "create-compliance-evidence-1",
    command: "createCampaign",
    payload: {
      campaignPath,
      campaignId: "campaign-compliance-evidence",
      coordinatorId: "coordinator-primary",
      createdAt: "2026-08-31T14:00:00.000Z",
      leaseExpiresAt: "2026-08-31T14:30:00.000Z",
    },
  };
  assert.equal((await runKernel(kernelPath, command)).code, 0);
  const recordsBefore = await readFile(path.join(campaignPath, "records.jsonl"));

  const replay = await runKernel(kernelPath, command);

  assert.equal(replay.code, 0, replay.stderr);
  assert.equal(replay.response.ok, true);
  assert.equal(replay.response.result.created, false);
  assert.equal(replay.response.result.campaign.id, "campaign-compliance-evidence");
  assert.equal(replay.response.result.campaign.path, campaignPath);
  assert.deepEqual(await readFile(path.join(campaignPath, "records.jsonl")), recordsBefore);
  assert.deepEqual(await readdir(storagePath), ["compliance-evidence"]);
});

test("replaying Campaign resume does not repeat authoritative work", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-resume-replay-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "vendor-onboarding");
  await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "create-vendor-onboarding-1",
    command: "createCampaign",
    payload: {
      campaignPath,
      campaignId: "campaign-vendor-onboarding",
      coordinatorId: "coordinator-first",
      createdAt: "2026-08-31T15:00:00.000Z",
      leaseExpiresAt: "2026-08-31T15:30:00.000Z",
    },
  });
  const command = {
    envelopeVersion: "0.1.0",
    requestId: "resume-vendor-onboarding-1",
    command: "resumeCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-second",
      resumedAt: "2026-08-31T16:00:00.000Z",
      leaseExpiresAt: "2026-08-31T16:30:00.000Z",
    },
  };
  assert.equal((await runKernel(kernelPath, command)).code, 0);
  const recordsBefore = await readFile(path.join(campaignPath, "records.jsonl"));

  const replay = await runKernel(kernelPath, command);

  assert.equal(replay.code, 0, replay.stderr);
  assert.equal(replay.response.ok, true);
  assert.equal(replay.response.result.resumed, false);
  assert.equal(replay.response.result.workView.recordSequence, 4);
  assert.deepEqual(await readFile(path.join(campaignPath, "records.jsonl")), recordsBefore);
});

test("resume rejects a reused request identity with different input", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-resume-conflict-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "inspection-routing");
  await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "create-inspection-routing-1",
    command: "createCampaign",
    payload: {
      campaignPath,
      campaignId: "campaign-inspection-routing",
      coordinatorId: "coordinator-first",
      createdAt: "2026-08-31T17:00:00.000Z",
      leaseExpiresAt: "2026-08-31T17:30:00.000Z",
    },
  });
  const resume = {
    envelopeVersion: "0.1.0",
    requestId: "resume-inspection-routing-1",
    command: "resumeCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-second",
      resumedAt: "2026-08-31T18:00:00.000Z",
      leaseExpiresAt: "2026-08-31T18:30:00.000Z",
    },
  };
  assert.equal((await runKernel(kernelPath, resume)).code, 0);
  const recordsBefore = await readFile(path.join(campaignPath, "records.jsonl"));

  const conflict = await runKernel(kernelPath, {
    ...resume,
    payload: {
      ...resume.payload,
      leaseExpiresAt: "2026-08-31T18:45:00.000Z",
    },
  });

  assert.equal(conflict.code, 3);
  assert.deepEqual(conflict.response, {
    envelopeVersion: "0.1.0",
    requestId: "resume-inspection-routing-1",
    command: "resumeCampaign",
    ok: false,
    error: {
      code: "SVS-CAMPAIGN-REQUEST-CONFLICT",
      message: "Resume request identity was already used with different input.",
      action: "Reuse the original request payload or provide a new stable request identity.",
    },
  });
  assert.deepEqual(await readFile(path.join(campaignPath, "records.jsonl")), recordsBefore);
});

test("caller time cannot bypass another coordinator's active lease", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-active-lease-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "active-lease");
  await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "create-active-lease-1",
    command: "createCampaign",
    payload: {
      campaignPath,
      campaignId: "campaign-active-lease",
      coordinatorId: "coordinator-active",
      createdAt: "2098-01-01T00:00:00.000Z",
      leaseExpiresAt: "2099-01-01T00:00:00.000Z",
    },
  });
  const recordsBefore = await readFile(path.join(campaignPath, "records.jsonl"));

  const result = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "resume-active-lease-1",
    command: "resumeCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-intruder",
      resumedAt: "2100-01-01T00:00:00.000Z",
      leaseExpiresAt: "2101-01-01T00:00:00.000Z",
    },
  });

  assert.equal(result.code, 3);
  assert.equal(result.response.error.code, "SVS-CAMPAIGN-LEASE-HELD");
  assert.deepEqual(await readFile(path.join(campaignPath, "records.jsonl")), recordsBefore);
});

test("resume replay reconciles derived state after an interrupted commit", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-resume-recover-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "derived-state-recovery");
  await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "create-derived-state-recovery-1",
    command: "createCampaign",
    payload: {
      campaignPath,
      campaignId: "campaign-derived-state-recovery",
      coordinatorId: "coordinator-first",
      createdAt: "2026-08-31T19:00:00.000Z",
      leaseExpiresAt: "2026-08-31T19:30:00.000Z",
    },
  });
  const oldWorkView = await readFile(path.join(campaignPath, "work-view.json"));
  const oldLease = await readFile(path.join(campaignPath, "lease.json"));
  const command = {
    envelopeVersion: "0.1.0",
    requestId: "resume-derived-state-recovery-1",
    command: "resumeCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-second",
      resumedAt: "2026-08-31T20:00:00.000Z",
      leaseExpiresAt: "2026-08-31T20:30:00.000Z",
    },
  };
  assert.equal((await runKernel(kernelPath, command)).code, 0);
  const recordsAfterResume = await readFile(path.join(campaignPath, "records.jsonl"));

  await writeFile(path.join(campaignPath, "work-view.json"), oldWorkView);
  await writeFile(path.join(campaignPath, "lease.json"), oldLease);
  await rm(path.join(campaignPath, "checkpoints", "000000000004.json"));

  const replay = await runKernel(kernelPath, command);

  assert.equal(replay.code, 0, replay.stderr);
  assert.equal(replay.response.result.resumed, false);
  assert.equal(replay.response.result.workView.recordSequence, 4);
  assert.equal(replay.response.result.lease.coordinatorId, "coordinator-second");
  assert.deepEqual(
    await readFile(path.join(campaignPath, "records.jsonl")),
    recordsAfterResume,
  );
  assert.equal(
    (
      await runKernel(kernelPath, {
        envelopeVersion: "0.1.0",
        requestId: "inspect-reconciled-state-1",
        command: "inspectCampaign",
        payload: { campaignPath },
      })
    ).code,
    0,
  );
});

test("inspection fails closed on malformed authoritative records", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-invalid-record-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "invalid-authority");
  await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "create-invalid-authority-1",
    command: "createCampaign",
    payload: {
      campaignPath,
      campaignId: "campaign-invalid-authority",
      coordinatorId: "coordinator-primary",
      createdAt: "2026-08-31T21:00:00.000Z",
      leaseExpiresAt: "2026-08-31T21:30:00.000Z",
    },
  });
  const recordsPath = path.join(campaignPath, "records.jsonl");
  const records = (await readFile(recordsPath, "utf8"))
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
  delete records[0].recordId;
  await writeFile(
    recordsPath,
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
  );

  const result = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "inspect-invalid-authority-1",
    command: "inspectCampaign",
    payload: { campaignPath },
  });

  assert.equal(result.code, 3);
  assert.equal(result.response.ok, false);
  assert.equal(result.response.error.code, "SVS-CAMPAIGN-AUTHORITY-DAMAGED");
  assert.match(result.response.error.details[0], /record 1/i);
  assert.match(result.response.error.action, /restore.*trusted backup/i);
});

test("manifest discovery ignores unrelated manifests", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-safe-discovery-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "valid-campaign");
  await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "create-valid-discovery-1",
    command: "createCampaign",
    payload: {
      campaignPath,
      campaignId: "campaign-valid-discovery",
      coordinatorId: "coordinator-primary",
      createdAt: "2026-08-31T22:00:00.000Z",
      leaseExpiresAt: "2026-08-31T22:30:00.000Z",
    },
  });
  const unrelatedPath = path.join(storagePath, "unrelated-tool");
  await mkdir(unrelatedPath);
  await writeFile(
    path.join(unrelatedPath, "manifest.json"),
    `${JSON.stringify({ name: "unrelated-tool", version: "1.0.0" })}\n`,
  );

  const result = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "inspect-valid-discovery-1",
    command: "inspectCampaign",
    payload: { searchPath: storagePath },
  });

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.response.result.campaign.id, "campaign-valid-discovery");
  assert.equal(result.response.result.campaign.path, campaignPath);
});

test("resume reclaims an abandoned coordinator operation lock", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-stale-lock-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "stale-operation-lock");
  await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "create-stale-operation-lock-1",
    command: "createCampaign",
    payload: {
      campaignPath,
      campaignId: "campaign-stale-operation-lock",
      coordinatorId: "coordinator-first",
      createdAt: "2026-08-31T23:00:00.000Z",
      leaseExpiresAt: "2026-08-31T23:30:00.000Z",
    },
  });
  const lockDirectory = path.join(campaignPath, ".coordinator-locks");
  await mkdir(lockDirectory, { mode: 0o700 });
  const lockPath = path.join(lockDirectory, "active.json");
  await writeFile(
    lockPath,
    `${JSON.stringify({
      version: "0.1.0",
      token: "abandoned-operation",
      processId: 99999999,
      requestId: "resume-abandoned-1",
      coordinatorId: "coordinator-abandoned",
      acquiredAt: "2026-08-31T23:31:00.000Z",
      expiresAt: "2026-08-31T23:36:00.000Z",
    })}\n`,
  );

  const result = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "resume-after-abandoned-lock-1",
    command: "resumeCampaign",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-second",
      resumedAt: "2026-09-01T00:00:00.000Z",
      leaseExpiresAt: "2026-09-01T00:30:00.000Z",
    },
  });

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.response.result.resumed, true);
  assert.equal(result.response.result.lease.coordinatorId, "coordinator-second");
  await assert.rejects(stat(lockPath), { code: "ENOENT" });
});

test("concurrent resumes preserve one exclusive coordinator", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-concurrent-resume-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "concurrent-resume");
  await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "create-concurrent-resume-1",
    command: "createCampaign",
    payload: {
      campaignPath,
      campaignId: "campaign-concurrent-resume",
      coordinatorId: "coordinator-first",
      createdAt: "2025-01-01T00:00:00.000Z",
      leaseExpiresAt: "2025-01-01T00:30:00.000Z",
    },
  });
  const resumeCommands = ["alpha", "beta"].map((name) => ({
    envelopeVersion: "0.1.0",
    requestId: `resume-concurrent-${name}-1`,
    command: "resumeCampaign",
    payload: {
      campaignPath,
      coordinatorId: `coordinator-${name}`,
      resumedAt: "2026-09-01T00:00:00.000Z",
      leaseExpiresAt: "2099-01-01T00:00:00.000Z",
    },
  }));

  const concurrentResults = await Promise.all(
    resumeCommands.map((command) => runKernel(kernelPath, command)),
  );
  const successes = concurrentResults.filter((result) => result.code === 0);
  assert.ok(successes.length <= 1, "more than one concurrent resume succeeded");
  if (successes.length === 0) {
    assert.equal((await runKernel(kernelPath, resumeCommands[0])).code, 0);
  }

  const inspected = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "inspect-concurrent-resume-1",
    command: "inspectCampaign",
    payload: { campaignPath },
  });
  assert.equal(inspected.code, 0, inspected.stderr);
  assert.equal(inspected.response.result.workView.recordSequence, 4);
  assert.equal(inspected.response.result.validation.recordCount, 4);
});
