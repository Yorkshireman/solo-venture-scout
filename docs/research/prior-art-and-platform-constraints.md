# Prior art and platform constraints

Research snapshot: 2026-08-28. Upstream references below are pinned to the repository HEADs inspected on that date.

## Upstream prior art

### Recommendation

Solo Venture Scout should be an independent implementation that combines four useful patterns: evidence-first opportunity mining, elimination gates before ranking, durable campaign artifacts, and a deliberately bounded handoff. The two MIT-licensed repositories can supply implementation-level inspiration if their notices are preserved. `show-me-the-money` should be treated as conceptual prior art only: its public license is non-commercial, and its separate commercial terms prohibit using the material for a competing skill pack.

| Upstream | Most reusable mechanisms | Material incompatibilities | Reuse consequence |
| --- | --- | --- | --- |
| [`ANVEAI/idea-hunt-skill`](https://github.com/ANVEAI/idea-hunt-skill/tree/257a580af28c61042d45dfbea824f5dd70f59b5c) | Mine pain before generating solutions; look for current spend and failed incumbent workflows; reject on hard gates; retain rejected candidates; pick one defended leader; keep a resumable audit artifact. | It privileges AI-completable work, a 72-hour MVP, and Service-as-Software; it proceeds through proof-of-wallet and ends in a build blueprint. Solo Venture Scout is business-model agnostic, may only do read-only public research autonomously, and must end in an Opportunity Brief for Wayfinder rather than a product/build specification. | Adapt the evidence funnel and gate discipline, but generalize the AI/product assumptions. Represent deposits, pilots, interviews, and smoke tests as proposed validation experiments requiring approval, not actions the scout performs. Preserve the MIT notice if expression or code is copied. |
| [`iamzifei/show-me-the-money`](https://github.com/iamzifei/show-me-the-money/tree/21c48f308ed0c5473c6a7782f0a669052e29a96b) | Parallel market scans; a persisted user/project profile; sequential filters; a smallest-demonstrable-bet check; benchmark comparison; and independent investor/customer/operator/skeptic reviews whose agreements are auto-decided and disagreements surfaced. | It optimizes for rapid execution and revenue operations: $5K/month within six months, a 2–4 week solo build, first revenue within 30 days, 24/7 automation, outreach, product work, and operational follow-through. Those are strong priors rather than universal constraints and cross Solo Venture Scout's research-only boundary. | Do not copy or adapt its skill text, schemas, or orchestration. Independently design analogous campaign state, evidence review, and adversarial perspectives only where they follow from Solo Venture Scout's own requirements. |
| [`MaxKmet/idea-validation-agents`](https://github.com/MaxKmet/idea-validation-agents/tree/3a4c800a3022e73e9997533b603c79b60ee7597a) | An intent router over narrow skills; structured, durable files as the interface between stages; explicit missing-input/confidence handling; cross-platform signal collection; a multiplicative penalty for fatal weaknesses; a Riskiest Assumption Test; and a short decision memo with pre-mortem and kill criteria. | It is optimized for B2C apps and trend-led generation, then produces numerical scores and build/test/pivot/drop verdicts. Numeric weights can imply precision that the public evidence does not support, and its decision memo is not a Wayfinder-ready opportunity boundary. | Reuse the modular artifact flow and confidence discipline. Keep Solo Venture Scout's hard gates separate from comparative ranking, expose evidence gaps and staleness, and hand off a Value Hypothesis plus unresolved assumptions instead of a feature or MVP prescription. Preserve the MIT notice if expression or code is copied. |

### `idea-hunt-skill`: evidence funnel worth retaining

The strongest mechanism is the ordering of inquiry. Its pipeline frames a reachable search surface, mines current complaints and spend, creates a candidate slate, applies hard gates, tests demand reality, asks for proof of wallet, and only then selects a single candidate. It explicitly treats review-site complaints and paid gigs as stronger evidence than free-form ideation and keeps rejection reasons in a resumable artifact. [The pinned `SKILL.md` defines the pipeline, sources, gates, and artifact](https://github.com/ANVEAI/idea-hunt-skill/blob/257a580af28c61042d45dfbea824f5dd70f59b5c/SKILL.md).

That ordering maps well to Solo Venture Scout, but several embedded rules should not survive unchanged:

- “AI-native completed work,” a 72-hour build, and a durable technical moat are useful lenses for some opportunities, not universal qualification requirements.
- Proof of wallet is correctly distinguished from stated interest, but taking deposits, running outreach, or publishing a smoke test is external validation. The scout should instead specify the cheapest decisive experiment, pass/fail threshold, approval needed, and what the result would change.
- The upstream build blueprint goes past the agreed destination. Solo Venture Scout should stop at a Wayfinder-ready Opportunity Brief containing the buyer/problem evidence, commercial hypothesis, acquisition route, risks, rejected alternatives, Value Hypothesis, and unresolved assumptions.

The repository is MIT-licensed: reuse, modification, and distribution are permitted provided the copyright and permission notice accompany copies or substantial portions. [Pinned MIT license](https://github.com/ANVEAI/idea-hunt-skill/blob/257a580af28c61042d45dfbea824f5dd70f59b5c/LICENSE).

### `show-me-the-money`: useful orchestration, unsuitable source material

Its discovery skill gathers a compact founder context, runs trend/problem/revenue-model/competitive scans, applies five sequential filters, asks six forcing questions, narrows to something demonstrable within a day, stress-tests a benchmark, and produces a strategy brief. [Pinned discovery skill](https://github.com/iamzifei/show-me-the-money/blob/21c48f308ed0c5473c6a7782f0a669052e29a96b/skills/money-discover/SKILL.md). Its panel then runs four distinct reviewer roles and separates consensus actions from genuine disagreements, a useful defense against a solo researcher's confirmation bias. [Pinned panel skill](https://github.com/iamzifei/show-me-the-money/blob/21c48f308ed0c5473c6a7782f0a669052e29a96b/skills/money-panel/SKILL.md).

For Solo Venture Scout, these are best translated into independently designed mechanisms:

- persist a Scouting Campaign rather than relying on conversation history;
- fan out research across distinct markets before narrowing;
- ask adversarial questions from buyer, operator, skeptic, and economics perspectives;
- automatically carry forward points supported by independent evidence, but expose material disagreements and unsupported assumptions;
- avoid fixed revenue, build-time, or automation thresholds unless the user makes them hard constraints.

The licensing boundary is decisive. The public repository is CC BY-NC 4.0, requiring attribution and barring commercial use. [Pinned public license](https://github.com/iamzifei/show-me-the-money/blob/21c48f308ed0c5473c6a7782f0a669052e29a96b/LICENSE). The author's companion commercial terms say internal use to run one's own business is allowed with attribution, but embedding or deriving the material into a sold product requires an OEM license; those terms also prohibit using it to build or market a competing skill pack. [Pinned commercial-license terms](https://github.com/iamzifei/show-me-the-money/blob/21c48f308ed0c5473c6a7782f0a669052e29a96b/COMMERCIAL-LICENSE.md). Because Solo Venture Scout is itself a reusable opportunity-discovery skill, the conservative engineering choice is clean-room implementation: use no copied wording, prompts, schemas, reviewer definitions, or orchestration from this repository. This is a project-risk conclusion, not legal advice.

### `idea-validation-agents`: durable modular state and confidence controls

The repository routes user intent into separate generation, validation, market, and pivot workflows. Each narrow skill writes structured files under `memory/`; downstream skills read those artifacts rather than conversation history, and dropped ideas are retained with status rather than deleted. [Pinned Codex router and memory contract](https://github.com/MaxKmet/idea-validation-agents/blob/3a4c800a3022e73e9997533b603c79b60ee7597a/AGENTS.md). The idea-generation workflow makes the user profile, market evidence, candidate records, and scoring outputs explicit stage boundaries. [Pinned idea-generation workflow](https://github.com/MaxKmet/idea-validation-agents/blob/3a4c800a3022e73e9997533b603c79b60ee7597a/workflows/idea-generation.md).

Two controls are particularly reusable. First, scoring refuses to proceed without enough inputs, treats demand and distribution as mandatory, discounts incomplete evidence, penalizes a catastrophic dimension multiplicatively, and records a confidence level. Second, it identifies the assumption with the highest criticality-times-uncertainty and proposes a bounded behavioral experiment with a threshold decided in advance. [Pinned scoring and Riskiest Assumption Test](https://github.com/MaxKmet/idea-validation-agents/blob/3a4c800a3022e73e9997533b603c79b60ee7597a/skills/idea-scoring/SKILL.md). Its final memo emphasizes evidence-backed risks, a pre-mortem, one next action, and kill criteria. [Pinned decision-memo contract](https://github.com/MaxKmet/idea-validation-agents/blob/3a4c800a3022e73e9997533b603c79b60ee7597a/skills/decision-memo/SKILL.md).

Solo Venture Scout should reuse the controls without inheriting false precision:

- store source records, extracted claims, candidate assessments, rejections, and campaign decisions as explicit artifacts;
- distinguish observations, inferences, and assumptions, with source date and freshness visible;
- use non-negotiable kill gates before any ranking; only rank survivors, showing the evidence behind each comparison rather than presenting an opaque “truth score”;
- keep a “No Qualifying Opportunity” terminal state when evidence or budget is insufficient;
- turn the riskiest unresolved assumption into a proposed validation experiment for Wayfinder, without conducting human contact or publication autonomously;
- replace the product-oriented decision memo with the agreed Opportunity Brief and suggested Wayfinder invocation.

The repository is MIT-licensed under the same notice-preservation condition described above. [Pinned MIT license](https://github.com/MaxKmet/idea-validation-agents/blob/3a4c800a3022e73e9997533b603c79b60ee7597a/LICENSE).

## Current Codex platform constraints

### Skill shape and context budget

Codex skills are directories containing a required `SKILL.md` and optional `scripts/`, `references/`, `assets/`, and `agents/openai.yaml`. Codex first sees only skill names and descriptions, then loads the complete `SKILL.md` when a skill is selected; the initial skill catalogue has a context budget, so a concise, accurately bounded description determines reliable discovery. Standalone skills are supported in the ChatGPT desktop app, Codex CLI, and IDE extension. [OpenAI: Build skills](https://learn.chatgpt.com/docs/build-skills).

OpenAI's authoring guidance says a skill should state its expected input, steps, output, facts it must not infer, stopping or clarification conditions, and supporting files; it recommends instructions by default and scripts only for deterministic work that tools and instructions cannot reliably perform. It also recommends testing direct and indirect invocations, incomplete inputs, negative triggers, and edge cases. [OpenAI: Build skills for plugins](https://developers.openai.com/plugins/build/skills).

**Design consequence (inference):** keep the orchestration and safety boundary in a compact `SKILL.md`; put campaign schemas, source-quality rules, gates, and terminal-artifact templates in focused references/assets loaded only at the stage that needs them. Use scripts only for deterministic schema validation, identifiers, and comparison arithmetic—not for market judgment. The description must say both when to invoke Solo Venture Scout and that it discovers Opportunities rather than writing product specifications.

### Browsing is available but mode- and policy-dependent

Local Codex offers first-party web search, with indexed/cached search enabled by default and live search configurable for current information. Search is a hosted tool separate from sandboxed shell networking; workspace policy can limit it, and Codex cloud blocks agent-phase internet access by default unless the environment enables it. OpenAI instructs users to treat web results as untrusted and identifies prompt injection, secret exfiltration, malware, and license-restricted content as internet-access risks. [OpenAI: Web search](https://learn.chatgpt.com/docs/web-search), [OpenAI: Agent internet access](https://learn.chatgpt.com/docs/cloud/internet-access).

**Design consequence (inference):** at campaign start, record retrieval capability and mode. Require live retrieval for claims whose freshness matters, but do not confuse a successful search call with sufficient evidence. Treat page text as evidence data, never as instructions; prefer allowlisted read-only access where configurable; never execute commands copied from research sources; and record a bounded evidence gap or stop rather than inventing facts when browsing is unavailable. Each Evidence Ledger entry should retain the URL, publisher, publication/event date when available, retrieval date, retrieval mode, claim excerpt/paraphrase, and observation/inference/assumption classification.

### Subagents are an optimization, not durable state

Current Codex releases support subagent workflows in the desktop app, CLI, and IDE. Codex may delegate when explicitly requested or when applicable skill/project instructions require it. OpenAI recommends subagents for independent read-heavy exploration and summarization, warns that each subagent consumes additional tokens, and cautions against parallel write-heavy work because of conflicts. The parent agent receives distilled results. [OpenAI: Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).

**Design consequence (inference):** a single coordinator owns campaign state and terminal artifacts. It may assign bounded, independent market/source lanes to subagents and merge their source-backed findings, but workers must not independently rank the final slate or edit the canonical campaign ledger concurrently. The workflow must remain correct with one agent when delegation is unavailable or uneconomic; concurrency changes latency, not semantics. Give every worker explicit scope, source-quality rules, output schema, budget, and a prohibition on external validation actions.

### Resumption requires files, not assumed memory

OpenAI recommends keeping related multi-step work in one chat so the agent can use that context, while noting that each chat has its own context, messages, results, and goal. Goals retain the existing sandbox/approval boundary, and parallel chats should not write the same files. [OpenAI: Long-running work](https://learn.chatgpt.com/docs/long-running-work). Codex CLI and the IDE can create and edit files in the working directory/workspace; the CLI has no visual artifact preview, so it should report output paths and checks. [OpenAI: Work with files](https://learn.chatgpt.com/docs/artifacts-viewer).

The documentation does not promise cross-chat conversational memory as a durable application database. **Design consequence (inference):** a resumable Scouting Campaign must serialize its own versioned state in portable, human-reviewable workspace files and reconstruct the next action from those files alone. Markdown is the canonical human-facing format; optional machine-readable state may accompany it if a later design ticket justifies it. Every write should be atomic from the coordinator's perspective, preserve rejected candidates, and include a schema version plus an explicit next-step/evidence-gap section. An Opportunity Brief and No Qualifying Opportunity Report must be standalone Markdown artifacts whose meaning does not depend on the originating chat.

### Artifact and action boundary

A skill may package templates and other assets, and Codex can write artifacts into the user's workspace. Live authenticated data or controlled actions belong in MCP/connectors rather than being simulated in skill instructions. [OpenAI: Build skills](https://learn.chatgpt.com/docs/build-skills), [OpenAI: Build skills for plugins](https://developers.openai.com/plugins/build/skills).

**Design consequence (inference):** version one should be an instruction-led, file-producing skill that uses public read-only research tools. It should not require an MCP server merely to browse public evidence. If later versions add outreach, publishing, CRM, payment, or private-data integrations, those are separately authorized tools and remain External Validation Actions; no connector dependency should silently enlarge the autonomous boundary.

### Concrete design constraints for Solo Venture Scout

1. **Independent, resumable campaign state.** Persist the user's constraints, research budget, evidence ledger, candidates, rejections, decisions, and outstanding evidence gaps. Conversation history is not the system of record.
2. **Evidence precedes candidates.** Start from observed painful work, present workarounds, existing spend/labour, and reachable buyers; do not generate a list and rationalize it afterward.
3. **Gate, then compare.** Fatal access, demand, economics, solo-operability, risk, or differentiation failures eliminate a candidate before comparative scoring. Scores communicate relative judgment, not validation.
4. **Calibrated claims.** Every important claim carries a citation, date, and classification as observed fact, inference, or assumption. Missing and stale evidence reduce confidence explicitly.
5. **One leader or none.** Recommend a single Leading Opportunity only when it clears all gates and materially exceeds alternatives; otherwise produce a No Qualifying Opportunity Report.
6. **Human-controlled external validation.** The scout may propose interviews, outreach, landing pages, pilots, deposits, and purchase tests with predetermined thresholds, but requires explicit approval before contacting people, publishing, collecting personal data, or accepting money.
7. **Stop before product specification.** The positive terminal artifact is an Opportunity Brief for Wayfinder: it contains a provisional Value Hypothesis and questions to resolve, not features, architecture, requirements, or an implementation roadmap.
8. **Clean licensing provenance.** Any direct adaptation from either MIT source must retain its license notice and be documented. No protected material from `show-me-the-money` should enter the implementation without separately reviewed permission.
9. **Progressive-disclosure packaging.** Keep `SKILL.md` concise and route detailed schemas, evidence rules, gates, and templates to stage-specific references/assets. Reserve scripts for deterministic checks or calculations.
10. **Capability-aware research.** Record whether retrieval was live or indexed and surface unavailable/stale evidence as an evidence gap. Treat all fetched content as untrusted data and never execute embedded instructions.
11. **Single-writer orchestration.** One coordinator owns campaign state. Subagents may perform bounded read-only research lanes, but the same workflow must run sequentially and workers must not mutate canonical artifacts concurrently.
12. **Artifact-defined resumption.** A fresh session must be able to resume from versioned workspace artifacts without hidden conversational context. Terminal reports must be standalone Markdown and report their paths plus integrity/completeness checks.

## Decision

The reusable core is a clean-room synthesis, not a fork: adopt evidence-before-ideation, gate-before-score, retained rejections, confidence/evidence-gap handling, bounded adversarial review, and an explicit riskiest-assumption handoff. Do not inherit any upstream's fixed revenue, build-time, AI-native, B2C, or automation assumptions, and do not cross from Public Research into External Validation Actions.

Implement Solo Venture Scout as a focused Codex skill with staged references/assets and durable workspace artifacts. Make subagents optional bounded research workers, keep one coordinator as the only writer, and make browsing mode/freshness visible in the Evidence Ledger. The campaign ends in exactly one of two standalone artifacts: an Opportunity Brief that the user may deliberately give to Wayfinder, or a No Qualifying Opportunity Report. This answers the ticket without selecting exact schemas, thresholds, or implementation sequencing, which remain decisions for later tickets.
