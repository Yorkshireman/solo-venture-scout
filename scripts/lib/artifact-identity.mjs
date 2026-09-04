import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { filesUnder } from "./files-under.mjs";

/** @param {Buffer | string} contents */
export function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

/** @param {string} root */
export async function treeSha256(root) {
  const digest = createHash("sha256");
  for (const file of await filesUnder(root)) {
    const contents = await readFile(path.join(root, file));
    digest.update(`${Buffer.byteLength(file)}:${file}:${contents.length}:`);
    digest.update(contents);
  }
  return digest.digest("hex");
}
