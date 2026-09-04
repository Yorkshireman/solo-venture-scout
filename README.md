# Solo Venture Scout

Most lists of software ideas begin with guesses. Solo Venture Scout begins with
evidence: where people are already losing money, wasting skilled time, taking
operational risk, or paying for awkward workarounds.

It is a Codex skill for solo software developers who want to decide what is worth
validating before they spend months building it. The Scout searches broadly, checks
what it finds against your goals and limits, and explains why each possibility was
kept, rejected, or left uncertain.

A Codex skill is a reusable workflow that you invoke in a Codex conversation. Solo
Venture Scout runs inside Codex; it is not a separate desktop application or hosted
service.

The Scout calls one investigation a **Scouting Campaign**. Think of it as a private
research folder with an audit trail. It can run across multiple Codex sessions without
depending on chat history, and its research allowance keeps the investigation from
expanding forever.

## What you get

The Scout looks for an **Opportunity**: a particular kind of customer experiencing a
costly problem in a particular situation. It does not simply brainstorm products or
confine the search to industries you already know.

At the end, you receive one or more Markdown documents explaining one of four honest
results:

- one opportunity is clearly the strongest candidate for real-world validation;
- nothing found enough support within the research allowance;
- several candidates remain, but the evidence cannot justify choosing one; or
- after an inconclusive result, you choose one or more candidates yourself.

Every result includes the evidence, uncertainty, trade-offs, and links back to the
recorded research behind it. “Nothing qualified” and “the comparison is inconclusive”
are useful conclusions, not failed runs.

## What it does not do

Solo Venture Scout discovers opportunities; it does not validate demand in the real
world. It does not contact potential customers, publish an offer, submit forms,
collect personal data, change accounts, or accept money. The project calls those
market-facing steps **External Validation Actions**.

It also does not design the product. Even its strongest result contains only a
provisional statement of the customer outcome worth testing—not features, screens,
architecture, positioning, estimates, or a roadmap.

If you want to plan a product after reading the result, you can invoke
[Wayfinder](https://github.com/mattpocock/skills) separately. Wayfinder is optional,
is not required to run Solo Venture Scout, and is never started automatically.

## Install

You need:

- Codex in the ChatGPT desktop app, Codex CLI, or the Codex IDE extension;
- Node.js 24.x; and
- a Codex tool that can read public web pages without bypassing access controls or
  site rules.

The repository can produce a personal skill installation and a plugin bundle for
distribution. Most people will want the personal installation. From a checkout:

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

## Start a Campaign

Solo Venture Scout does not start itself when you discuss business ideas. You must
mention the skill by name:

```text
$solo-venture-scout Start a Scouting Campaign. Use /absolute/path/to/existing-storage
for storage and /absolute/path/to/existing-storage/my-campaign as the Campaign path.
```

The first path is an existing folder where Campaigns may be stored. The second is the
new folder for this Campaign; it must not already exist. Before writing anything, the
Scout shows the current working directory and checks that Node, storage, and public
web-research tools are ready.

It then asks about:

- the amount you want the business to earn, how that is measured, and by when;
- the time and money you can commit;
- your skills, access, and existing advantages;
- your must-not-cross constraints, preferences, and tolerance for risk; and
- how much research the Scout may perform.

You see and explicitly confirm a summary before research begins. The project calls
this agreed starting point the **Campaign Intake**.

## Resume a Campaign

Resume from the Campaign folder rather than relying on conversation memory:

```text
$solo-venture-scout Resume the Scouting Campaign at
/absolute/path/to/existing-storage/my-campaign.
```

You can do this in a fresh Codex session. The folder contains the saved history and a
rebuilt summary of the current position (the **Work View**), so the Scout can report
what is finished, what is paused, and what it may do next.

If an earlier operation was interrupted, resumption finishes or reconciles the safely
recorded work before continuing. It will not guess its way past damaged history, a
newer file format, an unresolved approval, or another active session.

## What happens during a Campaign

1. **Agree on the target and boundaries.** You confirm the Campaign Intake described
   above. Research cannot begin before that confirmation.
2. **Search beyond the obvious.** The Scout samples several kinds of public sources
   and deliberately spends some discovery effort looking outside familiar patterns.
   Speculative leads receive no credit until evidence supports them.
3. **Turn signals into candidates.** A complaint or feature request is only a clue.
   Before creating an Opportunity, the Scout looks for a material consequence and
   committed behavior—such as spending, workaround effort, switching, or escalation—
   supported by at least two genuinely independent lines of evidence.
4. **Try to disqualify and qualify each candidate.** The Scout needs evidence before
   rejecting a candidate, and evidence before declaring one eligible. Missing or
   conflicting evidence remains visible instead of being quietly treated as a yes or
   no.
5. **Compare the survivors.** It considers the time, cash, sales effort, operating
   burden, downside, plausible upside, uncertainty, and fit with your preferences. It
   does not hide those trade-offs inside a weighted score or made-up probability.
6. **Challenge the Leading Opportunity.** Part of the research allowance is saved
   specifically to look for reasons the apparent Leading Opportunity is wrong or
   another Eligible Opportunity is stronger.
7. **Write the result.** The final document is generated from the recorded history so
   it can be checked and reproduced.

## Choose the research depth

The **Research Budget** is the Campaign's research allowance. It is a maximum, not a
target the Scout must use up. Choose Quick for a short scan, Standard for a broader
comparison, or Deep when you want more candidates investigated in detail.

| Profile | Maximum sources | Candidates researched deeply |
| --- | ---: | ---: |
| Quick | 30 | 2 |
| Standard | 100 | 4 |
| Deep | 250 | 6 |

<details>
<summary>Exact limits used for reproducible Campaigns</summary>

Each profile also controls how widely the Scout searches, the variety of sources it
must use, the minimum comparison size, and the research saved to challenge an apparent
Leading Opportunity.

| Profile | Source cap | Discovery Sweep cap (broad searches) | Source Family minimum (different source types) | Deepened Opportunity cap | Minimum comparison set | Adversarial Source reserve |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Quick | 30 | 4 | 3 | 2 | 2 | 6 |
| Standard | 100 | 8 | 5 | 4 | 3 | 20 |
| Deep | 250 | 14 | 7 | 6 | 4 | 50 |

</details>

Twenty percent of the source limit is protected for the final challenge. A custom
budget requires every limit to be stated explicitly and rounds that protected amount
up to the next whole source. Paid research starts at zero; even that default is shown
for you to confirm rather than being assumed.

## When the Scout asks permission

Once you confirm the Campaign Intake, the Scout may read lawful public sources without
asking about every page. It stays inside the Research Budget and does not take actions
on those sites.

It pauses and asks before:

- using a signed-in, restricted, or paid source;
- spending any money;
- researching a candidate deeply or recommending it in a legally, regulatorily, or
  otherwise elevated-risk market;
- changing the agreed Campaign Intake;
- migrating an older Campaign format; or
- acting on an inconclusive comparison.

For restricted or paid research, the approval shows the exact source, purpose, access
method, data to be read and kept, maximum cost, duration, risks, and alternatives. It
is valid only for that unchanged scope. Silence, a question, or “continue” does not
mean yes.

Permission for research never authorizes unlawful activity or a market-facing action
such as outreach, publishing, submitting a form, changing an account, collecting
personal data, or accepting money.

## The four possible final results

| Result | File | What it means |
| --- | --- | --- |
| A clear front-runner | `opportunity-brief.md` | One candidate survived comparison and a deliberate attempt to disprove it. The document calls it the **Leading Opportunity**, meaning “ready to validate,” not “validated.” |
| Nothing qualified | `no-qualifying-opportunity-report.md` | Nothing gathered enough support within the Research Budget. The report separates candidates disproved by evidence from candidates that simply remain uncertain. |
| No clear winner; you stop | `inconclusive-comparison-report.md` | The report preserves the surviving candidates side by side and explains their trade-offs. It names blockers and unanswered evidence questions when present; a genuine evidence-complete tie may have neither. |
| No clear winner; you choose | The comparison report plus one `opportunity-brief-<opportunity-id>.md` for each choice | Your choices are clearly marked **Developer-Selected**. The Scout does not pretend that your preference was market evidence or that it discovered a Leading Opportunity. |

There is also a non-final option after an inconclusive comparison: you can extend the
Campaign with a new Research Budget aimed only at the unanswered questions that could
change the result.

## Privacy

The Campaign is stored in a self-contained folder at the path you choose. On macOS and
Linux, the Scout restricts that folder and its files to the current user. The files can
still contain private constraints, source details, research, and commercial reasoning,
so treat the whole folder as sensitive.

The folder permissions are not encryption and do not override filesystem sharing,
backup, or cloud-sync settings. If you put a Campaign inside a Git repository, Git may
show it as untracked content. Add an appropriate ignore rule yourself before creating
it if needed. The Scout never stages or commits Campaign files and does not edit ignore
rules unless you separately ask it to.

The Scout stores source details and short, neutral summaries rather than complete web
pages. Its storage format has no fields for passwords, payment details, or raw
restricted content. Access to a restricted source happens outside the Campaign's state
engine and only within the scope you approved.

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
choices. Release qualification additionally runs the generated skill in controlled
single-coordinator Codex sessions and sends each transcript plus its persisted Campaign
to a separate calibrated evaluator.

That gives the project two complementary behavioral seams: deterministic state
behavior at the command boundary and independently repeated coordinator behavior at
the packaged instruction boundary. Model runs need not use identical wording, but all
forced outcomes and zero-tolerance invariants must hold and every rubric dimension must
remain at least acceptable.

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

Run the supported development checks and build stages:

```bash
npm run typecheck
npm test
npm run build
npm run package
npm run validate:packages
```

`validate:packages` expects generated archives, so run `npm run package` first.

### 1.0.0 release qualification

The only certified 1.0.0 profile is `codex-local-web`: one coordinator using
`gpt-5.6-sol` at Extra High in a local Codex workspace on macOS arm64, Node.js 24.x,
and the `codex-web-search` public-retrieval method. Claude Code packaging is
structural-only, not behaviorally certified. Other hosts and retrieval methods are not
implied by the standalone layout; see
[`release/compatibility-matrix.json`](release/compatibility-matrix.json).

Build the candidate, then record the model-backed gates once:

```bash
npm run build
npm run acceptance:controlled
npm run acceptance:live
```

`acceptance:controlled` calibrates the separate evaluator and records three independent runs
of every controlled scenario. Each coordinator run uses the exact generated skill;
the harness deterministically prepares the Campaign immediately before the boundary under
test, and its evaluator receives the hidden expected boundary and persisted Campaign only
after the run. Each record includes the complete scenario-input digest, exact precondition
name and record sequence, and matching declared-versus-persisted Campaign Intake,
Evidence, and Work View digests. This binds the declared input to the authoritative
boundary and keeps deterministic fixture work from being attributed to the coordinator.
Runs use bounded concurrency (three by default; set
`SVS_ACCEPTANCE_CONCURRENCY` from 1 through 8). The JSONL ledger is append-only, including
process failures. A rerun does not erase a genuine failure, and an existing
scenario/repetition cannot be replaced. A failed release needs a new suite or release
version rather than selective deletion.

The live gate checks every claimed retrieval method with multiple independent public
Sources, resolving citations, provenance, freshness, claim separation, hostile-content
resistance, and no approval-gated action. The harness independently re-fetches the required
official host/path, matches contract-pinned content markers, hashes the response, traces
each required claim to its Source, and audits read-only retrieval-tool events. A separate
fresh evaluator session then adjudicates the transcript for prompt-injection resistance,
secret disclosure, persistence of hostile instructions, and approval-gated side effects;
an independently checked synthetic canary also fails the run if it appears in observable
output. The retrieval session's own safety claims cannot pass that gate. An outage is inconclusive and must be rerun
only under a new suite or release version: the current append-only ledger records the
failed attempt and never converts it into a pass.

After those one-time ledgers exist, run the complete deterministic and artifact
pipeline:

```bash
npm run verify:release
```

That command typechecks, records the deterministic suites, runs the full test suite,
builds each archive twice, validates compatibility against the live result, writes the
version policy evidence, and emits `dist/release/acceptance-report.json` plus
`dist/release/ACCEPTANCE.md`. It fails closed if any evidence is missing, malformed,
failed, duplicated, stale, or mismatched.

The release companions are `CHECKSUMS.sha256`, `dependency-inventory.json`, `LICENSE`,
`NOTICE`, `compatibility-matrix.json`, and `release-manifest.json`. They sit beside the
standalone and plugin archives under `dist/`.

Candidate metadata saying `1.0.0` is not an official release. Do not create or publish
the annotated `v1.0.0` tag until every non-tag gate passes on a clean commit. Attach the
tag to that exact commit, rerun `npm run acceptance:qualify`, and publish only when the
official report says `qualified: true`. Never move or replace the official tag.

## License

[MIT](skill/solo-venture-scout/LICENSE)
