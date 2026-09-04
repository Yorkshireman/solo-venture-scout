import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
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
    "solo-venture-scout-standalone-0.1.0.tgz",
    "solo-venture-scout-plugin-0.1.0.tgz",
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
    "solo-venture-scout-plugin-0.1.0.tgz",
    "solo-venture-scout-standalone-0.1.0.tgz",
  ]);
  assert.deepEqual(report.versions, {
    release: "0.1.0",
    campaignFormat: "0.2.0",
    records: "0.2.0",
    commandEnvelope: "0.1.0",
    researchPackages: "0.1.0",
    renderTemplates: "0.1.0",
  });
});
