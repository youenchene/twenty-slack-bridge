import type { App } from "@slack/bolt";
import type { KnownBlock } from "@slack/types";
import { buildUnfurlBlocks } from "../blocks/unfurl.js";
import type { TwentyClient } from "../twenty-client.js";

export const registerLinkUnfurls = (app: App, twenty: TwentyClient): void => {
  app.event("link_shared", async ({ event, client, logger }) => {
    const entries = await Promise.all(
      event.links.map(async ({ url }): Promise<[string, { blocks: KnownBlock[] }] | undefined> => {
        const ref = twenty.parseRecordUrl(url);
        if (!ref) return undefined;
        try {
          return [url, { blocks: buildUnfurlBlocks(await twenty.getRecord(ref.kind, ref.id)) }];
        } catch (err) {
          logger.warn(`Unfurl lookup failed for ${url}`, err);
          return undefined;
        }
      }),
    );
    const unfurls = Object.fromEntries(entries.filter((e): e is NonNullable<typeof e> => e !== undefined));
    if (Object.keys(unfurls).length === 0) return;
    const target =
      event.channel === "COMPOSER" || !event.message_ts
        ? { unfurl_id: event.unfurl_id, source: event.source }
        : { channel: event.channel, ts: event.message_ts };
    await client.chat.unfurl({ ...target, unfurls } as Parameters<typeof client.chat.unfurl>[0]);
  });
};
