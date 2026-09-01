# Scouting Campaign lifecycle

Resolve `scripts/scout-kernel.mjs` relative to this skill's `SKILL.md`. Send one JSON
command on standard input and invoke the packaged kernel as described in
[preflight.md](preflight.md).

All paths must be absolute. All instants must be canonical ISO 8601 UTC values. Stable
identities are opaque non-empty strings. A lease expiry must be later than its
acquisition instant.

## Create

The Campaign path is the exact new directory selected by the developer. Its parent
must exist. The kernel will not overwrite or silently relocate an existing path.

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "create-campaign-stable-request-id",
  "command": "createCampaign",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "campaignId": "stable-campaign-id",
    "coordinatorId": "stable-coordinator-id",
    "createdAt": "2026-08-31T09:00:00.000Z",
    "leaseExpiresAt": "2026-08-31T09:30:00.000Z"
  }
}
```

Creation makes a private `0700` Campaign directory with private `0600` artifacts. It
records append-only operation intent and creation records, a manifest with independent
contract versions, a rebuildable Work View, an atomic checkpoint, and an exclusive
coordinator lease. A replay with the identical request identity and payload returns
the existing Campaign without adding records.

## Inspect

Inspect an exact Campaign path:

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "inspect-campaign-stable-request-id",
  "command": "inspectCampaign",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path"
  }
}
```

Alternatively replace `campaignPath` with `searchPath`. Manifest discovery examines
only the search directory itself and its direct, non-symlinked child directories. It
succeeds only when it finds exactly one direct Scouting Campaign. Inspection validates
the manifest, authoritative records, Work View, latest checkpoint, and lease without
changing Campaign state.

## Resume

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "resume-campaign-stable-request-id",
  "command": "resumeCampaign",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "coordinatorId": "stable-coordinator-id-for-this-session",
    "resumedAt": "2026-08-31T10:00:00.000Z",
    "leaseExpiresAt": "2026-08-31T10:30:00.000Z"
  }
}
```

The bounded `searchPath` locator may replace `campaignPath`. Resume validates the
Campaign, acquires an atomic coordinator lock, then appends an operation intent and
resume record, atomically replaces the Work View and lease, and writes the next
checkpoint. It uses the kernel clock—not the caller's `resumedAt`—to decide whether a
different coordinator's recorded lease is active. The response summarizes completed
work, current phase or pause, and next permitted actions. Replaying the identical
request does not append the work twice; if interruption occurred after the authoritative
records were appended, replay reconstructs the derived Work View, lease, and checkpoint.
The short-lived operation-lock registry uses one atomically published owner file per
contender. A resume proceeds only when no other unexpired owner is visible; release
removes only that contender's unique token file, and expired files are safely ignored
and removed. Process termination therefore does not leave the Campaign permanently
locked, and stale-lock cleanup cannot remove a newer coordinator's lock.

- Exit `0`: the lifecycle command succeeded, including an idempotent replay.
- Exit `3`: the command, path, Campaign state, or lease is invalid. Report the
  structured error and stop.
