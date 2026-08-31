---
name: solo-venture-scout
description: Start or resume a bounded, evidence-led Scouting Campaign for a solo developer when explicitly invoked.
---

# Solo Venture Scout

Run this workflow only when the developer explicitly invokes `$solo-venture-scout`.
Never interpret an ordinary discussion about markets, opportunities, or research as an
invocation.

## Preflight

Do not create Campaign state or begin Campaign Research until preflight succeeds.

1. Tell the developer the current working directory.
2. If they have not supplied a storage directory, ask them to choose an existing
   directory. Do not create or move storage silently.
3. Inventory the current host's public-retrieval tools. Declare a route only when it
   is currently available, retrieves public material, and can be used without
   bypassing access controls, site rules, or applicable law.
4. Run the packaged command exactly as described in
   [references/preflight.md](references/preflight.md).
5. When the response has `ok: true` and `result.ready: true`, report the detected
   Node runtime, resolved storage directory, lawful public-retrieval route names, and
   contract versions. State that no Campaign state has been created.
6. Otherwise, report every returned diagnostic with its action and stop. Do not
   substitute another storage path, invent a retrieval route, or create Campaign
   state to see whether it works.

This packaged release establishes the readiness boundary only. After a successful
preflight, stop without starting intake or research; later releases add those Campaign
commands behind the same versioned kernel envelope.
