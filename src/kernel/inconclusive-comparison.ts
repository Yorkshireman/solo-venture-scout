import contracts from "../../release/contracts.json" with { type: "json" };
import type { AuthoritativeHistoryRebuild } from "./authority.js";
import type {
  BaseOpportunityComparison,
  OpportunityBriefBuildInput,
} from "./leading-opportunity.js";
import type {
  ConcludeInconclusiveComparisonCommand,
  DeveloperOpportunitySelection,
  InconclusiveComparisonReport,
  InconclusiveOpportunityComparison,
  OpportunityBrief,
} from "./types.js";

export type InconclusiveComparisonServices = {
  opportunityComparisonViolation: (
    history: AuthoritativeHistoryRebuild,
    comparison: BaseOpportunityComparison,
    concludedAt: string,
  ) => string | undefined;
  availableAffirmativeEvidenceIds: (
    history: AuthoritativeHistoryRebuild,
  ) => Set<string>;
  unresolvedOpportunityIds: (
    history: AuthoritativeHistoryRebuild,
    at: string,
  ) => string[];
  buildOpportunityBrief: (
    history: AuthoritativeHistoryRebuild,
    input: OpportunityBriefBuildInput,
  ) => OpportunityBrief;
  latestSupersededArtifactId: (
    history: AuthoritativeHistoryRebuild,
  ) => string | null;
};

export function createInconclusiveComparisonModule({
  opportunityComparisonViolation,
  availableAffirmativeEvidenceIds,
  unresolvedOpportunityIds,
  buildOpportunityBrief,
  latestSupersededArtifactId,
}: InconclusiveComparisonServices) {
  function evidenceViolation(
    history: AuthoritativeHistoryRebuild,
    entryIds: string[],
    opportunityIds: string[],
  ): string | undefined {
    const availableIds = availableAffirmativeEvidenceIds(history);
    const scopes = new Set<string>();
    for (const entryId of entryIds) {
      if (!availableIds.has(entryId)) {
        return `inconclusive comparison links unavailable affirmative evidence ${entryId}`;
      }
      const inference = history.inferences.find((entry) => entry.id === entryId);
      if (
        inference === undefined ||
        !opportunityIds.includes(inference.scope) ||
        !["medium", "high"].includes(inference.confidence.level)
      ) {
        return `material inconclusive comparison evidence ${entryId} must be a medium- or high-confidence Opportunity-scoped Inference`;
      }
      scopes.add(inference.scope);
    }
    const unsupportedId = opportunityIds.find((id) => !scopes.has(id));
    return unsupportedId === undefined
      ? undefined
      : `material inconclusive comparison evidence must cover ${unsupportedId}`;
  }

  function inconclusiveComparisonViolation(
    history: AuthoritativeHistoryRebuild,
    comparison: InconclusiveOpportunityComparison,
    concludedAt: string,
  ): string | undefined {
    const baseViolation = opportunityComparisonViolation(
      history,
      comparison,
      concludedAt,
    );
    if (baseViolation !== undefined) {
      return baseViolation;
    }
    const derivedUnresolvedContenderIds = unresolvedOpportunityIds(
      history,
      concludedAt,
    );
    const singleBlockedApparentLeader =
      comparison.nonDominatedOpportunityIds.length === 1 &&
      comparison.apparentLeaderOpportunityId ===
        comparison.nonDominatedOpportunityIds[0] &&
      derivedUnresolvedContenderIds.length > 0;
    if (
      comparison.nonDominatedOpportunityIds.length < 2 &&
      !singleBlockedApparentLeader
    ) {
      return "an inconclusive comparison requires either multiple Eligible Non-Dominated Opportunities or an apparent leader blocked by an unresolved contender";
    }
    if (
      comparison.apparentLeaderOpportunityId !== null &&
      !comparison.nonDominatedOpportunityIds.includes(
        comparison.apparentLeaderOpportunityId,
      )
    ) {
      return "the apparent leader must remain an Eligible Non-Dominated Opportunity";
    }
    const tradeOffOpportunityIds = new Set([
      ...comparison.nonDominatedOpportunityIds,
      ...derivedUnresolvedContenderIds,
    ]);
    const tradeOffCoverage = new Set<string>();
    for (const tradeOff of comparison.decisiveTradeOffs) {
      if (
        new Set(tradeOff.opportunityIds).size !== tradeOff.opportunityIds.length ||
        tradeOff.opportunityIds.length < 2 ||
        tradeOff.opportunityIds.some(
          (id) => !tradeOffOpportunityIds.has(id),
        )
      ) {
        return "each decisive trade-off must compare distinct Eligible Non-Dominated Opportunities or unresolved contenders";
      }
      if (!["medium", "high"].includes(tradeOff.confidence.level)) {
        return "each decisive trade-off requires medium or high Evidence Confidence";
      }
      const tradeOffEvidenceViolation = evidenceViolation(
        history,
        tradeOff.evidenceEntryIds,
        tradeOff.opportunityIds,
      );
      if (tradeOffEvidenceViolation !== undefined) {
        return tradeOffEvidenceViolation;
      }
      tradeOff.opportunityIds.forEach((id) => tradeOffCoverage.add(id));
    }
    if (
      comparison.nonDominatedOpportunityIds.some(
        (id) => !tradeOffCoverage.has(id),
      )
    ) {
      return "decisive trade-offs must cover every Eligible Non-Dominated Opportunity";
    }
    const permittedContenderIds = new Set([
      ...comparison.nonDominatedOpportunityIds,
      ...derivedUnresolvedContenderIds,
    ]);
    if (
      comparison.apparentLeaderOpportunityId !== null &&
      comparison.blockers.length === 0
    ) {
      return "an apparent leader requires an explicit blocker showing why it is not defensible";
    }
    const contenderIds = new Set<string>();
    for (const blocker of comparison.blockers) {
      if (
        contenderIds.has(blocker.contenderOpportunityId) ||
        !permittedContenderIds.has(blocker.contenderOpportunityId) ||
        blocker.couldDisplaceOpportunityIds.includes(
          blocker.contenderOpportunityId,
        ) ||
        blocker.couldDisplaceOpportunityIds.some(
          (id) => !comparison.nonDominatedOpportunityIds.includes(id),
        )
      ) {
        return "each unresolved contender must have one explicit blocker against Eligible Non-Dominated Opportunities";
      }
      contenderIds.add(blocker.contenderOpportunityId);
      if (
        comparison.apparentLeaderOpportunityId !== null &&
        !blocker.couldDisplaceOpportunityIds.includes(
          comparison.apparentLeaderOpportunityId,
        )
      ) {
        return "every unresolved contender blocker must state that it could displace the apparent leader";
      }
      const linkedOpenGapIds = blocker.evidenceGapIds.filter((gapId) =>
        history.evidenceGaps.some(
          (gap) => gap.id === gapId && gap.status === "open",
        ),
      );
      const linkedUnresolvedContradictionIds = blocker.contradictionIds.filter(
        (contradictionId) =>
          history.contradictions.some(
            (contradiction) =>
              contradiction.id === contradictionId &&
              contradiction.resolutionStatus === "unresolved",
          ),
      );
      if (
        linkedOpenGapIds.length !== blocker.evidenceGapIds.length ||
        linkedUnresolvedContradictionIds.length !== blocker.contradictionIds.length
      ) {
        return "an explicit blocker must link only current open Evidence Gaps or unresolved Contradictions";
      }
      const blockerEvidenceViolation = evidenceViolation(
        history,
        blocker.evidenceEntryIds,
        [
          blocker.contenderOpportunityId,
          ...blocker.couldDisplaceOpportunityIds,
        ],
      );
      if (blockerEvidenceViolation !== undefined) {
        return blockerEvidenceViolation;
      }
    }
    const omittedContenderId = derivedUnresolvedContenderIds.find(
      (opportunityId) => !contenderIds.has(opportunityId),
    );
    if (omittedContenderId !== undefined) {
      return `unresolved contender ${omittedContenderId} must be shown as an explicit blocker`;
    }
    return undefined;
  }

  function buildInconclusiveComparisonReport(
    history: AuthoritativeHistoryRebuild,
    command: ConcludeInconclusiveComparisonCommand,
  ): InconclusiveComparisonReport {
    return {
      reportVersion: contracts.renderTemplates,
      id: command.payload.reportId,
      kind: "inconclusive-comparison-report",
      campaignId: history.campaignId,
      concludedAt: command.payload.concludedAt,
      intakeVersion: history.intake!.version,
      supersedes: latestSupersededArtifactId(history),
      comparison: command.payload.comparison,
      availableActions: ["stop", "extend", "select"],
      audit: {
        authoritativeRecordsPath: "records.jsonl",
        evidenceLedgerPath: "evidence-ledger.json",
      },
    };
  }

  function buildDeveloperSelectedOpportunityBrief(
    history: AuthoritativeHistoryRebuild,
    report: InconclusiveComparisonReport,
    selection: DeveloperOpportunitySelection,
    selectedAt: string,
  ): OpportunityBrief {
    const adversarialReservationIds = [...history.reservations.values()]
      .filter((reservation) => reservation.researchClass === "adversarial")
      .map((reservation) => reservation.id);
    const relevantTradeOffs = report.comparison.decisiveTradeOffs.filter(
      (tradeOff) => tradeOff.opportunityIds.includes(selection.opportunityId),
    );
    const briefPath = developerSelectedOpportunityBriefPath(
      selection.opportunityId,
    );
    return buildOpportunityBrief(history, {
      comparison: report.comparison,
      brief: selection.brief,
      opportunityId: selection.opportunityId,
      concludedAt: selectedAt,
      role: "developer-selected-opportunity",
      selectionProvenance: {
        kind: "developer-selection",
        reportId: report.id,
        rationale: selection.rationale,
        classification: "developer-preference-not-market-evidence",
      },
      selection: {
        rationale: selection.rationale,
        decisionId: report.comparison.decision.id,
        evidenceEntryIds: [],
        limitations: report.comparison.decision.limitations,
        traceabilityConclusion: "Developer selection preference",
      },
      adversarialReservationIds,
      comparisonLimitingFactors: [
        ...report.comparison.decision.confidence.limitingFactors,
        ...relevantTradeOffs.flatMap(
          (tradeOff) => tradeOff.confidence.limitingFactors,
        ),
      ],
      additionalTraceabilityRows: relevantTradeOffs.map((tradeOff) => ({
        conclusion: "Decisive trade-off",
        entryIds: tradeOff.evidenceEntryIds,
      })),
      wayfinderHandoff: {
        optional: true,
        invoked: false,
        briefPath,
        instruction:
          `If you choose, invoke Wayfinder separately for ${selection.opportunityId} using only ${briefPath}; challenge its provisional Value Hypothesis and do not combine it with another selected Opportunity.`,
      },
    });
  }

  return {
    inconclusiveComparisonViolation,
    buildInconclusiveComparisonReport,
    buildDeveloperSelectedOpportunityBrief,
  };
}

export function developerSelectedOpportunityBriefPath(
  opportunityId: string,
): string {
  return `opportunity-brief-${encodeURIComponent(opportunityId)}.md`;
}

function reportText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function renderInconclusiveComparisonReport(
  report: InconclusiveComparisonReport,
): string {
  const profiles = report.comparison.profiles.filter((profile) =>
    report.comparison.nonDominatedOpportunityIds.includes(profile.opportunityId),
  );
  return [
    "# Inconclusive Comparison Report",
    "",
    `**Supersedes:** ${report.supersedes === null ? "none" : reportText(report.supersedes)}`,
    "",
    "## Unscored side-by-side comparison",
    "",
    "No weighted total, probability, or forced ranking is applied. Every Eligible Non-Dominated Opportunity remains visible.",
    "",
    "| Opportunity | Required Input | Potential Output | Outcome Uncertainty | Input–Output Asymmetry |",
    "| --- | --- | --- | --- | --- |",
    ...profiles.map(
      (profile) =>
        `| ${reportText(profile.opportunityId)} | ${reportText(Object.values(profile.requiredInput).map((value) => value.summary).join("; "))} | ${reportText(Object.values(profile.potentialOutput).map((value) => value.summary).join("; "))} | ${reportText(profile.outcomeUncertainty.summary)} | ${reportText(profile.inputOutputAsymmetry.summary)} |`,
    ),
    "",
    "## Decisive trade-offs",
    "",
    ...report.comparison.decisiveTradeOffs.map(
      (tradeOff) =>
        `- ${tradeOff.opportunityIds.map(reportText).join(" ↔ ")}: ${reportText(tradeOff.summary)} (Evidence: ${tradeOff.evidenceEntryIds.map(reportText).join(", ")})`,
    ),
    "",
    "## Explicit blockers",
    "",
    ...(report.comparison.blockers.length === 0
      ? ["None."]
      : report.comparison.blockers.map(
          (blocker) =>
            `- ${reportText(blocker.contenderOpportunityId)} could displace ${blocker.couldDisplaceOpportunityIds.map(reportText).join(", ")}: ${reportText(blocker.summary)} (Evidence Gaps: ${blocker.evidenceGapIds.length === 0 ? "none" : blocker.evidenceGapIds.map(reportText).join(", ")}; Contradictions: ${blocker.contradictionIds.length === 0 ? "none" : blocker.contradictionIds.map(reportText).join(", ")})`,
        )),
    "",
    "## Developer actions",
    "",
    "- Stop: preserve this report unchanged and create no Opportunity Brief.",
    "- Extend: name targeted Evidence Gaps, create a new Campaign Intake version and Research Budget, and resume only affected work.",
    "- Select: choose one or more Eligible Non-Dominated Opportunities; record the rationale as developer Preference, never market evidence or a Leading Opportunity.",
    "",
    `Authoritative history: ${report.audit.authoritativeRecordsPath}`,
    `Evidence Ledger: ${report.audit.evidenceLedgerPath}`,
    "",
  ].join("\n");
}
