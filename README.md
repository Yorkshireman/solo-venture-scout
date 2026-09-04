# Solo Venture Scout

Solo Venture Scout is a Codex skill for finding evidence-backed software
opportunities that one developer could realistically pursue.

It runs a bounded, resumable **Scouting Campaign**: it starts from your Commercial
Outcome Target, capacity, Advantages, Hard Constraints, Preferences, and risk
tolerance; searches broadly for Costly Problems; tests the resulting Opportunities
against evidence and your constraints; and preserves the reasoning behind its
conclusion.

The intended user is a solo developer who wants a more defensible answer than a list
of unsupported Opportunities, while retaining control over private context, research
spend, restricted sources, and any action that could affect another person or the
market.

## What the Scout does—and does not do

The Scout performs **opportunity discovery**. It looks for a specific customer with a
specific costly problem in a specific situation, then asks whether the evidence
supports a plausible, solo-feasible route to your Commercial Outcome Target. It does
not start from a familiar industry list or a proposed product and work backward to a
justification.

A Leading Opportunity is promising enough to validate. It is **not a validated
business**. A Scouting Campaign does not contact prospective customers, publish an
offer, collect personal data, accept money, or otherwise perform an External
Validation Action. Its terminal Value Hypothesis is deliberately provisional, not a
product specification: the Scout does not settle features, interfaces, architecture,
positioning, a roadmap, or an implementation plan.

If you want to turn an Opportunity Brief into a product-planning effort, you can
invoke [Wayfinder](https://github.com/mattpocock/skills) separately. Wayfinder is an
optional downstream tool, not a dependency, and Solo Venture Scout never starts it
automatically.

## Install

You need:

- Codex in the ChatGPT desktop app, Codex CLI, or the Codex IDE extension;
- Node.js 24.x; and
- at least one available, lawful route for retrieving public material.

The repository currently builds a standalone skill and a skills-only plugin. The
standalone skill is the simplest local installation. From a checkout:

```bash
git clone https://github.com/Yorkshireman/solo-venture-scout.git
cd solo-venture-scout
npm ci
npm run build
mkdir -p ~/.agents/skills
if test -e ~/.agents/skills/solo-venture-scout; then
  echo "Solo Venture Scout is already installed; preserve or remove it before continuing."
else
  cp -R dist/standalone/solo-venture-scout ~/.agents/skills/solo-venture-scout
fi
```

The conditional deliberately avoids replacing an existing installation. Move or
remove an older copy only after preserving any version you still need.

Codex discovers personal skills under `~/.agents/skills`. If the skill does not
appear in `/skills` after installation, restart Codex. See the official
[Codex skills documentation](https://developers.openai.com/codex/skills/) for other
supported scopes and installation locations.

## Start or resume a Campaign

Solo Venture Scout is explicit-invocation-only. Start it by mentioning the skill by
name:

```text
$solo-venture-scout Start a Scouting Campaign. Use /absolute/path/to/existing-storage
for storage and /absolute/path/to/existing-storage/my-campaign as the Campaign path.
```

The Scout shows the current working directory and completes a preflight before it
creates Campaign state. The storage directory must already exist. The final Campaign
path must be explicit and must not already exist.

Resume later from the Campaign directory, not from conversation memory:

```text
$solo-venture-scout Resume the Scouting Campaign at
/absolute/path/to/existing-storage/my-campaign.
```

You can start in a fresh Codex session. The Campaign directory contains the history,
checkpoint, lease, current Work View, and generated artifacts needed to continue.

## How a Scouting Campaign works

1. **Preflight.** The Scout checks Node 24.x, the chosen writable storage directory,
   available public-retrieval routes, and the independent contract versions. No
   Campaign state is created during this check.
2. **Campaign Intake.** You confirm a dated snapshot of your Developer Profile, a
   concrete Commercial Outcome Target, Hard Constraints, weighted Preferences,
   Advantages, risk tolerance, and a Research Budget. Public Research cannot begin
   before explicit confirmation.
3. **Broad discovery.** Bounded Discovery Sweeps use heterogeneous external maps of
   economic activity and problem signals. Discovery Tranches reserve one-fifth of
   their capacity for evidence-neutral Novelty Probes, preventing familiar-domain
   bias without granting speculation evidential credit.
4. **Opportunity formation.** An Exploration Thread becomes an Opportunity only when
   evidence identifies a specific customer, situation, and Costly Problem. Formation
   requires independent Source Lineages and a behavioral Problem Signal.
5. **Gates and deepening.** Exclusion Gates fail only on affirmative evidence;
   Qualification Gates pass only on affirmative evidence. Missing evidence stays
   visible as unresolved. Once the Breadth Gate justifies narrowing, most ordinary
   research deepens Opportunities while an open-world discovery allowance remains.
6. **Comparison and challenge.** Eligible Opportunities are compared qualitatively by
   Required Input, Potential Output, Outcome Uncertainty, Input–Output Asymmetry, and
   your confirmed Preferences and Advantages. The Scout does not use a magic score or
   an invented probability. A protected adversarial reserve must challenge an
   apparent leader before it can be recommended.
7. **Terminal handoff.** The Campaign ends honestly with one of the artifact variants
   below. No Qualifying Opportunity and inconclusive comparison are successful
   outcomes, not exceptions.

### Research Budget

A Research Budget is an enforceable ceiling, not a quota. It limits Sources,
Discovery Sweeps, comparison breadth, Opportunity depth, and paid spend. Twenty
percent of every named profile's Source cap is protected for the final adversarial
challenge.

| Profile | Sources | Discovery Sweeps | Minimum Source Families | Deepened Opportunities | Minimum comparison set | Adversarial Sources |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Quick | 30 | 4 | 3 | 2 | 2 | 6 |
| Standard | 100 | 8 | 5 | 4 | 3 | 20 |
| Deep | 250 | 14 | 7 | 6 | 4 | 50 |

A custom budget requires every limit to be stated explicitly and reserves
`ceil(Source cap × 0.2)` Sources for adversarial research. Paid spend defaults to zero
only after that visible default is explicitly confirmed.

### Approval boundaries

After Campaign Intake, lawful read-only Public Research can proceed autonomously
within the Research Budget. The Scout pauses at boundaries that need your authority:

- authenticated, restricted, or paid research needs a time-bounded Research Approval
  for the exact Source, purpose, access method, retained data, maximum cost, and
  duration;
- deep research or recommendation in an Elevated-Risk Market needs
  Opportunity-specific approval;
- a revised Campaign Intake and a forward migration of an older Campaign each need
  explicit confirmation; and
- an inconclusive comparison waits for an explicit choice to stop, extend targeted
  research, or select one or more Non-Dominated Opportunities.

Silence, an informational question, or a general instruction to continue never counts
as consent. A Research Approval can authorize only read-only research. It cannot
authorize unlawful activity or an External Validation Action such as outreach,
publishing, form submission, account changes, personal-data collection, or accepting
money.

### The four terminal artifact variants

| Outcome | Artifact | Meaning |
| --- | --- | --- |
| Defensible leader | `opportunity-brief.md` | One Leading Opportunity survived comparison and adversarial challenge. |
| No Qualifying Opportunity | `no-qualifying-opportunity-report.md` | No Opportunity became eligible within the Research Budget; rejected and unresolved Opportunities remain distinct. |
| Inconclusive, then stop | `inconclusive-comparison-report.md` | The evidence did not justify a stand-out leader, so the unscored comparison and its blockers are preserved unchanged. |
| Inconclusive, then select | `inconclusive-comparison-report.md` plus one `opportunity-brief-<opportunity-id>.md` per selection | Your choice is recorded as developer Preference, not market evidence; each brief is marked Developer-Selected rather than Leading. |

Choosing **extend** after an inconclusive comparison is intentionally not terminal. It
creates a new Campaign Intake version and Research Budget and resumes only the
targeted Evidence Gaps.

## Campaign privacy and local state

Campaigns are self-contained directories at paths you choose. On POSIX systems, the
kernel creates the directory with mode `0700` and its artifacts with mode `0600`.
Campaign files can contain private constraints, source metadata, research, and
commercial reasoning, so treat the entire directory as sensitive.

These permissions are not encryption and do not override filesystem sharing, backup,
or cloud-sync policy. If you place a Campaign inside a Git repository, Git may expose
it as untracked content. Add an appropriate ignore rule yourself before creation if
needed. The Scout never stages or commits Campaign data and never edits ignore rules
without a separate request.

The persisted research contract minimizes data: it accepts precise Source metadata
and atomic neutral paraphrases, but has no fields for credentials, payment details,
raw retrieved content, or active instructions. Restricted-source access still occurs
outside the kernel and only within the approved scope.

## For developers

### Coordinator and Campaign State Kernel

The shipped skill is a coordinator around a deterministic Campaign State Kernel.
Their boundary is the central design choice:

- [`skill/solo-venture-scout/SKILL.md`](skill/solo-venture-scout/SKILL.md) tells
  the coordinator how to interact with the developer, retrieve and interpret
  research, make semantic judgments, and decide what command to propose next.
- [`src/kernel.ts`](src/kernel.ts) accepts one versioned JSON command on standard
  input and returns one JSON response on standard output. It owns validation,
  permission gates, budgets, state transitions, leases, idempotency, integrity, and
  deterministic artifact rendering.

The coordinator is deliberately capable of judgment but not authoritative mutation.
The kernel is deliberately authoritative but incapable of browsing or deciding what
market evidence means. This costs more schema and orchestration code than a prompt
that edits files directly, but it puts irreversible state changes behind a narrow,
testable interface and keeps untrusted retrieved content away from the mutation path.

### Append-only authority and projections

`records.jsonl` is the Campaign's authority. Each mutation records a durable operation
intent and outcome with stable request identities, sequences, command digests, and
record integrity digests. The manifest anchors the authoritative record count and
history digest. Corrections, re-evaluations, and terminal supersessions append new
records; they do not erase the decision basis that existed earlier.

Files such as `work-view.json`, `campaign-intake.json`, `research-budget.json`,
`evidence-ledger.json`, checkpoints, leases, and Markdown reports are projections.
They make normal work bounded and comprehensible, but they are not the source of
truth. The kernel validates or deterministically rebuilds them from authority.

This arrangement favors auditability and recovery over storage compactness. JSONL is
easy to inspect and preserve, while replay and versioned projection logic are more
work than updating one mutable document. The Work View keeps that cost off the normal
agent path: it exposes current work and stable pointers without loading the complete
Evidence Ledger into context.

### Evidence semantics

The data model prevents several persuasive-sounding shortcuts:

- a **Source** is provenance, and an **Observation** is only a neutral statement of
  what that Source says;
- an **Inference** must expose supporting and challenging evidence, scope, reasoning,
  confidence, and limiting factors;
- an **Assumption** receives no evidential credit and must link to an Evidence Gap;
- Source Lineage prevents syndicated reports or a shared dataset from masquerading as
  independent evidence; and
- Contradictions and Corrections remain explicit and traceable.

These distinctions make commands verbose, but they stop citation count, confident
wording, or absent evidence from silently turning into proof. The same philosophy
drives asymmetric gates: an Exclusion Gate needs evidence to reject, while a
Qualification Gate needs evidence to pass.

### Deterministic command seam

The bundled `scripts/scout-kernel.mjs` is the public machine seam. Every call is a
single command envelope with its own contract version and stable request ID. Identical
replays are idempotent; reusing an identity with changed input is rejected. Structured
errors include an action, allowing the coordinator to stop or recover without parsing
log prose.

The kernel also centralizes concurrency and time boundaries. An exclusive coordinator
lease prevents concurrent Campaign mutation, and the implementation compares relevant
times rather than trusting a caller to backdate an approval or bypass another lease.
Keeping this seam deterministic makes failures reproducible, at the cost of requiring
the coordinator to translate rich interaction and research into strict commands.

### Behavioral evaluation seam

Tests exercise the same generated skill that ships. They build an isolated standalone
tree, invoke the bundled kernel as a subprocess, and assert on its public JSON response
and persisted Campaign. They do not call private transition helpers. Instruction tests
separately inspect the packaged `SKILL.md` and references for user-visible behavioral
contracts such as privacy warnings, approval pauses, evidence rules, and terminal
choices.

That gives the project two complementary behavioral seams: deterministic state
behavior at the command boundary and coordinator behavior at the packaged instruction
boundary. The latter cannot prove that every model run will be identical, but it can
prevent critical constraints from disappearing from the artifact the host actually
loads.

### Recovery and compatibility

Before appending authority, a mutation writes a private operation journal. Resume can
complete a durable intent interrupted around the authoritative append, restore the
manifest anchor, regenerate projections and terminal Markdown, and then take a new
lease. Stable request identities make retry safe without pretending that ambiguous
external research or payment can be repeated.

Recovery fails closed when authority is missing, corrupt, truncated, or manually
changed. It preserves the Campaign and returns reconciliation or trusted-snapshot
options rather than inventing records or discarding a damaged tail. Supported older
Campaigns receive a visible, forward-only migration plan; migration requires explicit
confirmation bound to the exact source-authority digest and creates its own snapshot
and step journal. Unsupported newer contracts stop before mutation.

The trade-off is conservative interruption handling: some cases require a person to
resolve whether restricted access or a charge completed. That pause is preferable to
duplicating an external effect or manufacturing a clean-looking history.

### Source and generated packaging boundary

Do not edit `dist/`. It is generated and ignored by Git.

The source skill lives under [`skill/solo-venture-scout/`](skill/solo-venture-scout/),
the kernel under [`src/`](src/), and independent contract versions in
[`release/contracts.json`](release/contracts.json). `npm run build` copies the source
skill into both distributions, bundles the TypeScript kernel as
`scripts/scout-kernel.mjs`, injects `references/versions.json`, and creates the plugin
manifest.

The generated trees are:

- `dist/standalone/solo-venture-scout/` — the directly installable skill;
- `dist/plugin/solo-venture-scout/` — a skills-only plugin with
  `.codex-plugin/plugin.json`; and
- `dist/packages/` — versioned standalone and plugin `.tgz` archives created by
  `npm run package`.

Package validation checks that the standalone and plugin skill trees are
byte-identical, that metadata and all contract versions agree, that the kernel has its
Node shebang, and that both archives contain the expected layouts. The behavioral test
suite executes the generated kernel through Node. Together these checks avoid
source/generated drift, while accepting that every release must regenerate and verify
artifacts rather than hand-edit them.

### Development and release commands

Install the locked development dependencies:

```bash
npm ci
```

Run one behavioral test file while working:

```bash
node --test test/preflight.test.mjs
```

Run the supported checks and build stages:

```bash
npm run typecheck
npm test
npm run build
npm run package
npm run validate:packages
```

`validate:packages` expects generated archives, so run `npm run package` first. Before
release, run the complete pipeline:

```bash
npm run verify:release
```

That command typechecks, runs the full test suite, rebuilds both distributions,
creates both archives, and validates the artifacts that would ship.

## License

[MIT](skill/solo-venture-scout/LICENSE)
