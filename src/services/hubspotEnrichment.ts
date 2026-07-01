import type { HubSpotDealRecord } from "./hubspotDeals.js";
import { getEnv } from "./env.js";
import { hubspotFetch } from "./hubspot.js";
import { logger } from "./logger.js";
import type {
  HubSpotContactDetails,
  HubSpotDealEnrichment,
} from "../types/hubspotCrm.js";
import type { RetellSessionRow } from "../types/supabase.js";

interface HubSpotPipelineResponse {
  results?: Array<{
    id: string;
    label: string;
    stages?: Array<{ id: string; label: string }>;
  }>;
}

interface HubSpotDealWithAssociations {
  associations?: {
    contacts?: {
      results?: Array<{ id?: string }>;
    };
  };
}

interface HubSpotAssociationResponse {
  results?: Array<{ id?: string; toObjectId?: number | string }>;
}

interface HubSpotContactResponse {
  properties?: Record<string, string | null | undefined>;
}

interface PipelineStageInfo {
  pipelineLabel: string;
  stageLabel: string;
}

let pipelineStageCache: Map<string, PipelineStageInfo> | null = null;
let pipelineIdToLabel: Map<string, string> | null = null;

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

function buildContactName(
  firstName: string | null,
  lastName: string | null
): string | null {
  const full = [firstName, lastName].filter(Boolean).join(" ").trim();
  return full || null;
}

function parseHubSpotDate(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const ms = trimmed.length > 11 ? Number(trimmed) : Number(trimmed) * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function loadPipelineMaps(): Promise<{
  stageById: Map<string, PipelineStageInfo>;
  pipelineById: Map<string, string>;
}> {
  if (pipelineStageCache && pipelineIdToLabel) {
    return { stageById: pipelineStageCache, pipelineById: pipelineIdToLabel };
  }

  const result = await hubspotFetch<HubSpotPipelineResponse>("/crm/v3/pipelines/deals");
  const stageById = new Map<string, PipelineStageInfo>();
  const pipelineById = new Map<string, string>();

  for (const pipeline of result.data?.results ?? []) {
    pipelineById.set(pipeline.id, pipeline.label);
    for (const stage of pipeline.stages ?? []) {
      stageById.set(stage.id, {
        pipelineLabel: pipeline.label,
        stageLabel: stage.label,
      });
    }
  }

  pipelineStageCache = stageById;
  pipelineIdToLabel = pipelineById;
  return { stageById, pipelineById };
}

export async function getDealContactDetails(dealId: string): Promise<HubSpotContactDetails | null> {
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
    return null;
  }

  const contact = await hubspotFetch<HubSpotContactResponse>(
    `/crm/v3/objects/contacts/${contactId}?properties=firstname,lastname,email,phone,mobilephone,hs_whatsapp_phone_number,hs_calculated_phone_number,hs_searchable_calculated_international_phone_number`
  );

  if (!contact.ok || !contact.data?.properties) {
    logger.warn("Failed to fetch contact details for deal", { dealId, contactId });
    return null;
  }

  const props = contact.data.properties;
  const firstName = props.firstname?.trim() || null;
  const lastName = props.lastname?.trim() || null;

  return {
    contactId,
    firstName,
    lastName,
    fullName: buildContactName(firstName, lastName),
    email: props.email?.trim() || null,
    phone: pickContactPhone(props),
  };
}

export async function buildDealEnrichment(
  deal: HubSpotDealRecord,
  contact: HubSpotContactDetails | null
): Promise<HubSpotDealEnrichment> {
  const env = getEnv();
  const { stageById, pipelineById } = await loadPipelineMaps();

  const pipelineId = deal.properties.pipeline?.trim() || null;
  const stageId = deal.properties.dealstage?.trim() || null;
  const stageInfo = stageId ? stageById.get(stageId) : undefined;

  const pipelineLabel =
    (pipelineId ? pipelineById.get(pipelineId) : null) ??
    stageInfo?.pipelineLabel ??
    env.HUBSPOT_DEAL_PIPELINE_LABEL;

  return {
    hubspot_deal_id: deal.id,
    hubspot_deal_name: deal.properties.dealname?.trim() || null,
    hubspot_pipeline: pipelineLabel,
    hubspot_deal_stage_id: stageId,
    hubspot_deal_stage: stageInfo?.stageLabel ?? null,
    hubspot_unit_type: deal.properties[env.HUBSPOT_DEAL_UNIT_TYPE_PROPERTY]?.trim() || null,
    hubspot_contract_start_date: parseHubSpotDate(
      deal.properties[env.HUBSPOT_DEAL_CONTRACT_START_PROPERTY]
    ),
    hubspot_contract_end_date: parseHubSpotDate(
      deal.properties[env.HUBSPOT_DEAL_CONTRACT_END_PROPERTY]
    ),
    hubspot_contact_id: contact?.contactId ?? null,
    hubspot_contact_name: contact?.fullName ?? null,
    hubspot_contact_email: contact?.email ?? null,
    hubspot_contact_phone: contact?.phone ?? null,
  };
}

export function dealEnrichmentToSessionFields(
  enrichment: HubSpotDealEnrichment
): Partial<RetellSessionRow> {
  return {
    hubspot_deal_id: enrichment.hubspot_deal_id,
    hubspot_deal_name: enrichment.hubspot_deal_name,
    hubspot_pipeline: enrichment.hubspot_pipeline,
    hubspot_deal_stage: enrichment.hubspot_deal_stage,
    hubspot_deal_stage_id: enrichment.hubspot_deal_stage_id,
    hubspot_unit_type: enrichment.hubspot_unit_type,
    hubspot_contract_start_date: enrichment.hubspot_contract_start_date,
    hubspot_contract_end_date: enrichment.hubspot_contract_end_date,
    hubspot_contact_id: enrichment.hubspot_contact_id,
    hubspot_contact_name: enrichment.hubspot_contact_name,
    hubspot_contact_email: enrichment.hubspot_contact_email,
    hubspot_contact_phone: enrichment.hubspot_contact_phone,
  };
}
