import type { App } from "@slack/bolt";
import {
  buildLogModal,
  COMMENT_ACTION_ID,
  COMMENT_BLOCK_ID,
  decodeLogContext,
  LOG_MODAL_CALLBACK_ID,
  RECORD_ACTION_ID,
  RECORD_BLOCK_ID,
} from "../blocks/log-modal.js";
import { KIND_LABEL, truncate } from "../blocks/format.js";
import type { RecordKind, TwentyClient } from "../twenty-client.js";

export const SHORTCUT_CALLBACK_ID = "log_to_crm";

const parseValue = (v: string): { kind: RecordKind; id: string } => {
  const [kind, id] = v.split(":");
  if (!id || !(kind === "person" || kind === "company" || kind === "opportunity")) throw new Error(`Bad record value: ${v}`);
  return { kind, id };
};

export const registerLogToCrm = (app: App, twenty: TwentyClient): void => {
  app.shortcut({ callback_id: SHORTCUT_CALLBACK_ID, type: "message_action" }, async ({ shortcut, ack, client, logger }) => {
    await ack();
    const { message, channel, user, trigger_id } = shortcut;
    try {
      await client.views.open({
        trigger_id,
        view: buildLogModal({
          channelId: channel.id,
          channelName: channel.name,
          messageTs: message.ts,
          threadTs: "thread_ts" in message && typeof message.thread_ts === "string" ? message.thread_ts : undefined,
          authorId: "user" in message && typeof message.user === "string" ? message.user : "unknown",
          requesterId: user.id,
          text: "text" in message && typeof message.text === "string" ? message.text : "",
        }),
      });
    } catch (err) {
      logger.error("Failed to open Log to CRM modal", err);
    }
  });

  // Live search for the record picker.
  app.options({ action_id: RECORD_ACTION_ID }, async ({ options, ack, logger }) => {
    try {
      const { people, companies, opportunities } = await twenty.searchAll(options.value, 4);
      const groupFor = (label: string, rows: typeof people) => ({
        label: { type: "plain_text" as const, text: label },
        options: rows.map((r) => ({
          text: { type: "plain_text" as const, text: truncate([r.name, r.company].filter(Boolean).join(" — "), 75) },
          value: `${r.kind}:${r.id}`,
        })),
      });
      const option_groups = [
        groupFor("Opportunities", opportunities),
        groupFor("Companies", companies),
        groupFor("People", people),
      ].filter((g) => g.options.length > 0);
      // Bolt's ack() overloads cover dialog/message menus too; block menus accept option_groups.
      await (ack as unknown as (r: object) => Promise<void>)({ option_groups });
    } catch (err) {
      logger.error("Record search failed", err);
      await (ack as unknown as (r: object) => Promise<void>)({ options: [] });
    }
  });

  app.view(LOG_MODAL_CALLBACK_ID, async ({ ack, view, client, logger }) => {
    await ack();
    const ctx = decodeLogContext(view.private_metadata);
    const selected = view.state.values[RECORD_BLOCK_ID]?.[RECORD_ACTION_ID]?.selected_option;
    const comment = view.state.values[COMMENT_BLOCK_ID]?.[COMMENT_ACTION_ID]?.value?.trim();
    const dm = (text: string) => client.chat.postMessage({ channel: ctx.requesterId, text });
    try {
      if (!selected) throw new Error("No record selected");
      const target = parseValue(selected.value);
      const [permalink, authorInfo] = await Promise.all([
        client.chat.getPermalink({ channel: ctx.channelId, message_ts: ctx.threadTs ?? ctx.messageTs }),
        ctx.authorId === "unknown" ? undefined : client.users.info({ user: ctx.authorId }).catch(() => undefined),
      ]);
      const author = authorInfo?.user?.real_name ?? authorInfo?.user?.name ?? ctx.authorId;
      const channelLabel = ctx.channelName ? `#${ctx.channelName}` : ctx.channelId;
      const markdown = [
        comment,
        ...(comment ? [""] : []),
        ...ctx.text.split("\n").map((l) => `> ${l}`),
        "",
        `— ${author} in ${channelLabel}`,
        `[View in Slack](${permalink.permalink})`,
      ].join("\n");
      const title = `Slack: ${truncate((ctx.text || "message").replace(/\s+/g, " "), 60)}`;
      await twenty.createNote({ title, markdown, target });
      const record = await twenty.getRecord(target.kind, target.id).catch(() => undefined);
      await dm(`:white_check_mark: Note logged on ${KIND_LABEL[target.kind].toLowerCase()} ${record ? `<${record.url}|${record.name}>` : selected.text.text}.`);
    } catch (err) {
      logger.error("Log to CRM failed", err);
      await dm(":x: Could not log that message to the CRM. Nothing was saved — please try again.").catch(() => undefined);
    }
  });
};
