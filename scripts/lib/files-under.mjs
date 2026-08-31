import { readdir } from "node:fs/promises";
import path from "node:path";

/** @param {string} root */
export async function filesUnder(root) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)))
    .sort();
}
