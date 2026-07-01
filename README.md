# AI_Calling — Retell HubSpot MCP Server

Middle layer between **Retell AI (Cara)**, **HubSpot Scheduler/CRM**, and **Supabase** for tour availability, booking, and call logging.

```
Retell call → Render MCP server → HubSpot Scheduler API + CRM → Supabase logging
```

## Architecture

| MCP tool | Purpose |
|----------|---------|
| `get_tour_availability` | Check HubSpot availability for virtual or in-person tours |
| `book_tour` | Book a tour after guest confirms |
| `log_retell_session` | Save Retell session metadata to Supabase |
| `log_tour_preference` | Log tour interest without booking |

**HTTP routes**

| Route | Auth | Purpose |
|-------|------|---------|
| `GET /health` | No | Render health check |
| `POST /mcp` | Bearer | MCP Streamable HTTP endpoint for Retell |
| `POST /webhooks/retell` | Bearer | Retell post-call webhook → Supabase |

---

## Local setup

1. Copy environment file:
   ```bash
   cp .env.example .env
   ```
2. Fill in `.env` with your real values (never commit `.env`).
3. Run Supabase SQL from [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL editor.
4. Install and start:
   ```bash
   npm install
   npm run dev
   ```
5. Verify health:
   ```bash
   curl http://localhost:3000/health
   ```

---

## Environment variables

Use these **exact names** locally (`.env`) and in Render (**Dashboard → Web Service → Environment**).

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (`3000` locally; Render sets automatically) |
| `NODE_ENV` | `development` or `production` |
| `MCP_SERVER_SECRET` | Random secret; Retell sends `Authorization: Bearer <this>` |
| `HUBSPOT_ACCESS_TOKEN` | HubSpot Private App **Retell Connection** token only |
| `HUBSPOT_API_BASE` | `https://api.hubapi.com` |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **service_role** key (server-side only) |
| `DEFAULT_TIMEZONE` | `Europe/Madrid` |
| `HUBSPOT_IN_PERSON_MEETING_URL` | In-person meeting page URL |
| `HUBSPOT_VIRTUAL_MEETING_URL` | Virtual meeting page URL |
| `HUBSPOT_IN_PERSON_SLUG` | `info-madrid` |
| `HUBSPOT_VIRTUAL_SLUG` | `info-madrid/virtual-tour-booking-carabanchel` |
| `DEFAULT_TOUR_DURATION_MINUTES` | `30` |

**Where to get secrets**

- **HubSpot token:** Settings → Integrations → Private Apps → **Retell Connection** → Access token
- **Supabase service role:** Supabase → Project Settings → API → `service_role` key
- **MCP secret:** Generate a long random string; use the same value in Retell MCP headers

> **Important:** Do not use the Supabase publishable (anon) key for server-side inserts if RLS is enabled. Use the service role key in Render only — never expose it client-side or in Retell.

> **Important:** Do not use the old **Carabanchel_Direct_Booking_Integration** HubSpot app. Use **Retell Connection** only.

---

## HubSpot scopes required

The **Retell Connection** private app needs:

- `crm.objects.contacts.write`
- `crm.objects.contacts.read`
- `crm.objects.deals.write`
- `crm.objects.deals.read`
- `crm.schemas.deals.read`
- `crm.schemas.contacts.read`
- `crm.objects.owners.read`
- `automation`
- `scheduler.meetings.meeting-link.read`
- **`meetings-write`** ← required for booking; add before live booking tests

---

## Render deployment

| Setting | Value |
|---------|-------|
| Build command | `npm install && npm run build` |
| Start command | `npm start` |
| Health check path | `/health` |
| Instance | **Starter** recommended (Free tier cold starts can exceed Retell's 20s MCP timeout) |

Add all environment variables from the table above in **Render → Environment**.

---

## Connect Retell MCP

In **Retell → MCP → Add MCP**:

| Field | Value |
|-------|-------|
| MCP server URL | `https://<your-render-service>.onrender.com/mcp` |
| Timeout | `20000` |
| Headers | `Authorization: Bearer <MCP_SERVER_SECRET>` |

Select these tools after deploy:

- `get_tour_availability`
- `book_tour`
- `log_retell_session`
- `log_tour_preference`

Optional webhook (post-call): point Retell to `POST https://<your-render-service>.onrender.com/webhooks/retell` with the same bearer header.

---

## Cara prompt behavior

When the guest wants a tour:

1. Ask whether they prefer a **virtual** or **in-person** tour.
2. Ask which **day** works best.
3. Ask what **Madrid time** generally works best.
4. Call `get_tour_availability`.
5. Offer **one or two** available slots.
6. Ask clearly: **"Should I book that for you?"**
7. Only after the guest clearly confirms, call `book_tour`.
8. **Do not** say the tour is booked until `book_tour` returns success.
9. If booking fails, say: *"No problem, I'll send you the tour links by WhatsApp so you can choose the time that works best for you."*
10. Log the result with `log_retell_session` or `log_tour_preference`.

---

## Manual test scripts

```bash
# Test HubSpot availability (requires HUBSPOT_ACCESS_TOKEN in .env)
npx tsx scripts/testAvailability.ts

# Test Supabase inserts (requires SUPABASE_* in .env)
npx tsx scripts/testSupabaseInsert.ts

# Test live booking (guarded — only runs when enabled)
RUN_BOOKING_TEST=true TEST_BOOKING_EMAIL=you@example.com npx tsx scripts/testBookTour.ts
```

---

## Pre-live checklist

1. Run `supabase/schema.sql` in Supabase
2. Deploy to Render with all env vars
3. Confirm `GET /health` returns `{ "ok": true }`
4. Run `testAvailability.ts` and `testSupabaseInsert.ts`
5. Connect Retell MCP with bearer auth
6. Test a call with **your own** HubSpot contact and phone
7. Add `meetings-write` scope if booking fails with missing scope errors
8. Only then enable for real leads

---

## Supabase tables

- `retell_sessions` — Retell call/session metadata (upsert by `session_id`)
- `mcp_tool_calls` — MCP tool request/response logs
- `tour_bookings` — Tour bookings and preferences

See [`supabase/schema.sql`](supabase/schema.sql) for full schema.

---

## Security

- No secrets in code or `.env.example`
- `.env` is gitignored
- Bearer auth on `/mcp` and `/webhooks/retell`
- Logs scrub Authorization headers and token values
- All tool inputs validated with Zod
