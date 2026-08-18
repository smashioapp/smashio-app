// Run:
//   SUPABASE_URL=http://localhost:54321 SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x \
//     deno test --allow-env supabase/functions/ai-proxy/
//
// index.ts builds its Supabase clients at module load (top-level, outside the import.meta.main
// guard), so importing it for reviewStatusFor alone still needs *parseable* URL/key env vars —
// they're never called over the network here, just used to construct the client.
//
// Only covers pure logic (reviewStatusFor). checkRateLimits/downloadImage/parseWithGemini touch
// the network and the service-role client — cover those with integration tests against a local
// `supabase start` stack instead, not here.
import { assertEquals } from "jsr:@std/assert@1";
import { reviewStatusFor, type ParsedBooking } from "./index.ts";

function booking(overrides: Partial<ParsedBooking> = {}): ParsedBooking {
  return {
    is_booking_confirmation: true,
    venue_name: null,
    venue_address: null,
    starts_at_local: null,
    ends_at_local: null,
    courts: null,
    court_labels: null,
    total_cost_aud: null,
    booking_reference: null,
    confidence: "high",
    ...overrides,
  };
}

Deno.test("reviewStatusFor: verified when the photo is a real booking confirmation", () => {
  assertEquals(reviewStatusFor(booking({ is_booking_confirmation: true })), "verified");
});

Deno.test("reviewStatusFor: rejected when the photo isn't a booking confirmation", () => {
  assertEquals(reviewStatusFor(booking({ is_booking_confirmation: false })), "rejected");
});

Deno.test("reviewStatusFor: low confidence still verifies if it IS a confirmation", () => {
  // The gate is is_booking_confirmation, not confidence — a receipt read at low confidence is
  // still a receipt, per host-flow-plan.md.
  assertEquals(reviewStatusFor(booking({ is_booking_confirmation: true, confidence: "low" })), "verified");
});
