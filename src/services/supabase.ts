import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type {
  McpToolCallRow,
  RetellSessionRow,
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
