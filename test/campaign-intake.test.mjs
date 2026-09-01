import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildPackagedScout, runProcess } from "./support/packaged-scout.mjs";

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

/**
 * @param {string} kernelPath
 * @param {string} campaignPath
 */
async function createCampaign(kernelPath, campaignPath) {
  const result = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "create-intake-campaign-1",
    command: "createCampaign",
    payload: {
      campaignPath,
      campaignId: "campaign-intake",
      coordinatorId: "coordinator-primary",
      createdAt: "2026-09-01T09:00:00.000Z",
      leaseExpiresAt: "2099-09-01T09:30:00.000Z",
    },
  });
  assert.equal(result.code, 0, result.stderr);
}

/** @param {string} campaignPath */
function quickIntakeCommand(campaignPath) {
  return {
    envelopeVersion: "0.1.0",
    requestId: "confirm-intake-1",
    command: "confirmCampaignIntake",
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      confirmedAt: "2026-09-01T09:15:00.000Z",
      intake: {
        version: 1,
        explicitlyConfirmed: true,
        developerProfileSnapshot: {
          capturedAt: "2026-09-01T09:10:00.000Z",
          capacity: { state: "known", value: "15 hours per week" },
          capabilities: {
            state: "known",
            value: "TypeScript and operations software",
          },
          access: { state: "none" },
          boundaries: {
            state: "known",
            value: "No regulated medical decisions",
          },
          operatingPreferences: { state: "unknown" },
          riskTolerance: {
            state: "known",
            value: "Low irreversible downside",
          },
        },
        commercialOutcomeTarget: {
          amount: 10000,
          currency: "GBP",
          metric: "monthly recurring revenue",
          deadline: "2027-08-31",
        },
        statements: [
          {
            id: "constraint-no-employees",
            text: "Must not require employees",
            classification: "hard-constraint",
          },
          {
            id: "preference-low-support",
            text: "Prefer a low support burden",
            classification: "preference",
            importance: "major",
          },
          {
            id: "advantage-operations",
            text: "Has operations domain access",
            classification: "advantage",
            rationale: "Existing relationships shorten access paths",
          },
        ],
        researchBudget: {
          profile: "quick",
          sourceCap: 30,
          discoverySweepCap: 4,
          sourceFamilyMinimum: 3,
          deepenedOpportunityCap: 2,
          minimumComparisonSet: 2,
          adversarialSourceReserve: 6,
          paidSpendCap: { amount: 0, currency: "GBP" },
        },
      },
    },
  };
}

test("packaged Scout confirms and persists a versioned Campaign Intake", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-intake-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "campaign-intake");
  await createCampaign(kernelPath, campaignPath);
  const before = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "inspect-before-intake-1",
    command: "inspectCampaign",
    payload: { campaignPath },
  });
  assert.deepEqual(before.response.result.workView.nextPermittedActions, [
    "confirm-campaign-intake",
  ]);

  const command = quickIntakeCommand(campaignPath);
  const result = await runKernel(kernelPath, command);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.response.ok, true);
  assert.equal(result.response.result.confirmed, true);
  assert.equal(result.response.result.intake.version, 1);
  assert.equal(
    result.response.result.intake.developerProfileSnapshot.capturedAt,
    "2026-09-01T09:10:00.000Z",
  );
  assert.deepEqual(result.response.result.intake.researchBudget, {
    profile: "quick",
    sourceCap: 30,
    discoverySweepCap: 4,
    sourceFamilyMinimum: 3,
    deepenedOpportunityCap: 2,
    minimumComparisonSet: 2,
    adversarialSourceReserve: 6,
    paidSpendCap: { amount: 0, currency: "GBP" },
  });
  assert.deepEqual(result.response.result.workView, {
    campaignId: "campaign-intake",
    recordSequence: 4,
    phase: "campaign-intake-confirmed",
    pause: null,
    completedWork: [
      "Scouting Campaign created",
      "Campaign Intake version 1 confirmed",
    ],
    nextPermittedActions: ["reserve-public-research"],
    publicResearchAvailable: true,
  });

  const intakePath = path.join(campaignPath, "campaign-intake.json");
  assert.equal((await stat(intakePath)).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await readFile(intakePath, "utf8")), {
    campaignId: "campaign-intake",
    confirmedAt: "2026-09-01T09:15:00.000Z",
    ...command.payload.intake,
  });
  const records = (await readFile(path.join(campaignPath, "records.jsonl"), "utf8"))
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    records.map(({ sequence, type }) => ({ sequence, type })),
    [
      { sequence: 1, type: "operation-intent" },
      { sequence: 2, type: "campaign-created" },
      { sequence: 3, type: "operation-intent" },
      { sequence: 4, type: "campaign-intake-confirmed" },
    ],
  );

  const inspected = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "inspect-after-intake-1",
    command: "inspectCampaign",
    payload: { campaignPath },
  });
  assert.equal(inspected.code, 0, inspected.stderr);
  assert.deepEqual(inspected.response.result.intake, result.response.result.intake);
  assert.equal(inspected.response.result.workView.publicResearchAvailable, true);
});

test("Campaign Intake rejects unsafe omissions and logical conflicts without mutation", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-intake-invalid-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "invalid-intake");
  await createCampaign(kernelPath, campaignPath);
  const recordsBefore = await readFile(path.join(campaignPath, "records.jsonl"));
  const command = quickIntakeCommand(campaignPath);
  command.payload.intake.explicitlyConfirmed = false;
  // @ts-expect-error Deliberately omit the known value to exercise runtime validation.
  command.payload.intake.developerProfileSnapshot.boundaries = { state: "unknown" };
  command.payload.intake.commercialOutcomeTarget.deadline = "2026-08-31";
  command.payload.intake.statements.push({
    id: "conflicting-classification",
    text: "Must not require employees",
    classification: "preference",
    importance: "minor",
  });
  command.payload.intake.researchBudget.profile = "standard";
  command.payload.intake.researchBudget.paidSpendCap.currency = "USD";

  const result = await runKernel(kernelPath, command);

  assert.equal(result.code, 3);
  assert.equal(result.response.error.code, "SVS-CAMPAIGN-INTAKE-INVALID");
  assert.match(result.response.error.details.join("\n"), /explicitlyConfirmed/i);
  assert.match(result.response.error.details.join("\n"), /boundaries.+resolved/i);
  assert.match(result.response.error.details.join("\n"), /deadline.+after/i);
  assert.match(result.response.error.details.join("\n"), /conflicts/i);
  assert.match(result.response.error.details.join("\n"), /standard profile/i);
  assert.match(result.response.error.details.join("\n"), /target currency/i);
  assert.deepEqual(
    await readFile(path.join(campaignPath, "records.jsonl")),
    recordsBefore,
  );
  await assert.rejects(stat(path.join(campaignPath, "campaign-intake.json")), {
    code: "ENOENT",
  });
  const inspected = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "inspect-rejected-intake-1",
    command: "inspectCampaign",
    payload: { campaignPath },
  });
  assert.equal(inspected.response.result.workView.publicResearchAvailable, false);
});

test("named and custom Research Budgets persist their complete enforceable limits", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-intake-budgets-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const profiles = [
    {
      profile: "standard",
      sourceCap: 100,
      discoverySweepCap: 8,
      sourceFamilyMinimum: 5,
      deepenedOpportunityCap: 4,
      minimumComparisonSet: 3,
      adversarialSourceReserve: 20,
    },
    {
      profile: "deep",
      sourceCap: 250,
      discoverySweepCap: 14,
      sourceFamilyMinimum: 7,
      deepenedOpportunityCap: 6,
      minimumComparisonSet: 4,
      adversarialSourceReserve: 50,
    },
    {
      profile: "custom",
      sourceCap: 35,
      discoverySweepCap: 5,
      sourceFamilyMinimum: 4,
      deepenedOpportunityCap: 3,
      minimumComparisonSet: 2,
      adversarialSourceReserve: 7,
    },
  ];

  for (const profile of profiles) {
    const campaignPath = path.join(storagePath, profile.profile);
    await createCampaign(kernelPath, campaignPath);
    const command = quickIntakeCommand(campaignPath);
    Object.assign(command.payload.intake.researchBudget, profile);
    if (profile.profile === "custom") {
      Object.assign(command.payload.intake.developerProfileSnapshot.access, {
        state: "not-applicable",
        rationale: "No privileged customer access is required for Public Research",
      });
    }

    const result = await runKernel(kernelPath, command);

    assert.equal(result.code, 0, `${profile.profile}: ${result.stderr}`);
    assert.deepEqual(result.response.result.intake.researchBudget, {
      ...profile,
      paidSpendCap: { amount: 0, currency: "GBP" },
    });
  }
});

test("Campaign Intake confirmation is idempotent and cannot overwrite its first version", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-intake-replay-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "intake-replay");
  await createCampaign(kernelPath, campaignPath);
  const command = quickIntakeCommand(campaignPath);
  assert.equal((await runKernel(kernelPath, command)).code, 0);
  const recordsAfterConfirmation = await readFile(
    path.join(campaignPath, "records.jsonl"),
  );

  const replay = await runKernel(kernelPath, command);

  assert.equal(replay.code, 0, replay.stderr);
  assert.equal(replay.response.result.confirmed, false);
  assert.deepEqual(
    await readFile(path.join(campaignPath, "records.jsonl")),
    recordsAfterConfirmation,
  );

  const changedReplay = structuredClone(command);
  changedReplay.payload.intake.commercialOutcomeTarget.amount = 12000;
  const conflict = await runKernel(kernelPath, changedReplay);
  assert.equal(conflict.code, 3);
  assert.equal(conflict.response.error.code, "SVS-CAMPAIGN-REQUEST-CONFLICT");

  const replacement = structuredClone(changedReplay);
  replacement.requestId = "confirm-intake-replacement-1";
  const alreadyConfirmed = await runKernel(kernelPath, replacement);
  assert.equal(alreadyConfirmed.code, 3);
  assert.equal(
    alreadyConfirmed.response.error.code,
    "SVS-CAMPAIGN-INTAKE-ALREADY-CONFIRMED",
  );
  assert.deepEqual(
    await readFile(path.join(campaignPath, "records.jsonl")),
    recordsAfterConfirmation,
  );
});

test("Campaign Intake remains compatible with an earlier 0.1.0 Campaign manifest", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-intake-compat-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "earlier-manifest");
  await createCampaign(kernelPath, campaignPath);
  const manifestPath = path.join(campaignPath, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.projections = { workView: "work-view.json" };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const workViewPath = path.join(campaignPath, "work-view.json");
  const workView = JSON.parse(await readFile(workViewPath, "utf8"));
  delete workView.publicResearchAvailable;
  await writeFile(workViewPath, `${JSON.stringify(workView, null, 2)}\n`);

  const inspected = await runKernel(kernelPath, {
    envelopeVersion: "0.1.0",
    requestId: "inspect-earlier-manifest-1",
    command: "inspectCampaign",
    payload: { campaignPath },
  });
  const confirmed = await runKernel(kernelPath, quickIntakeCommand(campaignPath));

  assert.equal(inspected.code, 0, inspected.stderr);
  assert.equal(confirmed.code, 0, confirmed.stderr);
  assert.equal(confirmed.response.result.intake.version, 1);
});

test("Campaign Intake rejects impossible deadlines and incoherent custom budgets", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-intake-conflicts-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const deadlinePath = path.join(storagePath, "impossible-deadline");
  await createCampaign(kernelPath, deadlinePath);
  const impossibleDeadline = quickIntakeCommand(deadlinePath);
  impossibleDeadline.payload.intake.commercialOutcomeTarget.deadline = "2027-02-31";

  const deadlineResult = await runKernel(kernelPath, impossibleDeadline);

  assert.equal(deadlineResult.code, 3);
  assert.match(deadlineResult.response.error.details.join("\n"), /deadline/i);

  const budgetPath = path.join(storagePath, "incoherent-budget");
  await createCampaign(kernelPath, budgetPath);
  const incoherentBudget = quickIntakeCommand(budgetPath);
  Object.assign(incoherentBudget.payload.intake.researchBudget, {
    profile: "custom",
    sourceCap: 5,
    discoverySweepCap: 6,
    sourceFamilyMinimum: 50,
    deepenedOpportunityCap: 3,
    minimumComparisonSet: 1,
    adversarialSourceReserve: 1,
  });

  const budgetResult = await runKernel(kernelPath, incoherentBudget);

  assert.equal(budgetResult.code, 3);
  assert.match(budgetResult.response.error.details.join("\n"), /sourceFamilyMinimum/i);
  assert.match(budgetResult.response.error.details.join("\n"), /discoverySweepCap/i);
  assert.match(budgetResult.response.error.details.join("\n"), /minimumComparisonSet/i);
});

test("Campaign Intake confirmation never creates a missing Campaign path", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-intake-path-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const campaignPath = path.join(storagePath, "does-not-exist");

  const result = await runKernel(kernelPath, quickIntakeCommand(campaignPath));

  assert.equal(result.code, 3);
  assert.equal(result.response.error.code, "SVS-CAMPAIGN-INVALID");
  await assert.rejects(stat(campaignPath), { code: "ENOENT" });
});
