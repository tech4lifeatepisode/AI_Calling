type LogMeta = Record<string, unknown>;

const SECRET_KEYS = [
  "MCP_SERVER_SECRET",
  "HUBSPOT_ACCESS_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "Authorization",
  "authorization",
];

function scrubValue(key: string, value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (SECRET_KEYS.some((k) => key.toLowerCase().includes(k.toLowerCase()))) {
    return "[REDACTED]";
  }
  for (const secret of [
    process.env.MCP_SERVER_SECRET,
    process.env.HUBSPOT_ACCESS_TOKEN,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ]) {
    if (secret && value.includes(secret)) {
      return "[REDACTED]";
    }
  }
  return value;
}

function scrubMeta(meta?: LogMeta): LogMeta | undefined {
  if (!meta) return undefined;
  const scrubbed: LogMeta = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      scrubbed[key] = scrubMeta(value as LogMeta);
    } else {
      scrubbed[key] = scrubValue(key, value);
    }
  }
  return scrubbed;
}

function formatMessage(level: string, message: string, meta?: LogMeta): string {
  const ts = new Date().toISOString();
  const scrubbed = scrubMeta(meta);
  const suffix = scrubbed ? ` ${JSON.stringify(scrubbed)}` : "";
  return `[${ts}] ${level.toUpperCase()} ${message}${suffix}`;
}

export const logger = {
  info(message: string, meta?: LogMeta): void {
    console.log(formatMessage("info", message, meta));
  },
  warn(message: string, meta?: LogMeta): void {
    console.warn(formatMessage("warn", message, meta));
  },
  error(message: string, meta?: LogMeta): void {
    console.error(formatMessage("error", message, meta));
  },
  request(method: string, path: string, statusCode: number, durationMs: number): void {
    logger.info("HTTP request", { method, path, statusCode, durationMs });
  },
};

export function scrubHeaders(
  headers: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = scrubValue(key, value);
  }
  return result;
}

export function getServiceName(): string {
  return "episode-retell-hubspot-mcp";
}
