import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  MCP_SERVER_SECRET: z.string().min(1),
  HUBSPOT_ACCESS_TOKEN: z.string().min(1),
  HUBSPOT_API_BASE: z.string().url().default("https://api.hubapi.com"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DEFAULT_TIMEZONE: z.string().default("Europe/Madrid"),
  HUBSPOT_IN_PERSON_MEETING_URL: z.string().url(),
  HUBSPOT_VIRTUAL_MEETING_URL: z.string().url(),
  HUBSPOT_IN_PERSON_SLUG: z.string().min(1),
  HUBSPOT_VIRTUAL_SLUG: z.string().min(1),
  DEFAULT_TOUR_DURATION_MINUTES: z.coerce.number().default(30),
  RETELL_API_KEY: z.string().min(1).optional(),
  RETELL_API_BASE: z.string().url().default("https://api.retellai.com"),
  HUBSPOT_AI_CALL_ATTEMPTED_PROPERTY: z.string().default("ai_call_attempted"),
  HUBSPOT_RETELL_CALL_ID_PROPERTIES: z
    .string()
    .default("retell_call_id,retell_session_id,ai_retell_call_id"),
  HUBSPOT_DEAL_UNIT_TYPE_PROPERTY: z.string().default("unit_type__carabanchel_"),
  HUBSPOT_DEAL_CONTRACT_START_PROPERTY: z.string().default("desired_check_in_date"),
  HUBSPOT_DEAL_CONTRACT_END_PROPERTY: z.string().default("desired_check_out_date"),
  HUBSPOT_DEAL_PIPELINE_LABEL: z.string().default("Hubs B2C - Carabanchel"),
  SYNC_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  SYNC_INTERVAL_MS: z.coerce.number().default(3_600_000),
  SYNC_INITIAL_DELAY_MS: z.coerce.number().default(60_000),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (!cachedEnv) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const missing = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new Error(`Invalid environment configuration: ${missing}`);
    }
    cachedEnv = parsed.data;
  }
  return cachedEnv;
}

export function resetEnvCache(): void {
  cachedEnv = null;
}

export function requireRetellApiKey(): string {
  const key = getEnv().RETELL_API_KEY;
  if (!key) {
    throw new Error("RETELL_API_KEY is required for call sync");
  }
  return key;
}
