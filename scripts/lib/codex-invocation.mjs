import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Runs one isolated structured Codex session and returns its exact identity,
 * transcript, timing, and schema-validated output.
 *
 * @param {{
 *   prompt: string;
 *   schema: string;
 *   model: string;
 *   reasoningEffort: string;
 *   workingDirectory: string;
 *   readableSkillRoot?: string;
 *   executionPolicy?: "approval-managed" | "read-only";
 *   responsePrefix?: string;
 *   workingDirectoryPlaceholder?: string;
 *   executable?: string;
 * }} input
 */
export async function invokeCodex({
  prompt,
  schema,
  model,
  reasoningEffort,
  workingDirectory,
  readableSkillRoot,
  executionPolicy = "approval-managed",
  responsePrefix = "solo-venture-scout-codex-response-",
  workingDirectoryPlaceholder = "$WORKING_DIRECTORY",
  executable = process.env.SVS_CODEX_EXECUTABLE ?? "codex",
}) {
  if (!["approval-managed", "read-only"].includes(executionPolicy)) {
    throw new Error(`unsupported Codex execution policy: ${executionPolicy}`);
  }
  const executionPolicyArguments =
    executionPolicy === "read-only"
      ? ["--sandbox", "read-only"]
      : ["--approve-for-me"];
  const responseDirectory = await mkdtemp(path.join(tmpdir(), responsePrefix));
  const responsePath = path.join(responseDirectory, "response.json");
  const arguments_ = [
    "exec",
    "--ephemeral",
    "--ignore-user-config",
    "--skip-git-repo-check",
    ...executionPolicyArguments,
    "--model",
    model,
    "--config",
    `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`,
    "--cd",
    workingDirectory,
    ...(readableSkillRoot ? ["--add-dir", readableSkillRoot] : []),
    "--output-schema",
    schema,
    "--output-last-message",
    responsePath,
    "--json",
    "-",
  ];
  const startedAt = new Date().toISOString();
  const execution = await new Promise((resolve, reject) => {
    const child = spawn(executable, arguments_, {
      cwd: workingDirectory,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(prompt);
  });
  const completedAt = new Date().toISOString();
  if (execution.code !== 0) {
    await rm(responseDirectory, { recursive: true, force: true });
    const diagnostic = (/** @type {string} */ value) =>
      value.length <= 16_000
        ? value
        : `${value.slice(0, 8_000)}\n…\n${value.slice(-8_000)}`;
    throw new Error(
      `Codex acceptance invocation failed (exit ${execution.code}).\nstdout:\n${diagnostic(execution.stdout)}\nstderr:\n${diagnostic(execution.stderr)}`,
    );
  }
  /** @type {Array<Record<string, any>>} */
  const events = String(execution.stdout)
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
  const sessionId =
    events.find((event) => event.type === "thread.started")?.thread_id ??
    events.find((event) => typeof event.thread_id === "string")?.thread_id;
  if (typeof sessionId !== "string") {
    throw new Error("Codex acceptance invocation did not report a session identity");
  }
  const output = JSON.parse(await readFile(responsePath, "utf8"));
  await rm(responseDirectory, { recursive: true, force: true });
  return {
    sessionId,
    startedAt,
    completedAt,
    output,
    transcript: {
      arguments: arguments_.slice(0, -1).map((argument) =>
        argument === responsePath
          ? "$RESPONSE_PATH"
          : argument === workingDirectory
            ? workingDirectoryPlaceholder
            : argument === readableSkillRoot
              ? "$SKILL_ROOT"
              : argument,
      ),
      events,
      final: output,
    },
  };
}
