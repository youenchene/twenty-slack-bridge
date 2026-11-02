import type { KnownBlock } from "@slack/types";
import { escapeMrkdwn } from "./format.js";

export const APPROVE_ACTION_ID = "approval_approve";
export const CANCEL_ACTION_ID = "approval_cancel";

export const buildApprovalBlocks = (approvalId: string, description: string): KnownBlock[] => [
  { type: "section", text: { type: "mrkdwn", text: `:warning: *Approval needed*\n${escapeMrkdwn(description)}` } },
  {
    type: "actions",
    block_id: `approval_${approvalId}`,
    elements: [
      { type: "button", style: "primary", action_id: APPROVE_ACTION_ID, value: approvalId, text: { type: "plain_text", text: "Approve" } },
      { type: "button", style: "danger", action_id: CANCEL_ACTION_ID, value: approvalId, text: { type: "plain_text", text: "Cancel" } },
    ],
  },
];

export const buildApprovalResultBlocks = (description: string, outcome: string): KnownBlock[] => [
  { type: "section", text: { type: "mrkdwn", text: `${escapeMrkdwn(description)}\n*${escapeMrkdwn(outcome)}*` } },
];
