import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

/** @typedef {import("node:child_process").SpawnOptions & { input?: string }} RunOptions */

/**
 * @param {string} command
 * @param {readonly string[]} args
 * @param {RunOptions} [options]
 */
function run(command, args, options = {}) {
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

test("packaged preflight reports a ready environment without creating Campaign state", async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-ready-"));
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const build = await run(process.execPath, ["scripts/build.mjs"], {
    cwd: repositoryRoot,
    env: { ...process.env, SVS_DIST_DIR: outputRoot },
  });
  assert.equal(build.code, 0, build.stderr);

  const command = {
    envelopeVersion: "0.1.0",
    requestId: "preflight-ready-1",
    command: "preflight",
    payload: {
      storagePath,
      retrievalRoutes: [
        {
          id: "public-web-search",
          available: true,
          public: true,
          lawful: true,
        },
      ],
    },
  };
  const result = await run(
    process.execPath,
    [
      path.join(
        outputRoot,
        "standalone",
        "solo-venture-scout",
        "scripts",
        "scout-kernel.mjs",
      ),
    ],
    { input: `${JSON.stringify(command)}\n` },
  );

  assert.equal(result.code, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.envelopeVersion, "0.1.0");
  assert.equal(response.requestId, command.requestId);
  assert.equal(response.ok, true);
  assert.equal(response.result.ready, true);
  assert.equal(response.result.capabilities.nodeRuntime.major, 24);
  assert.deepEqual(response.result.capabilities.publicRetrieval.routes, [
    "public-web-search",
  ]);
  assert.deepEqual(await readdir(storagePath), []);
});

test("packaged preflight stops with an actionable retrieval diagnostic before Campaign state exists", async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-no-route-"));
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const build = await run(process.execPath, ["scripts/build.mjs"], {
    cwd: repositoryRoot,
    env: { ...process.env, SVS_DIST_DIR: outputRoot },
  });
  assert.equal(build.code, 0, build.stderr);

  const command = {
    envelopeVersion: "0.1.0",
    requestId: "preflight-no-route-1",
    command: "preflight",
    payload: { storagePath, retrievalRoutes: [] },
  };
  const result = await run(
    process.execPath,
    [
      path.join(
        outputRoot,
        "standalone",
        "solo-venture-scout",
        "scripts",
        "scout-kernel.mjs",
      ),
    ],
    { input: `${JSON.stringify(command)}\n` },
  );

  assert.equal(result.code, 2);
  const response = JSON.parse(result.stdout);
  assert.equal(response.ok, true);
  assert.equal(response.result.ready, false);
  assert.deepEqual(response.result.diagnostics, [
    {
      code: "SVS-PREFLIGHT-NO-LAWFUL-PUBLIC-RETRIEVAL",
      message: "No available lawful public-retrieval route was declared.",
      action:
        "Enable at least one public retrieval tool that respects access controls, site rules, and applicable law, then rerun $solo-venture-scout.",
    },
  ]);
  assert.deepEqual(await readdir(storagePath), []);
});

test("packaged preflight identifies storage that cannot hold Campaign state", async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-fail-"));
  const storagePath = path.join(outputRoot, "not-a-directory");
  await writeFile(storagePath, "developer data\n");
  const build = await run(process.execPath, ["scripts/build.mjs"], {
    cwd: repositoryRoot,
    env: { ...process.env, SVS_DIST_DIR: path.join(outputRoot, "dist") },
  });
  assert.equal(build.code, 0, build.stderr);

  const command = {
    envelopeVersion: "0.1.0",
    requestId: "preflight-storage-fail-1",
    command: "preflight",
    payload: {
      storagePath,
      retrievalRoutes: [
        { id: "public-web-search", available: true, public: true, lawful: true },
      ],
    },
  };
  const result = await run(
    process.execPath,
    [
      path.join(
        outputRoot,
        "dist",
        "standalone",
        "solo-venture-scout",
        "scripts",
        "scout-kernel.mjs",
      ),
    ],
    { input: `${JSON.stringify(command)}\n` },
  );

  assert.equal(result.code, 2);
  const response = JSON.parse(result.stdout);
  assert.equal(response.result.ready, false);
  assert.deepEqual(response.result.diagnostics, [
    {
      code: "SVS-PREFLIGHT-STORAGE-NOT-WRITABLE",
      message: `Campaign storage is not writable: ${storagePath}`,
      action:
        "Choose an existing writable directory and rerun $solo-venture-scout; no Campaign state was created.",
    },
  ]);
  assert.equal(await readFile(storagePath, "utf8"), "developer data\n");
});

test("kernel command envelope deterministically diagnoses an unsupported Node runtime", async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-node-fail-"));
  const build = await run(process.execPath, ["scripts/build.mjs"], {
    cwd: repositoryRoot,
    env: { ...process.env, SVS_DIST_DIR: path.join(outputRoot, "dist") },
  });
  assert.equal(build.code, 0, build.stderr);

  const kernelPath = path.join(
    outputRoot,
    "dist",
    "standalone",
    "solo-venture-scout",
    "scripts",
    "scout-kernel.mjs",
  );
  const harnessPath = path.join(outputRoot, "unsupported-node.mjs");
  await writeFile(
    harnessPath,
    `import { executeCommand } from ${JSON.stringify(pathToFileURL(kernelPath).href)};\n` +
      `const response = await executeCommand({\n` +
      `  envelopeVersion: "0.1.0",\n` +
      `  requestId: "preflight-node-fail-1",\n` +
      `  command: "preflight",\n` +
      `  payload: { storagePath: "/unused", retrievalRoutes: [{ id: "web", available: true, public: true, lawful: true }] }\n` +
      `}, { nodeVersion: "22.18.0", probeWritableStorage: async () => true });\n` +
      `process.stdout.write(JSON.stringify(response));\n`,
  );
  const result = await run(process.execPath, [harnessPath], { input: "" });

  assert.equal(result.code, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.result.ready, false);
  assert.deepEqual(response.result.diagnostics, [
    {
      code: "SVS-PREFLIGHT-NODE-UNSUPPORTED",
      message: "Node.js 24.x is required; found 22.18.0.",
      action: "Install Node.js 24 and rerun $solo-venture-scout.",
    },
  ]);
});

test("packaged kernel fails closed on an unsupported command-envelope version", async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-envelope-"));
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));
  const build = await run(process.execPath, ["scripts/build.mjs"], {
    cwd: repositoryRoot,
    env: { ...process.env, SVS_DIST_DIR: outputRoot },
  });
  assert.equal(build.code, 0, build.stderr);

  const result = await run(
    process.execPath,
    [
      path.join(
        outputRoot,
        "standalone",
        "solo-venture-scout",
        "scripts",
        "scout-kernel.mjs",
      ),
    ],
    {
      input: `${JSON.stringify({
        envelopeVersion: "9.0.0",
        requestId: "unsupported-envelope-1",
        command: "preflight",
        payload: {
          storagePath,
          retrievalRoutes: [
            { id: "web", available: true, public: true, lawful: true },
          ],
        },
      })}\n`,
    },
  );

  assert.equal(result.code, 3);
  assert.deepEqual(JSON.parse(result.stdout), {
    envelopeVersion: "0.1.0",
    requestId: "unsupported-envelope-1",
    command: "preflight",
    ok: false,
    error: {
      code: "SVS-COMMAND-ENVELOPE-UNSUPPORTED",
      message: "Command envelope 9.0.0 is not supported.",
      action: "Use command envelope 0.1.0 and retry.",
    },
  });
  assert.deepEqual(await readdir(storagePath), []);
});
