import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { filesUnder } from "../scripts/lib/files-under.mjs";
import {
  buildPackagedScout,
  execFileAsync,
  repositoryRoot,
} from "./support/packaged-scout.mjs";

test("build generates byte-identical standalone and plugin skill trees", async () => {
  const { outputRoot } = await buildPackagedScout("solo-venture-scout-build-");

  const standalone = path.join(outputRoot, "standalone", "solo-venture-scout");
  const pluginSkill = path.join(
    outputRoot,
    "plugin",
    "solo-venture-scout",
    "skills",
    "solo-venture-scout",
  );
  const files = await filesUnder(standalone);

  assert.deepEqual(files, await filesUnder(pluginSkill));
  for (const file of files) {
    assert.deepEqual(
      await readFile(path.join(standalone, file)),
      await readFile(path.join(pluginSkill, file)),
      `${file} differs between generated distributions`,
    );
  }
});

test("source skill folder matches its declared name", async () => {
  const sourceSkill = path.join(
    repositoryRoot,
    "skill",
    "solo-venture-scout",
  );
  const skill = await readFile(path.join(sourceSkill, "SKILL.md"), "utf8");
  const declaredName = skill.match(/^name:\s*(.+)$/m)?.[1];

  assert.equal(declaredName, path.basename(sourceSkill));
});

test("generated Scout is explicit-invocation-only in a skills-only plugin", async () => {
  const { outputRoot } = await buildPackagedScout("solo-venture-scout-policy-");

  const skillMetadata = await readFile(
    path.join(
      outputRoot,
      "standalone",
      "solo-venture-scout",
      "agents",
      "openai.yaml",
    ),
    "utf8",
  );
  assert.match(skillMetadata, /allow_implicit_invocation:\s*false/);

  const manifest = JSON.parse(
    await readFile(
      path.join(
        outputRoot,
        "plugin",
        "solo-venture-scout",
        ".codex-plugin",
        "plugin.json",
      ),
      "utf8",
    ),
  );
  assert.equal(manifest.name, "solo-venture-scout");
  assert.equal(manifest.skills, "./skills/");
  assert.equal("apps" in manifest, false);
  assert.equal("mcpServers" in manifest, false);
});

test("package command creates standalone and plugin release archives", async () => {
  const { outputRoot } = await buildPackagedScout("solo-venture-scout-package-");
  const environment = { ...process.env, SVS_DIST_DIR: outputRoot };

  await execFileAsync(process.execPath, ["scripts/package.mjs"], {
    cwd: repositoryRoot,
    env: environment,
  });

  for (const archive of [
    "solo-venture-scout-standalone-1.0.0.tgz",
    "solo-venture-scout-plugin-1.0.0.tgz",
  ]) {
    const archiveStat = await stat(path.join(outputRoot, "packages", archive));
    assert.equal(archiveStat.isFile(), true);
    assert.ok(archiveStat.size > 0);
  }
});

test("package validation checks the generated artifacts that ship", async () => {
  const { outputRoot } = await buildPackagedScout("solo-venture-scout-validate-");
  const environment = { ...process.env, SVS_DIST_DIR: outputRoot };

  await execFileAsync(process.execPath, ["scripts/package.mjs"], {
    cwd: repositoryRoot,
    env: environment,
  });
  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/validate-packages.mjs"],
    { cwd: repositoryRoot, env: environment },
  );

  const report = JSON.parse(stdout);
  assert.equal(report.valid, true);
  assert.ok(report.identicalSkillFiles >= 4);
  assert.deepEqual(report.archives, [
    "solo-venture-scout-plugin-1.0.0.tgz",
    "solo-venture-scout-standalone-1.0.0.tgz",
  ]);
  assert.deepEqual(report.versions, {
    release: "1.0.0",
    campaignFormat: "0.2.0",
    records: "0.2.0",
    commandEnvelope: "0.1.0",
    researchPackages: "0.1.0",
    renderTemplates: "0.1.0",
  });
});

test("independent packaging runs produce byte-identical archives and complete release companions", async () => {
  const first = await buildPackagedScout("solo-venture-scout-reproducible-first-");
  const second = await buildPackagedScout("solo-venture-scout-reproducible-second-");
  for (const outputRoot of [first.outputRoot, second.outputRoot]) {
    await execFileAsync(process.execPath, ["scripts/package.mjs"], {
      cwd: repositoryRoot,
      env: { ...process.env, SVS_DIST_DIR: outputRoot },
    });
  }

  const packageMetadata = JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  );
  const archives = [
    `solo-venture-scout-plugin-${packageMetadata.version}.tgz`,
    `solo-venture-scout-standalone-${packageMetadata.version}.tgz`,
  ];
  for (const archive of archives) {
    assert.deepEqual(
      await readFile(path.join(first.outputRoot, "packages", archive)),
      await readFile(path.join(second.outputRoot, "packages", archive)),
      `${archive} is not reproducible`,
    );
  }

  const releaseFiles = (await readdir(path.join(first.outputRoot, "release"))).sort();
  assert.deepEqual(releaseFiles, [
    "CHECKSUMS.sha256",
    "LICENSE",
    "NOTICE",
    "compatibility-matrix.json",
    "dependency-inventory.json",
    "release-manifest.json",
  ]);
  const checksums = await readFile(
    path.join(first.outputRoot, "release", "CHECKSUMS.sha256"),
    "utf8",
  );
  for (const archive of archives) {
    assert.match(checksums, new RegExp(`^[a-f0-9]{64}  packages/${archive}$`, "m"));
  }
  const inventory = JSON.parse(
    await readFile(
      path.join(first.outputRoot, "release", "dependency-inventory.json"),
      "utf8",
    ),
  );
  assert.equal(inventory.inventoryVersion, "1.0.0");
  assert.deepEqual(inventory.runtimeDependencies, []);
  assert.deepEqual(
    inventory.directDevelopmentDependencies.map(
      /** @param {{ name: string }} dependency */
      (dependency) => dependency.name,
    ),
    ["@types/node", "esbuild", "typescript"],
  );
  assert.deepEqual(
    await readFile(path.join(first.outputRoot, "release", "LICENSE")),
    await readFile(path.join(repositoryRoot, "skill", "solo-venture-scout", "LICENSE")),
  );
  assert.match(
    await readFile(path.join(first.outputRoot, "release", "NOTICE"), "utf8"),
    /build-time dependencies.+not bundled runtime dependencies/is,
  );
});
