import "dotenv/config";
import { listNotionSessionSnapshots } from "../src/services/notion.js";
import { normalizeSentiment, normalizeTranscriptForNotion } from "../src/services/notionMap.js";
import {
  countRetellSessionsTouchedSince,
  getRetellSessionTimestampBounds,
  getRetellSessionsByIds,
  listRetellSessionIdsTouchedSince,
  listRetellSessionsTouchedSince,
} from "../src/services/supabase.js";

const since = "2026-10-01T00:00:00Z";

function latestIso(values: Array<string | null>): string | null {
  let best: string | null = null;
  let bestTime = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const time = Date.parse(value);
    if (!Number.isNaN(time) && time > bestTime) {
      best = value;
      bestTime = time;
    }
  }
  return best;
}

const bounds = await getRetellSessionTimestampBounds();
const supabaseCount = await countRetellSessionsTouchedSince(since);
const supabaseIds = await listRetellSessionIdsTouchedSince(since);
const snapshots = await listNotionSessionSnapshots();

const notionIds = new Map<string, number>();
for (const snapshot of snapshots) {
  if (!snapshot.sessionId) continue;
  notionIds.set(snapshot.sessionId, (notionIds.get(snapshot.sessionId) ?? 0) + 1);
}

const missing = supabaseIds.filter((sessionId) => !notionIds.has(sessionId));
const duplicateSessionIds = [...notionIds.entries()].filter(([, count]) => count > 1);
const latestCallTime = latestIso(snapshots.map((snapshot) => snapshot.callTime));

console.log(`Supabase latest updated_at: ${bounds.latestUpdatedAt ?? "none"}`);
console.log(`Supabase latest created_at: ${bounds.latestCreatedAt ?? "none"}`);
console.log(`Notion latest Call time: ${latestCallTime ?? "none"}`);
console.log(`Supabase rows since ${since}: ${supabaseCount}`);
console.log(`Missing in Notion since ${since}: ${missing.length}`);
console.log(`Duplicate Session IDs in Notion: ${duplicateSessionIds.length}`);

if (duplicateSessionIds.length > 0) {
  console.log(
    `Duplicate examples: ${duplicateSessionIds
      .slice(0, 10)
      .map(([sessionId, count]) => `${sessionId} (${count})`)
      .join(", ")}`
  );
}

const spotSource =
  supabaseCount > 0
    ? await listRetellSessionsTouchedSince(since, Math.max(0, supabaseCount - 3), 3)
    : [];
const spotRows = spotSource.length
  ? spotSource
  : await getRetellSessionsByIds(missing.slice(0, 3));
const bySession = new Map(snapshots.map((snapshot) => [snapshot.sessionId, snapshot]));

console.log("Spot check:");
for (const row of spotRows) {
  const notion = bySession.get(row.session_id);
  const transcript = normalizeTranscriptForNotion(row.transcript);
  console.log(
    JSON.stringify(
      {
        sessionId: row.session_id,
        inNotion: Boolean(notion),
        cost: { supabase: row.cost ?? null, notion: notion?.cost ?? null },
        durationSeconds: {
          supabase: row.duration_seconds ?? null,
          notion: notion?.durationSeconds ?? null,
        },
        outcome: { supabase: row.session_outcome ?? null, notion: notion?.outcome ?? null },
        sentiment: {
          supabase: normalizeSentiment(row.user_sentiment) ?? null,
          notion: notion?.sentiment ?? null,
        },
        transcriptLength: {
          supabase: transcript.length,
          notion: notion?.transcriptLength ?? null,
        },
      },
      null,
      2
    )
  );
}

if (missing.length > 0 || duplicateSessionIds.length > 0) {
  process.exitCode = 1;
}
