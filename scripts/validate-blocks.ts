// Validates every Block Kit layout against Slack's blocks.validate. Needs SLACK_BOT_TOKEN.
import { WebClient } from "@slack/web-api";
import { buildApprovalBlocks, buildApprovalResultBlocks } from "../src/blocks/approval.js";
import { buildLogModal } from "../src/blocks/log-modal.js";
import { buildNotificationBlocks } from "../src/blocks/notification.js";
import { buildSearchBlocks } from "../src/blocks/search-results.js";
import { buildUnfurlBlocks } from "../src/blocks/unfurl.js";
import type { CrmRecord } from "../src/twenty-client.js";

const rec = (kind: CrmRecord["kind"]): CrmRecord => ({ kind, id: "id", name: "A & B <x>", company: "EGIS", stage: "MEETING", owner: "Youen", jobTitle: "CDO", url: "https://crm.example.com/object/x/1" });

const layouts: Record<string, { blocks: unknown[] } | { view: unknown }> = {
  "search results": { blocks: buildSearchBlocks("egis", { people: [rec("person")], companies: [rec("company")], opportunities: [rec("opportunity")] }) },
  "search empty": { blocks: buildSearchBlocks("zzz", { people: [], companies: [], opportunities: [] }) },
  unfurl: { blocks: buildUnfurlBlocks(rec("opportunity")) },
  "notification created": { blocks: buildNotificationBlocks({ kind: "created", name: "Deal", url: "https://x.io", stage: "New", amount: "5,000 EUR" }) },
  "notification stage": { blocks: buildNotificationBlocks({ kind: "stage_changed", name: "Deal", url: "https://x.io", stage: "Meeting", previousStage: "New" }) },
  approval: { blocks: buildApprovalBlocks("abc", "Update stage of Deal to Proposal") },
  "approval result": { blocks: buildApprovalResultBlocks("Update stage", "Done") },
  "log modal": { view: buildLogModal({ channelId: "C1", messageTs: "1.2", authorId: "U1", requesterId: "U2", text: "hello\nworld" }) },
};

const token = process.env.SLACK_BOT_TOKEN;
if (!token) throw new Error("Set SLACK_BOT_TOKEN to validate against Slack");
const client = new WebClient(token);
let failed = false;
for (const [name, payload] of Object.entries(layouts)) {
  const res = await client.apiCall("blocks.validate", "blocks" in payload ? { blocks: JSON.stringify(payload.blocks) } : { view: JSON.stringify(payload.view) }).catch((e: unknown) => ({ ok: false, error: String(e) }));
  console.log(`${res.ok ? "OK  " : "FAIL"} ${name}${res.ok ? "" : ` — ${JSON.stringify(res)}`}`);
  failed ||= !res.ok;
}
process.exit(failed ? 1 : 0);
