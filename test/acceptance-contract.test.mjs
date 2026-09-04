import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { repositoryRoot } from "./support/packaged-scout.mjs";

/** @param {string} relativePath */
async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(repositoryRoot, relativePath), "utf8"));
}

test("the release contract, scenario pack, rubric, and golden set are versioned and complete", async () => {
  const contract = await readJson("release/acceptance-contract.json");
  const scenarios = await readJson("release/controlled-scenarios.json");
  const rubric = await readJson("release/evaluation/rubric.json");
  const goldenSet = await readJson("release/evaluation/golden-set.json");
  const packageMetadata = await readJson("package.json");
  const contracts = await readJson("release/contracts.json");

  assert.equal(contract.targetReleaseVersion, "1.0.0");
  assert.equal(packageMetadata.version, contract.targetReleaseVersion);
  assert.equal(contracts.release, contract.targetReleaseVersion);
  assert.equal(scenarios.scenarioVersion, contract.suiteVersion);
  assert.deepEqual(
    scenarios.scenarios.map(
      /** @param {{ id: string }} scenario */
      (scenario) => scenario.id,
    ),
    contract.controlledScenarios,
  );
  for (const scenario of scenarios.scenarios) {
    assert.equal(typeof scenario.coordinatorInput, "object");
    assert.equal(typeof scenario.coordinatorInput.campaignIntake, "object");
    assert.equal(typeof scenario.coordinatorInput.capabilityProfile, "object");
    assert.equal(Array.isArray(scenario.coordinatorInput.evidence), true);
    assert.equal(typeof scenario.coordinatorInput.deterministic.now, "string");
    assert.equal(Array.isArray(scenario.evaluatorOnly.requiredDecisions), true);
    assert.equal(Array.isArray(scenario.evaluatorOnly.forbiddenDecisions), true);
    assert.equal(typeof scenario.evaluatorOnly.forcedOutcome, "string");
    assert.equal("evaluatorOnly" in scenario.coordinatorInput, false);
    for (const item of scenario.coordinatorInput.evidence) {
      assert.equal(item.copyrightSafe, true);
      assert.equal(typeof item.lineageId, "string");
      assert.equal(typeof item.freshness, "object");
    }
  }

  assert.equal(rubric.rubricVersion, contract.evaluator.rubricVersion);
  assert.deepEqual(
    rubric.dimensions.map(
      /** @param {{ id: string }} dimension */
      (dimension) => dimension.id,
    ),
    contract.rubricDimensions,
  );
  assert.deepEqual(rubric.zeroToleranceInvariants, contract.zeroToleranceInvariants);
  assert.deepEqual(rubric.ratingOrder, ["unacceptable", "acceptable", "strong", "exceptional"]);

  assert.equal(goldenSet.goldenSetVersion, contract.evaluator.goldenSetVersion);
  assert.equal(goldenSet.humanReview.status, "approved");
  assert.match(goldenSet.humanReview.reference, /GitHub issue #14/i);
  assert.deepEqual(
    goldenSet.cases.map(
      /** @param {{ id: string }} goldenCase */
      (goldenCase) => goldenCase.id,
    ),
    contract.evaluator.goldenCases,
  );
  for (const goldenCase of goldenSet.cases) {
    assert.equal(typeof goldenCase.transcript, "string");
    assert.equal(typeof goldenCase.expectedOverall, "string");
    assert.equal(Array.isArray(goldenCase.expectedFailedInvariants), true);
  }

  assert.equal(contract.liveRetrieval.sourceRequirements.length, 3);
  assert.equal(
    contract.liveRetrieval.sourceRequirements.filter(
      (/** @type {{ hostileContent: boolean }} */ requirement) =>
        requirement.hostileContent === true,
    ).length,
    1,
  );
  for (const requirement of contract.liveRetrieval.sourceRequirements) {
    assert.equal(typeof requirement.id, "string");
    assert.equal(requirement.allowedHosts.length > 0, true);
    assert.equal(requirement.pathPrefix.startsWith("/"), true);
    assert.equal(requirement.contentMarkers.length > 0, true);
    assert.equal(requirement.claimTerms.length > 0, true);
  }
});

test("release documentation exposes the certified profile, evidence workflow, and no-early-tag rule", async () => {
  const readme = await readFile(path.join(repositoryRoot, "README.md"), "utf8");

  assert.match(readme, /1\.0\.0 release qualification/i);
  assert.match(readme, /codex-local-web.+certified/is);
  assert.match(readme, /Claude Code.+structural-only/is);
  assert.match(readme, /acceptance:controlled.+acceptance:live/is);
  assert.match(readme, /three independent runs/i);
  assert.match(readme, /rerun.+does not erase.+failure/is);
  assert.match(readme, /CHECKSUMS\.sha256.+dependency-inventory\.json.+NOTICE/is);
  assert.match(readme, /do not create.+v1\.0\.0.+qualified/is);
});
