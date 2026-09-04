import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { repositoryRoot } from "./support/packaged-scout.mjs";

const execFileAsync = promisify(execFile);

test("release qualification fails closed and reports every missing mandatory gate", async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-qualification-"));

  await assert.rejects(
    execFileAsync(process.execPath, ["scripts/qualify-release.mjs"], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        SVS_ACCEPTANCE_EVIDENCE_DIR: path.join(outputRoot, "missing-evidence"),
        SVS_RELEASE_REPORT_DIR: outputRoot,
      },
    }),
    (error) => {
      assert.ok(error && typeof error === "object" && "code" in error);
      assert.equal(error.code, 1);
      return true;
    },
  );

  const report = JSON.parse(
    await readFile(path.join(outputRoot, "acceptance-report.json"), "utf8"),
  );
  assert.equal(report.reportVersion, "1.0.0");
  assert.equal(report.releaseVersion, "1.0.0");
  assert.equal(report.qualified, false);
  assert.deepEqual(report.failedGateIds, [
    "deterministic",
    "behavioral",
    "live-retrieval",
    "compatibility",
    "legal-and-packaging",
    "version-and-tag",
  ]);
  for (const gate of report.gates) assert.equal(gate.status, "missing");
});

test("release qualification rejects evidence that does not prove its gate", async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-invalid-evidence-"));
  const evidenceDirectory = path.join(outputRoot, "evidence");
  await mkdir(evidenceDirectory);
  await writeFile(
    path.join(evidenceDirectory, "deterministic.json"),
    `${JSON.stringify({
      evidenceVersion: "1.0.0",
      gateId: "deterministic",
      releaseVersion: "1.0.0",
      status: "failed",
    })}\n`,
  );

  await assert.rejects(
    execFileAsync(process.execPath, ["scripts/qualify-release.mjs"], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        SVS_ACCEPTANCE_EVIDENCE_DIR: evidenceDirectory,
        SVS_RELEASE_REPORT_DIR: outputRoot,
      },
    }),
  );

  const report = JSON.parse(
    await readFile(path.join(outputRoot, "acceptance-report.json"), "utf8"),
  );
  assert.equal(report.gates[0].id, "deterministic");
  assert.equal(report.gates[0].status, "failed");
  assert.equal(report.gates[0].evidence, "deterministic.json");
  assert.deepEqual(report.gates[0].diagnostics[0], "evidence status is failed");
  assert.equal(report.qualified, false);
});

test("deterministic evidence must identify every required passing suite and tested artifact", async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-deterministic-proof-"));
  const evidenceDirectory = path.join(outputRoot, "evidence");
  await mkdir(evidenceDirectory);
  for (const gateId of [
    "deterministic",
    "behavioral",
    "live-retrieval",
    "compatibility",
    "legal-and-packaging",
    "version-and-tag",
  ]) {
    await writeFile(
      path.join(evidenceDirectory, `${gateId}.json`),
      `${JSON.stringify({
        evidenceVersion: "1.0.0",
        gateId,
        releaseVersion: "1.0.0",
        status: "passed",
      })}\n`,
    );
  }

  await assert.rejects(
    execFileAsync(process.execPath, ["scripts/qualify-release.mjs"], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        SVS_ACCEPTANCE_EVIDENCE_DIR: evidenceDirectory,
        SVS_RELEASE_REPORT_DIR: outputRoot,
      },
    }),
  );

  const report = JSON.parse(
    await readFile(path.join(outputRoot, "acceptance-report.json"), "utf8"),
  );
  const gate = report.gates.find(
    /** @param {{ id: string }} candidate */
    (candidate) => candidate.id === "deterministic",
  );
  assert.equal(gate.status, "failed");
  assert.match(gate.diagnostics.join("\n"), /tested skill identity/i);
  assert.match(gate.diagnostics.join("\n"), /contract versions/i);
  assert.match(gate.diagnostics.join("\n"), /runtime identity/i);
  assert.match(gate.diagnostics.join("\n"), /missing suites.+kernel.+fault-recovery/i);
});

test("behavioral evidence must contain three independently evaluated passing runs per scenario and profile", async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-behavioral-proof-"));
  const evidenceDirectory = path.join(outputRoot, "evidence");
  await mkdir(evidenceDirectory);
  await writeFile(
    path.join(evidenceDirectory, "behavioral.json"),
    `${JSON.stringify({
      evidenceVersion: "1.0.0",
      gateId: "behavioral",
      releaseVersion: "1.0.0",
      status: "passed",
      profiles: [],
    })}\n`,
  );

  await assert.rejects(
    execFileAsync(process.execPath, ["scripts/qualify-release.mjs"], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        SVS_ACCEPTANCE_EVIDENCE_DIR: evidenceDirectory,
        SVS_RELEASE_REPORT_DIR: outputRoot,
      },
    }),
  );

  const report = JSON.parse(
    await readFile(path.join(outputRoot, "acceptance-report.json"), "utf8"),
  );
  const gate = report.gates.find(
    /** @param {{ id: string }} candidate */
    (candidate) => candidate.id === "behavioral",
  );
  assert.equal(gate.status, "failed");
  assert.match(gate.diagnostics.join("\n"), /tested skill identity/i);
  assert.match(gate.diagnostics.join("\n"), /missing claimed profile.+codex-local-web/i);
});

test("live-retrieval evidence must prove every claimed method against independent resolving Sources", async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-live-proof-"));
  const evidenceDirectory = path.join(outputRoot, "evidence");
  await mkdir(evidenceDirectory);
  await writeFile(
    path.join(evidenceDirectory, "live-retrieval.json"),
    `${JSON.stringify({
      evidenceVersion: "1.0.0",
      gateId: "live-retrieval",
      releaseVersion: "1.0.0",
      status: "passed",
      profiles: [],
    })}\n`,
  );

  await assert.rejects(
    execFileAsync(process.execPath, ["scripts/qualify-release.mjs"], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        SVS_ACCEPTANCE_EVIDENCE_DIR: evidenceDirectory,
        SVS_RELEASE_REPORT_DIR: outputRoot,
      },
    }),
  );

  const report = JSON.parse(
    await readFile(path.join(outputRoot, "acceptance-report.json"), "utf8"),
  );
  const gate = report.gates.find(
    /** @param {{ id: string }} candidate */
    (candidate) => candidate.id === "live-retrieval",
  );
  assert.equal(gate.status, "failed");
  assert.match(gate.diagnostics.join("\n"), /tested skill identity/i);
  assert.match(gate.diagnostics.join("\n"), /missing claimed profile.+codex-local-web/i);
});

test("compatibility evidence must independently prove every certified profile in the published matrix", async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-compatibility-proof-"));
  const evidenceDirectory = path.join(outputRoot, "evidence");
  await mkdir(evidenceDirectory);
  await writeFile(
    path.join(evidenceDirectory, "compatibility.json"),
    `${JSON.stringify({
      evidenceVersion: "1.0.0",
      gateId: "compatibility",
      releaseVersion: "1.0.0",
      status: "passed",
      matrixVersion: "1.0.0",
      claims: [],
    })}\n`,
  );

  await assert.rejects(
    execFileAsync(process.execPath, ["scripts/qualify-release.mjs"], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        SVS_ACCEPTANCE_EVIDENCE_DIR: evidenceDirectory,
        SVS_RELEASE_REPORT_DIR: outputRoot,
      },
    }),
  );

  const report = JSON.parse(
    await readFile(path.join(outputRoot, "acceptance-report.json"), "utf8"),
  );
  const gate = report.gates.find(
    /** @param {{ id: string }} candidate */
    (candidate) => candidate.id === "compatibility",
  );
  assert.equal(gate.status, "failed");
  assert.match(gate.diagnostics.join("\n"), /tested skill identity/i);
  assert.match(gate.diagnostics.join("\n"), /compatibility matrix digest/i);
  assert.match(gate.diagnostics.join("\n"), /missing certified profile.+codex-local-web/i);
});

test("legal and packaging evidence must prove reproducibility, checksums, dependencies, licenses, and notices", async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-legal-proof-"));
  const evidenceDirectory = path.join(outputRoot, "evidence");
  await mkdir(evidenceDirectory);
  await writeFile(
    path.join(evidenceDirectory, "legal-and-packaging.json"),
    `${JSON.stringify({
      evidenceVersion: "1.0.0",
      gateId: "legal-and-packaging",
      releaseVersion: "1.0.0",
      status: "passed",
      archives: [],
    })}\n`,
  );

  await assert.rejects(
    execFileAsync(process.execPath, ["scripts/qualify-release.mjs"], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        SVS_ACCEPTANCE_EVIDENCE_DIR: evidenceDirectory,
        SVS_RELEASE_REPORT_DIR: outputRoot,
      },
    }),
  );

  const report = JSON.parse(
    await readFile(path.join(outputRoot, "acceptance-report.json"), "utf8"),
  );
  const gate = report.gates.find(
    /** @param {{ id: string }} candidate */
    (candidate) => candidate.id === "legal-and-packaging",
  );
  assert.equal(gate.status, "failed");
  assert.match(gate.diagnostics.join("\n"), /tested skill identity/i);
  assert.match(gate.diagnostics.join("\n"), /standalone archive.+reproducible/i);
  assert.match(gate.diagnostics.join("\n"), /plugin archive.+reproducible/i);
  assert.match(gate.diagnostics.join("\n"), /checksum/i);
  assert.match(gate.diagnostics.join("\n"), /dependency inventory/i);
  assert.match(gate.diagnostics.join("\n"), /license.+notice/i);
});

test("version and tag evidence cannot pass before generated metadata and the annotated tag agree", async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-version-proof-"));
  const evidenceDirectory = path.join(outputRoot, "evidence");
  await mkdir(evidenceDirectory);
  await writeFile(
    path.join(evidenceDirectory, "version-and-tag.json"),
    `${JSON.stringify({
      evidenceVersion: "1.0.0",
      gateId: "version-and-tag",
      releaseVersion: "1.0.0",
      status: "passed",
      officialTag: "v1.0.0",
      tagMustBeAnnotated: true,
      tagMustPointToHead: true,
      publicationRequiresQualifiedReport: true,
    })}\n`,
  );

  await assert.rejects(
    execFileAsync(process.execPath, ["scripts/qualify-release.mjs"], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        SVS_ACCEPTANCE_EVIDENCE_DIR: evidenceDirectory,
        SVS_RELEASE_REPORT_DIR: outputRoot,
        SVS_DIST_DIR: path.join(outputRoot, "dist"),
      },
    }),
  );

  const report = JSON.parse(
    await readFile(path.join(outputRoot, "acceptance-report.json"), "utf8"),
  );
  const gate = report.gates.find(
    /** @param {{ id: string }} candidate */
    (candidate) => candidate.id === "version-and-tag",
  );
  assert.equal(gate.status, "failed");
  assert.equal(report.versionAndTagState.packageVersion, "1.0.0");
  assert.equal(report.versionAndTagState.contractReleaseVersion, "1.0.0");
  assert.match(gate.diagnostics.join("\n"), /generated standalone.+plugin metadata/i);
  assert.match(gate.diagnostics.join("\n"), /annotated official tag.+v1\.0\.0/i);
});

test("malformed evidence produces an auditable failed report instead of aborting qualification", async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-malformed-proof-"));
  const evidenceDirectory = path.join(outputRoot, "evidence");
  await mkdir(evidenceDirectory);
  await writeFile(path.join(evidenceDirectory, "deterministic.json"), "{not-json\n");

  await assert.rejects(
    execFileAsync(process.execPath, ["scripts/qualify-release.mjs"], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        SVS_ACCEPTANCE_EVIDENCE_DIR: evidenceDirectory,
        SVS_RELEASE_REPORT_DIR: outputRoot,
      },
    }),
  );

  const report = JSON.parse(
    await readFile(path.join(outputRoot, "acceptance-report.json"), "utf8"),
  );
  assert.equal(report.qualified, false);
  assert.deepEqual(report.gates[0], {
    id: "deterministic",
    status: "failed",
    evidence: "deterministic.json",
    diagnostics: ["evidence is not valid JSON"],
  });
  assert.match(
    await readFile(path.join(outputRoot, "ACCEPTANCE.md"), "utf8"),
    /deterministic: failed.+evidence is not valid JSON/is,
  );
});

test("acceptance reports retain exact suite, artifact, contract, and runtime identities", async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-report-identity-"));
  const evidenceDirectory = path.join(outputRoot, "evidence");
  await mkdir(evidenceDirectory);
  const deterministicEvidence = {
    evidenceVersion: "1.0.0",
    gateId: "deterministic",
    releaseVersion: "1.0.0",
    status: "passed",
    generatedAt: "2026-09-04T12:00:00.000Z",
    suiteVersion: "1.0.0",
    skill: {
      name: "solo-venture-scout",
      version: "1.0.0",
      treeSha256: "a".repeat(64),
    },
    contractVersions: {
      release: "1.0.0",
      campaignFormat: "0.2.0",
      records: "0.2.0",
      commandEnvelope: "0.1.0",
      researchPackages: "0.1.0",
      renderTemplates: "0.1.0",
    },
    runtime: {
      nodeVersion: "24.14.0",
      platform: "darwin",
      architecture: "arm64",
    },
    suites: [
      "kernel",
      "schema",
      "migration",
      "property",
      "concurrency",
      "rendering",
      "fault-recovery",
    ].map((id) => ({
      id,
      command: `node --test ${id}`,
      status: "passed",
      testCount: 1,
      failureCount: 0,
      startedAt: "2026-09-04T12:00:00.000Z",
      completedAt: "2026-09-04T12:00:01.000Z",
    })),
  };
  await writeFile(
    path.join(evidenceDirectory, "deterministic.json"),
    `${JSON.stringify(deterministicEvidence)}\n`,
  );

  await assert.rejects(
    execFileAsync(process.execPath, ["scripts/qualify-release.mjs"], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        SVS_ACCEPTANCE_EVIDENCE_DIR: evidenceDirectory,
        SVS_RELEASE_REPORT_DIR: outputRoot,
      },
    }),
  );

  const report = JSON.parse(
    await readFile(path.join(outputRoot, "acceptance-report.json"), "utf8"),
  );
  assert.deepEqual(report.acceptanceIdentity, {
    contractVersion: "1.0.0",
    suiteVersion: "1.0.0",
    releaseVersion: "1.0.0",
    officialTag: "v1.0.0",
  });
  assert.deepEqual(report.evidenceResults.deterministic, deterministicEvidence);
  assert.match(report.evidenceDigests.deterministic, /^[a-f0-9]{64}$/);
  const humanReport = await readFile(path.join(outputRoot, "ACCEPTANCE.md"), "utf8");
  assert.match(humanReport, /Skill.+solo-venture-scout 1\.0\.0.+a{64}/is);
  assert.match(humanReport, /Contracts.+campaignFormat: 0\.2\.0/is);
  assert.match(humanReport, /Runtime.+Node 24\.14\.0.+darwin arm64/is);
  assert.match(humanReport, /fault-recovery.+1 tests.+0 failures/is);
});

test("qualification rejects gate evidence produced from different generated skill trees", async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-artifact-identity-"));
  const evidenceDirectory = path.join(outputRoot, "evidence");
  await mkdir(evidenceDirectory);
  for (const [gateId, treeSha256] of [
    ["deterministic", "a".repeat(64)],
    ["behavioral", "b".repeat(64)],
  ]) {
    await writeFile(
      path.join(evidenceDirectory, `${gateId}.json`),
      `${JSON.stringify({
        evidenceVersion: "1.0.0",
        gateId,
        releaseVersion: "1.0.0",
        status: "passed",
        skill: { name: "solo-venture-scout", version: "1.0.0", treeSha256 },
        profiles: [],
        suites: [],
      })}\n`,
    );
  }

  await assert.rejects(
    execFileAsync(process.execPath, ["scripts/qualify-release.mjs"], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        SVS_ACCEPTANCE_EVIDENCE_DIR: evidenceDirectory,
        SVS_RELEASE_REPORT_DIR: outputRoot,
      },
    }),
  );
  const report = JSON.parse(
    await readFile(path.join(outputRoot, "acceptance-report.json"), "utf8"),
  );
  for (const gateId of ["deterministic", "behavioral"]) {
    const gate = report.gates.find(
      (/** @type {{ id: string }} */ candidate) => candidate.id === gateId,
    );
    assert.match(gate.diagnostics.join("\n"), /different generated skill tree/i);
  }
});
