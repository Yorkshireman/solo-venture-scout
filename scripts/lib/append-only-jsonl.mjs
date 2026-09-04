import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * @param {string} filePath
 * @param {{ missingAsEmpty?: boolean, label?: string }} [options]
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function readJsonLines(
  filePath,
  { missingAsEmpty = false, label = "JSONL ledger" } = {},
) {
  let contents;
  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    if (
      missingAsEmpty &&
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return [];
    }
    throw error;
  }
  return contents
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`invalid ${label} JSON at line ${index + 1}`, {
          cause: error,
        });
      }
    });
}

/** @param {string} filePath @param {{ label?: string }} [options] */
export function appendOnlyJsonl(filePath, { label = "JSONL ledger" } = {}) {
  let appendQueue = Promise.resolve();
  return {
    read: () => readJsonLines(filePath, { missingAsEmpty: true, label }),
    /** @param {Record<string, any>} record */
    append(record) {
      const pending = appendQueue.then(async () => {
        await mkdir(path.dirname(filePath), { recursive: true });
        await appendFile(filePath, `${JSON.stringify(record)}\n`, { flag: "a" });
      });
      appendQueue = pending.catch(() => undefined);
      return pending;
    },
  };
}
