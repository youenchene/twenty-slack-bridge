import type { ModalView } from "@slack/types";
import { escapeMrkdwn, truncate } from "./format.js";

export const LOG_MODAL_CALLBACK_ID = "log_to_crm_modal";
export const RECORD_BLOCK_ID = "record_block";
export const RECORD_ACTION_ID = "record_select";
export const COMMENT_BLOCK_ID = "comment_block";
export const COMMENT_ACTION_ID = "comment_input";

export interface LogContext {
  readonly channelId: string;
  readonly channelName?: string;
  readonly messageTs: string;
  readonly threadTs?: string;
  readonly authorId: string;
  readonly requesterId: string;
  readonly text: string;
}

/** Slack caps private_metadata at 3000 chars; keep message text well under that. */
export const encodeLogContext = (c: LogContext): string => JSON.stringify({ ...c, text: truncate(c.text, 1500) });
export const decodeLogContext = (s: string): LogContext => JSON.parse(s) as LogContext;

export const buildLogModal = (ctx: LogContext): ModalView => ({
  type: "modal",
  callback_id: LOG_MODAL_CALLBACK_ID,
  private_metadata: encodeLogContext(ctx),
  title: { type: "plain_text", text: "Log to CRM" },
  submit: { type: "plain_text", text: "Create note" },
  close: { type: "plain_text", text: "Cancel" },
  blocks: [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Message from <@${ctx.authorId}>*\n>${escapeMrkdwn(truncate(ctx.text || "(no text)", 400)).replace(/\n/g, "\n>")}` },
    },
    {
      type: "input",
      block_id: RECORD_BLOCK_ID,
      label: { type: "plain_text", text: "CRM record" },
      element: {
        type: "external_select",
        action_id: RECORD_ACTION_ID,
        min_query_length: 2,
        placeholder: { type: "plain_text", text: "Search people, companies, opportunities…" },
      },
    },
    {
      type: "input",
      block_id: COMMENT_BLOCK_ID,
      optional: true,
      label: { type: "plain_text", text: "Add a comment (optional)" },
      element: { type: "plain_text_input", action_id: COMMENT_ACTION_ID, multiline: true },
    },
  ],
});
