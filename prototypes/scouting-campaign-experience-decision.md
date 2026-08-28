# Scouting Campaign experience prototype

Status: validated through a live native-Codex walkthrough on 2026-08-28.

This is a prototype record, not production skill content. The first browser-based state-machine treatment was rejected as the wrong fidelity: Solo Venture Scout runs natively in Codex through the terminal or VS Code extension. The validated prototype was the subsequent guided conversation.

## Validated experience

### 1. Choose storage before creating files

Every new Scouting Campaign begins by showing the current working folder and asking where its campaign directory should live. This happens whether or not the current folder is a Git repository. No campaign files are created before the developer confirms a location.

The Scout explains that it will create checkpoints, evidence records, research state, and terminal reports. It offers to choose another folder, create a dedicated folder under the current location, preview the planned file set, or cancel. If the current folder is a Git repository, it adds a version-control warning. It never commits campaign files automatically.

If the chosen path is outside Codex's writable workspace, the Scout explains how to grant access or restart in the intended workspace before continuing. A terminal artifact may later be deliberately exported elsewhere, but canonical campaign storage cannot be deferred until campaign completion.

### 2. Conduct a guided Campaign Intake

The Scout gathers the Campaign Intake as a one-question-at-a-time interview. It does not expect the developer to volunteer complete, formally structured answers.

Each question:

- explains why the answer matters;
- offers sensible options and, where permitted, a recommended starting point;
- accepts a custom answer;
- translates the answer into a proposed Hard Constraint, Preference, Advantage, Commercial Outcome Target component, or Research Budget setting for confirmation.

Formal input requirements may be decomposed. For example, the Scout first offers financial-metric options, then separately asks for amount, currency, and deadline. It does not invent defaults that the intake contract forbids.

Before Public Research, the Scout presents a concise review, calls out warnings and unresolved conflicts, and offers to confirm and begin, revise an answer, show the complete intake, or explain a warning. Public Research begins only after explicit confirmation.

### 3. Use plain language for actions

Conversation actions lead with their effect in ordinary language. Canonical domain terms remain visible in detailed views and persisted audit records, but do not make menu choices cryptic.

Examples:

- `See what we still don't know and why it matters`, with `Evidence Gap` introduced in the detail.
- `Change my goals, limits, or preferences`, rather than `Revise the Campaign Intake`.
- `See the Opportunities found so far`, rather than an internal lifecycle label.

### 4. Work autonomously after confirmation

Once confirmed, the Scout performs permitted Public Research without asking routine questions. Progress reporting is concise and meaningful: Sources examined, Exploration Threads investigated, Opportunities formed, dispositions, remaining Research Budget, and material blockers.

### 5. Make approval pauses precise and recoverable

When unavoidable Approved Research is blocked on Research Approval, the Scout writes a durable checkpoint and asks one precise question. The request states the action, purpose, Source and access method, external effects, maximum cost, data involved, risks, duration, and alternatives.

The first option may recommend skipping when uncertain. Refusal records the resulting Evidence Gap and allows independent work to continue. Silence leaves the campaign safely paused and consumes no Research Budget.

On return, the Scout reconstructs state from files and gives a concise resume summary: integrity and recovery status, work completed, campaign state, the pause reason, the recorded human decision, its effect, and the next permitted actions. It never asks the developer to reconstruct conversation history.

### 6. Make reasoning challengeable

Opportunity summaries distinguish:

- what Sources directly state;
- what the Scout inferred;
- what remains uncertain;
- material evidence against the Opportunity.

The developer may challenge a conclusion in natural language, question Source incentives, correct an assumed Advantage, or ask to see support for a claim. The Scout records the challenge, investigates where possible, and explicitly reaffirms or supersedes affected conclusions. It never silently overwrites earlier reasoning.

### 7. Make terminal outcomes clear and actionable

Every terminal message leads with a plain-language outcome summary, distinguishes evidence from uncertainty, names the generated artifact and its path, and explains that a promising Opportunity is not commercially validated.

For a Leading Opportunity, the Scout offers to view the Opportunity Brief, explain the selection, show the strongest evidence against it, finish, or get instructions for planning in a new session.

For an inconclusive comparison, the Scout shows the Eligible Non-Dominated Opportunities side by side without a forced winner. The developer may inspect the comparison, extend research against named unknowns, select one or more Opportunities with explicit developer-selected provenance, or finish.

For No Qualifying Opportunity, the Scout distinguishes affirmatively rejected Opportunities from unresolved ones and presents the outcome as valid rather than as an error. The developer may inspect the report, request a short explanation, extend the Research Budget, or finish.

### 8. Keep Wayfinder in a separate session

Solo Venture Scout never invokes Wayfinder in the current campaign session. From an Opportunity Brief, it offers `Get instructions for planning in a new session` and supplies a ready-to-use invocation containing the immutable brief path. The current Scouting Campaign then remains complete.

Each Opportunity selected from an inconclusive comparison receives its own Opportunity Brief and separate future Wayfinder effort.

### 9. Let the developer choose how documents open

Whenever the Scout offers a document, it identifies the file type and extension, shows the path, and lets the developer choose how to view it. Typical choices are preview in Codex, open in a developer-selected application, reveal in the system file manager, show only the path, or do nothing.

The Scout never chooses or launches an application without the developer's selection.

### 10. Return from explanation to the pending choice

Informational actions do not consume the decision that prompted them. After explaining a warning, previewing planned files, showing why an Opportunity was chosen, describing evidence against it, or summarizing why nothing qualified, the Scout returns to the previous menu with the new context available.

The same rule applies to document previews and other secondary views: there are no conversational dead ends.
