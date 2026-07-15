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

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("Supabase updateRetellSessionPricing exception", { message });
    return { success: false, error: message };
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
