import type { HomeView, KnownBlock } from "@slack/types";
import type { CrmRecord, CrmTask, WorkspaceMember } from "../twenty-client.js";
import { detailLine, escapeMrkdwn, recordLink } from "./format.js";

export interface HomeData {
  readonly member: WorkspaceMember;
  readonly opportunities: readonly CrmRecord[];
  readonly tasks: readonly CrmTask[];
  /** ISO timestamp of the start of today; tasks due before it are flagged overdue. */
  readonly startOfToday: string;
}

const text = (t: string): KnownBlock => ({ type: "section", text: { type: "mrkdwn", text: t } });
const header = (t: string): KnownBlock => ({ type: "header", text: { type: "plain_text", text: t } });
const muted = (t: string): KnownBlock => ({ type: "context", elements: [{ type: "mrkdwn", text: t }] });

/** Slack renders <!date^…> in each viewer's own timezone. */
const slackDate = (iso: string): string =>
  `<!date^${Math.floor(Date.parse(iso) / 1000)}^{date_short_pretty}|${iso.slice(0, 10)}>`;

const opportunityBlock = (o: CrmRecord): KnownBlock => text(`:moneybag: *${recordLink(o)}*\n${detailLine(o) || "_no details_"}`);

const taskBlock = (t: CrmTask, startOfToday: string): KnownBlock => {
  const overdue = t.dueAt !== undefined && t.dueAt < startOfToday;
  const due = t.dueAt ? `${overdue ? ":warning: Overdue since" : "Due"} ${slackDate(t.dueAt)}` : "No due date";
  return text(`:ballot_box_with_check: *<${t.url}|${escapeMrkdwn(t.title)}>*\n${due}`);
};

export const buildHomeView = (d: HomeData): HomeView => ({
  type: "home",
  blocks: [
    header(`Twenty CRM — ${d.member.name}`),
    header(`My open opportunities (${d.opportunities.length})`),
    ...(d.opportunities.length ? d.opportunities.map(opportunityBlock) : [muted("No open opportunities owned by you.")]),
    { type: "divider" },
    header(`Follow-ups due today (${d.tasks.length})`),
    ...(d.tasks.length ? d.tasks.map((t) => taskBlock(t, d.startOfToday)) : [muted("Nothing due today or overdue. :tada:")]),
    { type: "divider" },
    muted("Opportunities you own in any stage except Customer · unfinished tasks assigned to you, due today or earlier"),
  ],
});

export const buildHomeMessageView = (message: string): HomeView => ({
  type: "home",
  blocks: [header("Twenty CRM"), text(message)],
});

export const HOME_NOT_LINKED = (email?: string): string =>
  email
    ? `I couldn't find a Twenty user with the email *${escapeMrkdwn(email)}*. Use the same email in Slack and Twenty to see your opportunities and follow-ups here.`
    : "I couldn't read your Slack email address, so I can't match you to a Twenty user. (The app needs the `users:read.email` scope.)";

export const HOME_ERROR = ":x: Could not load your CRM data right now. Reopen this tab to try again.";
