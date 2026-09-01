import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { buildPackagedScout } from "./support/packaged-scout.mjs";

test("packaged Scout requires an explicit storage choice before Campaign writes", async () => {
  const { outputRoot } = await buildPackagedScout("solo-venture-scout-instructions-");
  const skillRoot = path.join(outputRoot, "standalone", "solo-venture-scout");
  const instructions = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");

  assert.match(instructions, /show the developer the current working directory/i);
  assert.match(instructions, /explicit.+Campaign path/i);
  assert.match(instructions, /before.+Campaign write/i);
  assert.match(instructions, /inside a (Git )?repository.+privacy warning/i);
  assert.match(instructions, /never (stage or )?commit Campaign data/i);
  assert.match(instructions, /references\/campaigns\.md/);
});

test("packaged Scout documents create, inspect, and resume commands", async () => {
  const { outputRoot } = await buildPackagedScout("solo-venture-scout-command-docs-");
  const reference = await readFile(
    path.join(
      outputRoot,
      "standalone",
      "solo-venture-scout",
      "references",
      "campaigns.md",
    ),
    "utf8",
  );

  for (const command of ["createCampaign", "inspectCampaign", "resumeCampaign"]) {
    assert.match(reference, new RegExp(`"command": "${command}"`));
  }
  assert.match(reference, /manifest discovery/i);
  assert.match(reference, /exactly one direct Scouting Campaign/i);
});
