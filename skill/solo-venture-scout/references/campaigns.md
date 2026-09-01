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

## Confirm Campaign Intake

The coordinator sends the complete review that the developer explicitly confirmed.
Profile values use `known` with a non-empty value, `unknown`, `none`, or
`not-applicable` with a rationale. Do not omit a profile area or encode one of these
states as an empty string.

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "confirm-intake-stable-request-id",
  "command": "confirmCampaignIntake",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "coordinatorId": "stable-coordinator-id",
    "confirmedAt": "2026-08-31T09:15:00.000Z",
    "intake": {
      "version": 1,
      "explicitlyConfirmed": true,
      "developerProfileSnapshot": {
        "capturedAt": "2026-08-31T09:10:00.000Z",
        "capacity": { "state": "known", "value": "15 hours per week" },
        "capabilities": { "state": "known", "value": "TypeScript and operations software" },
        "access": { "state": "none" },
        "boundaries": { "state": "known", "value": "No regulated medical decisions" },
        "operatingPreferences": { "state": "unknown" },
        "riskTolerance": { "state": "known", "value": "Low irreversible downside" }
      },
      "commercialOutcomeTarget": {
        "amount": 10000,
        "currency": "GBP",
        "metric": "monthly recurring revenue",
        "deadline": "2027-08-31"
      },
      "statements": [
        {
          "id": "constraint-no-employees",
          "text": "Must not require employees",
          "classification": "hard-constraint"
        },
        {
          "id": "preference-low-support",
          "text": "Prefer a low support burden",
          "classification": "preference",
          "importance": "major"
        },
        {
          "id": "advantage-operations",
          "text": "Has operations domain access",
          "classification": "advantage",
          "rationale": "Existing relationships shorten access paths"
        }
      ],
      "researchBudget": {
        "profile": "quick",
        "sourceCap": 30,
        "discoverySweepCap": 4,
        "sourceFamilyMinimum": 3,
        "deepenedOpportunityCap": 2,
        "minimumComparisonSet": 2,
        "adversarialSourceReserve": 6,
        "paidSpendCap": { "amount": 0, "currency": "GBP" }
      }
    }
  }
}
```

Named profiles must be sent with all expanded values so the developer can see and
confirm them. Quick expands to `30 / 4 / 3 / 2 / 2`, standard to
`100 / 8 / 5 / 4 / 3`, and deep to `250 / 14 / 7 / 6 / 4` for Source cap,
Discovery Sweep cap, Source Family minimum, Deepened Opportunity cap, and minimum
comparison set respectively. The adversarial Source reserve is twenty percent of the
Source cap: 6, 20, or 50. Custom requires every limit explicitly. Paid spend defaults
to zero only when that visible value is explicitly confirmed.

The kernel rejects omissions, inconsistent named-profile expansions, logical
conflicts, unsafe unknown boundaries or risk tolerance, and anything other than an
explicit first version confirmation. Success appends the complete immutable intake
to authoritative history, writes a private rebuildable `campaign-intake.json`, and
makes Public Research available in the Work View. A replay with the identical
request and payload adds no records; a changed payload with the same identity fails.

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
