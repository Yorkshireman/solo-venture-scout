import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { buildPackagedScout, runProcess } from "./support/packaged-scout.mjs";

test("packaged preflight reports a ready environment without creating Campaign state", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-ready-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));

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
  const result = await runProcess(process.execPath, [kernelPath], {
    input: `${JSON.stringify(command)}\n`,
  });

  assert.equal(result.code, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.envelopeVersion, "0.1.0");
  assert.equal(response.requestId, command.requestId);
  assert.equal(response.ok, true);
  assert.equal(response.result.ready, true);
  assert.deepEqual(response.result.versions, {
    release: "1.0.0",
    campaignFormat: "0.2.0",
    records: "0.2.0",
    commandEnvelope: "0.1.0",
    researchPackages: "0.1.0",
    renderTemplates: "0.1.0",
  });
  assert.equal(response.result.capabilities.nodeRuntime.major, 24);
  assert.deepEqual(response.result.capabilities.publicRetrieval.routes, [
    "public-web-search",
  ]);
  assert.deepEqual(await readdir(storagePath), []);
});

test("packaged preflight stops with an actionable retrieval diagnostic before Campaign state exists", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-no-route-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));

  const command = {
    envelopeVersion: "0.1.0",
    requestId: "preflight-no-route-1",
    command: "preflight",
    payload: { storagePath, retrievalRoutes: [] },
  };
  const result = await runProcess(process.execPath, [kernelPath], {
    input: `${JSON.stringify(command)}\n`,
  });

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
  const { outputRoot, kernelPath } = await buildPackagedScout(
    "solo-venture-scout-storage-fail-",
  );
  const storagePath = path.join(outputRoot, "not-a-directory");
  await writeFile(storagePath, "developer data\n");

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
  const result = await runProcess(process.execPath, [kernelPath], {
    input: `${JSON.stringify(command)}\n`,
  });

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
  const { outputRoot, kernelPath } = await buildPackagedScout(
    "solo-venture-scout-node-fail-",
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
  const result = await runProcess(process.execPath, [harnessPath], { input: "" });

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
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-envelope-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));

  const result = await runProcess(process.execPath, [kernelPath], {
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
  });

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

test("packaged kernel rejects non-boolean public-retrieval claims", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-route-shape-");
  const storagePath = await mkdtemp(path.join(tmpdir(), "solo-venture-scout-storage-"));

  const result = await runProcess(process.execPath, [kernelPath], {
    input: `${JSON.stringify({
      envelopeVersion: "0.1.0",
      requestId: "invalid-route-1",
      command: "preflight",
      payload: {
        storagePath,
        retrievalRoutes: [
          { id: "web", available: "false", public: true, lawful: true },
        ],
      },
    })}\n`,
  });

  assert.equal(result.code, 3);
  assert.deepEqual(JSON.parse(result.stdout), {
    envelopeVersion: "0.1.0",
    requestId: "invalid-route-1",
    command: "preflight",
    ok: false,
    error: {
      code: "SVS-COMMAND-INVALID",
      message: "Preflight command is invalid.",
      action: "Correct the reported fields and retry without creating Campaign state.",
      details: ["payload.retrievalRoutes[0].available must be a boolean."],
    },
  });
  assert.deepEqual(await readdir(storagePath), []);
});

test("kernel rejects unsupported commands before performing effects", async () => {
  const { outputRoot, kernelPath } = await buildPackagedScout(
    "solo-venture-scout-command-",
  );
  const harnessPath = path.join(outputRoot, "unsupported-command.mjs");
  await writeFile(
    harnessPath,
    `import { executeCommand } from ${JSON.stringify(pathToFileURL(kernelPath).href)};\n` +
      `let storageProbed = false;\n` +
      `const response = await executeCommand({\n` +
      `  envelopeVersion: "0.1.0", requestId: "unsupported-command-1", command: "deleteCampaign",\n` +
      `  payload: { storagePath: "/unused", retrievalRoutes: [] }\n` +
      `}, { nodeVersion: "24.0.0", probeWritableStorage: async () => { storageProbed = true; return true; } });\n` +
      `process.stdout.write(JSON.stringify({ response, storageProbed }));\n`,
  );
  const result = await runProcess(process.execPath, [harnessPath], { input: "" });

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    response: {
      envelopeVersion: "0.1.0",
      requestId: "unsupported-command-1",
      command: "deleteCampaign",
      ok: false,
      error: {
        code: "SVS-COMMAND-UNSUPPORTED",
        message: "Kernel command deleteCampaign is not supported.",
        action: "Use a supported command with envelope 0.1.0.",
      },
    },
    storageProbed: false,
  });
});

test("packaged kernel returns a structured error for a non-object envelope", async () => {
  const { kernelPath } = await buildPackagedScout("solo-venture-scout-null-command-");

  const result = await runProcess(process.execPath, [kernelPath], { input: "null\n" });

  assert.equal(result.code, 3);
  assert.deepEqual(JSON.parse(result.stdout), {
    envelopeVersion: "0.1.0",
    requestId: "unknown",
    command: "unknown",
    ok: false,
    error: {
      code: "SVS-COMMAND-INVALID",
      message: "Kernel command envelope must be a JSON object.",
      action: "Send one JSON object using command envelope 0.1.0 and retry.",
      details: ["command must be a JSON object."],
    },
  });
});
