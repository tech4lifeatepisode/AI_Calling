import { getRetellCallIfConfigured } from "./retellApi.js";
import { getRetellSessionBySessionId } from "./supabase.js";

export interface CallContext {
  sessionId?: string | null;
  hubspotDealId?: string | null;
  hubspotContactId?: string | null;
}

export interface ResolvedCallContext {
  sessionId?: string;
  hubspotDealId?: string;
  hubspotContactId?: string;
  hubspotContactEmail?: string;
  hubspotContactName?: string;
  hubspotDealName?: string;
}

const PLACEHOLDER_EMAIL_PREFIXES = ["need_email@", "placeholder@", "no_email@", "unknown@"];
const PLACEHOLDER_EMAIL_DOMAINS = ["example.com", "example.org", "test.com"];

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;

  const normalized = email.trim().toLowerCase();
  if (PLACEHOLDER_EMAIL_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return true;
  }

  const atIndex = normalized.lastIndexOf("@");
  if (atIndex === -1) return false;

  const domain = normalized.slice(atIndex + 1);
  return PLACEHOLDER_EMAIL_DOMAINS.includes(domain);
}

export function sanitizeGuestEmail(email: string | null | undefined): string | undefined {
  const trimmed = email?.trim();
  if (!trimmed || isPlaceholderEmail(trimmed)) {
    return undefined;
  }
  return trimmed;
}

export function extractHubspotDealIdFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): string | undefined {
  if (!metadata) return undefined;

  const directCandidates = [
    metadata.hubspot_deal_id,
    metadata.hubspotDealId,
    metadata.deal_id,
    metadata.dealId,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }

  const objectMeta = metadata.object;
  if (objectMeta && typeof objectMeta === "object") {
    const record = objectMeta as Record<string, unknown>;
    const objectType = String(record.objectType ?? "").toUpperCase();
    if (objectType === "DEAL" || !record.objectType) {
      const objectId = record.objectId;
      if (typeof objectId === "string" && objectId.trim()) {
        return objectId.trim();
      }
      if (typeof objectId === "number" && Number.isFinite(objectId)) {
        return String(objectId);
      }
    }
  }

  return undefined;
}

export async function resolveCallContext(ctx: CallContext): Promise<ResolvedCallContext> {
  let hubspotDealId = ctx.hubspotDealId?.trim() || undefined;
  let hubspotContactId = ctx.hubspotContactId?.trim() || undefined;
  let hubspotContactEmail: string | undefined;
  let hubspotContactName: string | undefined;
  let hubspotDealName: string | undefined;
  const sessionId = ctx.sessionId?.trim() || undefined;

  if (sessionId) {
    const session = await getRetellSessionBySessionId(sessionId);
    if (session) {
      hubspotDealId = hubspotDealId ?? session.hubspot_deal_id ?? undefined;
      hubspotContactId = hubspotContactId ?? session.hubspot_contact_id ?? undefined;
      hubspotContactEmail = session.hubspot_contact_email ?? undefined;
      hubspotContactName = session.hubspot_contact_name ?? undefined;
      hubspotDealName = session.hubspot_deal_name ?? undefined;
    }

    if (!hubspotDealId) {
      const call = await getRetellCallIfConfigured(sessionId);
      hubspotDealId =
        hubspotDealId ?? extractHubspotDealIdFromMetadata(call?.metadata ?? undefined);
    }
  }

  return {
    sessionId,
    hubspotDealId,
    hubspotContactId,
    hubspotContactEmail,
    hubspotContactName,
    hubspotDealName,
  };
}
