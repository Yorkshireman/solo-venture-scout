import { execFile } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { outputRoot, repositoryRoot } from "./lib/release-paths.mjs";

const execFileAsync = promisify(execFile);
const packageMetadata = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
);
const packagesDirectory = path.join(outputRoot, "packages");

await mkdir(packagesDirectory, { recursive: true });

for (const distribution of ["standalone", "plugin"]) {
  const archive = path.join(
    packagesDirectory,
    `solo-venture-scout-${distribution}-${packageMetadata.version}.tgz`,
  );
  await rm(archive, { force: true });
  await execFileAsync(
    "tar",
    [
      "-czf",
      archive,
      "-C",
      path.join(outputRoot, distribution),
      "solo-venture-scout",
    ],
    { env: { ...process.env, COPYFILE_DISABLE: "1" } },
  );
}
