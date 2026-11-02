import type { App } from "@slack/bolt";
import { buildSearchBlocks, searchFallbackText } from "../blocks/search-results.js";
import type { TwentyClient } from "../twenty-client.js";

export const registerCrmCommand = (app: App, twenty: TwentyClient): void => {
  app.command("/crm", async ({ command, ack, respond, logger }) => {
    await ack();
    const query = command.text.trim();
    if (!query) {
      await respond({ response_type: "ephemeral", text: "Usage: `/crm <name, company or opportunity>`" });
      return;
    }
    try {
      const results = await twenty.searchAll(query);
      await respond({
        response_type: "ephemeral",
        text: searchFallbackText(query),
        blocks: buildSearchBlocks(query, results),
      });
    } catch (err) {
      logger.error("/crm search failed", err);
      await respond({ response_type: "ephemeral", text: ":x: CRM search failed. Please try again in a moment." });
    }
  });
};
