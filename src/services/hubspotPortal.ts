import { hubspotFetch } from "./hubspot.js";

interface HubSpotAccountDetails {
  portalId?: number;
}

let cachedPortalId: number | null = null;

export async function getHubSpotPortalId(configuredPortalId?: number): Promise<number | null> {
  if (configuredPortalId) {
    return configuredPortalId;
  }

  if (cachedPortalId) {
    return cachedPortalId;
  }

  const result = await hubspotFetch<HubSpotAccountDetails>("/account-info/v3/details");
  if (!result.ok || !result.data?.portalId) {
    return null;
  }

  cachedPortalId = result.data.portalId;
  return cachedPortalId;
}

export function buildHubSpotDealUrl(portalId: number, dealId: string): string {
  return `https://app.hubspot.com/contacts/${portalId}/deal/${dealId}`;
}

export function buildHubSpotContactUrl(portalId: number, contactId: string): string {
  return `https://app.hubspot.com/contacts/${portalId}/contact/${contactId}`;
}
