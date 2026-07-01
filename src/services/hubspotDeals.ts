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

function getRetellCallIdPropertyNames(): string[] {
  return getEnv()
    .HUBSPOT_RETELL_CALL_ID_PROPERTIES.split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

function getDealSearchPropertyNames(): string[] {
  const env = getEnv();
  return [
    ...new Set([
      env.HUBSPOT_AI_CALL_ATTEMPTED_PROPERTY,
      "dealname",
      "pipeline",
      "dealstage",
      "hs_lastmodifieddate",
      env.HUBSPOT_DEAL_UNIT_TYPE_PROPERTY,
      env.HUBSPOT_DEAL_CONTRACT_START_PROPERTY,
      env.HUBSPOT_DEAL_CONTRACT_END_PROPERTY,
      ...getRetellCallIdPropertyNames(),
    ]),
  ];
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
  const propertyNames = getDealSearchPropertyNames();

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

export async function getDealContactPhone(dealId: string): Promise<string | null> {
  const { getDealContactDetails } = await import("./hubspotEnrichment.js");
  const contact = await getDealContactDetails(dealId);
  return contact?.phone ?? null;
}
