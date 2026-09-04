import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { sha256 } from "./lib/artifact-identity.mjs";
import { filesUnder } from "./lib/files-under.mjs";
import { outputRoot, repositoryRoot } from "./lib/release-paths.mjs";

const packageMetadata = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
);
const lock = JSON.parse(
  await readFile(path.join(repositoryRoot, "package-lock.json"), "utf8"),
);
const packagesDirectory = path.join(outputRoot, "packages");
const releaseDirectory = path.join(outputRoot, "release");

/**
 * @param {Buffer} header
 * @param {number} offset
 * @param {number} length
 * @param {string} value
 */
function writeText(header, offset, length, value) {
  const encoded = Buffer.from(value);
  if (encoded.length > length) throw new Error(`tar field is too long: ${value}`);
  encoded.copy(header, offset);
}

/**
 * @param {Buffer} header
 * @param {number} offset
 * @param {number} length
 * @param {number} value
 */
function writeOctal(header, offset, length, value) {
  writeText(header, offset, length, `${value.toString(8).padStart(length - 1, "0")}\0`);
}

/** @param {string} archivePath */
function splitTarPath(archivePath) {
  if (Buffer.byteLength(archivePath) <= 100) return { name: archivePath, prefix: "" };
  const separators = [...archivePath.matchAll(/\//g)].map((match) => match.index ?? -1);
  for (const separator of separators.reverse()) {
    const prefix = archivePath.slice(0, separator);
    const name = archivePath.slice(separator + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) {
      return { name, prefix };
    }
  }
  throw new Error(`path cannot be represented in ustar: ${archivePath}`);
}

/**
 * @param {string} archivePath
 * @param {Buffer} contents
 * @param {boolean} directory
 */
function tarEntry(archivePath, contents, directory) {
  const header = Buffer.alloc(512);
  const { name, prefix } = splitTarPath(archivePath);
  writeText(header, 0, 100, name);
  writeOctal(header, 100, 8, directory ? 0o755 : 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, contents.length);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  writeText(header, 156, 1, directory ? "5" : "0");
  writeText(header, 257, 6, "ustar\0");
  writeText(header, 263, 2, "00");
  writeText(header, 265, 32, "root");
  writeText(header, 297, 32, "root");
  writeText(header, 345, 155, prefix);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  writeText(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  const padding = Buffer.alloc((512 - (contents.length % 512)) % 512);
  return Buffer.concat([header, contents, padding]);
}

/**
 * @param {string} sourceRoot
 * @param {string} archiveRoot
 */
async function createReproducibleArchive(sourceRoot, archiveRoot) {
  const files = await filesUnder(sourceRoot);
  const directories = new Set([archiveRoot]);
  for (const file of files) {
    let directory = path.posix.dirname(path.posix.join(archiveRoot, file));
    while (directory !== "." && !directories.has(directory)) {
      directories.add(directory);
      directory = path.posix.dirname(directory);
    }
  }
  const entries = [];
  for (const directory of [...directories].sort()) {
    entries.push(tarEntry(`${directory}/`, Buffer.alloc(0), true));
  }
  for (const file of files) {
    entries.push(
      tarEntry(
        path.posix.join(archiveRoot, file),
        await readFile(path.join(sourceRoot, file)),
        false,
      ),
    );
  }
  entries.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(entries), { level: 9 });
}

/** @param {string} dependencyPath */
function dependencyName(dependencyPath) {
  return dependencyPath.slice(dependencyPath.lastIndexOf("node_modules/") + 13);
}

function buildDependencyInventory() {
  const root = lock.packages[""];
  const directRuntimeNames = Object.keys(root.dependencies ?? {}).sort();
  const directDevelopmentNames = Object.keys(root.devDependencies ?? {}).sort();
  /** @param {string} name */
  const describe = (name) => {
    const dependency = lock.packages[`node_modules/${name}`];
    return {
      name,
      version: dependency.version,
      license: dependency.license ?? "unknown",
    };
  };
  return {
    inventoryVersion: "1.0.0",
    releaseVersion: packageMetadata.version,
    runtimeDependencies: directRuntimeNames.map(describe),
    directDevelopmentDependencies: directDevelopmentNames.map(describe),
    completeLockInventory: Object.entries(lock.packages)
      .filter(([dependencyPath]) => dependencyPath !== "")
      .map(([dependencyPath, dependency]) => ({
        name: dependencyName(dependencyPath),
        version: dependency.version,
        license: dependency.license ?? "unknown",
        development: dependency.dev === true,
        optional: dependency.optional === true,
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}

await rm(packagesDirectory, { recursive: true, force: true });
await rm(releaseDirectory, { recursive: true, force: true });
await mkdir(packagesDirectory, { recursive: true });
await mkdir(releaseDirectory, { recursive: true });

const archiveRecords = [];
for (const distribution of ["standalone", "plugin"]) {
  const archiveName = `solo-venture-scout-${distribution}-${packageMetadata.version}.tgz`;
  const contents = await createReproducibleArchive(
    path.join(outputRoot, distribution, "solo-venture-scout"),
    "solo-venture-scout",
  );
  await writeFile(path.join(packagesDirectory, archiveName), contents);
  archiveRecords.push({
    path: `packages/${archiveName}`,
    bytes: contents.length,
    sha256: sha256(contents),
  });
}

const companionSources = [
  [path.join(repositoryRoot, "skill", "solo-venture-scout", "LICENSE"), "LICENSE"],
  [path.join(repositoryRoot, "skill", "solo-venture-scout", "NOTICE"), "NOTICE"],
  [path.join(repositoryRoot, "release", "compatibility-matrix.json"), "compatibility-matrix.json"],
];
for (const [source, destination] of companionSources) {
  await cp(source, path.join(releaseDirectory, destination));
}
await writeFile(
  path.join(releaseDirectory, "dependency-inventory.json"),
  `${JSON.stringify(buildDependencyInventory(), null, 2)}\n`,
);

const companionRecords = [];
for (const file of [
  "LICENSE",
  "NOTICE",
  "compatibility-matrix.json",
  "dependency-inventory.json",
]) {
  const filePath = path.join(releaseDirectory, file);
  const contents = await readFile(filePath);
  companionRecords.push({
    path: `release/${file}`,
    bytes: (await stat(filePath)).size,
    sha256: sha256(contents),
  });
}

const checksummedFiles = [...archiveRecords, ...companionRecords].sort((left, right) =>
  left.path.localeCompare(right.path),
);
await writeFile(
  path.join(releaseDirectory, "CHECKSUMS.sha256"),
  `${checksummedFiles.map((file) => `${file.sha256}  ${file.path}`).join("\n")}\n`,
);
await writeFile(
  path.join(releaseDirectory, "release-manifest.json"),
  `${JSON.stringify(
    {
      manifestVersion: "1.0.0",
      releaseVersion: packageMetadata.version,
      reproducibleArchiveFormat: "ustar+gzip with normalized metadata",
      files: checksummedFiles,
    },
    null,
    2,
  )}\n`,
);
