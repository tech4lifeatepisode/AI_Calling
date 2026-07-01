import { getEnv } from "./env.js";
import { hubspotFetch } from "./hubspot.js";
import { logger } from "./logger.js";

export interface HubSpotDealRecord {
  id: string;
  properties: Record<string, string | null | undefined>;
}

interface HubSpotSearchResponse {
  results?: HubSpotDealRecord[];
  paging?: { next?: { after?: string } };
}

interface HubSpotAssociationResponse {
  results?: Array<{ id?: string; toObjectId?: number | string; type?: string }>;
}

interface HubSpotContactResponse {
  id?: string;
  properties?: Record<string, string | null | undefined>;
}

function getRetellCallIdPropertyNames(): string[] {
  return getEnv()
    .HUBSPOT_RETELL_CALL_ID_PROPERTIES.split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

export function getRetellCallIdFromDeal(deal: HubSpotDealRecord): string | null {
  for (const propertyName of getRetellCallIdPropertyNames()) {
    const value = deal.properties[propertyName]?.trim();
    if (value) return value;
  }
  return null;
}

export async function searchDealsWithAiCallAttempted(options?: {
  modifiedSince?: Date;
}): Promise<HubSpotDealRecord[]> {
  const env = getEnv();
  const propertyNames = [
    env.HUBSPOT_AI_CALL_ATTEMPTED_PROPERTY,
    "dealname",
    "hs_lastmodifieddate",
    ...getRetellCallIdPropertyNames(),
  ];

  const filters: Array<{
    propertyName: string;
    operator: string;
    value?: string;
  }> = [
    {
      propertyName: env.HUBSPOT_AI_CALL_ATTEMPTED_PROPERTY,
      operator: "EQ",
      value: "true",
    },
  ];

  if (options?.modifiedSince) {
    filters.push({
      propertyName: "hs_lastmodifieddate",
      operator: "GTE",
      value: String(options.modifiedSince.getTime()),
    });
  }

  const deals: HubSpotDealRecord[] = [];
  let after: string | undefined;

  do {
    const body: Record<string, unknown> = {
      filterGroups: [{ filters }],
      properties: propertyNames,
      limit: 100,
      sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
    };

    if (after) {
      body.after = after;
    }

    const result = await hubspotFetch<HubSpotSearchResponse>("/crm/v3/objects/deals/search", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!result.ok) {
      throw new Error(
        result.errorText ?? `HubSpot deal search failed with status ${result.status}`
      );
    }

    const page = result.data?.results ?? [];
    deals.push(...page);
    after = result.data?.paging?.next?.after;

    logger.info("HubSpot deal search page fetched", {
      pageSize: page.length,
      totalSoFar: deals.length,
    });
  } while (after);

  return deals;
}

interface HubSpotDealWithAssociations {
  id?: string;
  properties?: Record<string, string | null | undefined>;
  associations?: {
    contacts?: {
      results?: Array<{ id?: string }>;
    };
  };
}

function extractAssociationId(
  result: { id?: string; toObjectId?: number | string } | undefined
): string | null {
  if (!result) return null;
  if (result.id) return String(result.id);
  if (result.toObjectId !== undefined) return String(result.toObjectId);
  return null;
}

function pickContactPhone(props: Record<string, string | null | undefined>): string | null {
  const candidates = [
    props.phone,
    props.mobilephone,
    props.hs_whatsapp_phone_number,
    props.hs_calculated_phone_number,
    props.hs_searchable_calculated_international_phone_number,
  ];

  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }

  return null;
}

export async function getDealContactPhone(dealId: string): Promise<string | null> {
  const dealWithAssociations = await hubspotFetch<HubSpotDealWithAssociations>(
    `/crm/v3/objects/deals/${dealId}?associations=contacts`
  );

  let contactId = extractAssociationId(
    dealWithAssociations.data?.associations?.contacts?.results?.[0]
  );

  if (!contactId) {
    const associations = await hubspotFetch<HubSpotAssociationResponse>(
      `/crm/v4/objects/deals/${dealId}/associations/contacts`
    );

    if (!associations.ok) {
      logger.warn("Failed to fetch deal contact associations", {
        dealId,
        status: associations.status,
      });
      return null;
    }

    contactId = extractAssociationId(associations.data?.results?.[0]);
  }

  if (!contactId) {
    logger.warn("No associated contact found for deal", { dealId });
    return null;
  }

  const contact = await hubspotFetch<HubSpotContactResponse>(
    `/crm/v3/objects/contacts/${contactId}?properties=phone,mobilephone,hs_whatsapp_phone_number,hs_calculated_phone_number,hs_searchable_calculated_international_phone_number`
  );

  if (!contact.ok || !contact.data?.properties) {
    logger.warn("Failed to fetch contact phone for deal", { dealId, contactId });
    return null;
  }

  return pickContactPhone(contact.data.properties);
}
