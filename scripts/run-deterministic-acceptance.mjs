import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha256, treeSha256 } from "./lib/artifact-identity.mjs";
import { outputRoot, repositoryRoot } from "./lib/release-paths.mjs";

const contract = JSON.parse(
  await readFile(path.join(repositoryRoot, "release", "acceptance-contract.json"), "utf8"),
);
const planPath = path.resolve(
  process.env.SVS_DETERMINISTIC_PLAN ??
    path.join(repositoryRoot, "release", "deterministic-suites.json"),
);
const evidenceDirectory = path.resolve(
  process.env.SVS_ACCEPTANCE_EVIDENCE_DIR ??
    path.join(repositoryRoot, "release", "evidence", contract.targetReleaseVersion),
);
const plan = JSON.parse(await readFile(planPath, "utf8"));
const skillRoot = path.join(outputRoot, "standalone", "solo-venture-scout");
const contractVersions = JSON.parse(
  await readFile(path.join(skillRoot, "references", "versions.json"), "utf8"),
);

if (plan.planVersion !== contract.suiteVersion) {
  throw new Error(`deterministic plan version must be ${contract.suiteVersion}`);
}
const planIds = plan.suites.map(
  /** @param {{ id: string }} suite */
  (suite) => suite.id,
);
if (
  planIds.length !== contract.deterministicSuites.length ||
  new Set(planIds).size !== planIds.length ||
  contract.deterministicSuites.some(
    /** @param {string} suiteId */
    (suiteId) => !planIds.includes(suiteId),
  )
) {
  throw new Error("deterministic plan must contain every required suite exactly once");
}

/**
 * @param {string} executable
 * @param {string[]} arguments_
 */
function execute(executable, arguments_) {
  return new Promise((resolve) => {
    execFile(
      executable,
      arguments_,
      {
        cwd: repositoryRoot,
        env: { ...process.env, NO_COLOR: "1" },
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        resolve({ code: error && "code" in error ? error.code : 0, stdout, stderr });
      },
    );
  });
}

const suites = [];
for (const suite of plan.suites) {
  const startedAt = new Date().toISOString();
  const result = await execute(suite.executable, suite.arguments);
  const completedAt = new Date().toISOString();
  const combinedOutput = `${result.stdout}\n${result.stderr}`;
  const testCount = Number(combinedOutput.match(/(?:^|\s)tests\s+(\d+)/m)?.[1] ?? 0);
  const failureCount = Number(combinedOutput.match(/(?:^|\s)fail\s+(\d+)/m)?.[1] ?? 0);
  const passed = result.code === 0 && testCount > 0 && failureCount === 0;
  suites.push({
    id: suite.id,
    command: [suite.executable, ...suite.arguments].join(" "),
    status: passed ? "passed" : "failed",
    testCount,
    failureCount,
    startedAt,
    completedAt,
    outputSha256: sha256(combinedOutput),
    ...(passed ? {} : { diagnostic: combinedOutput.slice(-4000) }),
  });
}

const evidence = {
  evidenceVersion: contract.contractVersion,
  gateId: "deterministic",
  releaseVersion: contract.targetReleaseVersion,
  status: suites.every((suite) => suite.status === "passed") ? "passed" : "failed",
  generatedAt: new Date().toISOString(),
  suiteVersion: contract.suiteVersion,
  skill: {
    name: contract.skillName,
    version: contractVersions.release,
    treeSha256: await treeSha256(skillRoot),
  },
  contractVersions,
  runtime: {
    nodeVersion: process.versions.node,
    platform: process.platform,
    architecture: process.arch,
  },
  suites,
};

await mkdir(evidenceDirectory, { recursive: true });
await writeFile(
  path.join(evidenceDirectory, "deterministic.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(evidence)}\n`);
if (evidence.status !== "passed") process.exitCode = 1;
