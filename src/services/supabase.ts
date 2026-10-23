import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type {
  McpToolCallRow,
  RetellSessionPricingUpdate,
  RetellSessionRow,
  RoomPricingRequestRow,
  SyncRunRow,
  TourBookingRow,
} from "../types/supabase.js";
import { getEnv } from "./env.js";
import { logger } from "./logger.js";
import { enqueueRetellSessionNotionSync } from "./notionSyncQueue.js";

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!client) {
    const env = getEnv();
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export async function upsertRetellSession(
  data: RetellSessionRow
): Promise<{ success: boolean; error?: string }> {
  try {
    const row = {
      ...data,
      updated_at: new Date().toISOString(),
    };

    const { error } = await getClient()
      .from("retell_sessions")
      .upsert(row, { onConflict: "session_id" });

    if (error) {
      logger.error("Supabase upsertRetellSession failed", { message: error.message });
      return { success: false, error: error.message };
    }

    enqueueRetellSessionNotionSync(row.session_id);

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Supabase upsertRetellSession exception", { message });
    return { success: false, error: message };
  }
}

export async function insertToolCallLog(
  data: McpToolCallRow
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await getClient().from("mcp_tool_calls").insert(data);

    if (error) {
      logger.error("Supabase insertToolCallLog failed", { message: error.message });
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Supabase insertToolCallLog exception", { message });
    return { success: false, error: message };
  }
}

export async function insertTourBooking(
  data: TourBookingRow
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const { data: inserted, error } = await getClient()
      .from("tour_bookings")
      .insert(data)
      .select("id")
      .single();

    if (error) {
      logger.error("Supabase insertTourBooking failed", { message: error.message });
      return { success: false, error: error.message };
    }

    return { success: true, id: inserted?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Supabase insertTourBooking exception", { message });
    return { success: false, error: message };
  }
}

export async function updateTourBooking(
  id: string,
  data: Partial<TourBookingRow>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await getClient()
      .from("tour_bookings")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      logger.error("Supabase updateTourBooking failed", { message: error.message });
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Supabase updateTourBooking exception", { message });
    return { success: false, error: message };
  }
}

export async function insertSyncRun(
  data: SyncRunRow
): Promise<{ id?: string; error?: string }> {
  try {
    const { data: inserted, error } = await getClient()
      .from("sync_runs")
      .insert(data)
      .select("id")
      .single();

    if (error) {
      logger.error("Supabase insertSyncRun failed", { message: error.message });
      return { error: error.message };
    }

    return { id: inserted?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Supabase insertSyncRun exception", { message });
    return { error: message };
  }
}

export async function updateSyncRun(
  id: string,
  data: Partial<SyncRunRow>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await getClient().from("sync_runs").update(data).eq("id", id);

    if (error) {
      logger.error("Supabase updateSyncRun failed", { message: error.message });
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Supabase updateSyncRun exception", { message });
    return { success: false, error: message };
  }
}

export async function getLastSuccessfulSyncTime(): Promise<Date | null> {
  try {
    const { data, error } = await getClient()
      .from("sync_runs")
      .select("completed_at")
      .eq("status", "success")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.warn("Supabase getLastSuccessfulSyncTime failed", { message: error.message });
      return null;
    }

    if (!data?.completed_at) return null;
    return new Date(data.completed_at);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("Supabase getLastSuccessfulSyncTime exception", { message });
    return null;
  }
}

export async function getRetellSessionBySessionId(
  sessionId: string
): Promise<RetellSessionRow | null> {
  try {
    const { data, error } = await getClient()
      .from("retell_sessions")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (error) {
      logger.warn("Supabase getRetellSessionBySessionId failed", { message: error.message });
      return null;
    }

    return (data as RetellSessionRow) ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("Supabase getRetellSessionBySessionId exception", { message });
    return null;
  }
}

export async function updateRetellSessionPricing(
  data: RetellSessionPricingUpdate
): Promise<{ success: boolean; error?: string }> {
  try {
    const { session_id, ...fields } = data;
    const { error } = await getClient()
      .from("retell_sessions")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("session_id", session_id);

    if (error) {
      logger.warn("Supabase updateRetellSessionPricing failed", { message: error.message });
      return { success: false, error: error.message };
    }

    enqueueRetellSessionNotionSync(session_id);

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("Supabase updateRetellSessionPricing exception", { message });
    return { success: false, error: message };
  }
}

export async function getLastSuccessfulSyncTimeByType(
  prefix: string
): Promise<Date | null> {
  try {
    const { data, error } = await getClient()
      .from("sync_runs")
      .select("completed_at")
      .eq("status", "success")
      .like("sync_type", `${prefix}%`)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.warn("Supabase getLastSuccessfulSyncTimeByType failed", { message: error.message });
      return null;
    }

    if (!data?.completed_at) return null;
    return new Date(data.completed_at);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("Supabase getLastSuccessfulSyncTimeByType exception", { message });
    return null;
  }
}

export async function listRetellSessionsUpdatedSince(
  since: Date,
  limit = 500
): Promise<RetellSessionRow[]> {
  try {
    const { data, error } = await getClient()
      .from("retell_sessions")
      .select("*")
      .gte("updated_at", since.toISOString())
      .order("updated_at", { ascending: true })
      .limit(limit);

    if (error) {
      logger.warn("Supabase listRetellSessionsUpdatedSince failed", { message: error.message });
      return [];
    }

    return (data as RetellSessionRow[]) ?? [];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("Supabase listRetellSessionsUpdatedSince exception", { message });
    return [];
  }
}

export async function listRetellSessions(limit = 200): Promise<RetellSessionRow[]> {
  try {
    const { data, error } = await getClient()
      .from("retell_sessions")
      .select("*")
      .order("session_time", { ascending: false })
      .limit(limit);

    if (error) {
      logger.warn("Supabase listRetellSessions failed", { message: error.message });
      return [];
    }

    return (data as RetellSessionRow[]) ?? [];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("Supabase listRetellSessions exception", { message });
    return [];
  }
}

export async function insertRoomPricingRequest(
  data: RoomPricingRequestRow
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const { data: inserted, error } = await getClient()
      .from("room_pricing_requests")
      .insert(data)
      .select("id")
      .single();

    if (error) {
      logger.warn("Supabase insertRoomPricingRequest failed", { message: error.message });
      return { success: false, error: error.message };
    }

    return { success: true, id: inserted?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("Supabase insertRoomPricingRequest exception", { message });
    return { success: false, error: message };
  }
}

export interface SyncStateRow {
  name: string;
  cursor: string | null;
  updated_at: string | null;
  meta: Record<string, unknown> | null;
}

interface PostgrestErrorLike {
  message: string;
  code?: string;
}

function throwSupabase(error: PostgrestErrorLike, label: string): never {
  const missingTable =
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /sync_state|sync_errors/.test(error.message);
  const hint = missingTable
    ? " Run supabase/migrations/20261023_notion_sync_state.sql in the Supabase SQL editor."
    : "";
  throw new Error(`${label}: ${error.message}.${hint}`);
}

export async function getSyncState(name: string): Promise<SyncStateRow | null> {
  const { data, error } = await getClient()
    .from("sync_state")
    .select("name, cursor, updated_at, meta")
    .eq("name", name)
    .maybeSingle();

  if (error) {
    throwSupabase(error, "getSyncState");
  }

  return (data as SyncStateRow | null) ?? null;
}

export async function upsertSyncState(input: {
  name: string;
  cursor?: string | null;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  const existing = await getSyncState(input.name);
  const { error } = await getClient()
    .from("sync_state")
    .upsert(
      {
        name: input.name,
        cursor: input.cursor === undefined ? (existing?.cursor ?? null) : input.cursor,
        meta:
          input.meta === undefined
            ? (existing?.meta ?? null)
            : { ...(existing?.meta ?? {}), ...input.meta },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "name" }
    );

  if (error) {
    throwSupabase(error, "upsertSyncState");
  }
}

export async function upsertSyncError(input: {
  syncName: string;
  sessionId: string;
  error: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await getClient().from("sync_errors").upsert(
    {
      sync_name: input.syncName,
      session_id: input.sessionId,
      error: input.error.slice(0, 4000),
      updated_at: now,
      resolved_at: null,
    },
    { onConflict: "sync_name,session_id" }
  );

  if (error) {
    throwSupabase(error, "upsertSyncError");
  }
}

export async function resolveSyncError(syncName: string, sessionId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await getClient()
    .from("sync_errors")
    .update({ resolved_at: now, updated_at: now })
    .eq("sync_name", syncName)
    .eq("session_id", sessionId)
    .is("resolved_at", null);

  if (error) {
    throwSupabase(error, "resolveSyncError");
  }
}

export async function countOpenSyncErrors(syncName: string): Promise<number> {
  const { count, error } = await getClient()
    .from("sync_errors")
    .select("id", { count: "exact", head: true })
    .eq("sync_name", syncName)
    .is("resolved_at", null);

  if (error) {
    throwSupabase(error, "countOpenSyncErrors");
  }

  return count ?? 0;
}

export async function listOpenSyncErrorSessionIds(
  syncName: string,
  limit = 100
): Promise<string[]> {
  const { data, error } = await getClient()
    .from("sync_errors")
    .select("session_id")
    .eq("sync_name", syncName)
    .is("resolved_at", null)
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error) {
    throwSupabase(error, "listOpenSyncErrorSessionIds");
  }

  return (data ?? []).map((row) => String((row as { session_id: string }).session_id));
}

export async function listRetellSessionsUpdatedAfter(
  cursorIso: string | null,
  limit = 100
): Promise<RetellSessionRow[]> {
  let query = getClient()
    .from("retell_sessions")
    .select("*")
    .order("updated_at", { ascending: true })
    .order("session_id", { ascending: true })
    .limit(limit);

  if (cursorIso) {
    query = query.gt("updated_at", cursorIso);
  }

  const { data, error } = await query;
  if (error) {
    throwSupabase(error, "listRetellSessionsUpdatedAfter");
  }

  return (data as RetellSessionRow[]) ?? [];
}

export async function listRetellSessionsTouchedSince(
  sinceIso: string,
  offset: number,
  limit: number
): Promise<RetellSessionRow[]> {
  const { data, error } = await getClient()
    .from("retell_sessions")
    .select("*")
    .or(`created_at.gte.${sinceIso},updated_at.gte.${sinceIso}`)
    .order("updated_at", { ascending: true })
    .order("session_id", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    throwSupabase(error, "listRetellSessionsTouchedSince");
  }

  return (data as RetellSessionRow[]) ?? [];
}

export async function countRetellSessionsTouchedSince(sinceIso: string): Promise<number> {
  const { count, error } = await getClient()
    .from("retell_sessions")
    .select("session_id", { count: "exact", head: true })
    .or(`created_at.gte.${sinceIso},updated_at.gte.${sinceIso}`);

  if (error) {
    throwSupabase(error, "countRetellSessionsTouchedSince");
  }

  return count ?? 0;
}

export async function listRetellSessionIdsTouchedSince(sinceIso: string): Promise<string[]> {
  const ids: string[] = [];
  const pageSize = 1000;
  let offset = 0;

  for (;;) {
    const { data, error } = await getClient()
      .from("retell_sessions")
      .select("session_id")
      .or(`created_at.gte.${sinceIso},updated_at.gte.${sinceIso}`)
      .order("session_id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throwSupabase(error, "listRetellSessionIdsTouchedSince");
    }

    const rows = (data ?? []) as Array<{ session_id: string }>;
    for (const row of rows) {
      ids.push(row.session_id);
    }
    if (rows.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return ids;
}

export async function getRetellSessionsByIds(sessionIds: string[]): Promise<RetellSessionRow[]> {
  if (sessionIds.length === 0) {
    return [];
  }

  const { data, error } = await getClient()
    .from("retell_sessions")
    .select("*")
    .in("session_id", sessionIds);

  if (error) {
    throwSupabase(error, "getRetellSessionsByIds");
  }

  return (data as RetellSessionRow[]) ?? [];
}

export async function getRetellSessionTimestampBounds(): Promise<{
  latestUpdatedAt: string | null;
  latestCreatedAt: string | null;
  oldestUpdatedAt: string | null;
}> {
  const client = getClient();
  const [latestUpdated, latestCreated, oldestUpdated] = await Promise.all([
    client
      .from("retell_sessions")
      .select("updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("retell_sessions")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("retell_sessions")
      .select("updated_at")
      .order("updated_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (latestUpdated.error) throwSupabase(latestUpdated.error, "latest updated_at");
  if (latestCreated.error) throwSupabase(latestCreated.error, "latest created_at");
  if (oldestUpdated.error) throwSupabase(oldestUpdated.error, "oldest updated_at");

  return {
    latestUpdatedAt: (latestUpdated.data?.updated_at as string | undefined) ?? null,
    latestCreatedAt: (latestCreated.data?.created_at as string | undefined) ?? null,
    oldestUpdatedAt: (oldestUpdated.data?.updated_at as string | undefined) ?? null,
  };
}
