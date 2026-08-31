# Environment preflight

Resolve `scripts/scout-kernel.mjs` relative to this skill's `SKILL.md`. Send exactly
one JSON command on standard input:

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "a-stable-id-for-this-attempt",
  "command": "preflight",
  "payload": {
    "storagePath": "/developer-chosen/existing/directory",
    "retrievalRoutes": [
      {
        "id": "the-host-tool-name",
        "available": true,
        "public": true,
        "lawful": true
      }
    ]
  }
}
```

Invoke the command with the supported Node runtime:

```text
node /absolute/path/to/solo-venture-scout/scripts/scout-kernel.mjs
```

Write the JSON object followed by a newline, then close standard input. Read the one
JSON response from standard output.

Declare only retrieval routes the current host actually provides. A route is lawful
only when it accesses public material without bypassing access controls, site rules,
or applicable law.

- Exit `0`: the response is valid; continue only when `result.ready` is `true`.
- Exit `2`: the environment is not ready. Report every diagnostic and stop.
- Exit `3`: the command envelope is unsupported. Report the contract error and stop.

The probe may create and remove a temporary `.svs-preflight-*` directory. It does not
create Campaign state.
