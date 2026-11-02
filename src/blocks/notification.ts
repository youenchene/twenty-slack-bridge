import type { KnownBlock } from "@slack/types";
import { escapeMrkdwn } from "./format.js";

export interface OpportunityNotification {
  readonly kind: "created" | "stage_changed";
  readonly name: string;
  readonly url: string;
  readonly stage?: string;
  readonly previousStage?: string;
  readonly amount?: string;
}

export const buildNotificationBlocks = (n: OpportunityNotification): KnownBlock[] => {
  const headline =
    n.kind === "created"
      ? `:sparkles: New opportunity *<${n.url}|${escapeMrkdwn(n.name)}>*`
      : `:arrows_counterclockwise: *<${n.url}|${escapeMrkdwn(n.name)}>* moved ${n.previousStage ? `from *${escapeMrkdwn(n.previousStage)}* ` : ""}to *${escapeMrkdwn(n.stage ?? "?")}*`;
  const details = [n.kind === "created" && n.stage && `Stage: ${escapeMrkdwn(n.stage)}`, n.amount && `Amount: ${escapeMrkdwn(n.amount)}`].filter(Boolean);
  return [
    { type: "section", text: { type: "mrkdwn", text: headline } },
    ...(details.length ? [{ type: "context" as const, elements: [{ type: "mrkdwn" as const, text: details.join("  ·  ") }] }] : []),
  ];
};
