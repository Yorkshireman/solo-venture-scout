import path from "node:path";

export const repositoryRoot = path.resolve(import.meta.dirname, "../..");
export const outputRoot = path.resolve(
  process.env.SVS_DIST_DIR ?? path.join(repositoryRoot, "dist"),
);
