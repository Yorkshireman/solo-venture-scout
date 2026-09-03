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

test("packaged Scout runs bounded source-led discovery without familiar-domain bias", async () => {
  const { outputRoot } = await buildPackagedScout("solo-venture-scout-discovery-guide-");
  const skillRoot = path.join(outputRoot, "standalone", "solo-venture-scout");
  const instructions = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  const reference = await readFile(
    path.join(skillRoot, "references", "campaigns.md"),
    "utf8",
  );

  assert.match(instructions, /Discovery Sweep.+heterogeneous Source Families/is);
  assert.match(instructions, /external maps of economic activity.+controlled sampling/is);
  assert.match(instructions, /not.+developer-supplied category list/is);
  assert.match(instructions, /customer group.+situation or workflow.+problem family/is);
  assert.match(instructions, /familiar domain.+one-third.+Campaign Intake.+exception/is);
  assert.match(instructions, /same shallow initial research allowance/is);
  assert.match(instructions, /twenty percent.+discovery tranche.+Novelty Probes/is);
  assert.match(instructions, /Novelty Probe.+Assumption.+Evidence Gap.+no evidential credit/is);
  assert.match(instructions, /material consequence.+committed behavior.+complaint.+feature request/is);
  assert.match(instructions, /Work View.+coverage.+Source Families.+allowances.+retained.+dropped/is);
  assert.match(reference, /"command": "recordDiscoveryTranche"/);
  assert.match(reference, /"frameOrigin": "external-map"/);
  assert.match(reference, /"kind": "novelty-probe"/);
});

test("packaged Scout forms evidence-backed Opportunities and narrows only through the Breadth Gate", async () => {
  const { outputRoot } = await buildPackagedScout("solo-venture-scout-opportunity-guide-");
  const skillRoot = path.join(outputRoot, "standalone", "solo-venture-scout");
  const instructions = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  const reference = await readFile(
    path.join(skillRoot, "references", "campaigns.md"),
    "utf8",
  );

  assert.match(instructions, /specific customer.+specific situation.+Costly Problem/is);
  assert.match(instructions, /two independent Source Lineages.+behavioral Problem Signal/is);
  assert.match(instructions, /customer.+workflow.+costly consequence.+not.+solution/is);
  assert.match(instructions, /Exploration Thread.+explicit Evidence Gaps/is);
  assert.match(instructions, /before.+Breadth Gate.+evenly.+Discovery Sweeps.+shallow problem mining/is);
  assert.match(instructions, /Breadth Gate.+Source Famil.+minimum comparison set.+two diminishing-return tranches.+familiar/is);
  assert.match(instructions, /after.+Breadth Gate.+eighty percent.+deepening.+twenty percent.+open-world discovery/is);
  assert.match(instructions, /Decision Value.+formation.+gate.+Contradiction.+comparison/is);
  assert.match(instructions, /final adversarial.+reserved.+ordinary research/is);
  assert.match(reference, /"command": "recordOpportunityFormation"/);
  assert.match(reference, /"command": "passBreadthGate"/);
});

test("packaged Scout documents Opportunity Exclusion Gates and Elevated-Risk approval", async () => {
  const { outputRoot } = await buildPackagedScout("solo-venture-scout-exclusion-guide-");
  const skillRoot = path.join(outputRoot, "standalone", "solo-venture-scout");
  const instructions = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  const reference = await readFile(
    path.join(skillRoot, "references", "campaigns.md"),
    "utf8",
  );

  assert.match(
    instructions,
    /Excluded\s+Market.+intended activity.+directly serves.+non-overridable/is,
  );
  assert.match(instructions, /missing evidence.+Exclusion\s+Gate.+unresolved/is);
  assert.match(instructions, /Hard Constraint.+failed Exclusion\s+Gate.+rejected/is);
  assert.match(
    instructions,
    /Elevated-Risk\s+Market.+shallow classification.+Opportunity-specific Research\s+Approval.+deep research.+recommendation/is,
  );
  assert.match(
    instructions,
    /refus.+unavailable.+unresolved.+ineligible.+not.+rejected/is,
  );
  assert.match(
    instructions,
    /Opportunity\s+Disposition.+gate state.+terminal role.+distinct/is,
  );
  assert.match(reference, /"command": "recordOpportunityExclusionGates"/);
  assert.match(reference, /"supportingEvidenceEntryIds"/);
  assert.match(reference, /"challengingEvidenceEntryIds"/);
  assert.match(reference, /"evidenceGapIds"/);
  assert.match(reference, /"contradictionIds"/);
  assert.match(reference, /"access": "elevated-risk"/);
  assert.match(reference, /"opportunityId"/);
  assert.match(reference, /"researchDepth": "deep"/);
});

test("packaged Scout pauses safely at restricted and paid research boundaries", async () => {
  const { outputRoot } = await buildPackagedScout("solo-venture-scout-approval-guide-");
  const skillRoot = path.join(outputRoot, "standalone", "solo-venture-scout");
  const instructions = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  const reference = await readFile(
    path.join(skillRoot, "references", "campaigns.md"),
    "utf8",
  );

  assert.match(
    instructions,
    /action.+purpose.+Source.+access method.+data.+external effects.+maximum cost.+currency.+risks.+duration.+alternatives/is,
  );
  assert.match(instructions, /one active blocking\s+Pending Decision/i);
  assert.match(instructions, /explicit.+unchanged scope.+consum/is);
  assert.match(instructions, /informational.+preserve.+Pending Decision/is);
  assert.match(instructions, /silence.+resumable pause/is);
  assert.match(instructions, /refus.+Evidence Gap/is);
  assert.match(instructions, /continue independent.+work/is);
  assert.match(instructions, /material change.+renewed\s+approval/is);
  assert.match(instructions, /Research Expenditure.+approval provenance.+Research Budget/is);
  assert.match(instructions, /never.+credentials.+payment details/is);
  assert.match(instructions, /ambiguous.+never.+retr/is);
  assert.match(instructions, /unlawful.+External Validation Action/is);
  assert.match(reference, /"action": "read-source"/);
  assert.match(
    reference,
    /"accessMethod": "developer-controlled-authenticated-and-paid-read-only"/,
  );
  assert.match(reference, /externalEffects.+must be empty/is);
  for (const command of [
    "requestResearchApproval",
    "recordResearchApprovalInformation",
    "respondResearchApproval",
    "recordResearchExpenditure",
  ]) {
    assert.match(reference, new RegExp(`"command": "${command}"`));
  }
});
