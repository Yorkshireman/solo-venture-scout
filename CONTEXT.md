# Solo Venture Scout

Solo Venture Scout is a reusable Codex skill for discovering and evaluating commercially promising software opportunities that fit the constraints of a solo developer.

## Language

**Solo Venture Scout**:
The skill being designed in this repository. It explores markets, rejects weak candidates, and recommends an opportunity for downstream validation and product planning.
_Avoid_: Idea generator, startup generator

**Opportunity**:
A narrowly defined potential software business for a specific customer facing a specific costly problem in a specific situation.
_Avoid_: App idea, concept

**Exploration Thread**:
A provisional combination of customer group, situation or workflow, and problem family examined before evidence is strong enough to form an Opportunity.
_Avoid_: Industry, product category, solution idea

**Discovery Sweep**:
A bounded, source-led scan of heterogeneous external maps of economic activity and problem signals that generates Exploration Threads, including controlled random sampling and novelty checks.
_Avoid_: Brainstorming, market questionnaire

**Source Family**:
A broad kind of external map or problem-signal source used to measure Discovery Sweep diversity. Different Source Families broaden coverage but do not by themselves establish independent evidence.
_Avoid_: Source Lineage, publisher count

**Novelty Probe**:
A deliberately speculative discovery exercise that generates unusual Exploration Threads through cross-domain transfer, change combinations, inversion, or recombination, while recording its derivation as Assumptions and granting it no evidential credit.
_Avoid_: App idea, supporting evidence, intuition

**Breadth Gate**:
A Campaign Decision that bounded discovery coverage, a viable comparison set, and diminishing returns justify shifting most research from exploration to Opportunity deepening while retaining an open-world discovery allowance.
_Avoid_: Market exhausted, comprehensive coverage

**Exclusion Gate**:
A disqualifying test that rejects an Opportunity only when sufficient affirmative evidence establishes the excluded condition; missing evidence leaves the gate unresolved.
_Avoid_: Qualification Gate, assumed failure

**Qualification Gate**:
An eligibility test that an Opportunity passes only when sufficient affirmative evidence establishes the required condition; missing evidence leaves the gate unresolved.
_Avoid_: Exclusion Gate, assumed pass

**Costly Problem**:
A problem with a credible material consequence for a specific customer in a specific situation, such as lost money, wasted skilled time, blocked revenue, operational risk, compliance exposure, or recurring workaround expenditure.
_Avoid_: Annoyance, broad desire, speculative need

**Problem Signal**:
An Observation that points toward a possible Costly Problem through a material consequence or committed behavior such as expenditure, workaround effort, switching, escalation, or measurable loss; it directs further research but is not sufficient evidence by itself.
_Avoid_: Complaint, feature request, proof

**Campaign Research**:
Read-only evidence gathering for a Scouting Campaign, comprising autonomous Public Research and approval-gated Approved Research.
_Avoid_: Validation, market outreach

**Public Research**:
Campaign Research using publicly accessible Sources that may proceed autonomously after Campaign Intake confirmation.
_Avoid_: Approved Research, validation

**Approved Research**:
Campaign Research using an authenticated or otherwise restricted Source under explicit, scoped developer approval.
_Avoid_: Public Research, external validation

**Research Approval**:
An affirmative, recorded, and scoped developer authorisation for Approved Research or Research Expenditure that never authorises unlawful activity or an External Validation Action.
_Avoid_: Standing permission, implied consent

**External Validation Action**:
An action that interacts with prospective customers or the market, including outreach, publishing, collecting personal data, or accepting money; it requires explicit human approval.
_Avoid_: Public research

**Scouting Campaign**:
A resumable investigation that applies one developer's constraints to broad market research and progressively records evidence, candidates, rejections, and decisions.
_Avoid_: Search, run

**Solo Developer**:
The single accountable owner-builder of an Opportunity, which must be able to reach its Commercial Outcome Target without requiring a cofounder or employee. Paid services and bounded contractor work are compatible when they fit the developer's declared constraints.
_Avoid_: Startup team, founding team

**Developer Profile**:
Reusable developer information covering capabilities, access, standing boundaries, and recurring operating preferences. A Scouting Campaign uses a dated, developer-confirmed snapshot rather than assuming the profile remains current.
_Avoid_: User account, résumé

**Campaign Intake**:
The developer-confirmed, versioned baseline for a Scouting Campaign, combining a dated Developer Profile snapshot with its Commercial Outcome Target, capacity, risk tolerance, and Research Budget.
_Avoid_: Prompt, questionnaire

**Hard Constraint**:
A developer condition whose violation makes an Opportunity ineligible for the Scouting Campaign.
_Avoid_: Preference, soft constraint

**Preference**:
A non-fatal developer condition used to compare otherwise eligible Opportunities, with `minor`, `important`, or `major` importance confirmed during Campaign Intake.
_Avoid_: Hard constraint, requirement

**Advantage**:
Existing developer leverage that improves an Opportunity's feasibility but cannot compensate for weak market evidence.
_Avoid_: Requirement, proof

**Commercial Outcome Target**:
The campaign's required monetary result, expressed as an amount, currency, financial metric, and deadline. An Opportunity is eligible only when evidence supports a credible path to it; the target is not a forecast or guarantee.
_Avoid_: Success metric, aspiration

**Research Budget**:
The explicit limits on a Scouting Campaign's research effort, sources, candidate depth, and paid spend; paid spend is zero unless the developer authorizes otherwise.
_Avoid_: Token budget, unlimited research

**Evidence Ledger**:
The append-only audit record of every atomic statement or unanswered question that could change Opportunity formation, rejection, comparison, confidence, or terminal handoff. Stable entries may become active, superseded, or retracted, but corrections and changed assessments never erase the campaign's historical decision basis.
_Avoid_: Research notes, browsing history

**Source**:
The origin from which an Observation was obtained during Campaign Research, identified precisely enough for an authorised later reader to locate what the Scout examined and when.
_Avoid_: Evidence, citation

**Observation**:
An atomic, neutrally represented statement found directly in a Source and recorded with a traceable location and temporal context. It reports what the Source says, not that the statement is objectively true.
_Avoid_: Fact, finding

**Inference**:
An atomic conclusion derived from linked Observations or other Inferences rather than stated directly by a Source. Its reasoning preserves both material support and material challenge.
_Avoid_: Observation, fact

**Source Lineage**:
The provenance relationship between Sources that reveals shared authorship, datasets, publications, syndication, or other common origins. Multiple Sources provide independent evidence only when their relevant origins are genuinely independent.
_Avoid_: Citation count, URL count

**Source Freshness**:
How well a Source's publication, update, access, and effective periods match the time sensitivity of the Observation drawn from it.
_Avoid_: Recency, access date

**Research Expenditure**:
Developer-approved paid access to a Source, charged against the Research Budget and recorded without payment credentials.
_Avoid_: Operating cost, implicit spend

**Excluded Market**:
A market whose intended activity falls outside Solo Venture Scout's non-overridable safety boundary and cannot produce an eligible Opportunity.
_Avoid_: Elevated-risk market, user exclusion

**Elevated-Risk Market**:
A market that may remain eligible but requires Opportunity-specific Research Approval because of material legal, regulatory, safety, or exploitation risk.
_Avoid_: Excluded market, ordinary market

**Assumption**:
An explicitly unsupported premise retained in the Evidence Ledger so it cannot be mistaken for observed evidence. Every material Assumption links to the Evidence Gap that would test or resolve it and never counts as supporting evidence.
_Avoid_: Inference, fact

**Evidence Gap**:
A material unanswered question whose resolution could change an Opportunity decision or terminal handoff. It records the affected decisions and the condition that would count as resolution; missing evidence is not silently treated as evidence of absence.
_Avoid_: Missing data, research backlog

**Contradiction**:
A recorded relationship between incompatible Evidence Ledger entries that preserves the disputed proposition, scope, and reconciliation status rather than silently choosing one as true.
_Avoid_: Error, duplicate

**Source Credibility**:
A contextual assessment of how fit a Source is for a particular Observation, considering directness, relevant expertise, methodology, incentives, verifiability, and limitations. It is not a universal rating of a publisher.
_Avoid_: Trusted source, publisher score

**Evidence Confidence**:
An ordinal, reasoned assessment of how strongly the Evidence Ledger warrants an Inference or material Campaign Decision after accounting for credibility, independence, freshness, Contradictions, and Evidence Gaps. It is not a probability or a rating attached to an Observation.
_Avoid_: Certainty score, source confidence

**Campaign Decision**:
An auditable conclusion that changes Opportunity formation, rejection, comparison, or terminal handoff. It records its Campaign Intake version, applicable rule, linked Evidence Ledger entries, rationale, confidence, limitations, and time.
_Avoid_: Bare decision, result

**Opportunity Disposition**:
The versioned current decision status of an Opportunity within a Scouting Campaign: active, rejected, or unresolved when the campaign ends. New evidence or Campaign Intake revisions may supersede the current disposition through an explicit Campaign Decision, while history is retained; Leading Opportunity is a terminal role, not a disposition.
_Avoid_: Candidate lifecycle, research stage

**Eligible Opportunity**:
An Opportunity whose Exclusion Gates and Qualification Gates have all passed under the current Campaign Intake and Evidence Ledger, making it eligible for comparison but not necessarily the Leading Opportunity.
_Avoid_: Candidate, finalist, qualified idea

**Decision Value**:
The expected usefulness of a research action in changing an Opportunity gate, comparison, or terminal decision relative to the Research Budget it consumes.
_Avoid_: Research volume, interestingness, evidence accumulation

**Deepened Opportunity**:
An Opportunity allocated Campaign Research beyond its equal shallow formation allowance because further evidence could change a gate, comparison, or terminal decision.
_Avoid_: Deep candidate, favourite idea

**Required Input**:
The ranges of time, cash, acquisition effort, operating burden, irreversible downside, and opportunity cost needed to test an Opportunity and reach an initial sellable outcome. It is a vector of constraints and exposures, not a single effort score or implementation plan.
_Avoid_: Build estimate, total cost score

**Potential Output**:
The evidence-backed range of commercial outcomes, scale, durability, and strategic leverage an Opportunity could produce. It is not a forecast and unsupported upside receives no comparison credit.
_Avoid_: Guaranteed return, speculative upside

**Outcome Uncertainty**:
The variation in an Opportunity's possible commercial results even when the supporting evidence is credible. It is distinct from Evidence Confidence, which assesses the warrant for the claims describing that variation.
_Avoid_: Evidence Confidence, failure probability

**Input–Output Asymmetry**:
The relationship between an Opportunity's Required Input and Potential Output; low bounded input with credible high upside is a comparison advantage even when Outcome Uncertainty is substantial.
_Avoid_: Expected-value score, cheap lottery ticket

**Non-Dominated Opportunity**:
An Eligible Opportunity for which no other Eligible Opportunity requires no more material input, offers no less credible output, fits the confirmed Developer Profile at least as well, and is materially better on at least one comparison dimension.
_Avoid_: Winner, highest-scoring candidate

**Leading Opportunity**:
The strongest surviving opportunity after public research and comparison; it is promising enough to validate but is not yet a validated business.
_Avoid_: Validated opportunity, winning idea

**Developer-Selected Opportunity**:
A Non-Dominated Opportunity chosen by the developer after an Inconclusive Comparison Report without being reclassified as the Leading Opportunity.
_Avoid_: Leading Opportunity, Scout recommendation

**No Qualifying Opportunity**:
The valid outcome when no Opportunity becomes eligible within the Research Budget.
_Avoid_: Failed campaign

**Opportunity Brief**:
An immutable, evidence-backed terminal handoff for exactly one Leading Opportunity or Developer-Selected Opportunity that preserves selection provenance and exposes a provisional Value Hypothesis and audit pointers without becoming a product specification. Each brief may enter one separate, human-invoked Wayfinder effort.
_Avoid_: Product spec, implementation plan, opportunity dossier

**Value Hypothesis**:
A visibly provisional statement of the smallest customer outcome that might address an Opportunity, together with its evidence limits and disconfirmation conditions. It is recorded for Wayfinder to challenge and never settles features, delivery design, or a product boundary.
_Avoid_: MVP specification, feature list

**No Qualifying Opportunity Report**:
The immutable terminal record of a Scouting Campaign with no Eligible Opportunity, separating affirmatively rejected Opportunities from unresolved Opportunities and explaining coverage, Research Budget use, uncertainty, and possible continuation conditions. It is not a Wayfinder handoff.
_Avoid_: Opportunity Brief, failure report

**Inconclusive Comparison Report**:
The immutable terminal record produced when one or more Opportunities qualified but the Scouting Campaign could not establish a defensible stand-out leader. It compares Eligible Non-Dominated Opportunities without forced ranking, exposes unresolved contenders and trade-offs, and lets the developer stop, extend research, or select Opportunities for separate downstream work.
_Avoid_: No Qualifying Opportunity Report, forced ranking
