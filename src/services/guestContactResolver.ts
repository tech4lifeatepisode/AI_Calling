import { hubspotFetch } from "./hubspot.js";
import { getDealContactDetails } from "./hubspotEnrichment.js";
import type { HubSpotContactDetails } from "../types/hubspotCrm.js";

interface HubSpotContactResponse {
  properties?: Record<string, string | null | undefined>;
}

function pickContactPhone(props: Record<string, string | null | undefined>): string | null {
  const candidates = [
    props.phone,
    props.mobilephone,
    props.hs_whatsapp_phone_number,
    props.hs_calculated_phone_number,
  ];

  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }

  return null;
}

async function getContactById(contactId: string): Promise<HubSpotContactDetails | null> {
  const contact = await hubspotFetch<HubSpotContactResponse>(
    `/crm/v3/objects/contacts/${contactId}?properties=firstname,lastname,email,phone,mobilephone,hs_whatsapp_phone_number,hs_calculated_phone_number`
  );

  if (!contact.ok || !contact.data?.properties) {
    return null;
  }

  const props = contact.data.properties;
  const firstName = props.firstname?.trim() || null;
  const lastName = props.lastname?.trim() || null;
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || null;

  return {
    contactId,
    firstName,
    lastName,
    fullName,
    email: props.email?.trim() || null,
    phone: pickContactPhone(props),
  };
}

export interface ResolvedGuestContact {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  hubspotContactId?: string;
}

export async function resolveGuestContactForBooking(input: {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  hubspotContactId?: string;
  hubspotDealId?: string;
}): Promise<{ ok: true; guest: ResolvedGuestContact } | { ok: false; error: string }> {
  let contact: HubSpotContactDetails | null = null;

  if (input.hubspotContactId) {
    contact = await getContactById(input.hubspotContactId);
  } else if (input.hubspotDealId) {
    contact = await getDealContactDetails(input.hubspotDealId);
  }

  const email = input.email?.trim() || contact?.email || null;
  if (!email) {
    return {
      ok: false,
      error:
        "Email is required to book a tour. Pass email directly or provide hubspotContactId / hubspotDealId so it can be looked up from HubSpot.",
    };
  }

  return {
    ok: true,
    guest: {
      email,
      firstName: input.firstName ?? contact?.firstName ?? undefined,
      lastName: input.lastName ?? contact?.lastName ?? undefined,
      phone: input.phone ?? contact?.phone ?? undefined,
      hubspotContactId: input.hubspotContactId ?? contact?.contactId ?? undefined,
    },
  };
}

interface HubSpotDealResponse {
  properties?: Record<string, string | null | undefined>;
}

export async function getHubSpotDealName(dealId: string): Promise<string | null> {
  const result = await hubspotFetch<HubSpotDealResponse>(
    `/crm/v3/objects/deals/${dealId}?properties=dealname`
  );

  if (!result.ok) {
    return null;
  }

  return result.data?.properties?.dealname?.trim() || null;
}
