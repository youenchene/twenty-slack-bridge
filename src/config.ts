export interface Config {
  readonly twentyApiKey: string;
  readonly twentyBaseUrl: string;
  readonly slackBotToken: string;
  readonly slackAppToken: string;
  readonly slackSigningSecret: string;
  readonly slackNotifyChannel: string;
  readonly twentyWebhookSecret?: string;
  readonly port: number;
}

const required = (env: NodeJS.ProcessEnv, key: string): string => {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => ({
  twentyApiKey: required(env, "TWENTY_API_KEY"),
  twentyBaseUrl: required(env, "TWENTY_BASE_URL").replace(/\/+$/, ""),
  slackBotToken: required(env, "SLACK_BOT_TOKEN"),
  slackAppToken: required(env, "SLACK_APP_TOKEN"),
  slackSigningSecret: required(env, "SLACK_SIGNING_SECRET"),
  slackNotifyChannel: required(env, "SLACK_NOTIFY_CHANNEL"),
  twentyWebhookSecret: env.TWENTY_WEBHOOK_SECRET?.trim() || undefined,
  port: Number(env.PORT ?? 3000),
});
