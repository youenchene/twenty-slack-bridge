import type { App } from "@slack/bolt";
import { buildHomeMessageView, buildHomeView, HOME_ERROR, HOME_NOT_LINKED } from "../blocks/home.js";
import type { TwentyClient } from "../twenty-client.js";

/** Start and end of the current day in the server's timezone (set TZ, e.g. Europe/Paris). */
export const dayBounds = (now: Date): { start: string; end: string } => {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start: start.toISOString(), end: end.toISOString() };
};

export const registerAppHome = (app: App, twenty: TwentyClient, now: () => Date = () => new Date()): void => {
  app.event("app_home_opened", async ({ event, client, logger }) => {
    if (event.tab !== "home") return;
    const publish = (view: Parameters<typeof client.views.publish>[0]["view"]) =>
      client.views.publish({ user_id: event.user, view });
    try {
      const info = await client.users.info({ user: event.user });
      const email = info.user?.profile?.email;
      const member = email ? await twenty.findMemberByEmail(email) : undefined;
      if (!member) {
        await publish(buildHomeMessageView(HOME_NOT_LINKED(email)));
        return;
      }
      const { start, end } = dayBounds(now());
      const [opportunities, tasks] = await Promise.all([
        twenty.listOpenOpportunities(member.id),
        twenty.listDueTasks(member.id, end),
      ]);
      await publish(buildHomeView({ member, opportunities, tasks, startOfToday: start }));
    } catch (err) {
      logger.error("App Home failed", err);
      await publish(buildHomeMessageView(HOME_ERROR)).catch(() => undefined);
    }
  });
};
