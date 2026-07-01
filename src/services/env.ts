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
