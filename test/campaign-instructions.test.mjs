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

test("packaged Scout keeps Public Research retrieval outside the kernel and imports only safe evidence", async () => {
  const { outputRoot } = await buildPackagedScout("solo-venture-scout-public-research-guide-");
  const skillRoot = path.join(outputRoot, "standalone", "solo-venture-scout");
  const instructions = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  const reference = await readFile(
    path.join(skillRoot, "references", "campaigns.md"),
    "utf8",
  );

  assert.match(instructions, /reserve.+Source.+before.+retriev/is);
  assert.match(instructions, /retrieval.+outside the kernel/i);
  assert.match(instructions, /retrieved instructions.+untrusted.+never execute/is);
  assert.match(instructions, /atomic.+neutral.+paraphrase/is);
  assert.match(instructions, /credentials.+payment information.+personal data.+raw content/is);
  assert.match(instructions, /checkpoint.+resume/is);
  assert.match(reference, /"command": "reservePublicResearch"/);
  assert.match(reference, /"command": "recordPublicResearchObservation"/);
  assert.match(reference, /publisher.+originator.+publishedAt.+updatedAt.+accessedAt.+exactLocator/is);
});

test("packaged Scout derives auditable reasoning without blurring evidence types", async () => {
  const { outputRoot } = await buildPackagedScout("solo-venture-scout-reasoning-guide-");
  const skillRoot = path.join(outputRoot, "standalone", "solo-venture-scout");
  const instructions = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  const reference = await readFile(
    path.join(skillRoot, "references", "campaigns.md"),
    "utf8",
  );

  assert.match(instructions, /Observation.+Inference.+Assumption.+Evidence Gap.+Contradiction/is);
  assert.match(instructions, /supporting.+challenging.+scope.+reasoning/is);
  assert.match(instructions, /Assumption.+no evidential credit.+Evidence Gap/is);
  assert.match(instructions, /Source Lineage.+independent/is);
  assert.match(instructions, /credibility.+freshness.+Observation.+use/is);
  assert.match(instructions, /Evidence Confidence.+unknown.+low.+medium.+high/is);
  assert.match(instructions, /never.+Observation.+confidence/is);
  assert.match(instructions, /correction.+supersed.+retract.+never delet/is);
  assert.match(instructions, /Work View.+stable.+pointer.+entire Evidence Ledger/is);
  assert.match(reference, /"command": "recordEvidenceReasoning"/);
  for (const entryType of [
    "source-lineage",
    "source-credibility",
    "source-freshness",
    "evidence-gap",
    "assumption",
    "inference",
    "contradiction",
    "correction",
  ]) {
    assert.match(reference, new RegExp(`"type": "${entryType}"`));
  }
});
