import type { KnownBlock } from "@slack/types";
import type { CrmRecord } from "../twenty-client.js";
import { detailLine, KIND_EMOJI, KIND_LABEL, recordLink } from "./format.js";

export const buildUnfurlBlocks = (r: CrmRecord): KnownBlock[] => [
  { type: "section", text: { type: "mrkdwn", text: `${KIND_EMOJI[r.kind]} *${recordLink(r)}*\n${detailLine(r) || "_no details_"}` } },
  { type: "context", elements: [{ type: "mrkdwn", text: `Twenty CRM · ${KIND_LABEL[r.kind]}` }] },
];
