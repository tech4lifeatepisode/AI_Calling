import type { RetellSessionRow } from "../types/supabase.js";

const NOTION_RICH_TEXT_CHUNK_SIZE = 2000;
const NOTION_RICH_TEXT_MAX_CHUNKS = 100;
const TRUNCATION_MARKER = "\n[truncated]";

export interface NotionRichText {
  type: "text";
  text: { content: string };
}

interface RetellTranscriptTurn {
  role?: string;
  content?: string;
  name?: string;
}

const SENTIMENT_OPTIONS: Record<string, string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
  unknown: "Unknown",
};

export function normalizeTranscriptForNotion(value: unknown): string {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith("[") || trimmed.startsWith("{")) &&
      trimmed.endsWith(trimmed.startsWith("[") ? "]" : "}")
    ) {
      try {
        return normalizeTranscriptForNotion(JSON.parse(trimmed) as unknown);
      } catch {
        return value;
      }
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((turn) => {
        if (typeof turn === "string") {
          return turn.trim();
        }
        if (!turn || typeof turn !== "object") {
          return "";
        }

        const record = turn as RetellTranscriptTurn;
        const label = record.role?.trim();
        const text = record.content?.trim() || record.name?.trim();
        if (!text) {
          return "";
        }
        return label ? `${label}: ${text}` : text;
      })
      .filter(Boolean)
      .join("\n");
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

export function chunkRichTextForNotion(value: string | null | undefined): NotionRichText[] {
  const text = value ?? "";
  if (!text) return [];

  const chunks: NotionRichText[] = [];
  const limit = NOTION_RICH_TEXT_CHUNK_SIZE * NOTION_RICH_TEXT_MAX_CHUNKS;

  for (
    let offset = 0;
    offset < text.length && chunks.length < NOTION_RICH_TEXT_MAX_CHUNKS;
    offset += NOTION_RICH_TEXT_CHUNK_SIZE
  ) {
    chunks.push({
      type: "text",
      text: { content: text.slice(offset, offset + NOTION_RICH_TEXT_CHUNK_SIZE) },
    });
  }

  if (text.length > limit && chunks.length > 0) {
    const last = chunks[chunks.length - 1];
    if (last) {
      last.text.content =
        last.text.content.slice(0, NOTION_RICH_TEXT_CHUNK_SIZE - TRUNCATION_MARKER.length) +
        TRUNCATION_MARKER;
    }
  }

  return chunks;
}

function asFiniteNumber(value: number | string | null | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function selectName(value: string | null | undefined): string | undefined {
  const name = value?.trim();
  if (!name) return undefined;
  return name.slice(0, 100);
}

export function normalizeSentiment(value: string | null | undefined): string | undefined {
  const name = selectName(value);
  if (!name) return undefined;
  return SENTIMENT_OPTIONS[name.toLowerCase()] ?? name;
}

export function normalizePhoneForNotion(value: string | null | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  let cleaned = value.trim().replace(/[^\d+]/g, "");
  if (cleaned.startsWith("00")) {
    cleaned = `+${cleaned.slice(2)}`;
  }
  if (!/^\+[1-9]\d{6,14}$/.test(cleaned)) {
    return undefined;
  }
  return cleaned;
}

function emailForNotion(value: string | null | undefined): string | undefined {
  const email = value?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return undefined;
  }
  return email;
}

function urlForNotion(value: string | null | undefined): string | undefined {
  const url = value?.trim();
  if (!url || url.length > 2000) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return url;
  } catch {
    return undefined;
  }
}

function dateForNotion(value: string | null | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return undefined;
  return new Date(time).toISOString();
}

type NotionProperty = Record<string, unknown>;

function assign(
  properties: Record<string, NotionProperty>,
  key: string,
  property: NotionProperty | undefined
): void {
  if (property) {
    properties[key] = property;
  }
}

export function mapRowToNotionProperties(row: RetellSessionRow): Record<string, NotionProperty> {
  const properties: Record<string, NotionProperty> = {
    "Session ID": {
      title: [{ type: "text", text: { content: row.session_id } }],
    },
  };

  const callTime = dateForNotion(row.session_time);
  assign(properties, "Call time", callTime ? { date: { start: callTime } } : undefined);

  const duration = asFiniteNumber(row.duration_seconds);
  assign(properties, "Duration (s)", duration != null ? { number: duration } : undefined);

  const cost = asFiniteNumber(row.cost);
  assign(properties, "Cost", cost != null ? { number: cost } : undefined);

  const totalPrice = asFiniteNumber(row.latest_total_price);
  assign(properties, "Total price", totalPrice != null ? { number: totalPrice } : undefined);

  const status = selectName(row.session_status);
  assign(properties, "Status", status ? { select: { name: status } } : undefined);

  const outcome = selectName(row.session_outcome);
  assign(properties, "Outcome", outcome ? { select: { name: outcome } } : undefined);

  const sentiment = normalizeSentiment(row.user_sentiment);
  assign(properties, "Sentiment", sentiment ? { select: { name: sentiment } } : undefined);

  const direction = selectName(row.direction);
  assign(properties, "Direction", direction ? { select: { name: direction } } : undefined);

  const dealStage = selectName(row.hubspot_deal_stage);
  assign(properties, "Deal stage", dealStage ? { select: { name: dealStage } } : undefined);

  const contact = chunkRichTextForNotion(row.hubspot_contact_name);
  assign(properties, "Contact", contact.length ? { rich_text: contact } : undefined);

  const deal = chunkRichTextForNotion(row.hubspot_deal_name);
  assign(properties, "Deal", deal.length ? { rich_text: deal } : undefined);

  const agent = chunkRichTextForNotion(row.agent_name);
  assign(properties, "Agent", agent.length ? { rich_text: agent } : undefined);

  const email = emailForNotion(row.hubspot_contact_email);
  assign(properties, "Email", email ? { email } : undefined);

  const phone = normalizePhoneForNotion(row.hubspot_contact_phone);
  assign(properties, "Phone", phone ? { phone_number: phone } : undefined);

  const recording = urlForNotion(row.recording_url);
  assign(properties, "Recording", recording ? { url: recording } : undefined);

  const retellLog = urlForNotion(row.public_log_url);
  assign(properties, "Retell log", retellLog ? { url: retellLog } : undefined);

  const transcript = chunkRichTextForNotion(normalizeTranscriptForNotion(row.transcript));
  assign(properties, "call_transcript", transcript.length ? { rich_text: transcript } : undefined);

  const toolTranscript = chunkRichTextForNotion(
    normalizeTranscriptForNotion(row.transcript_with_tool_calls)
  );
  assign(
    properties,
    "transcript_with_tool_calls",
    toolTranscript.length ? { rich_text: toolTranscript } : undefined
  );

  const updated = dateForNotion(row.updated_at);
  assign(properties, "Supabase updated", updated ? { date: { start: updated } } : undefined);

  return properties;
}
