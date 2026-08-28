# Solo Venture Scout

Solo Venture Scout is a reusable Codex skill for discovering and evaluating commercially promising software opportunities that fit the constraints of a solo developer.

## Language

**Solo Venture Scout**:
The skill being designed in this repository. It explores markets, rejects weak candidates, and recommends an opportunity for downstream validation and product planning.
_Avoid_: Idea generator, startup generator

**Opportunity**:
A narrowly defined potential software business for a specific customer facing a specific costly problem in a specific situation.
_Avoid_: App idea, concept

**Public Research**:
Read-only evidence gathering from publicly accessible sources that does not interact with prospects or publish on the developer's behalf.
_Avoid_: Validation

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
A non-fatal developer condition used to compare otherwise eligible Opportunities.
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

**Leading Opportunity**:
The strongest surviving opportunity after public research and comparison; it is promising enough to validate but is not yet a validated business.
_Avoid_: Validated opportunity, winning idea

**No Qualifying Opportunity**:
The valid outcome when no candidate clears the campaign's evidence and suitability gates within its research budget.
_Avoid_: Failed campaign

**Opportunity Brief**:
The terminal handoff from a successful Scouting Campaign: an evidence-backed description of a Leading Opportunity that the user may give to Wayfinder, not a product specification.
_Avoid_: Product spec, implementation plan, opportunity dossier

**Value Hypothesis**:
A provisional statement of the smallest customer outcome that might address an Opportunity, recorded for Wayfinder to challenge rather than as a settled product boundary.
_Avoid_: MVP specification, feature list

**No Qualifying Opportunity Report**:
The terminal record of an unsuccessful Scouting Campaign, explaining its search coverage, rejections, uncertainty, and whether a different campaign is justified; it is not a Wayfinder handoff.
_Avoid_: Opportunity Brief, failure report
