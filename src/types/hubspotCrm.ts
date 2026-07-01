export interface HubSpotContactDetails {
  contactId: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  email: string | null;
  phone: string | null;
}

export interface HubSpotDealEnrichment {
  hubspot_deal_id: string;
  hubspot_deal_name: string | null;
  hubspot_pipeline: string | null;
  hubspot_deal_stage: string | null;
  hubspot_deal_stage_id: string | null;
  hubspot_unit_type: string | null;
  hubspot_contract_start_date: string | null;
  hubspot_contract_end_date: string | null;
  hubspot_contact_id: string | null;
  hubspot_contact_name: string | null;
  hubspot_contact_email: string | null;
  hubspot_contact_phone: string | null;
}
