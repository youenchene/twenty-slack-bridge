import { App, LogLevel } from "@slack/bolt";
import { createApprovalStore } from "./approvals.js";
import { APPROVE_ACTION_ID, buildApprovalResultBlocks, CANCEL_ACTION_ID } from "./blocks/approval.js";
import { buildNotificationBlocks } from "./blocks/notification.js";
import { registerCrmCommand } from "./commands/crm.js";
import { registerAppHome } from "./home/app-home.js";
import { loadConfig } from "./config.js";
import { registerLogToCrm } from "./shortcuts/log-to-crm.js";
import { createTwentyClient } from "./twenty-client.js";
import { registerLinkUnfurls } from "./unfurls/link-shared.js";
import { createTwentyWebhookHandler } from "./webhooks/twenty.js";

const config = loadConfig();
const twenty = createTwentyClient({ baseUrl: config.twentyBaseUrl, apiKey: config.twentyApiKey });
const approvals = createApprovalStore();

const app = new App({
  token: config.slackBotToken,
  appToken: config.slackAppToken,
  signingSecret: config.slackSigningSecret,
  socketMode: true,
  port: config.port,
  logLevel: LogLevel.INFO,
  customRoutes: [
    {
      path: "/healthz",
      method: ["GET"],
      handler: (_req, res) => void res.writeHead(200).end("ok"),
    },
    {
      path: "/webhooks/twenty",
      method: ["POST"],
      handler: (req, res) =>
        void createTwentyWebhookHandler({
          twenty,
          webhookSecret: config.twentyWebhookSecret,
          logger: app.logger,
          notify: async (n) => {
            await app.client.chat.postMessage({
              channel: config.slackNotifyChannel,
              text: n.kind === "created" ? `New opportunity: ${n.name}` : `${n.name} moved to ${n.stage}`,
              blocks: buildNotificationBlocks(n),
            });
          },
        })(req, res),
    },
  ],
});

registerCrmCommand(app, twenty);
registerLogToCrm(app, twenty);
registerLinkUnfurls(app, twenty);
registerAppHome(app, twenty);

if (!config.twentyWebhookSecret) {
  app.logger.warn(
    "TWENTY_WEBHOOK_SECRET is not set: /webhooks/twenty accepts unsigned requests, so anyone who knows the URL " +
      "can post fake notifications. Set the same secret in Twenty (webhook settings) and in this env var.",
  );
}

// Approve/Cancel card handlers for any write that requires confirmation (update/delete).
const resolveApproval = (approve: boolean) =>
  (async ({ ack, action, body, respond, logger }) => {
    await ack();
    const id = "value" in action ? action.value : undefined;
    const pending = id ? approvals.take(id) : undefined;
    if (!pending) {
      await respond({ replace_original: true, text: "This approval has expired.", blocks: buildApprovalResultBlocks("This request", "Expired") });
      return;
    }
    if (body.user.id !== pending.requesterId) {
      await respond({ response_type: "ephemeral", replace_original: false, text: "Only the requester can answer this approval." });
      return;
    }
    try {
      const outcome = approve ? await pending.run() : "Cancelled";
      await respond({ replace_original: true, text: outcome, blocks: buildApprovalResultBlocks(pending.description, approve ? `:white_check_mark: ${outcome}` : ":no_entry_sign: Cancelled") });
    } catch (err) {
      logger.error("Approved action failed", err);
      await respond({ replace_original: true, text: "Action failed", blocks: buildApprovalResultBlocks(pending.description, ":x: Failed — nothing was changed") });
    }
  }) satisfies Parameters<typeof app.action>[1];
app.action(APPROVE_ACTION_ID, resolveApproval(true));
app.action(CANCEL_ACTION_ID, resolveApproval(false));

await app.start();
app.logger.info(`twenty-slack-bridge running (Socket Mode, HTTP on :${config.port})`);
