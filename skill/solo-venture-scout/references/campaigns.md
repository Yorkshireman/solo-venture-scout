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

## Migrate a supported older Campaign

`resumeCampaign` opens a supported older Campaign read-only and returns a visible
forward-only migration plan. It does not acquire a lease, append history, create a
snapshot, or advance a version at this stage. Show the returned source and target
versions and every planned step to the developer, then obtain explicit confirmation.

After confirmation, send the exact migration identity and source-authority digest
returned by Resume:

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "migrate-campaign-stable-request-id",
  "command": "migrateCampaign",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "coordinatorId": "stable-coordinator-id",
    "confirmedAt": "2026-09-04T09:05:00.000Z",
    "migrationId": "campaign-format-0.1.0-to-0.2.0",
    "sourceAuthorityDigest": "exact-sha-256-digest-from-the-plan",
    "confirmed": true
  }
}
```

The migration validates the older authoritative history first, writes a private
snapshot and step journal under `migrations/<migration-id>/`, adds integrity digests
to the migrated records, anchors the complete authoritative record count and history
digest in the manifest, validates a complete candidate Campaign, and advances the
manifest versions only after candidate validation. Subsequent journaled operations
advance the records and manifest anchor as one recoverable commit. It never migrates
backward or migrates authority that differs from the confirmed source digest. On
failure, preserve the returned snapshot and journal and retry only the same forward
migration after resolving the diagnostic.

Each release, Campaign format, record, command envelope, Research Result Package,
and render-template contract has its own version in `references/versions.json`,
preflight responses, and Campaign manifests. Do not infer one contract version from
another.

Unsupported newer contract versions stop before any Campaign mutation. Missing or
corrupt `records.jsonl` stops with choices to restore a trusted backup, restore a
migration snapshot, or preserve the Campaign and begin a new one. Record integrity
changes, deletion of an otherwise valid record tail, and manifest edits made outside
the kernel require explicit reconciliation against a trusted original or snapshot.
Never invent authoritative records or remove a damaged tail.

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

Before the Breadth Gate, omit `researchClass`; the later Opportunity formation record
classifies completed reservations into the equal discovery and shallow problem-mining
allocation. After the gate, every ordinary reservation must add exactly one of
`"researchClass": "deepening"` or
`"researchClass": "open-world-discovery"`. The kernel keeps each cumulative group of
five ordinary Source units within the four-to-one allocation and rejects unclassified
or imbalanced reservations. Neither class can consume the separate adversarial reserve.
After Opportunity Exclusion Gates are recorded, every deepening reservation names its
`opportunityId`; rejected and unresolved Opportunities cannot consume deepening
capacity. Elevated-Risk deepening also names the exact granted `approvalId`.

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

## Reserve Approved Research capacity

After an explicit Research Approval, reserve its exact Approved Research scope before
authenticated, restricted, or paid Source access:

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "reserve-approved-source-stable-request-id",
  "command": "reserveApprovedResearch",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "coordinatorId": "stable-coordinator-id",
    "reservedAt": "2026-08-31T09:20:00.000Z",
    "reservation": {
      "id": "stable-approved-research-reservation-id",
      "sourceUnits": 1,
      "purpose": "Exact approved purpose",
      "retrievalRoute": "developer-controlled-authenticated-and-paid-read-only",
      "approvalId": "stable-research-approval-id"
    }
  }
}
```

The purpose and retrieval route must exactly match the current approval. A Research
Approval can back only one reservation. Restricted or paid Approved Research may omit
`opportunityId`; an Elevated-Risk approval remains Opportunity-specific Public
Research and uses `reservePublicResearch` with a deepening reservation.

## Record an Approved Research Observation

Import a completed Approved Research result with inert Source provenance, one neutral
Observation, and an explicit charge resolution:

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "record-approved-observation-stable-request-id",
  "command": "recordApprovedResearchObservation",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "coordinatorId": "stable-coordinator-id",
    "recordedAt": "2026-08-31T09:25:00.000Z",
    "reservationId": "stable-approved-research-reservation-id",
    "source": {
      "id": "stable-approved-source-id",
      "retrievalMode": "developer-controlled-authenticated-read-only",
      "url": "https://research.example/reports/named-report",
      "publisher": "Example Publisher",
      "originator": null,
      "publishedAt": "2026-06-10",
      "updatedAt": null,
      "accessedAt": "2026-08-31T09:24:00.000Z",
      "exactLocator": "Results, paragraph 3"
    },
    "observation": {
      "id": "stable-approved-observation-id",
      "text": "The report describes the named market estimate.",
      "sourceId": "stable-approved-source-id",
      "exactLocator": "Results, paragraph 3"
    },
    "charge": { "incurred": false }
  }
}
```

When a charge occurred, record it first with `recordResearchExpenditure`, then use
`"charge": { "incurred": true, "expenditureId": "stable-expenditure-id" }`.
The kernel rejects a charged result unless that expenditure matches the reservation's
Research Approval. Never persist credentials, payment details, or raw restricted
content.

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
      "action": "read-source",
      "purpose": "Resolve one named Evidence Gap",
      "source": {
        "id": "stable-proposed-source-id",
        "description": "Named analyst report",
        "url": "https://research.example.com/report"
      },
      "accessMethod": "developer-controlled-authenticated-and-paid-read-only",
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
parameters. `action` is the closed `read-source` capability. `accessMethod` must be
`developer-controlled-authenticated-read-only` for `restricted`,
`developer-approved-paid-read-only` for `paid`, or
`developer-controlled-authenticated-and-paid-read-only` for `restricted-and-paid`.
`externalEffects` must be empty. These structural constraints prevent Research
Approval from authorising outreach, publishing, collecting personal data, accepting
money, or another External Validation Action; free text cannot add capabilities.
Success appends the request, writes its checkpoint, and only then returns
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
          "action": "read-source",
          "purpose": "Resolve one named Evidence Gap",
          "source": {
            "id": "stable-proposed-source-id",
            "description": "Named analyst report",
            "url": "https://research.example.com/report"
          },
          "accessMethod": "developer-controlled-authenticated-and-paid-read-only",
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

## Record a Discovery Tranche

After importing the public Sources and Observations sampled by the Discovery Sweeps,
record one bounded tranche:

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "record-discovery-tranche-stable-request-id",
  "command": "recordDiscoveryTranche",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "coordinatorId": "stable-coordinator-id",
    "recordedAt": "2026-08-31T10:00:00.000Z",
    "tranche": {
      "id": "stable-discovery-tranche-id",
      "ordinal": 1,
      "threadSlots": 5,
      "noveltyProbeSlots": 1,
      "shallowResearchSourceUnitsPerRetainedThread": 1,
      "familiarDomainException": null,
      "sweeps": [
        {
          "id": "stable-occupation-sweep-id",
          "sourceFamily": {
            "id": "source-family-occupation-map",
            "name": "Occupation and task maps",
            "economicActivityMap": "Published occupation workflow taxonomy"
          },
          "sourceIds": ["stable-occupation-source-id"],
          "sampling": {
            "frameOrigin": "external-map",
            "method": "systematic",
            "frame": "Dispatch occupations in rows 1 through 40",
            "selectionRule": "Inspect every fourth row from a fixed first row",
            "sampleSize": 10,
            "randomSeed": null
          }
        },
        {
          "id": "stable-procurement-sweep-id",
          "sourceFamily": {
            "id": "source-family-procurement-map",
            "name": "Procurement and spending maps",
            "economicActivityMap": "Published public award notices"
          },
          "sourceIds": ["stable-procurement-source-id"],
          "sampling": {
            "frameOrigin": "external-map",
            "method": "seeded-random",
            "frame": "Service award notices published in the sampled month",
            "selectionRule": "Sample notice identities using the recorded seed",
            "sampleSize": 12,
            "randomSeed": "stable-recorded-seed"
          }
        }
      ],
      "threads": [
        {
          "id": "stable-source-led-thread-id",
          "customerGroup": "Independent dispatch coordinators",
          "situation": "Assigning urgent field work across changing schedules",
          "problemFamily": "Repeated reconciliation of inconsistent availability data",
          "familiarDomain": false,
          "origin": {
            "kind": "source-led",
            "sweepId": "stable-occupation-sweep-id",
            "observationIds": ["stable-workaround-observation-id"]
          },
          "problemSignal": {
            "materialConsequence": {
              "kind": "wasted-skilled-time",
              "description": "Skilled time is diverted from paid operational work.",
              "observationIds": ["stable-workaround-observation-id"]
            },
            "committedBehavior": {
              "kind": "workaround-effort",
              "description": "Operators repeatedly perform manual reconciliation.",
              "observationIds": ["stable-workaround-observation-id"]
            }
          },
          "noveltyCheck": {
            "comparedWithThreadIds": [],
            "result": "distinct",
            "rationale": "The customer, workflow, and consequence form a distinct thread."
          },
          "disposition": {
            "status": "retained",
            "rationale": "The behavioral Problem Signal warrants shallow research."
          }
        },
        {
          "id": "stable-novelty-probe-thread-id",
          "customerGroup": "Small equipment rental depots",
          "situation": "Transferring returned equipment between contractors",
          "problemFamily": "Unclear chain of custody during handoffs",
          "familiarDomain": false,
          "origin": {
            "kind": "novelty-probe",
            "method": "cross-domain-transfer",
            "derivation": "Transfer exception-ledger practices from cold-chain logistics.",
            "assumption": {
              "type": "assumption",
              "id": "stable-novelty-assumption-id",
              "text": "Handoff ambiguity causes a material loss for small depots.",
              "scope": "Small equipment rental depots using multiple contractors.",
              "evidenceGapId": "stable-novelty-gap-id"
            },
            "evidenceGap": {
              "type": "evidence-gap",
              "id": "stable-novelty-gap-id",
              "question": "Does ambiguity cause measurable loss or workaround effort?",
              "affectedDecisionIds": ["decision-form-rental-handoff-opportunity"],
              "resolutionCriteria": "Independent behavior evidence shows a material consequence.",
              "resolutionMethod": "Sample public operational workflow evidence.",
              "status": "open",
              "resolution": null
            }
          },
          "noveltyCheck": {
            "comparedWithThreadIds": ["stable-source-led-thread-id"],
            "result": "distinct",
            "rationale": "The transferred workflow does not duplicate the source-led thread."
          },
          "disposition": {
            "status": "retained",
            "rationale": "Use the reserved probe slot without granting evidential credit."
          }
        }
      ]
    }
  }
}
```

Every tranche must contain at least two Source Families, and every sweep links recorded
Sources to an external-map sampling frame. `systematic`, `stratified`,
`seeded-random`, and `bounded-enumeration` are the controlled sampling methods; only
`seeded-random` carries a non-null seed. The cumulative sweep count cannot exceed the
confirmed Research Budget's Discovery Sweep cap.

`threadSlots` must be a multiple of five and `noveltyProbeSlots` must be exactly one
fifth. A source-led thread links its material consequence and committed behavior to
Observations from its sweep. The strict thread shape has no industry or proposed-product
field. Overlap checks may drop a thread but cannot retain one marked as overlapping.

Every Novelty Probe atomically appends its Evidence Gap and Assumption to the Evidence
Ledger. Its Work View entry records `evidenceCredit: "none"` and
`comparisonBonus: "none"`. All retained threads receive the tranche's common shallow
Source-unit allowance. Later tranches must preserve that allowance, use the next
ordinal, and stay within the campaign sweep cap.

Without an exception, familiar-domain threads cannot exceed one-third of all initial
threads. An exception must name an exact confirmed Campaign Intake
statement and include a rationale; free-form familiarity claims are insufficient. The
Work View reports cumulative coverage, Source Families, reserved allowances, the bias
count and exception, and separate retained and dropped thread lists.

## Record Opportunity Formation

After equal pre-gate discovery and shallow problem mining, assess evidence clusters in
one append-only operation:

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "record-opportunity-formation-stable-request-id",
  "command": "recordOpportunityFormation",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "coordinatorId": "stable-coordinator-id",
    "recordedAt": "2026-08-31T10:30:00.000Z",
    "allocation": {
      "discoveryReservationIds": ["stable-discovery-reservation-1"],
      "shallowProblemMiningReservationIds": ["stable-shallow-reservation-1"]
    },
    "assessments": [{
      "id": "stable-formation-assessment-id",
      "explorationThreadIds": ["stable-source-led-thread-id"],
      "customer": "Independent dispatch coordinators",
      "situation": "Assigning urgent field work across changing schedules",
      "costlyProblem": {
        "description": "Repeated reconciliation diverts skilled time from paid work.",
        "materialConsequence": "wasted-skilled-time",
        "observationIds": ["stable-workaround-observation-id"]
      },
      "clusterBasis": {
        "sharedCustomer": "The evidence concerns independent dispatch coordinators.",
        "sharedWorkflow": "The evidence concerns urgent work assignment.",
        "sharedCostlyConsequence": "The evidence concerns recurring skilled-time loss."
      },
      "supportingObservationIds": ["stable-workaround-observation-id", "stable-independent-observation-id"],
      "behavioralProblemSignalObservationIds": ["stable-workaround-observation-id"],
      "independentSourceLineages": [
        { "id": "stable-lineage-1", "sourceIds": ["stable-workflow-source-id"], "rationale": "The workflow publisher originated this evidence." },
        { "id": "stable-lineage-2", "sourceIds": ["stable-study-source-id"], "rationale": "The separate research group originated this study." }
      ],
      "result": { "kind": "opportunity", "opportunityId": "stable-opportunity-id" },
      "decision": {
        "type": "campaign-decision",
        "id": "stable-formation-decision-id",
        "kind": "opportunity-formation",
        "outcome": "formed",
        "intakeVersion": 1,
        "applicableRule": "Require a specific customer, situation, Costly Problem, behavioral Problem Signal, and two independent Source Lineages.",
        "evidenceEntryIds": ["stable-workaround-observation-id", "stable-independent-observation-id"],
        "rationale": "The complete formation rule is supported.",
        "confidence": { "level": "medium", "limitingFactors": ["Public research does not validate demand."] },
        "limitations": ["Buyer economics remain untested."],
        "decidedAt": "2026-08-31T10:30:00.000Z"
      }
    }]
  }
}
```

Assess each supporting Source into an explicit, reasoned lineage. The kernel rejects
lineage groups contradicted by dependency relationships in the Evidence Ledger;
Sources connected by a recorded dependency count as one lineage. Every settled
ordinary reservation appears exactly once in `allocation`, and the lists contain equal
Source units. An insufficient assessment uses result kind `exploration-thread`,
decision outcome `insufficient-evidence`, and one or more complete open Evidence Gaps
instead of an `opportunityId`. The batch must assess every retained Exploration Thread,
so no unsupported thread can lose its explicit Evidence Gaps during narrowing.

## Pass the Breadth Gate

After forming the minimum comparison set, record the evidence for narrowing:

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "pass-breadth-gate-stable-request-id",
  "command": "passBreadthGate",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "coordinatorId": "stable-coordinator-id",
    "recordedAt": "2026-08-31T10:35:00.000Z",
    "gate": {
      "id": "stable-breadth-gate-id",
      "comparisonOpportunityIds": ["stable-opportunity-1", "stable-opportunity-2"],
      "diminishingReturns": [
        { "trancheId": "stable-tranche-1", "newOpportunityIds": ["stable-opportunity-1", "stable-opportunity-2"], "rationale": "The tranche formed two Opportunities." },
        { "trancheId": "stable-tranche-2", "newOpportunityIds": [], "rationale": "The later tranche formed no additional Opportunity." }
      ],
      "decisionValuePriorities": [{
        "id": "stable-priority-id",
        "researchQuestion": "Can buyer economics change the next qualification gate?",
        "target": { "kind": "gate", "id": "buyer-economics" },
        "rationale": "The answer can change eligibility."
      }],
      "decision": {
        "type": "campaign-decision",
        "id": "stable-breadth-gate-decision-id",
        "kind": "breadth-gate",
        "outcome": "passed",
        "intakeVersion": 1,
        "applicableRule": "Require diversity, comparison, diminishing returns, familiarity compliance, and remaining budget.",
        "evidenceEntryIds": ["stable-formation-decision-id"],
        "rationale": "The complete Breadth Gate is satisfied.",
        "confidence": { "level": "medium", "limitingFactors": ["Open-world discovery remains incomplete."] },
        "limitations": ["Passing does not imply market exhaustion."],
        "decidedAt": "2026-08-31T10:35:00.000Z"
      }
    }
  }
}
```

The tranche entries are consecutive and the later tranche must form fewer new
Opportunities. The kernel derives diversity, familiarity, and remaining budget from
authoritative history. Remaining ordinary capacity must include at least two Source
units for every Opportunity in the comparison set, while the separate adversarial
reserve remains untouched. Passing changes the Work View allocation from equal discovery
and shallow problem mining to eighty percent deepening and twenty percent open-world
discovery. The adversarial reserve remains outside both allocations.

## Record Opportunity Exclusion Gates

Before deepening, assess every formed Opportunity in one append-only operation:

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "record-opportunity-exclusion-gates-stable-request-id",
  "command": "recordOpportunityExclusionGates",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "coordinatorId": "stable-coordinator-id",
    "recordedAt": "2026-08-31T10:40:00.000Z",
    "assessments": [{
      "id": "stable-opportunity-exclusion-assessment-id",
      "opportunityId": "stable-opportunity-id",
      "marketSafety": {
        "classification": "ordinary",
        "intendedActivity": "Help authorized operators reconcile their own workflow records",
        "excludedCategory": null,
        "directlyServesExcludedActivity": false,
        "gate": {
          "id": "stable-market-safety-gate-id",
          "state": "passed",
          "decision": {
            "type": "campaign-decision",
            "id": "stable-market-safety-decision-id",
            "kind": "exclusion-gate",
            "outcome": "passed",
            "opportunityId": "stable-opportunity-id",
            "intakeVersion": 1,
            "applicableRule": "Reject only intended activity that directly serves a non-overridable excluded category.",
            "supportingEvidenceEntryIds": ["stable-intended-activity-inference-id"],
            "challengingEvidenceEntryIds": ["stable-material-challenge-observation-id"],
            "evidenceGapIds": [],
            "contradictionIds": [],
            "rationale": "Affirmative evidence supports an ordinary intended activity; hypothetical misuse does not establish direct service.",
            "confidence": { "level": "medium", "limitingFactors": ["The assessment is limited to the stated intended activity."] },
            "limitations": ["A material change in intended activity requires reassessment."],
            "decidedAt": "2026-08-31T10:40:00.000Z"
          }
        }
      },
      "hardConstraints": [{
        "hardConstraintId": "stable-confirmed-hard-constraint-id",
        "gate": {
          "id": "stable-hard-constraint-gate-id",
          "state": "unresolved",
          "decision": {
            "type": "campaign-decision",
            "id": "stable-hard-constraint-decision-id",
            "kind": "exclusion-gate",
            "outcome": "unresolved",
            "opportunityId": "stable-opportunity-id",
            "intakeVersion": 1,
            "applicableRule": "Use the exact confirmed Hard Constraint text.",
            "supportingEvidenceEntryIds": [],
            "challengingEvidenceEntryIds": [],
            "evidenceGapIds": ["stable-hard-constraint-evidence-gap-id"],
            "contradictionIds": [],
            "rationale": "Missing evidence cannot establish satisfaction or violation.",
            "confidence": { "level": "low", "limitingFactors": ["Required-input evidence is missing."] },
            "limitations": ["Resolve the linked Evidence Gap before deepening."],
            "decidedAt": "2026-08-31T10:40:00.000Z"
          }
        }
      }]
    }]
  }
}
```

The batch must assess every formed Opportunity and every Hard Constraint in the
current Campaign Intake exactly once. `excluded-market` requires a named category,
`directlyServesExcludedActivity: true`, affirmative supporting evidence, a failed
gate, and medium or high Evidence Confidence. `ordinary` and `elevated-risk` use a
passed Exclusion Gate with `directlyServesExcludedActivity: false`; an unknown direct
relationship uses classification and gate state `unresolved`, plus an explicit open
Evidence Gap when support is absent. Any terminal gate state is invalid while a linked
Evidence Gap or Contradiction remains decision-changing.

Each supporting evidence identity must name an available Inference whose `scope` is
the assessed `opportunityId`; raw Observations and Inferences scoped to another
Opportunity cannot affirm a gate decision. The decision must enumerate every
unresolved Contradiction involving any supporting or challenging evidence it cites.

The Work View retains each gate separately, derives Opportunity Disposition, keeps
eligibility and `terminalRole` distinct, and preserves every Campaign Decision in the
Evidence Ledger. A failed gate rejects the Opportunity. An unresolved gate makes it
unresolved and ineligible. A passed Elevated-Risk market gate still leaves the
Opportunity unresolved until scoped approval is granted.

For deep research on an Elevated-Risk Opportunity, use the normal Research Approval
lifecycle with this complete scope shape:

```json
{
  "id": "stable-elevated-risk-pending-decision-id",
  "access": "elevated-risk",
  "action": "read-source",
  "opportunityId": "stable-opportunity-id",
  "researchDepth": "deep",
  "purpose": "Resolve the named Elevated-Risk gate question",
  "source": {
    "id": "stable-public-risk-source-id",
    "description": "Named public regulatory analysis",
    "url": "https://example.com/regulatory-analysis"
  },
  "accessMethod": "public-read-only",
  "data": {
    "accessed": ["Published regulatory analysis"],
    "retained": ["Source metadata and neutral atomic paraphrases"]
  },
  "externalEffects": [],
  "maximumCost": { "amount": 0, "currency": "GBP" },
  "risks": ["The market has material legal or safety risk"],
  "duration": {
    "startsAt": "2026-08-31T10:41:00.000Z",
    "expiresAt": "2026-08-31T11:41:00.000Z"
  },
  "alternatives": ["Leave the Opportunity unresolved"],
  "lawfulActivity": true,
  "externalValidationAction": false
}
```

After exact explicit approval, a matching deepening reservation adds
`"opportunityId": "stable-opportunity-id"` and
`"approvalId": "stable-elevated-risk-research-approval-id"`. The kernel rejects a
missing, expired, differently scoped, or cross-Opportunity approval before reserving
capacity. Refusal records its Evidence Gap and leaves the Opportunity unresolved and
ineligible rather than rejected. Shallow classification and independent permitted work
remain available without treating silence as approval.

## Record Opportunity Qualification Gates

After Exclusion Gates, use `recordOpportunityQualificationGates` with exactly one
assessment for every surviving Opportunity. Each assessment contains exactly these
gate kinds: `costly-problem`, `buyer-economics`, `customer-access`,
`value-feasibility`, `solo-feasibility`, `competitive-viability`,
`legal-operational-feasibility`, and `commercial-plausibility`.

This excerpt shows the command envelope and complete shapes for an ordinary gate, the
commercial gate, and the research decision. A real command must include all eight gate
objects for every surviving Opportunity; do not submit this abbreviated example:

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "record-qualification-evaluation-stable-request-id",
  "command": "recordOpportunityQualificationGates",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "coordinatorId": "stable-coordinator-id",
    "recordedAt": "2026-08-31T11:00:00.000Z",
    "evaluation": {
      "id": "stable-qualification-evaluation-id",
      "assessments": [
        {
          "id": "stable-opportunity-qualification-assessment-id",
          "opportunityId": "stable-opportunity-id",
          "gates": [
            {
              "id": "gate-costly-problem-stable-opportunity-id",
              "kind": "costly-problem",
              "state": "unresolved",
              "evidenceBasis": {
                "behavioralEvidenceEntryIds": [],
                "independentSourceLineages": [],
                "sourceFreshnessIds": []
              },
              "decision": {
                "type": "campaign-decision",
                "id": "decision-costly-problem-stable-opportunity-id",
                "kind": "qualification-gate",
                "outcome": "unresolved",
                "opportunityId": "stable-opportunity-id",
                "intakeVersion": 1,
                "applicableRule": "Require affirmative evidence of a current Costly Problem.",
                "supportingEvidenceEntryIds": [],
                "challengingEvidenceEntryIds": [],
                "evidenceGapIds": ["gap-costly-problem-stable-opportunity-id"],
                "contradictionIds": [],
                "rationale": "The required affirmative evidence is missing.",
                "confidence": {
                  "level": "low",
                  "limitingFactors": ["Independent behavior evidence is missing."]
                },
                "limitations": ["The open Evidence Gap may change this gate."],
                "decidedAt": "2026-08-31T11:00:00.000Z"
              }
            },
            {
              "id": "gate-commercial-plausibility-stable-opportunity-id",
              "kind": "commercial-plausibility",
              "state": "passed",
              "evidenceBasis": {
                "behavioralEvidenceEntryIds": ["inference-commercial-behavior"],
                "independentSourceLineages": [
                  { "sourceIds": ["source-independent-a"], "rationale": "Distinct origin A." },
                  { "sourceIds": ["source-independent-b"], "rationale": "Distinct origin B." }
                ],
                "sourceFreshnessIds": ["freshness-a", "freshness-b"]
              },
              "commercialRanges": {
                "price": { "low": 75, "high": 150, "unit": "GBP/customer/month", "evidenceEntryIds": ["inference-commercial-behavior"] },
                "customerVolume": { "low": 70, "high": 160, "unit": "customers", "evidenceEntryIds": ["inference-commercial-behavior"] },
                "costs": { "low": 500, "high": 2500, "unit": "GBP/month", "evidenceEntryIds": ["inference-commercial-behavior"] },
                "acquisition": { "low": 20, "high": 80, "unit": "GBP/customer", "evidenceEntryIds": ["inference-commercial-behavior"] },
                "capacity": { "low": 80, "high": 200, "unit": "customers/Solo Developer", "evidenceEntryIds": ["inference-commercial-behavior"] },
                "timing": { "low": 6, "high": 18, "unit": "months to target", "evidenceEntryIds": ["inference-commercial-behavior"] }
              },
              "decision": {
                "type": "campaign-decision",
                "id": "decision-commercial-plausibility-stable-opportunity-id",
                "kind": "qualification-gate",
                "outcome": "passed",
                "opportunityId": "stable-opportunity-id",
                "intakeVersion": 1,
                "applicableRule": "Require an evidence-backed range path to the Commercial Outcome Target.",
                "supportingEvidenceEntryIds": ["inference-commercial-behavior"],
                "challengingEvidenceEntryIds": [],
                "evidenceGapIds": [],
                "contradictionIds": [],
                "rationale": "Independent current behavior evidence supports every range.",
                "confidence": { "level": "medium", "limitingFactors": ["Ranges remain uncertain."] },
                "limitations": ["This is not a point forecast."],
                "decidedAt": "2026-08-31T11:00:00.000Z"
              }
            }
          ]
        }
      ],
      "researchDecision": {
        "type": "campaign-decision",
        "id": "stable-qualification-research-decision-id",
        "kind": "qualification-research",
        "outcome": "continue",
        "intakeVersion": 1,
        "applicableRule": "Continue only while budget remains and a permitted action has positive Decision Value.",
        "evidenceEntryIds": ["gap-costly-problem-stable-opportunity-id"],
        "decisionValuePriorities": [
          {
            "id": "priority-costly-problem-stable-opportunity-id",
            "researchQuestion": "Can independent behavior evidence resolve this gate?",
            "target": { "kind": "gate", "id": "gate-costly-problem-stable-opportunity-id" },
            "permittedAction": {
              "purpose": "Research current Costly Problem behavior",
              "retrievalRoute": "public-web-search",
              "researchClass": "deepening",
              "opportunityId": "stable-opportunity-id"
            },
            "rationale": "The answer can change Opportunity eligibility."
          }
        ],
        "stopReason": null,
        "rationale": "Budget remains and the named permitted action can resolve a gate.",
        "confidence": { "level": "medium", "limitingFactors": ["Only one next action is prioritized."] },
        "limitations": ["Research remains bounded."],
        "decidedAt": "2026-08-31T11:00:00.000Z"
      }
    }
  }
}
```

A terminal gate needs medium or high Evidence Confidence, Opportunity-scoped
supporting Inferences, no decision-changing open Evidence Gap, and no unresolved
Contradiction involving its evidence. Market and commercial gates require independent
behavior evidence. Time-sensitive gates cite current Source Freshness entries for every
supporting Observation. `commercialRanges` is `null` only while unresolved; otherwise
every low value is less than its high value and every range cites supporting evidence.

When research continues, each later post-Breadth-Gate reservation selects a current
positive Decision Value priority by adding:

```json
{
  "purpose": "Research current Costly Problem behavior",
  "retrievalRoute": "public-web-search",
  "researchClass": "deepening",
  "opportunityId": "stable-opportunity-id",
  "decisionValuePriorityId": "stable-current-priority-id"
}
```

The reservation's purpose, retrieval route, research class, and Opportunity must
exactly match the priority's `permittedAction`; naming the priority alone does not
authorize unrelated research.

Use stop reason `ordinary-budget-exhausted` only when recorded budget use leaves zero
ordinary Source units, `no-permitted-positive-decision-value` when no lawful in-scope
action can change a gate, and `qualification-complete` only when at least one Opportunity
is eligible for later comparison.

## Reserve the adversarial challenge

After Qualification Gates complete with at least one Eligible Opportunity, reserve each
protected adversarial Source unit against the apparent leader. Use the normal
`recordPublicResearchObservation` loop to settle every reservation:

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "reserve-adversarial-source-stable-request-id",
  "command": "reservePublicResearch",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "coordinatorId": "stable-coordinator-id",
    "reservedAt": "2026-08-31T11:05:00.000Z",
    "reservation": {
      "id": "stable-adversarial-reservation-1",
      "sourceUnits": 1,
      "purpose": "Challenge the apparent leader for decision-changing gaps, contradictions, or contenders",
      "retrievalRoute": "public-web-search",
      "researchClass": "adversarial",
      "opportunityId": "stable-apparent-leader-id"
    }
  }
}
```

Adversarial capacity is separate from the ordinary eighty/twenty allocation. It becomes
available only after qualification completes, must name an Eligible Opportunity, and
cannot exceed `adversarialSourceReserve`. A Leading Opportunity requires the complete
reserve to be settled against the same apparent leader.

## Conclude a Leading Opportunity

Submit one strict, unscored comparison and the evidence-backed fields the kernel needs
to derive the immutable Opportunity Brief:

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "conclude-leading-opportunity-stable-request-id",
  "command": "concludeLeadingOpportunity",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "coordinatorId": "stable-coordinator-id",
    "concludedAt": "2026-08-31T11:30:00.000Z",
    "comparison": {
      "id": "stable-opportunity-comparison-id",
      "profiles": [
        {
          "opportunityId": "stable-apparent-leader-id",
          "requiredInput": {
            "validation": { "summary": "Bounded validation input.", "evidenceEntryIds": ["stable-leader-inference-id"], "confidence": { "level": "medium", "limitingFactors": ["The evidence is bounded."] } },
            "initialDelivery": { "summary": "Bounded initial-delivery input.", "evidenceEntryIds": ["stable-leader-inference-id"], "confidence": { "level": "medium", "limitingFactors": ["The evidence is bounded."] } },
            "acquisition": { "summary": "Bounded acquisition input.", "evidenceEntryIds": ["stable-leader-inference-id"], "confidence": { "level": "medium", "limitingFactors": ["The evidence is bounded."] } },
            "operations": { "summary": "Bounded operating burden.", "evidenceEntryIds": ["stable-leader-inference-id"], "confidence": { "level": "medium", "limitingFactors": ["The evidence is bounded."] } },
            "time": { "summary": "Bounded time input.", "evidenceEntryIds": ["stable-leader-inference-id"], "confidence": { "level": "medium", "limitingFactors": ["The evidence is bounded."] } },
            "cash": { "summary": "Bounded cash input.", "evidenceEntryIds": ["stable-leader-inference-id"], "confidence": { "level": "medium", "limitingFactors": ["The evidence is bounded."] } },
            "irreversibleDownside": { "summary": "Bounded irreversible downside.", "evidenceEntryIds": ["stable-leader-inference-id"], "confidence": { "level": "medium", "limitingFactors": ["The evidence is bounded."] } },
            "opportunityCost": { "summary": "Bounded opportunity cost.", "evidenceEntryIds": ["stable-leader-inference-id"], "confidence": { "level": "medium", "limitingFactors": ["The evidence is bounded."] } }
          },
          "potentialOutput": {
            "commercialHeadroom": { "summary": "Credible commercial headroom.", "evidenceEntryIds": ["stable-leader-inference-id"], "confidence": { "level": "medium", "limitingFactors": ["The range is uncertain."] } },
            "scale": { "summary": "Credible bounded scale.", "evidenceEntryIds": ["stable-leader-inference-id"], "confidence": { "level": "medium", "limitingFactors": ["The range is uncertain."] } },
            "durability": { "summary": "Credible bounded durability.", "evidenceEntryIds": ["stable-leader-inference-id"], "confidence": { "level": "medium", "limitingFactors": ["The range is uncertain."] } },
            "strategicLeverage": { "summary": "Credible strategic leverage.", "evidenceEntryIds": ["stable-leader-inference-id"], "confidence": { "level": "medium", "limitingFactors": ["The range is uncertain."] } }
          },
          "outcomeUncertainty": { "summary": "Results remain high-variance within supported ranges.", "evidenceEntryIds": ["stable-leader-inference-id"], "confidence": { "level": "medium", "limitingFactors": ["This is not a probability."] } },
          "inputOutputAsymmetry": { "summary": "Low bounded input retains credible upside.", "evidenceEntryIds": ["stable-leader-inference-id"], "confidence": { "level": "medium", "limitingFactors": ["The ranges may change."] } },
          "riskToleranceFit": { "fit": "within", "summary": "The bounded downside remains within the declared Risk Tolerance.", "evidenceEntryIds": ["stable-leader-inference-id"], "confidence": { "level": "medium", "limitingFactors": ["The evidence is bounded."] } },
          "preferences": [
            {
              "statementId": "stable-major-preference-id",
              "effect": "advantage",
              "materiality": "material",
              "rationale": "The Opportunity fits the confirmed major Preference.",
              "evidenceEntryIds": ["stable-leader-inference-id"],
              "confidence": { "level": "medium", "limitingFactors": ["Fit is evidence-backed but bounded."] }
            }
          ],
          "advantages": [
            {
              "statementId": "stable-confirmed-advantage-id",
              "effect": "reduces-input",
              "rationale": "Demonstrated leverage reduces validation input.",
              "evidenceEntryIds": ["stable-leader-inference-id"],
              "confidence": { "level": "medium", "limitingFactors": ["Leverage varies by customer."] }
            }
          ]
        }
      ],
      "dominanceAssessments": [],
      "nonDominatedOpportunityIds": ["stable-apparent-leader-id"],
      "leadingAssessment": {
        "opportunityId": "stable-apparent-leader-id",
        "advantagesOverAlternatives": [],
        "noMaterialDisadvantage": {
          "established": true,
          "summary": "No material disadvantage exists on another major Preference or declared Risk Tolerance.",
          "evidenceEntryIds": ["stable-leader-inference-id"],
          "confidence": { "level": "medium", "limitingFactors": ["The evidence is bounded."] }
        },
        "robustAcrossCredibleRanges": {
          "established": true,
          "summary": "The selection persists across the supported input and output ranges.",
          "evidenceEntryIds": ["stable-leader-inference-id"],
          "confidence": { "level": "medium", "limitingFactors": ["Future ranges may change."] }
        },
        "unresolvedContenderOpportunityIds": [],
        "decisionChangingEvidenceGapIds": [],
        "decisionChangingContradictionIds": [],
        "adversarialChallenge": {
          "reservationIds": [
            "stable-adversarial-reservation-1",
            "stable-adversarial-reservation-2",
            "stable-adversarial-reservation-3",
            "stable-adversarial-reservation-4",
            "stable-adversarial-reservation-5",
            "stable-adversarial-reservation-6"
          ],
          "outcome": "leader-remains-eligible",
          "summary": "The complete protected challenge found no decision-changing result.",
          "evidenceEntryIds": ["stable-adversarial-inference-id"],
          "confidence": { "level": "medium", "limitingFactors": ["The challenge is bounded."] }
        }
      },
      "decision": {
        "type": "campaign-decision",
        "id": "stable-leading-decision-id",
        "kind": "opportunity-comparison",
        "outcome": "leading-opportunity",
        "leaderOpportunityId": "stable-apparent-leader-id",
        "intakeVersion": 1,
        "applicableRule": "Require a robust evidence-backed stand-out after adversarial challenge.",
        "evidenceEntryIds": ["stable-leader-inference-id", "stable-adversarial-inference-id"],
        "rationale": "The Opportunity retains its supported advantage across credible ranges.",
        "confidence": { "level": "medium", "limitingFactors": ["Public Research is not market validation."] },
        "limitations": ["The recommendation remains subject to separate validation."],
        "decidedAt": "2026-08-31T11:30:00.000Z"
      }
    },
    "brief": {
      "id": "stable-leading-opportunity-brief-id",
      "buyerEconomics": { "summary": "An identifiable buyer has supported reason and ability to pay.", "evidenceEntryIds": ["stable-leader-inference-id"], "confidence": { "level": "medium", "limitingFactors": ["The range is bounded."] } },
      "customerAccess": { "summary": "A plausible affordable route to customers exists.", "evidenceEntryIds": ["stable-leader-inference-id"], "confidence": { "level": "medium", "limitingFactors": ["Access has not been externally validated."] } },
      "alternatives": { "summary": "Current alternatives leave a supported competitive opening.", "evidenceEntryIds": ["stable-leader-inference-id"], "confidence": { "level": "medium", "limitingFactors": ["Alternatives may change."] } },
      "risks": [
        { "summary": "Acquisition and operating ranges may widen.", "evidenceEntryIds": ["stable-leader-inference-id"], "confidence": { "level": "medium", "limitingFactors": ["External validation has not occurred."] } }
      ],
      "valueHypothesis": {
        "status": "provisional-not-a-product-specification",
        "customer": "Specific customer",
        "situation": "Specific situation",
        "smallestDesiredCustomerOutcome": "Smallest desired customer outcome",
        "supportedReason": "Evidence supports testing this customer outcome.",
        "confidence": { "level": "medium", "limitingFactors": ["No External Validation Action has occurred."] },
        "supportingEvidenceEntryIds": ["stable-leader-inference-id"],
        "challengingEvidenceEntryIds": [],
        "assumptionIds": [],
        "evidenceGapIds": [],
        "disconfirmationConditions": ["The customer outcome does not occur in a separate approved validation effort."]
      }
    }
  }
}
```

For multiple Eligible Opportunities, include one profile per Opportunity, one directed
dominance assessment for every ordered pair, and one material
`advantagesOverAlternatives` entry for every alternative to the leader. A `dominates`
result is valid only when all three criteria are true and `materiallyBetterOn` is
non-empty and contains only a named comparison dimension. Every profile must represent
every confirmed Preference and Advantage; use `effect: "not-demonstrated"` with no
evidence IDs rather than omitting an Advantage, and record `riskToleranceFit.fit` explicitly.
A major-Preference leader advantage must match a material `advantage` in the leader's
profile that the alternative's profile does not share.
The kernel derives the Non-Dominated set and the authoritative open gaps,
Contradictions, and unresolved contenders. It rejects a hidden survivor, weak evidence,
incomplete commercial-range coverage, an incomplete adversarial reserve, a point score,
an unresolved contender, or a product-specification field.

Success creates `opportunity-brief.md` with mode `0600` and returns its absolute path,
`format: "markdown"`, and `immutable: true`. Report those values without opening the
file. The brief's Wayfinder instruction is optional and records `invoked: false`; only
the developer may start that separate effort.

## Conclude and respond to an inconclusive comparison

Use the same complete `profiles`, directed `dominanceAssessments`, and
`nonDominatedOpportunityIds` contract as `concludeLeadingOpportunity`. Replace the
leader assessment with evidence-backed `decisiveTradeOffs`, an optional
`apparentLeaderOpportunityId`, and explicit contender `blockers`. Every blocker names
the contender, the Eligible Non-Dominated Opportunities it could displace, and current
open Evidence Gaps or unresolved Contradictions. Include every Opportunity whose
authoritative disposition remains unresolved. A genuine evidence-complete tie with no
apparent leader may use an empty `blockers` array; do not manufacture a gap merely to
justify the inconclusive result.

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "conclude-inconclusive-comparison-stable-request-id",
  "command": "concludeInconclusiveComparison",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "coordinatorId": "stable-coordinator-id",
    "concludedAt": "2026-08-31T11:30:00.000Z",
    "reportId": "stable-inconclusive-comparison-report-id",
    "comparison": {
      "id": "stable-opportunity-comparison-id",
      "profiles": "complete profiles using the preceding schema",
      "dominanceAssessments": "complete directed pairs using the preceding schema",
      "nonDominatedOpportunityIds": ["stable-opportunity-a", "stable-opportunity-b"],
      "decisiveTradeOffs": [{
        "opportunityIds": ["stable-opportunity-a", "stable-opportunity-b"],
        "summary": "One needs less input while the other has stronger supported durability.",
        "evidenceEntryIds": ["stable-opportunity-a-inference", "stable-opportunity-b-inference"],
        "confidence": { "level": "medium", "limitingFactors": ["The supported ranges overlap."] }
      }],
      "apparentLeaderOpportunityId": "stable-opportunity-a",
      "blockers": [{
        "contenderOpportunityId": "stable-opportunity-b",
        "couldDisplaceOpportunityIds": ["stable-opportunity-a"],
        "summary": "The unresolved durability boundary could reverse the preference.",
        "evidenceGapIds": ["stable-durability-gap-id"],
        "contradictionIds": [],
        "evidenceEntryIds": ["stable-opportunity-a-inference", "stable-opportunity-b-inference"]
      }],
      "decision": {
        "type": "campaign-decision",
        "id": "stable-inconclusive-decision-id",
        "kind": "opportunity-comparison",
        "outcome": "inconclusive-comparison",
        "leaderOpportunityId": null,
        "intakeVersion": 1,
        "applicableRule": "Do not force a leader while a material blocker remains.",
        "evidenceEntryIds": ["stable-opportunity-a-inference", "stable-opportunity-b-inference"],
        "rationale": "Neither Eligible Non-Dominated Opportunity is defensibly strongest.",
        "confidence": { "level": "medium", "limitingFactors": ["One boundary remains open."] },
        "limitations": ["Public Research is not market validation."],
        "decidedAt": "2026-08-31T11:30:00.000Z"
      }
    }
  }
}
```

Success creates immutable `inconclusive-comparison-report.md`. Present Stop, Extend,
and Select without choosing for the developer. Stop preserves that report and creates
no Opportunity Brief:

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "stop-inconclusive-comparison-stable-request-id",
  "command": "respondInconclusiveComparison",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "coordinatorId": "stable-coordinator-id",
    "respondedAt": "2026-08-31T11:31:00.000Z",
    "reportId": "stable-inconclusive-comparison-report-id",
    "response": { "kind": "stop", "rationale": "Preserve the current comparison." }
  }
}
```

Extend creates the next Campaign Intake version and a fresh expanded Research Budget.
All resumed Campaign work remains confined to the named Opportunities and Evidence
Gaps. Reservations must use `researchClass: "deepening"`, an affected `opportunityId`,
and a targeted `evidenceGapId`:

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "extend-inconclusive-comparison-stable-request-id",
  "command": "respondInconclusiveComparison",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "coordinatorId": "stable-coordinator-id",
    "respondedAt": "2026-08-31T11:31:00.000Z",
    "reportId": "stable-inconclusive-comparison-report-id",
    "response": {
      "kind": "extend",
      "rationale": "Resolve only the blocker that could change comparison.",
      "targetedEvidenceGapIds": ["stable-durability-gap-id"],
      "affectedOpportunityIds": ["stable-opportunity-a", "stable-opportunity-b"],
      "researchBudget": {
        "profile": "custom",
        "sourceCap": 5,
        "discoverySweepCap": 1,
        "sourceFamilyMinimum": 1,
        "deepenedOpportunityCap": 2,
        "minimumComparisonSet": 2,
        "adversarialSourceReserve": 1,
        "paidSpendCap": { "amount": 0, "currency": "GBP" }
      }
    }
  }
}
```

Select accepts one or more entries. Each `brief` uses the complete brief-input shape
from `concludeLeadingOpportunity` and each Opportunity must be Non-Dominated:

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "select-inconclusive-opportunities-stable-request-id",
  "command": "respondInconclusiveComparison",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "coordinatorId": "stable-coordinator-id",
    "respondedAt": "2026-08-31T11:31:00.000Z",
    "reportId": "stable-inconclusive-comparison-report-id",
    "response": {
      "kind": "select",
      "selections": [{
        "opportunityId": "stable-opportunity-a",
        "rationale": "I prefer its lower operating input despite the unresolved trade-off.",
        "brief": "complete evidence-backed brief input using the preceding schema"
      }]
    }
  }
}
```

Record every selection rationale as developer Preference, not market evidence. Create
one separately marked `opportunity-brief-<opportunity-id>.md` per Developer-Selected
Opportunity, never relabel it as Leading, and give it one separate optional Wayfinder
instruction with `invoked: false`.

## Conclude No Qualifying Opportunity

When no Opportunity is eligible and the latest qualification-related Campaign Decision stopped
for budget exhaustion or no permitted positive Decision Value, run:

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "conclude-no-qualifying-opportunity-stable-request-id",
  "command": "concludeNoQualifyingOpportunity",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "coordinatorId": "stable-coordinator-id",
    "concludedAt": "2026-08-31T11:30:00.000Z",
    "reportId": "stable-no-qualifying-opportunity-report-id",
    "continuationConditions": [
      {
        "id": "stable-continuation-condition-id",
        "opportunityId": "stable-unresolved-opportunity-id",
        "condition": "Reopen only if a public Source can resolve the linked gap within a revised Research Budget.",
        "evidenceGapIds": ["stable-open-qualification-gap-id"]
      }
    ]
  }
}
```

All reservations must be settled, and continuation conditions cover every unresolved
Opportunity and no rejected Opportunity. The kernel derives the structured record from
authoritative history and deterministically renders
`no-qualifying-opportunity-report.md`. It separates rejected and unresolved
Opportunities and includes coverage, Breadth Gate state, Research Budget use,
limitations, continuation conditions, completeness checks, and audit pointers. Success
uses exit `0`: this is a valid terminal outcome, not an error. The identical request is
idempotent; later mutation commands fail because the report and Campaign are immutable.

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
or write outcome, preserve the checkpoint and request a precise human decision.
Descriptive fields containing credential or payment-detail markers, including card
numbers, are rejected; never retry payment or restricted access automatically.

## Re-evaluate a challenge or revision

Use one explicit append-only operation for a developer challenge, Campaign Intake
revision, source correction or redaction, Source Freshness change, Contradiction, new
evidence, or a refresh found during Resume:

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "reevaluate-stable-request-id",
  "command": "reevaluateCampaign",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "coordinatorId": "stable-coordinator-id",
    "reevaluatedAt": "2026-08-31T12:00:00.000Z",
    "operation": {
      "id": "stable-reevaluation-id",
      "kind": "developer-challenge",
      "reason": "The confirmed capacity changed after meaningful work.",
      "reasoningEntries": [],
      "intakeRevision": {
        "reason": "Reduce the confirmed weekly capacity.",
        "intake": "the complete explicitly confirmed next Campaign Intake version"
      },
      "decision": {
        "type": "campaign-decision",
        "id": "stable-reevaluation-decision-id",
        "kind": "campaign-re-evaluation",
        "outcome": "resume",
        "intakeVersion": 2,
        "applicableRule": "Re-evaluate only decisions dependent on the changed capacity.",
        "triggerEntryIds": [],
        "affectedOpportunityIds": ["stable-affected-opportunity-id"],
        "supersededDecisionIds": ["stable-dependent-decision-id"],
        "rationale": "The prior feasibility decision used the superseded capacity.",
        "confidence": {
          "level": "medium",
          "limitingFactors": ["The revised feasibility still needs evidence."]
        },
        "limitations": ["Unrelated decisions remain current."],
        "decidedAt": "2026-08-31T12:00:00.000Z"
      }
    }
  }
}
```

`reasoningEntries` uses the same strict Evidence Ledger shapes as
`recordEvidenceReasoning`; this lets a correction and its re-evaluation commit as one
operation. A Correction action may be `reaffirm`, `supersede`, or `retract` and always
uses stable target and replacement links. The kernel rejects an unrelated
`supersededDecisionIds` entry, derives superseded terminal artifact identities, keeps
the Campaign identity unchanged, and rebuilds only affected current views.

To record replacement Exclusion or Qualification Gate decisions, use the existing
gate command with `payload.reevaluationId` set to the stable re-evaluation identity.
Submit only assessments for affected Opportunities. Each changed gate receives a new
stable identity and Campaign Decision; unchanged gates may retain their prior decision
and time. The current evaluation snapshot carries forward every unsubmitted
Opportunity unchanged, and the kernel rejects a replacement not authorized by that
re-evaluation.

For time-sensitive evidence, Source Freshness may add an ISO UTC `refreshAfter` (or
`null` when no scheduled review is justified):

```json
{
  "type": "source-freshness",
  "id": "stable-freshness-id",
  "sourceId": "stable-source-id",
  "observationId": "stable-observation-id",
  "intendedUse": "Assess the current buyer process.",
  "assessment": "medium",
  "timeSensitivity": "The process may change monthly.",
  "rationale": "Review after the stated monthly boundary.",
  "limitations": ["A later change could alter the decision."],
  "refreshAfter": "2026-09-30T00:00:00.000Z"
}
```

Resume returns `workView.evidenceRefresh` only when the boundary has passed and the
assessment is linked to an active Campaign Decision. Refresh exactly those listed
freshness, Observation, and decision identities; do not repeat unrelated research.

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
The short-lived operation-lock registry uses one atomically published active-owner
file. The kernel claims that fully written file with an atomic exclusive filesystem
link, so concurrent coordinators cannot both enter the mutation boundary.
An abandoned lock owned by a terminated process is quarantined before a new claim;
release verifies its token and cannot remove a newer coordinator's lock.

Every mutation of an existing Campaign first writes and synchronizes a private
durable intent journal, then atomically replaces authoritative history with the
complete record pair.
An interruption before the authoritative commit remains an explicit journal entry;
Resume completes that exact validated intent once. An interruption after the commit
regenerates every damaged or missing rebuildable projection and deterministic Markdown
rendering from authoritative history before the journal is cleared. The Resume summary
lists recovered operations and whether projections were regenerated.

Unsettled Source reservations continue to consume their Source capacity. An unsettled
paid reservation also reserves the unrecorded remainder of its approved maximum, so
recovery cannot exceed the Research Budget. Public Research can continue from its
existing reservation. Approved Research that crosses a Resume boundary becomes an
`interrupted-approved-research` Pending Decision: do not access or pay again. If the
result completed, record an incurred Research Expenditure when applicable and import
the saved Observation with `recordApprovedResearchObservation`. If no result completed,
respond with the exact work and charge state for every reservation:

```json
{
  "envelopeVersion": "0.1.0",
  "requestId": "respond-interrupted-research-stable-request-id",
  "command": "respondInterruptedResearch",
  "payload": {
    "campaignPath": "/developer-chosen/exact-campaign-path",
    "coordinatorId": "stable-coordinator-id-for-this-session",
    "respondedAt": "2026-08-31T10:05:00.000Z",
    "decisionId": "interrupted-approved-research:stable-reservation-id",
    "response": {
      "kind": "resolve-without-result",
      "reservations": [
        {
          "reservationId": "stable-reservation-id",
          "externalWorkCompleted": false,
          "charge": { "incurred": false }
        }
      ],
      "explicitlyConfirmed": true,
      "rationale": "No Source access or charge completed before interruption."
    }
  }
}
```

The response must cover the exact active reservation set, cannot be backdated, and is
idempotent. A charged resolution names its already recorded Research Expenditure. The
response closes those reservations without retry and keeps their Source units consumed
conservatively. Silence, an informational message, or a partial response does not
resolve the Pending Decision.

- Exit `0`: the lifecycle command succeeded, including an idempotent replay.
- Exit `3`: the command, path, Campaign state, or lease is invalid. Report the
  structured error and stop.
