import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const outputRoot = path.resolve(
  process.env.SVS_DIST_DIR ?? path.join(repositoryRoot, "dist"),
);
const skillSource = path.join(repositoryRoot, "skill");
const standaloneSkill = path.join(
  outputRoot,
  "standalone",
  "solo-venture-scout",
);
const pluginSkill = path.join(
  outputRoot,
  "plugin",
  "solo-venture-scout",
  "skills",
  "solo-venture-scout",
);

await rm(path.join(outputRoot, "standalone"), { recursive: true, force: true });
await rm(path.join(outputRoot, "plugin"), { recursive: true, force: true });
await mkdir(path.dirname(standaloneSkill), { recursive: true });
await mkdir(path.dirname(pluginSkill), { recursive: true });
await cp(skillSource, standaloneSkill, { recursive: true });
await cp(skillSource, pluginSkill, { recursive: true });

const standaloneScripts = path.join(standaloneSkill, "scripts");
const pluginScripts = path.join(pluginSkill, "scripts");
await mkdir(standaloneScripts, { recursive: true });
await mkdir(pluginScripts, { recursive: true });
await build({
  entryPoints: [path.join(repositoryRoot, "src", "kernel.ts")],
  outfile: path.join(standaloneScripts, "scout-kernel.mjs"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  banner: { js: "#!/usr/bin/env node" },
});
await cp(
  path.join(standaloneScripts, "scout-kernel.mjs"),
  path.join(pluginScripts, "scout-kernel.mjs"),
);

const contracts = await readFile(
  path.join(repositoryRoot, "release", "contracts.json"),
);
await writeFile(path.join(standaloneSkill, "references", "versions.json"), contracts);
await writeFile(path.join(pluginSkill, "references", "versions.json"), contracts);

const packageMetadata = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
);
const pluginRoot = path.join(outputRoot, "plugin", "solo-venture-scout");
const manifestDirectory = path.join(pluginRoot, ".codex-plugin");
await mkdir(manifestDirectory, { recursive: true });
await cp(path.join(standaloneSkill, "LICENSE"), path.join(pluginRoot, "LICENSE"));
await writeFile(
  path.join(manifestDirectory, "plugin.json"),
  `${JSON.stringify(
    {
      name: "solo-venture-scout",
      version: packageMetadata.version,
      description:
        "Discover and evaluate evidence-backed software opportunities for a solo developer.",
      author: {
        name: "Yorkshireman",
        url: "https://github.com/Yorkshireman",
      },
      repository: "https://github.com/Yorkshireman/solo-venture-scout",
      license: "MIT",
      keywords: ["research", "opportunity-discovery", "solo-developer"],
      skills: "./skills/",
      interface: {
        displayName: "Solo Venture Scout",
        shortDescription: "Find evidence-backed solo software opportunities",
        longDescription:
          "Run a bounded, resumable Scouting Campaign that preserves evidence and honest uncertainty.",
        developerName: "Yorkshireman",
        category: "Productivity",
        capabilities: ["Interactive", "Write"],
        websiteURL: "https://github.com/Yorkshireman/solo-venture-scout",
        defaultPrompt: ["Start a Solo Venture Scout campaign."],
      },
    },
    null,
    2,
  )}\n`,
);
