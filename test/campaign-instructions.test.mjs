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
  assert.match(reference, /"command": "reserveApprovedResearch"/);
  assert.match(reference, /"command": "recordApprovedResearchObservation"/);
  assert.match(reference, /"kind": "resolve-without-result"/);
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

test("packaged Scout qualifies Opportunities and reports an honest No Qualifying Opportunity outcome", async () => {
  const { outputRoot } = await buildPackagedScout(
    "solo-venture-scout-qualification-guide-",
  );
  const skillRoot = path.join(outputRoot, "standalone", "solo-venture-scout");
  const instructions = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  const reference = await readFile(
    path.join(skillRoot, "references", "campaigns.md"),
    "utf8",
  );

  for (const gate of [
    "Costly Problem",
    "buyer economics",
    "customer access",
    "value feasibility",
    "solo feasibility",
    "competitive viability",
    "legal and operational feasibility",
    "commercial plausibility",
  ]) {
    assert.match(instructions, new RegExp(gate, "i"));
  }
  assert.match(
    instructions,
    /Qualification Gate.+affirmative evidence.+medium or high Evidence\s+Confidence/is,
  );
  assert.match(
    instructions,
    /market and commercial claims.+independent behavior evidence/is,
  );
  assert.match(instructions, /time-sensitive claims.+current evidence/is);
  assert.match(
    instructions,
    /Evidence Gap|Contradiction.+block.+Qualification Gate/is,
  );
  assert.match(
    instructions,
    /price.+volume.+costs.+acquisition.+capacity.+timing.+ranges.+point forecast/is,
  );
  assert.match(
    instructions,
    /Research Budget.+positive Decision Value.+continue/is,
  );
  assert.match(
    instructions,
    /No Qualifying Opportunity Report.+immutable.+valid.+not an error/is,
  );
  assert.match(
    instructions,
    /rejected Opportunities.+unresolved\s+Opportunities.+coverage.+Breadth Gate.+budget.+limitations.+continuation conditions/is,
  );
  assert.match(reference, /"command": "recordOpportunityQualificationGates"/);
  assert.match(reference, /"kind": "commercial-plausibility"/);
  assert.match(reference, /"commercialRanges"/);
  assert.match(reference, /"decisionValuePriorityId"/);
  assert.match(reference, /"command": "concludeNoQualifyingOpportunity"/);
  assert.match(reference, /no-qualifying-opportunity-report\.md/);
});

test("packaged Scout compares Eligible Opportunities and hands off only a defensible Leading Opportunity", async () => {
  const { outputRoot } = await buildPackagedScout(
    "solo-venture-scout-leading-opportunity-guide-",
  );
  const skillRoot = path.join(outputRoot, "standalone", "solo-venture-scout");
  const instructions = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  const reference = await readFile(
    path.join(skillRoot, "references", "campaigns.md"),
    "utf8",
  );

  assert.match(instructions, /Required Input.+Potential Output.+Outcome Uncertainty.+Input.Output Asymmetry/is);
  assert.match(instructions, /without.+weighted totals.+probabilities/is);
  assert.match(instructions, /dominance.+material.+evidence.+Non-Dominated Opportunities.+visible/is);
  assert.match(instructions, /advantage over every alternative.+major Preference.+Risk Tolerance.+credible ranges/is);
  assert.match(instructions, /adversarial.+reserve.+decision-changing gap.+Contradiction.+contender/is);
  assert.match(instructions, /Value Hypothesis.+provisional.+not a product specification/is);
  assert.match(instructions, /features.+interfaces.+architecture.+roadmap.+backlog.+estimates.+delivery design.+settled mechanism.+settled positioning/is);
  assert.match(instructions, /Wayfinder.+optional.+separate.+human-invoked.+never start/is);
  assert.match(instructions, /Markdown.+path.+never open/is);
  assert.match(reference, /"researchClass": "adversarial"/);
  assert.match(reference, /"command": "concludeLeadingOpportunity"/);
  assert.match(reference, /opportunity-brief\.md/);
});

test("packaged Scout preserves inconclusive comparisons and exact developer terminal choices", async () => {
  const { outputRoot } = await buildPackagedScout(
    "solo-venture-scout-inconclusive-guide-",
  );
  const skillRoot = path.join(outputRoot, "standalone", "solo-venture-scout");
  const instructions = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  const reference = await readFile(
    path.join(skillRoot, "references", "campaigns.md"),
    "utf8",
  );

  assert.match(
    instructions,
    /Inconclusive Comparison Report.+Eligible Non-Dominated\s+Opportunities.+unscored side-by-side.+decisive trade-offs/is,
  );
  assert.match(
    instructions,
    /unresolved contenders.+explicit blockers.+Stop.+Extend.+Select/is,
  );
  assert.match(
    instructions,
    /Stop.+preserve.+unchanged.+no Opportunity Brief/is,
  );
  assert.match(
    instructions,
    /Extend.+targeted Evidence Gaps.+new\s+Campaign Intake version.+Research Budget.+only affected work/is,
  );
  assert.match(
    instructions,
    /Select.+one or more.+Eligible Non-Dominated\s+Opportunities.+developer Preference.+not market evidence/is,
  );
  assert.match(
    instructions,
    /Developer-Selected Opportunity.+never.+Leading.+separate.+Wayfinder/is,
  );
  assert.match(reference, /"command": "concludeInconclusiveComparison"/);
  assert.match(reference, /inconclusive-comparison-report\.md/);
  assert.match(reference, /"kind": "stop"/);
  assert.match(reference, /"kind": "extend"/);
  assert.match(reference, /"targetedEvidenceGapIds"/);
  assert.match(reference, /"kind": "select"/);
  assert.match(reference, /"selections"/);
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

test("packaged Scout records challenges, targeted re-evaluation, and terminal supersession explicitly", async () => {
  const { outputRoot } = await buildPackagedScout(
    "solo-venture-scout-reevaluation-guide-",
  );
  const skillRoot = path.join(outputRoot, "standalone", "solo-venture-scout");
  const instructions = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  const reference = await readFile(
    path.join(skillRoot, "references", "campaigns.md"),
    "utf8",
  );

  assert.match(
    instructions,
    /natural-language challenge.+explicit.+correction|re-evaluation/is,
  );
  assert.match(
    instructions,
    /Campaign Intake revision.+reason.+new confirmed\s+version.+only dependent decisions/is,
  );
  assert.match(
    instructions,
    /reaffirm.+supersede.+retract.+stable links/is,
  );
  assert.match(
    instructions,
    /Rejected Opportunities.+active.+Eligible Opportunities.+lose\s+eligibility/is,
  );
  assert.match(
    instructions,
    /terminal artifacts.+immutable.+explicit\s+supersession/is,
  );
  assert.match(
    instructions,
    /continued campaign.+identity.+evidence.+lineage.+independent objective.+new\s+campaign/is,
  );
  assert.match(
    instructions,
    /Resume.+only.+time-sensitive evidence.+active\s+decision/is,
  );
  assert.match(
    instructions,
    /inspect.+authoritative Work View.+current disposition.+eligibility.+exactly/is,
  );
  assert.match(
    instructions,
    /never.+carry forward.+superseded.+status|label/is,
  );
  assert.match(reference, /"command": "reevaluateCampaign"/);
  assert.match(reference, /"kind": "campaign-re-evaluation"/);
  assert.match(reference, /"supersededDecisionIds"/);
  assert.match(reference, /"refreshAfter"/);
});
