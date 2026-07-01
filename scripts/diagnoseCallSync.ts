/**
 * One-off diagnostic — run with production env vars in shell.
 * npx tsx scripts/diagnoseCallSync.ts
 */
import dotenv from "dotenv";
import { searchDealsWithAiCallAttempted, getDealContactPhone } from "../src/services/hubspotDeals.js";
import { findRetellCallsByPhone, listRetellCalls } from "../src/services/retellApi.js";

dotenv.config();

async function main(): Promise<void> {
  const deals = await searchDealsWithAiCallAttempted();
  console.log(`Deals with ai_call_attempted=true: ${deals.length}`);

  const sampleDeals = deals.slice(0, 5);
  for (const deal of sampleDeals) {
    const phone = await getDealContactPhone(deal.id);
    console.log({
      dealId: deal.id,
      dealname: deal.properties.dealname,
      phone,
      retell_call_id: deal.properties.retell_call_id,
      retell_session_id: deal.properties.retell_session_id,
    });

    if (phone) {
      const matches = await findRetellCallsByPhone(phone);
      console.log(`  Retell matches for phone: ${matches.length}`, matches[0]?.call_id, matches[0]?.to_number, matches[0]?.from_number);
    }
  }

  const calls = await listRetellCalls({ callStatus: ["ended"] });
  console.log(`Retell ended calls: ${calls.length}`);
  console.log(
    "Sample calls:",
    calls.slice(0, 5).map((c) => ({
      call_id: c.call_id,
      to_number: c.to_number,
      from_number: c.from_number,
      direction: c.direction,
      metadata: c.metadata,
    }))
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
