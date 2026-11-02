import type { KnownBlock } from "@slack/types";
import type { CrmRecord, RecordKind } from "../twenty-client.js";
import { detailLine, escapeMrkdwn, KIND_EMOJI, KIND_LABEL, recordLink } from "./format.js";

export interface SearchResults {
  readonly people: readonly CrmRecord[];
  readonly companies: readonly CrmRecord[];
  readonly opportunities: readonly CrmRecord[];
}

const recordBlock = (r: CrmRecord): KnownBlock => ({
  type: "section",
  text: {
    type: "mrkdwn",
    text: `${KIND_EMOJI[r.kind]} *${recordLink(r)}*\n${detailLine(r) || "_no details_"}`,
  },
});

const group = (kind: RecordKind, title: string, rows: readonly CrmRecord[]): KnownBlock[] =>
  rows.length === 0 ? [] : [{ type: "header", text: { type: "plain_text", text: `${title} (${rows.length})` } }, ...rows.map(recordBlock)];

export const buildSearchBlocks = (query: string, results: SearchResults): KnownBlock[] => {
  const blocks = [
    ...group("opportunity", "Opportunities", results.opportunities),
    ...group("company", "Companies", results.companies),
    ...group("person", "People", results.people),
  ];
  if (blocks.length === 0) {
    return [{ type: "section", text: { type: "mrkdwn", text: `No CRM results for *${escapeMrkdwn(query)}*.` } }];
  }
  return [
    ...blocks,
    { type: "context", elements: [{ type: "mrkdwn", text: `Results for *${escapeMrkdwn(query)}*` }] },
  ];
};

export const searchFallbackText = (query: string): string => `CRM results for "${query}"`;
export { KIND_LABEL };
