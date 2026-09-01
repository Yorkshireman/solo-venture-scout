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

test("packaged Scout guides and reviews Campaign Intake one decision at a time", async () => {
  const { outputRoot } = await buildPackagedScout("solo-venture-scout-intake-guide-");
  const skillRoot = path.join(outputRoot, "standalone", "solo-venture-scout");
  const instructions = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  const reference = await readFile(
    path.join(skillRoot, "references", "campaigns.md"),
    "utf8",
  );

  assert.match(instructions, /one decision at a time/i);
  for (const topic of [
    "Commercial Outcome Target",
    "capacity",
    "capabilities",
    "access",
    "boundaries",
    "operating preferences",
    "risk tolerance",
    "Research Budget",
  ]) {
    assert.match(instructions, new RegExp(topic, "i"));
  }
  assert.match(instructions, /Hard Constraint/i);
  assert.match(instructions, /Preference.+minor.+important.+major/is);
  assert.match(instructions, /Advantage.+rationale/is);
  assert.match(instructions, /unknown.+none.+not applicable/is);
  assert.match(instructions, /safe default.+visible.+confirm/is);
  assert.match(instructions, /warnings.+constraints.+preferences.+advantages.+unknowns/is);
  assert.match(instructions, /explicit confirmation/i);
  assert.match(instructions, /Public Research.+unavailable.+confirmed Campaign Intake/is);
  assert.match(reference, /"command": "confirmCampaignIntake"/);
});
