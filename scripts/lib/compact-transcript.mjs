import { sha256 } from "./artifact-identity.mjs";

const maximumInlineTextBytes = 64 * 1024;
const maximumEvents = 512;

/** @param {string} value */
function compactText(value) {
  if (Buffer.byteLength(value) <= maximumInlineTextBytes) return value;
  return {
    omitted: true,
    bytes: Buffer.byteLength(value),
    sha256: sha256(value),
    prefix: value.slice(0, 2_000),
    suffix: value.slice(-2_000),
  };
}

/**
 * Preserve decision-relevant transcript events while bounding redundant command
 * output and pathological retry loops. Omitted material retains its byte identity.
 *
 * @param {Record<string, any>} transcript
 */
export function compactTranscript(transcript) {
  const compactedEvents = (transcript.events ?? [])
    .filter(
      (/** @type {Record<string, any>} */ event) =>
        event.type !== "item.started" && event.type !== "turn.started",
    )
    .map((/** @type {Record<string, any>} */ event) => {
      if (event.item?.type === "command_execution") {
        const aggregatedOutput = String(event.item.aggregated_output ?? "");
        const command = String(event.item.command ?? "");
        return {
          ...event,
          item: {
            ...event.item,
            command: compactText(command),
            aggregated_output: undefined,
            aggregatedOutputBytes: Buffer.byteLength(aggregatedOutput),
            aggregatedOutputSha256: sha256(aggregatedOutput),
          },
        };
      }
      if (event.item?.type === "agent_message" && typeof event.item.text === "string") {
        return {
          ...event,
          item: { ...event.item, text: compactText(event.item.text) },
        };
      }
      return event;
    });
  const events =
    compactedEvents.length <= maximumEvents
      ? compactedEvents
      : [
          ...compactedEvents.slice(0, maximumEvents / 2),
          {
            type: "events.omitted",
            count: compactedEvents.length - maximumEvents,
            sha256: sha256(
              JSON.stringify(
                compactedEvents.slice(
                  maximumEvents / 2,
                  compactedEvents.length - maximumEvents / 2,
                ),
              ),
            ),
          },
          ...compactedEvents.slice(-maximumEvents / 2),
        ];
  return {
    ...transcript,
    arguments: transcript.arguments,
    events,
    precondition: transcript.precondition,
    final: transcript.final,
  };
}
