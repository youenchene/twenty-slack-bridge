# twenty-slack-bridge

A deterministic Slack app (Bolt for TypeScript, Socket Mode) that connects a Slack workspace to a self-hosted [Twenty CRM](https://twenty.com). **No AI/LLM calls live in this bot.** Natural-language CRM access is done separately by connecting Claude to a Twenty MCP server.

## Features

| # | Feature | How |
|---|---------|-----|
| 1 | `/crm <search>` | Searches People, Companies and Opportunities, replies (only to you) with a compact card: name, company, stage, owner, link. |
| 2 | **Log to CRM** message shortcut | Message → modal → search/pick a record → *Create note*. Note = optional comment + quoted message + author + channel + Slack permalink. |
| 3 | Link unfurls | Pasting `https://<twenty>/object/{person,company,opportunity}/<id>` shows type, name, company, stage. |
| 4 | Notifications | Twenty webhook → `POST /webhooks/twenty` → post in `SLACK_NOTIFY_CHANNEL` when an Opportunity is created or its stage changes. |
| 5 | App Home | The bot's **Home** tab shows *My open opportunities* (owned by you, any stage except Customer) and *Follow-ups due today* (unfinished tasks assigned to you, due today or overdue). Refreshed each time you open the tab. |

Destructive or ambiguous writes (update/delete) must go through the Approve/Cancel card (`src/approvals.ts`, `src/blocks/approval.ts`, handlers in `src/index.ts`). The MVP only creates notes, which apply directly, so nothing uses the card yet.

## Known limitation: writes are attributed to the bot

The bot uses **one shared Twenty API key**. Every write (e.g. a note from *Log to CRM*) appears in Twenty as made by the API key / bot, **not** by the Slack user who triggered it. The Slack author is recorded in the note body instead. Per-user attribution of writes is a planned later iteration. The App Home tab already matches Slack users to Twenty workspace members by email, but only to *read* their data.

## Configuration

All config is environment-only (see `.env.example`):

| Variable | Notes |
|----------|-------|
| `TWENTY_BASE_URL` | e.g. `https://crm.tooling.pulsover.io` |
| `TWENTY_API_KEY` | Twenty API key |
| `SLACK_BOT_TOKEN` | `xoxb-…` |
| `SLACK_APP_TOKEN` | `xapp-…`, scope `connections:write` (Socket Mode) |
| `SLACK_SIGNING_SECRET` | Slack app → Basic Information |
| `SLACK_NOTIFY_CHANNEL` | Channel **ID** (invite the bot to it) |
| `PORT` | HTTP port for the Twenty webhook (default 3000) |
| `TWENTY_WEBHOOK_SECRET` | Optional but recommended. If set, webhook signatures are verified; if not, the bot logs a warning at startup. See step 3. |
| `TZ` | Timezone that defines "due today" on the Home tab, e.g. `Europe/Paris`. Defaults to UTC in Docker. |

## 1. Create the Slack app

Fastest: *api.slack.com/apps → Create New App → From a manifest* and paste `slack-manifest.json`. Then:

1. **Install to Workspace**, copy the **Bot User OAuth Token** → `SLACK_BOT_TOKEN`.
2. **Basic Information → App-Level Tokens**: create one with `connections:write` → `SLACK_APP_TOKEN`. Copy the **Signing Secret** → `SLACK_SIGNING_SECRET`.

Manual setup, if you prefer the UI. The manifest does all of this:

- **Bot scopes:** `commands`, `chat:write`, `app_mentions:read`, `links:read`, `links:write`, plus `users:read` (author's real name in notes) and `users:read.email` (matches you to your Twenty user on the Home tab).
- **Event subscriptions → bot events:** `app_mention`, `link_shared`, `app_home_opened`.
- **App Home:** enable the Home tab.
- **App Unfurl Domains:** `crm.tooling.pulsover.io`.
- **Slash command:** `/crm` (no request URL needed in Socket Mode).
- **Interactivity & Shortcuts:** enable; add a **message** shortcut, name *Log to CRM*, callback ID `log_to_crm`.
- **Socket Mode:** enable.

## 2. Create the Twenty API key

In Twenty: **Settings → APIs & Webhooks → API keys → Create**, copy the key into `TWENTY_API_KEY`.

## 3. Register the Twenty webhook

In Twenty: **Settings → APIs & Webhooks → Webhooks → Create webhook**, URL `https://<bot-subdomain>/webhooks/twenty`. Twenty sends every event type. The bot ignores everything except `opportunity.created` and `opportunity.updated` where the stage changed. Twenty does not generate the secret: create one (`openssl rand -hex 32`), paste it into the webhook's **Secret** field in Twenty, and put the same value in `TWENTY_WEBHOOK_SECRET`. If the two differ, every webhook is rejected with 401.

> Twenty's payload shape has changed between versions; `src/webhooks/twenty.ts` accepts `{eventName, record, updatedFields | properties.before}` and the older `{event, data}`. Check it against your instance with the manual test checklist below.

## 4. Run

```bash
cp .env.example .env   # fill in values
npm install
npm run dev            # tsx watch, loads .env
npm test               # unit tests (Twenty client, webhook parser)
npm run typecheck
npm run validate:blocks   # validates all Block Kit layouts via Slack's blocks.validate (needs SLACK_BOT_TOKEN)
```

Docker:

```bash
docker compose up --build -d
```

Health check: `GET /healthz`.

## Deployment (Cloudron)

Run the bot as a **custom app on the same Cloudron server** with its own subdomain (for example `slack-bridge.tooling.pulsover.io`) using the Dockerfile in this repo, with the environment variables above. Register the Twenty webhook as `https://<bot-subdomain>/webhooks/twenty`. Slack itself needs no public URL (Socket Mode).

## Verified Twenty REST details (against the live instance)

- Auth: `Authorization: Bearer $TWENTY_API_KEY`. Responses are `{ data: { <plural>: [...] }, totalCount, pageInfo }`.
- Collections: `/rest/people`, `/rest/companies`, `/rest/opportunities`, `/rest/notes`, `/rest/noteTargets`.
- Filters: `filter=or(name[ilike]:"%x%",…)` / `and(…)`. `depth=1` inlines `company`, `owner` and `pointOfContact`.
- Opportunity `stage` values: `NEW`, `SCREENING`, `MEETING`, `PROPOSAL`, `CUSTOMER`.
- Note creation: `POST /rest/notes {title, bodyV2:{markdown}}` → `data.createNote.id`, then `POST /rest/noteTargets {noteId, targetPersonId|targetCompanyId|targetOpportunityId}`.
- Record URLs: `/object/{person|company|opportunity|task}/<id>`.
- Workspace members: `/rest/workspaceMembers?filter=userEmail[ilike]:"…"`. Opportunities have `ownerId`; tasks have `assigneeId`, `dueAt` and `status` (`TODO`, `IN_PROGRESS`, `DONE`).
- Sorting: `orderBy=dueAt[AscNullsLast]`.

## Manual test checklist

- [ ] `npm run validate:blocks` reports OK for every layout.
- [ ] `/crm egis` returns Opportunities, Companies and People cards with working links.
- [ ] `/crm zzzzz` shows a "No CRM results" message; `/crm` alone shows usage.
- [ ] Message `⋯` → **Log to CRM** opens the modal; typing 2+ characters lists records in the picker.
- [ ] Submit creates a note in Twenty on the chosen record, with the quote, author, channel and a working Slack link; you get a confirmation DM.
- [ ] Same on a message inside a thread (the permalink points to the thread).
- [ ] Pasting a Twenty record URL (person, company, opportunity) unfurls a card. A URL on another host does not.
- [ ] Creating an opportunity in Twenty posts a notification in `SLACK_NOTIFY_CHANNEL`.
- [ ] Changing an opportunity's stage posts a notification. Editing only its name does not.
- [ ] `curl -X POST /webhooks/twenty -d '{}'` with a wrong signature returns 401 when `TWENTY_WEBHOOK_SECRET` is set.
- [ ] Opening the bot's **Home** tab shows your open opportunities and tasks due today or overdue (overdue ones are flagged).
- [ ] A Slack user whose email is not a Twenty user sees the "couldn't find a Twenty user" message.
- [ ] Starting the bot without `TWENTY_WEBHOOK_SECRET` logs a warning.
- [ ] Bot with a revoked/invalid `TWENTY_API_KEY`: `/crm` replies with a friendly error, process stays up.
