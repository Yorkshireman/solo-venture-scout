import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { filesUnder } from "./lib/files-under.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const outputRoot = path.resolve(
  process.env.SVS_DIST_DIR ?? path.join(repositoryRoot, "dist"),
);
const standalone = path.join(outputRoot, "standalone", "solo-venture-scout");
const pluginRoot = path.join(outputRoot, "plugin", "solo-venture-scout");
const pluginSkill = path.join(pluginRoot, "skills", "solo-venture-scout");
const semver = /^\d+\.\d+\.\d+$/;

const standaloneFiles = await filesUnder(standalone);
assert.deepEqual(
  standaloneFiles,
  await filesUnder(pluginSkill),
  "standalone and plugin skill file lists differ",
);
for (const file of standaloneFiles) {
  assert.deepEqual(
    await readFile(path.join(standalone, file)),
    await readFile(path.join(pluginSkill, file)),
    `${file} differs between standalone and plugin skills`,
  );
}

const skill = await readFile(path.join(standalone, "SKILL.md"), "utf8");
assert.match(skill, /^---\n[\s\S]*?name: solo-venture-scout\n[\s\S]*?description: .+\n[\s\S]*?---\n/);
assert.doesNotMatch(skill, /\[TODO:/);
const openaiMetadata = await readFile(
  path.join(standalone, "agents", "openai.yaml"),
  "utf8",
);
assert.match(openaiMetadata, /allow_implicit_invocation:\s*false/);

const kernel = await readFile(
  path.join(standalone, "scripts", "scout-kernel.mjs"),
  "utf8",
);
assert.match(kernel, /^#!\/usr\/bin\/env node\n/);

const packageMetadata = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
);
const versions = JSON.parse(
  await readFile(path.join(standalone, "references", "versions.json"), "utf8"),
);
assert.deepEqual(Object.keys(versions).sort(), [
  "campaignFormat",
  "commandEnvelope",
  "records",
  "release",
  "renderTemplates",
  "researchPackages",
]);
for (const version of Object.values(versions)) {
  assert.equal(typeof version, "string");
  assert.match(version, semver);
}
assert.equal(versions.release, packageMetadata.version);

const manifest = JSON.parse(
  await readFile(path.join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"),
);
assert.equal(manifest.name, "solo-venture-scout");
assert.equal(manifest.version, versions.release);
assert.equal(manifest.skills, "./skills/");
assert.equal(manifest.license, "MIT");
assert.equal(typeof manifest.author?.name, "string");
assert.equal(typeof manifest.interface?.displayName, "string");
assert.equal("apps" in manifest, false);
assert.equal("mcpServers" in manifest, false);

const archives = (await readdir(path.join(outputRoot, "packages")))
  .filter((file) => file.endsWith(".tgz"))
  .sort();
assert.deepEqual(archives, [
  `solo-venture-scout-plugin-${versions.release}.tgz`,
  `solo-venture-scout-standalone-${versions.release}.tgz`,
]);
for (const archive of archives) {
  const { stdout } = await execFileAsync("tar", [
    "-tzf",
    path.join(outputRoot, "packages", archive),
  ]);
  assert.match(stdout, /solo-venture-scout\/SKILL\.md|solo-venture-scout\/skills\/solo-venture-scout\/SKILL\.md/);
  if (archive.includes("-plugin-")) {
    assert.match(stdout, /solo-venture-scout\/\.codex-plugin\/plugin\.json/);
  } else {
    assert.doesNotMatch(stdout, /\.codex-plugin/);
  }
}

process.stdout.write(
  `${JSON.stringify({
    valid: true,
    identicalSkillFiles: standaloneFiles.length,
    archives,
    versions,
  })}\n`,
);
