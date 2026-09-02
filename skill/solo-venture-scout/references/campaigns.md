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

## Reserve Public Research capacity

Reserve exactly one ordinary Source unit before retrieving or substantively examining
one public Source. Retrieval itself happens outside the kernel.

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "reserve-public-source-stable-request-id",
  "command": "reservePublicResearch",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "coordinatorId": "stable-coordinator-id",
    "reservedAt": "2026-08-31T09:20:00.000Z",
    "reservation": {
      "id": "stable-research-reservation-id",
      "sourceUnits": 1,
      "purpose": "Measure one named problem signal",
      "retrievalRoute": "available-lawful-public-route"
    }
  }
}
```

The active coordinator lease and a confirmed Campaign Intake are required. Ordinary
reservations cannot exceed `sourceCap - adversarialSourceReserve`; outstanding and
settled reservations both consume that hard capacity. Success appends reservation
intent and outcome records, updates `research-budget.json`, and writes a checkpoint
before external retrieval begins.

## Record a Public Research Observation

After read-only retrieval outside the kernel, import inert provenance and one neutral
paraphrase, settling the matching reservation:

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "record-public-observation-stable-request-id",
  "command": "recordPublicResearchObservation",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "coordinatorId": "stable-coordinator-id",
    "recordedAt": "2026-08-31T09:25:00.000Z",
    "reservationId": "stable-research-reservation-id",
    "source": {
      "id": "stable-source-id",
      "retrievalMode": "public-web",
      "url": "https://public.example/research",
      "publisher": "Example Publisher",
      "originator": null,
      "publishedAt": "2026-06-10",
      "updatedAt": null,
      "accessedAt": "2026-08-31T09:24:00.000Z",
      "exactLocator": "Results, paragraph 3"
    },
    "observation": {
      "id": "stable-observation-id",
      "text": "Survey respondents reported spending staff time on the named workaround.",
      "sourceId": "stable-source-id",
      "exactLocator": "Results, paragraph 3"
    }
  }
}
```

Use `null` for an unknown publication or update date and for whichever of publisher
or originator is unknown; at least one of publisher or originator is required. The
URL must be public HTTP or HTTPS without embedded credentials or sensitive query or
fragment data. The Source and Observation locators must match so an authorised later
reader can find exactly what was examined. The Observation must be one atomic neutral
paraphrase linked to that Source, not an Inference or a copy of raw content. The
kernel also rejects obvious credential or payment assignments, imperative active
instructions, and raw markup in accepted text fields; this is defense-in-depth and
does not replace the coordinator's semantic data-minimisation review.

The strict command has no fields for credentials, payment information, personal data,
raw retrieved content, or active instructions. Do not add them. Success appends the
immutable Source and Observation to authoritative history, settles the reservation,
rebuilds private `research-budget.json` and `evidence-ledger.json` projections, and
writes a checkpoint. Replaying the identical request is idempotent; a reservation,
Source identity, or Observation identity cannot be settled or imported twice.

## Record Evidence Ledger reasoning

The coordinator makes semantic judgments outside the kernel, then submits typed,
linked entries. Entries in one request are applied in order, so a later entry may link
an earlier one from the same request.

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "record-reasoning-stable-request-id",
  "command": "recordEvidenceReasoning",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "coordinatorId": "stable-coordinator-id",
    "recordedAt": "2026-08-31T09:35:00.000Z",
    "entries": [
      {
        "type": "source-lineage",
        "id": "lineage-shared-dataset",
        "sourceIds": ["stable-source-id", "second-source-id"],
        "sharedOrigin": "Both publications analyse the same named survey dataset.",
        "relationship": "shared-dataset",
        "independence": "dependent"
      },
      {
        "type": "source-credibility",
        "id": "credibility-source-for-workaround-cost",
        "sourceId": "stable-source-id",
        "observationId": "stable-observation-id",
        "intendedUse": "Assess whether the named workaround consumes material staff time.",
        "assessment": "medium",
        "rationale": "The Source directly surveyed the affected operators.",
        "limitations": ["The sampling method is incompletely described."]
      },
      {
        "type": "source-freshness",
        "id": "freshness-source-for-workaround-cost",
        "sourceId": "stable-source-id",
        "observationId": "stable-observation-id",
        "intendedUse": "Assess whether the named workaround consumes material staff time.",
        "assessment": "high",
        "timeSensitivity": "Workflow adoption may change within a year.",
        "rationale": "The survey was published three months before assessment.",
        "limitations": ["No update date is available."]
      },
      {
        "type": "evidence-gap",
        "id": "gap-independent-cost-measure",
        "question": "Does independent evidence quantify the workaround cost?",
        "affectedDecisionIds": ["decision-form-opportunity"],
        "resolutionCriteria": "An independent methodologically described Source quantifies time or expenditure.",
        "resolutionMethod": "Examine an independent operational benchmark.",
        "status": "open",
        "resolution": null
      },
      {
        "type": "assumption",
        "id": "assumption-time-is-material",
        "text": "The reported staff time has a material financial consequence.",
        "scope": "Operators represented by the cited survey.",
        "evidenceGapId": "gap-independent-cost-measure"
      },
      {
        "type": "inference",
        "id": "inference-narrowed-workaround-cost",
        "text": "The workaround may create a Costly Problem for the represented operators.",
        "scope": "Operators represented by the cited survey.",
        "reasoning": "One Observation reports staff effort, while a second limits broader applicability.",
        "supportingEntryIds": ["stable-observation-id"],
        "challengingEntryIds": ["second-observation-id"],
        "confidence": {
          "level": "low",
          "limitingFactors": ["The Sources share one underlying dataset."]
        }
      },
      {
        "type": "contradiction",
        "id": "contradiction-workaround-time",
        "entryIds": ["stable-observation-id", "second-observation-id"],
        "disputedProposition": "The workaround consumes material staff time.",
        "disputedScope": "Manual and automated workflows may differ.",
        "attemptedReconciliation": "Narrow by workflow, but comparable subgroups are unavailable.",
        "resolutionStatus": "unresolved",
        "resolution": null
      },
      {
        "type": "correction",
        "id": "correction-narrow-prior-inference",
        "targetEntryId": "prior-inference-id",
        "action": "supersede",
        "replacementEntryId": "inference-narrowed-workaround-cost",
        "rationale": "The prior scope extended beyond the represented population."
      }
    ]
  }
}
```

An Inference must link at least one supporting Observation or prior Inference and must
include the explicit (possibly empty) set of material challenges. Evidence Confidence
uses only `unknown`, `low`, `medium`, or `high`, always with limiting factors, and is
not accepted on an Observation or Assumption. An Assumption has no support or
confidence fields and must link an existing or earlier Evidence Gap. Source
Credibility and Source Freshness each bind one Source to one of its Observations and
state the intended use;
shared-origin Source Lineage always records those Sources as dependent.

Contradictions retain both or all incompatible entries even after reconciliation.
Corrections append `supersede` with a different replacement identity or `retract` with
`null`; the target remains in authoritative history. Success checkpoints the append,
rebuilds `evidence-ledger.json`, and adds only current Inference, open Evidence Gap,
unresolved Contradiction, active Assumption, Source Lineage, Source Credibility, Source
Freshness, and Correction identities plus the stable Ledger path to the Work View. If
a Correction invalidates evidence used by an Inference, that Inference is removed from
current evidence and listed for reassessment; its dependent Inferences are handled
transitively.

Inspect only the entries named by a Work View without returning the entire Evidence
Ledger:

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "inspect-evidence-stable-request-id",
  "command": "inspectEvidence",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "entryIds": ["inference-narrowed-workaround-cost", "gap-independent-cost-measure"]
  }
}
```

The bounded `searchPath` locator may replace `campaignPath`. The command validates the
Campaign and returns the requested entries in request order without changing state or
returning unrelated Evidence Ledger content. An unknown identity fails the whole read.

## Request and resolve Research Approval

Before restricted or paid research, checkpoint the complete proposed scope:

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "request-research-approval-stable-request-id",
  "command": "requestResearchApproval",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "coordinatorId": "stable-coordinator-id",
    "requestedAt": "2026-08-31T10:00:00.000Z",
    "request": {
      "id": "stable-pending-decision-id",
      "access": "restricted-and-paid",
      "action": "Read one named report through the developer-controlled portal",
      "purpose": "Resolve one named Evidence Gap",
      "source": {
        "id": "stable-proposed-source-id",
        "description": "Named analyst report",
        "url": "https://research.example.com/report"
      },
      "accessMethod": "Use the developer's existing signed-in browser session read-only",
      "data": {
        "accessed": ["Report text and publication metadata"],
        "retained": ["Citation metadata and neutral atomic paraphrases"]
      },
      "externalEffects": [],
      "maximumCost": { "amount": 12, "currency": "GBP" },
      "risks": ["The report may be outdated or methodologically opaque"],
      "duration": {
        "startsAt": "2026-08-31T10:00:00.000Z",
        "expiresAt": "2026-08-31T11:00:00.000Z"
      },
      "alternatives": ["Continue with public Sources and leave the Evidence Gap open"],
      "lawfulActivity": true,
      "externalValidationAction": false
    }
  }
}
```

The request must fit the confirmed paid-spend cap and currency. `restricted` requires
a zero maximum; `paid` and `restricted-and-paid` require a positive maximum. The URL
may identify a restricted Source but must not contain credentials or sensitive query
parameters. Success appends the request, writes its checkpoint, and only then returns
the Pending Decision in the Work View. A second request cannot replace an active one.

An informational exchange may be retained without answering the decision:

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "record-approval-information-stable-request-id",
  "command": "recordResearchApprovalInformation",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "coordinatorId": "stable-coordinator-id",
    "recordedAt": "2026-08-31T10:02:00.000Z",
    "decisionId": "stable-pending-decision-id",
    "information": {
      "id": "stable-information-id",
      "question": "Can the Campaign continue without this Source?",
      "explanation": "Yes; independent Public Research can continue and the Evidence Gap can remain open."
    }
  }
}
```

This command checkpoints the explanation but leaves the same Pending Decision active.
Inspection and resume are also informational and do not consume it. No response is a
safe pause.

Approval copies the entire request as the exact scope the developer saw:

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "respond-research-approval-stable-request-id",
  "command": "respondResearchApproval",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "coordinatorId": "stable-coordinator-id",
    "respondedAt": "2026-08-31T10:03:00.000Z",
    "decisionId": "stable-pending-decision-id",
    "response": {
      "kind": "approve",
      "approval": {
        "id": "stable-research-approval-id",
        "explicitlyApproved": true,
        "scope": {
          "id": "stable-pending-decision-id",
          "access": "restricted-and-paid",
          "action": "Read one named report through the developer-controlled portal",
          "purpose": "Resolve one named Evidence Gap",
          "source": {
            "id": "stable-proposed-source-id",
            "description": "Named analyst report",
            "url": "https://research.example.com/report"
          },
          "accessMethod": "Use the developer's existing signed-in browser session read-only",
          "data": {
            "accessed": ["Report text and publication metadata"],
            "retained": ["Citation metadata and neutral atomic paraphrases"]
          },
          "externalEffects": [],
          "maximumCost": { "amount": 12, "currency": "GBP" },
          "risks": ["The report may be outdated or methodologically opaque"],
          "duration": {
            "startsAt": "2026-08-31T10:00:00.000Z",
            "expiresAt": "2026-08-31T11:00:00.000Z"
          },
          "alternatives": ["Continue with public Sources and leave the Evidence Gap open"],
          "lawfulActivity": true,
          "externalValidationAction": false
        }
      }
    }
  }
}
```

Any changed material field fails closed and requires a refused or newly requested
scope. The kernel compares its current clock—not the caller's `respondedAt`—with the
recorded duration, so an expired request cannot be approved by backdating a response.
Before any later use, recheck the recorded scope and duration; expired approvals are
historical provenance and require renewal.

Refusal uses the same command with an explicit refusal and one complete open Evidence
Gap:

```json
{
  "response": {
    "kind": "refuse",
    "refusal": {
      "id": "stable-refusal-id",
      "explicitlyRefused": true,
      "rationale": "Do not use paid or authenticated research for this question.",
      "evidenceGap": {
        "type": "evidence-gap",
        "id": "stable-resulting-gap-id",
        "question": "Can public independent Sources resolve the question?",
        "affectedDecisionIds": ["stable-affected-decision-id"],
        "resolutionCriteria": "Independent public evidence meets the named test.",
        "resolutionMethod": "Continue Public Research or leave the decision unresolved.",
        "status": "open",
        "resolution": null
      }
    }
  }
}
```

Refusal clears the pause, appends the Evidence Gap, and leaves independent permitted
work available. It does not make the refused research happen or turn missing evidence
into evidence of absence.

## Record Research Expenditure

After an approved paid action is actually charged, record its budget effect:

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "record-research-expenditure-stable-request-id",
  "command": "recordResearchExpenditure",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "coordinatorId": "stable-coordinator-id",
    "incurredAt": "2026-08-31T10:10:00.000Z",
    "expenditure": {
      "id": "stable-research-expenditure-id",
      "approvalId": "stable-research-approval-id",
      "sourceId": "stable-proposed-source-id",
      "purpose": "Resolve one named Evidence Gap",
      "amount": 8,
      "currency": "GBP"
    }
  }
}
```

The approval must be current and explicitly cover paid access to that exact Source,
purpose, and currency. Cumulative spend cannot exceed either the approval maximum or
Campaign paid-spend cap. Success records the approval decision provenance and returns
recorded and remaining spend. The strict command has no credential, authenticated
session, account, card, bank, or other payment-detail field. On an ambiguous purchase
or write outcome, preserve the checkpoint and request a precise human decision; never
retry payment or restricted access automatically.

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
