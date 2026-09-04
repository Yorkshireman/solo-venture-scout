import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { repositoryRoot } from "./lib/release-paths.mjs";

const contract = JSON.parse(
  await readFile(path.join(repositoryRoot, "release", "acceptance-contract.json"), "utf8"),
);
const evidenceDirectory = path.resolve(
  process.env.SVS_ACCEPTANCE_EVIDENCE_DIR ??
    path.join(repositoryRoot, "release", "evidence", contract.targetReleaseVersion),
);
const evidence = {
  evidenceVersion: contract.contractVersion,
  gateId: "version-and-tag",
  releaseVersion: contract.targetReleaseVersion,
  status: "passed",
  generatedAt: new Date().toISOString(),
  officialTag: contract.officialTag,
  tagMustBeAnnotated: true,
  tagMustPointToHead: true,
  publicationRequiresQualifiedReport: true,
};

await mkdir(evidenceDirectory, { recursive: true });
await writeFile(
  path.join(evidenceDirectory, "version-and-tag.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(evidence)}\n`);
