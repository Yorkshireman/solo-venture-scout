import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { filesUnder } from "./lib/files-under.mjs";
import { sha256, treeSha256 } from "./lib/artifact-identity.mjs";
import { outputRoot, repositoryRoot } from "./lib/release-paths.mjs";

const execFileAsync = promisify(execFile);
const contract = JSON.parse(
  await readFile(path.join(repositoryRoot, "release", "acceptance-contract.json"), "utf8"),
);
const evidenceDirectory = path.resolve(
  process.env.SVS_ACCEPTANCE_EVIDENCE_DIR ??
    path.join(repositoryRoot, "release", "evidence", contract.targetReleaseVersion),
);
const repeatRoot = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-repeat-package-"));

/** @param {string} targetRoot */
async function buildAndPackage(targetRoot) {
  const env = { ...process.env, SVS_DIST_DIR: targetRoot };
  await execFileAsync(process.execPath, ["scripts/build.mjs"], {
    cwd: repositoryRoot,
    env,
    maxBuffer: 10 * 1024 * 1024,
  });
  await execFileAsync(process.execPath, ["scripts/package.mjs"], {
    cwd: repositoryRoot,
    env,
    maxBuffer: 10 * 1024 * 1024,
  });
}

/** @param {string} archivePath */
async function archiveContentsAreValid(archivePath) {
  try {
    const { stdout } = await execFileAsync("tar", ["-tzf", archivePath]);
    return (
      /solo-venture-scout\/(?:skills\/solo-venture-scout\/)?SKILL\.md/.test(stdout) &&
      /solo-venture-scout\/LICENSE/.test(stdout) &&
      /solo-venture-scout\/NOTICE/.test(stdout) &&
      !/\.DS_Store|\/\._/.test(stdout)
    );
  } catch {
    return false;
  }
}

/**
 * @param {string} archivePath
 * @param {string} member
 */
async function archiveMember(archivePath, member) {
  const { stdout } = await execFileAsync("tar", ["-xOzf", archivePath, member], {
    encoding: "buffer",
  });
  return stdout;
}

try {
  await buildAndPackage(outputRoot);
  await buildAndPackage(repeatRoot);

  const standaloneSkill = path.join(outputRoot, "standalone", "solo-venture-scout");
  const pluginSkill = path.join(
    outputRoot,
    "plugin",
    "solo-venture-scout",
    "skills",
    "solo-venture-scout",
  );
  const standaloneFiles = await filesUnder(standaloneSkill);
  const pluginFiles = await filesUnder(pluginSkill);
  let skillTreesByteIdentical = JSON.stringify(standaloneFiles) === JSON.stringify(pluginFiles);
  for (const file of standaloneFiles) {
    if (!skillTreesByteIdentical) break;
    skillTreesByteIdentical =
      Buffer.compare(
        await readFile(path.join(standaloneSkill, file)),
        await readFile(path.join(pluginSkill, file)),
      ) === 0;
  }

  const manifestPath = path.join(outputRoot, "release", "release-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const archiveManifestEntries = manifest.files
    .filter(
      /** @param {{ path: string }} file */
      (file) => file.path.startsWith("packages/"),
    )
    .sort(
      /** @param {{ path: string }} left @param {{ path: string }} right */
      (left, right) => left.path.localeCompare(right.path),
    );
  const archives = [];
  for (const entry of archiveManifestEntries) {
    const archivePath = path.join(outputRoot, entry.path);
    const repeatPath = path.join(repeatRoot, entry.path);
    const contents = await readFile(archivePath);
    const repeatContents = await readFile(repeatPath);
    archives.push({
      distribution: entry.path.includes("-plugin-") ? "plugin" : "standalone",
      path: entry.path,
      bytes: contents.length,
      sha256: sha256(contents),
      repeatSha256: sha256(repeatContents),
      contentsValid: await archiveContentsAreValid(archivePath),
    });
  }

  const checksumPath = path.join(outputRoot, "release", "CHECKSUMS.sha256");
  const checksumContents = await readFile(checksumPath, "utf8");
  const declaredChecksums = new Map(
    checksumContents
      .trim()
      .split("\n")
      .map((line) => {
        const [digest, file] = line.split(/\s{2}/);
        return [file, digest];
      }),
  );
  const checksumVerified = manifest.files.every(
    /** @param {{ path: string, sha256: string }} file */
    (file) => declaredChecksums.get(file.path) === file.sha256,
  );

  const inventoryPath = path.join(outputRoot, "release", "dependency-inventory.json");
  const inventoryContents = await readFile(inventoryPath);
  const inventory = JSON.parse(inventoryContents.toString("utf8"));
  const licensePath = path.join(outputRoot, "release", "LICENSE");
  const noticePath = path.join(outputRoot, "release", "NOTICE");
  const licenseContents = await readFile(licensePath);
  const noticeContents = await readFile(noticePath);
  let archiveCopiesVerified = true;
  for (const archive of archives) {
    const archivePath = path.join(outputRoot, archive.path);
    archiveCopiesVerified =
      archiveCopiesVerified &&
      Buffer.compare(
        await archiveMember(archivePath, "solo-venture-scout/LICENSE"),
        licenseContents,
      ) === 0 &&
      Buffer.compare(
        await archiveMember(archivePath, "solo-venture-scout/NOTICE"),
        noticeContents,
      ) === 0;
  }
  const matrixPath = path.join(outputRoot, "release", "compatibility-matrix.json");
  const matrixContents = await readFile(matrixPath);
  const sourceMatrixContents = await readFile(
    path.join(repositoryRoot, "release", "compatibility-matrix.json"),
  );

  const status =
    skillTreesByteIdentical &&
    archives.length === 2 &&
    archives.every(
      (archive) => archive.sha256 === archive.repeatSha256 && archive.contentsValid,
    ) &&
    checksumVerified &&
    inventory.runtimeDependencies.length === 0 &&
    inventory.completeLockInventory.every(
      /** @param {{ license: string }} dependency */
      (dependency) => dependency.license !== "unknown",
    ) &&
    archiveCopiesVerified &&
    Buffer.compare(matrixContents, sourceMatrixContents) === 0;

  const evidence = {
    evidenceVersion: contract.contractVersion,
    gateId: "legal-and-packaging",
    releaseVersion: contract.targetReleaseVersion,
    status: status ? "passed" : "failed",
    generatedAt: new Date().toISOString(),
    skill: {
      name: contract.skillName,
      version: manifest.releaseVersion,
      treeSha256: await treeSha256(standaloneSkill),
    },
    skillTreesByteIdentical,
    archives,
    checksumManifest: {
      path: "release/CHECKSUMS.sha256",
      sha256: sha256(checksumContents),
      verified: checksumVerified,
    },
    dependencyInventory: {
      path: "release/dependency-inventory.json",
      sha256: sha256(inventoryContents),
      verified: inventory.releaseVersion === contract.targetReleaseVersion,
      runtimeDependencies: inventory.runtimeDependencies,
      allLicensesKnown: inventory.completeLockInventory.every(
        /** @param {{ license: string }} dependency */
        (dependency) => dependency.license !== "unknown",
      ),
    },
    licenseAndNotice: {
      licenseIncluded: licenseContents.length > 0,
      noticeIncluded: noticeContents.length > 0,
      archiveCopiesVerified,
      licenseSha256: sha256(licenseContents),
      noticeSha256: sha256(noticeContents),
      unresolvedNotices: [],
    },
    compatibilityMatrix: {
      verified: Buffer.compare(matrixContents, sourceMatrixContents) === 0,
      sha256: sha256(matrixContents),
    },
  };

  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(
    path.join(evidenceDirectory, "legal-and-packaging.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
  if (!status) process.exitCode = 1;
} finally {
  await rm(repeatRoot, { recursive: true, force: true });
}
