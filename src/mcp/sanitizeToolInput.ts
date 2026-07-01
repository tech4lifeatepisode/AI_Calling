export function sanitizeNulls<T>(value: T): T {
  if (value === null) {
    return undefined as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeNulls(item)) as T;
  }

  if (typeof value === "object" && value !== null) {
    const sanitized: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      const next = sanitizeNulls(nested);
      if (next !== undefined) {
        sanitized[key] = next;
      }
    }
    return sanitized as T;
  }

  return value;
}

export function sanitizeMcpRequestBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;

  const request = body as {
    method?: string;
    params?: { arguments?: unknown };
  };

  if (request.method !== "tools/call" || !request.params?.arguments) {
    return body;
  }

  return {
    ...request,
    params: {
      ...request.params,
      arguments: sanitizeNulls(request.params.arguments),
    },
  };
}
