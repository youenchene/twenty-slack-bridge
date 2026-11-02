import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpportunityNotification } from "../blocks/notification.js";
import { stageLabel, type TwentyClient } from "../twenty-client.js";

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);

export interface ParsedOpportunityEvent {
  readonly kind: "created" | "stage_changed";
  readonly id: string;
  readonly name: string;
  readonly stage?: string;
  readonly previousStage?: string;
  readonly amount?: string;
}

const formatAmount = (v: unknown): string | undefined => {
  const a = obj(v);
  const micros = typeof a.amountMicros === "number" ? a.amountMicros : Number(a.amountMicros);
  if (!Number.isFinite(micros) || a.amountMicros === null) return undefined;
  return `${(micros / 1_000_000).toLocaleString("en-US")} ${str(a.currencyCode) ?? ""}`.trim();
};

/**
 * Pure parser. Twenty's payload shape has changed between versions, so this accepts
 * both `{eventName, record, updatedFields}` and the older `{event, data}` shapes.
 * Returns undefined for anything that is not an opportunity creation or stage change.
 */
export const parseOpportunityEvent = (payload: unknown): ParsedOpportunityEvent | undefined => {
  const p = obj(payload);
  const eventName = str(p.eventName) ?? str(p.event);
  if (!eventName?.startsWith("opportunity.")) return undefined;
  const action = eventName.split(".")[1];
  const record = obj(p.record ?? p.data);
  const id = str(record.id);
  if (!id) return undefined;
  const base = { id, name: str(record.name) ?? "(unnamed)", stage: stageLabel(str(record.stage)), amount: formatAmount(record.amount) };
  if (action === "created") return { kind: "created", ...base };
  if (action !== "updated") return undefined;

  const props = obj(p.properties);
  const updated = [p.updatedFields, props.updatedFields, record.updatedFields].find(Array.isArray) as unknown[] | undefined;
  const before = obj(props.before ?? p.before);
  const previousStage = str(before.stage);
  const stageTouched = updated?.includes("stage") || (previousStage !== undefined && previousStage !== str(record.stage));
  if (!stageTouched) return undefined;
  return { kind: "stage_changed", ...base, previousStage: stageLabel(previousStage) };
};

export const verifySignature = (secret: string, timestamp: string | undefined, signature: string | undefined, rawBody: string): boolean => {
  if (!timestamp || !signature) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}:${rawBody}`).digest();
  const got = Buffer.from(signature, "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
};

const readBody = (req: IncomingMessage, limit = 1_000_000): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

export interface WebhookDeps {
  readonly twenty: TwentyClient;
  readonly webhookSecret?: string;
  readonly notify: (n: OpportunityNotification) => Promise<void>;
  readonly logger: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void };
}

export const createTwentyWebhookHandler =
  (deps: WebhookDeps) =>
  async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const reply = (status: number, msg: string) => {
      res.writeHead(status, { "Content-Type": "text/plain" }).end(msg);
    };
    try {
      const raw = await readBody(req);
      if (deps.webhookSecret) {
        const ok = verifySignature(
          deps.webhookSecret,
          req.headers["x-twenty-webhook-timestamp"] as string | undefined,
          req.headers["x-twenty-webhook-signature"] as string | undefined,
          raw,
        );
        if (!ok) return reply(401, "invalid signature");
      }
      const event = parseOpportunityEvent(JSON.parse(raw));
      reply(200, "ok"); // ack fast; Slack posting happens after
      if (!event) return;
      await deps.notify({
        kind: event.kind,
        name: event.name,
        url: deps.twenty.recordUrl("opportunity", event.id),
        stage: event.stage,
        previousStage: event.previousStage,
        amount: event.amount,
      });
    } catch (err) {
      deps.logger.error("Twenty webhook failed", err);
      if (!res.headersSent) reply(400, "bad request");
    }
  };
