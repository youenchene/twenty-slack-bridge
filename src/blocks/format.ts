import type { CrmRecord, RecordKind } from "../twenty-client.js";
import { stageLabel } from "../twenty-client.js";

export const escapeMrkdwn = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const truncate = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export const KIND_LABEL: Record<RecordKind, string> = {
  person: "Person",
  company: "Company",
  opportunity: "Opportunity",
};

export const KIND_EMOJI: Record<RecordKind, string> = {
  person: ":bust_in_silhouette:",
  company: ":office:",
  opportunity: ":moneybag:",
};

/** "Company · Stage · Owner" style detail line, skipping missing values. */
export const detailLine = (r: CrmRecord): string =>
  [r.jobTitle, r.company, stageLabel(r.stage) && `Stage: ${stageLabel(r.stage)}`, r.owner && `Owner: ${r.owner}`]
    .filter((x): x is string => Boolean(x))
    .map(escapeMrkdwn)
    .join("  ·  ");

export const recordLink = (r: CrmRecord): string => `<${r.url}|${escapeMrkdwn(r.name)}>`;
