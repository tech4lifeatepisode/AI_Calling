export interface CursorRowResult {
  updatedAt: string;
  ok: boolean;
}

export const NOTION_SYNC_NAME = "notion_retell_sessions";
export const NOTION_SYNC_INITIAL_CURSOR = "2026-09-30T23:59:59.999Z";
export const NOTION_SYNC_LAG_LIMIT_MINUTES = 30;

function time(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Advance the cursor through leading successful timestamp groups.
 * A failed row keeps the cursor in front of its timestamp so the next run retries it.
 * Later successes in the same batch do not jump the cursor over that hole.
 */
export function nextCursor(current: string | null, results: CursorRowResult[]): string | null {
  const ordered = [...results].sort((a, b) => time(a.updatedAt) - time(b.updatedAt));
  let cursor = current;
  let index = 0;

  while (index < ordered.length) {
    const stamp = time(ordered[index]?.updatedAt ?? "");
    const stampIso = ordered[index]?.updatedAt ?? null;
    let failed = false;

    while (index < ordered.length && time(ordered[index]?.updatedAt ?? "") === stamp) {
      if (!ordered[index]?.ok) {
        failed = true;
      }
      index += 1;
    }

    if (failed || !stampIso) {
      break;
    }

    if (!cursor || time(stampIso) > time(cursor)) {
      cursor = stampIso;
    }
  }

  return cursor;
}

export function notionSyncLagMinutes(input: {
  latestUpdatedAt: string | null;
  oldestUpdatedAt?: string | null;
  cursor: string | null;
  now?: number;
}): number {
  const now = input.now ?? Date.now();
  if (!input.latestUpdatedAt) {
    return 0;
  }

  if (!input.cursor) {
    const oldest = input.oldestUpdatedAt ?? input.latestUpdatedAt;
    return Math.max(0, (now - time(oldest)) / 60_000);
  }

  const latest = time(input.latestUpdatedAt);
  const cursor = time(input.cursor);
  if (latest <= cursor) {
    return 0;
  }

  return (latest - cursor) / 60_000;
}
