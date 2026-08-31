import { mkdtemp, rm } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import contracts from "../release/contracts.json" with { type: "json" };

const supportedNodeMajor = 24;

type RetrievalRoute = {
  id: string;
  available: boolean;
  public: boolean;
  lawful: boolean;
};

type PreflightCommand = {
  envelopeVersion: string;
  requestId: string;
  command: "preflight";
  payload: {
    storagePath: string;
    retrievalRoutes: RetrievalRoute[];
  };
};

export type KernelEffects = {
  nodeVersion: string;
  probeWritableStorage: (storagePath: string) => Promise<boolean>;
};

async function probeWritableStorage(storagePath: string): Promise<void> {
  const probePath = await mkdtemp(path.join(storagePath, ".svs-preflight-"));
  await rm(probePath, { recursive: true, force: true });
}

const realEffects: KernelEffects = {
  nodeVersion: process.versions.node,
  async probeWritableStorage(storagePath) {
    await probeWritableStorage(storagePath);
    return true;
  },
};

export async function executeCommand(
  command: PreflightCommand,
  effects: KernelEffects = realEffects,
) {
  if (command.envelopeVersion !== contracts.commandEnvelope) {
    return {
      envelopeVersion: contracts.commandEnvelope,
      requestId: command.requestId,
      command: command.command,
      ok: false as const,
      error: {
        code: "SVS-COMMAND-ENVELOPE-UNSUPPORTED",
        message: `Command envelope ${command.envelopeVersion} is not supported.`,
        action: `Use command envelope ${contracts.commandEnvelope} and retry.`,
      },
    };
  }

  const nodeMajor = Number.parseInt(effects.nodeVersion.split(".")[0] ?? "", 10);
  let storageWritable = true;
  try {
    storageWritable = await effects.probeWritableStorage(command.payload.storagePath);
  } catch {
    storageWritable = false;
  }
  const routes = command.payload.retrievalRoutes
    .filter((route) => route.available && route.public && route.lawful)
    .map((route) => route.id);
  const diagnostics = [];
  if (nodeMajor !== supportedNodeMajor) {
    diagnostics.push({
      code: "SVS-PREFLIGHT-NODE-UNSUPPORTED",
      message: `Node.js ${supportedNodeMajor}.x is required; found ${effects.nodeVersion}.`,
      action: `Install Node.js ${supportedNodeMajor} and rerun $solo-venture-scout.`,
    });
  }
  if (!storageWritable) {
    diagnostics.push({
      code: "SVS-PREFLIGHT-STORAGE-NOT-WRITABLE",
      message: `Campaign storage is not writable: ${command.payload.storagePath}`,
      action:
        "Choose an existing writable directory and rerun $solo-venture-scout; no Campaign state was created.",
    });
  }
  if (routes.length === 0) {
    diagnostics.push({
      code: "SVS-PREFLIGHT-NO-LAWFUL-PUBLIC-RETRIEVAL",
      message: "No available lawful public-retrieval route was declared.",
      action:
        "Enable at least one public retrieval tool that respects access controls, site rules, and applicable law, then rerun $solo-venture-scout.",
    });
  }

  return {
    envelopeVersion: contracts.commandEnvelope,
    requestId: command.requestId,
    command: command.command,
    ok: true as const,
    result: {
      ready: diagnostics.length === 0,
      diagnostics,
      versions: contracts,
      capabilities: {
        nodeRuntime: {
          supportedMajor: supportedNodeMajor,
          detected: effects.nodeVersion,
          major: nodeMajor,
        },
        storage: {
          path: path.resolve(command.payload.storagePath),
          writable: storageWritable,
        },
        publicRetrieval: {
          available: routes.length > 0,
          routes,
        },
      },
    },
  };
}

async function runCli() {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const command = JSON.parse(input) as PreflightCommand;
  const response = await executeCommand(command);
  process.stdout.write(`${JSON.stringify(response)}\n`);
  if (!response.ok) {
    process.exitCode = 3;
  } else if (!response.result.ready) {
    process.exitCode = 2;
  }
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  await runCli();
}
