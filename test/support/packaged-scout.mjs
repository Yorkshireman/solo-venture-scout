import { execFile, spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

export const execFileAsync = promisify(execFile);
export const repositoryRoot = path.resolve(import.meta.dirname, "../..");

/** @param {string} prefix */
export async function buildPackagedScout(prefix) {
  const outputRoot = await mkdtemp(path.join(tmpdir(), prefix));
  await execFileAsync(process.execPath, ["scripts/build.mjs"], {
    cwd: repositoryRoot,
    env: { ...process.env, SVS_DIST_DIR: outputRoot },
  });
  return {
    outputRoot,
    kernelPath: path.join(
      outputRoot,
      "standalone",
      "solo-venture-scout",
      "scripts",
      "scout-kernel.mjs",
    ),
  };
}

/** @typedef {import("node:child_process").SpawnOptions & { input?: string }} RunOptions */

/**
 * @param {string} command
 * @param {readonly string[]} args
 * @param {RunOptions} [options]
 */
export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr?.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    if (options.input !== undefined) {
      child.stdin?.end(options.input);
    }
  });
}
