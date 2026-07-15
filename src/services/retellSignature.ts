import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_RE = /^v=(\d+),d=(.+)$/;

export function verifyRetellSignature(
  rawBody: string,
  apiKey: string,
  signature: string | undefined
): boolean {
  if (!signature || !apiKey) return false;

  const match = signature.match(SIGNATURE_RE);
  if (!match) return false;

  const [, timestamp, digest] = match;
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return false;

  if (Math.abs(Date.now() - ts) > 5 * 60 * 1000) return false;

  const expected = createHmac("sha256", apiKey)
    .update(rawBody + timestamp)
    .digest("hex");

  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(expected));
  } catch {
    return false;
  }
}
