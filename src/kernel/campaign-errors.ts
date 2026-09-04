export type CampaignAccessFailure = {
  code: string;
  message: string;
  action: string;
  details?: string[];
};

export class NewerCampaignContractsError extends Error {
  constructor(readonly details: string[]) {
    super("Scouting Campaign uses unsupported newer contract versions");
  }
}

export class AmbiguousCampaignDiscoveryError extends Error {
  constructor(readonly campaignPaths: string[]) {
    super("Manifest discovery found more than one Scouting Campaign");
  }
}

function isFileSystemError(
  error: unknown,
): error is Error & { code: unknown } {
  return error instanceof Error && "code" in error;
}

export function campaignAuthorityFailure(
  error: unknown,
): CampaignAccessFailure | undefined {
  if (error instanceof AmbiguousCampaignDiscoveryError) {
    return {
      code: "SVS-CAMPAIGN-DISCOVERY-AMBIGUOUS",
      message: "Manifest discovery found more than one Scouting Campaign.",
      action:
        "Provide one exact Campaign path; do not guess between compatible, older, or newer Campaigns.",
      details: error.campaignPaths,
    };
  }
  if (error instanceof NewerCampaignContractsError) {
    return {
      code: "SVS-CAMPAIGN-CONTRACT-NEWER",
      message:
        "Scouting Campaign uses contract versions newer than this release supports.",
      action:
        "Open it with a release that supports every listed version; do not reinterpret, edit, or migrate it backward.",
      details: error.details,
    };
  }
  const detail =
    error instanceof Error ? error.message : "unknown validation error";
  if (
    isFileSystemError(error) &&
    error.code === "ENOENT" &&
    detail.includes("records.jsonl")
  ) {
    return {
      code: "SVS-CAMPAIGN-AUTHORITY-MISSING",
      message: "Authoritative Campaign history is missing: records.jsonl.",
      action:
        "Choose one: restore records.jsonl from a trusted backup; restore a migration snapshot; or preserve this Campaign and start a new one. Never invent replacement records.",
      details: ["records.jsonl was not found."],
    };
  }
  if (
    detail === "manifest integrity digest does not match" ||
    /^authoritative record \d+ integrity digest does not match$/.test(detail)
  ) {
    return {
      code: "SVS-CAMPAIGN-RECONCILIATION-REQUIRED",
      message:
        "Authoritative Campaign history changed outside the kernel and cannot be continued automatically.",
      action:
        "Reconcile the changed authoritative artifact against a trusted original or restore a migration snapshot; preserve the damaged copy and do not delete, rewrite, or drop its tail.",
      details: [detail],
    };
  }
  if (
    detail === "authoritative history is empty" ||
    detail === "authoritative history is incomplete" ||
    /^authoritative record line \d+ is not valid JSON; damaged tail was preserved$/.test(
      detail,
    ) ||
    /^authoritative record \d+ is invalid$/.test(detail)
  ) {
    return {
      code: "SVS-CAMPAIGN-AUTHORITY-DAMAGED",
      message: "Authoritative Campaign history is incomplete or corrupt.",
      action:
        "Choose one: restore records.jsonl from a trusted backup; restore a migration snapshot; or preserve this Campaign and start a new one. Do not invent records or discard the damaged tail.",
      details: [detail],
    };
  }
  return undefined;
}
