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

1. Show the developer the current working directory.
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

## Campaign location

Before any Campaign write, show the developer the current working directory and
require an explicit absolute Campaign path. The final path is the self-contained
Campaign directory; its parent must already exist, but the final path must not be
silently created under a different name or moved later.

If the explicit Campaign path is inside a Git repository, give a privacy warning
before creation: Campaign data may contain private constraints and research, Git can
discover untracked files, and the developer is responsible for an appropriate ignore
rule. Never stage or commit Campaign data, never edit ignore rules without a separate
request, and never treat repository storage as consent to publish.

## Create a Scouting Campaign

After successful preflight and the location checks:

1. Create stable campaign, request, and coordinator identities. Record the current
   UTC instant and a short, explicit coordinator lease expiry.
2. Run `createCampaign` exactly as described in
   [references/campaigns.md](references/campaigns.md).
3. Report the resolved Campaign path, stable identity, contract versions, current
   phase, lease expiry, and next permitted actions from the response.
4. On an error, report its action and stop. Do not choose another path, overwrite an
   existing path, or relocate the Campaign.

This release stops at `confirm-campaign-intake`; do not begin Campaign Intake or
Campaign Research yet.

## Inspect a Scouting Campaign

Inspection is read-only. Use `inspectCampaign` from
[references/campaigns.md](references/campaigns.md) with either an explicit Campaign
path or an explicit search path. Manifest discovery is bounded and succeeds only
when exactly one direct Scouting Campaign is present. Report the validated Work View,
lease, phase or pause, and next permitted actions. Do not acquire a lease or repair
state during inspection.

## Resume a Scouting Campaign

Resume from developer-supplied filesystem state, never from conversation memory or
native agent state:

1. Use an explicit Campaign path or the bounded manifest-discovery form in
   [references/campaigns.md](references/campaigns.md).
2. Create a stable request identity and a coordinator identity for this session;
   record the current UTC instant and a short lease expiry.
3. Run `resumeCampaign`. Report completed work, current phase or pause, the exclusive
   lease, and next permitted actions exactly from the validated response.
4. If another coordinator holds the lease or validation fails, report the returned
   action and stop without continuing Campaign work.

Replaying the same create or resume request is safe. Reuse its request identity and
payload for a retry; do not invent a different Campaign path.
