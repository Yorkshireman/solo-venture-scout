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

export type CampaignAuthorityErrorKind =
  | "missing"
  | "damaged"
  | "reconciliation";

export class CampaignAuthorityError extends Error {
  constructor(
    readonly kind: CampaignAuthorityErrorKind,
    detail: string,
  ) {
    super(detail);
  }
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
  if (error instanceof CampaignAuthorityError) {
    if (error.kind === "missing") {
      return {
        code: "SVS-CAMPAIGN-AUTHORITY-MISSING",
        message: "Authoritative Campaign history is missing: records.jsonl.",
        action:
          "Choose one: restore records.jsonl from a trusted backup; restore a migration snapshot; or preserve this Campaign and start a new one. Never invent replacement records.",
        details: [detail],
      };
    }
    if (error.kind === "reconciliation") {
      return {
        code: "SVS-CAMPAIGN-RECONCILIATION-REQUIRED",
        message:
          "Authoritative Campaign history changed outside the kernel and cannot be continued automatically.",
        action:
          "Reconcile the changed authoritative artifact against a trusted original or restore a migration snapshot; preserve the damaged copy and do not delete, rewrite, or drop its tail.",
        details: [detail],
      };
    }
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
