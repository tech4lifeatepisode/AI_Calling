export interface RetellMcpToolDefinition {
  name: string;
  description: string;
  retellLink: string;
  writesToSupabase: string;
}

export const RETELL_MCP_SERVER_NAME = "episode-retell-hubspot-mcp";
export const RETELL_MCP_ENDPOINT = "POST /mcp";

export const RETELL_MCP_TOOLS: RetellMcpToolDefinition[] = [
  {
    name: "get_tour_availability",
    description: "Checks HubSpot availability for virtual or in-person tours.",
    retellLink: "Pass sessionId (call_id) for logging and call context.",
    writesToSupabase: "mcp_tool_calls",
  },
  {
    name: "book_tour",
    description:
      "Books a HubSpot tour after the guest explicitly confirms the selected slot.",
    retellLink:
      "Requires sessionId; resolves HubSpot contact/deal from call metadata.",
    writesToSupabase: "mcp_tool_calls, tour_bookings",
  },
  {
    name: "log_retell_session",
    description: "Saves Retell call/session metadata into Supabase.",
    retellLink: "Writes the Retell call_id as session_id.",
    writesToSupabase: "retell_sessions, mcp_tool_calls",
  },
  {
    name: "log_tour_preference",
    description: "Logs tour interest even if the guest does not complete booking.",
    retellLink: "Tied to the call via sessionId.",
    writesToSupabase: "tour_bookings, mcp_tool_calls",
  },
  {
    name: "list_selectable_room_types",
    description:
      "Lists room types selectable on booking.episode.life for the given stay dates.",
    retellLink: "Episode booking flow during live calls.",
    writesToSupabase: "mcp_tool_calls",
  },
  {
    name: "check_room_availability",
    description:
      "Checks if a room is selectable on the website and available via Housemonk.",
    retellLink: "Episode booking flow during live calls.",
    writesToSupabase: "mcp_tool_calls",
  },
  {
    name: "get_room_pricing",
    description:
      "Gets live Housemonk pricing after selectability and availability checks.",
    retellLink: "Can update pricing fields on the session row.",
    writesToSupabase: "mcp_tool_calls, retell_sessions (pricing fields)",
  },
];

export const RETELL_MCP_CONTEXT_FIELDS = [
  "sessionId — Retell call_id",
  "hubspotContactId — HubSpot contact from call metadata",
  "hubspotDealId — HubSpot deal from call metadata",
];
