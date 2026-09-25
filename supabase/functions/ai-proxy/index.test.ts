// Run:
//   SUPABASE_URL=http://localhost:54321 SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x \
//     deno test --allow-env supabase/functions/ai-proxy/
//
// index.ts builds its Supabase clients at module load (top-level, outside the import.meta.main
// guard), so importing it for reviewStatusFor alone still needs *parseable* URL/key env vars —
// they're never called over the network here, just used to construct the client.
//
// Only covers pure logic (reviewStatusFor, and classify_image's validate/decide/normalise helpers). checkRateLimits/downloadImage/parseWithGemini touch
// the network and the service-role client — cover those with integration tests against a local
// `supabase start` stack instead, not here.
import { assertEquals } from "jsr:@std/assert@1";
import {
  chatStatusFor,
  normaliseVerdict,
  outcomeFor,
  reviewStatusFor,
  validateImageRequest,
  type ParsedBooking,
} from "./index.ts";

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

// --- classify_image (docs/image-moderation-plan.md §1) ---------------------------------------

const AUTHOR = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const GAME = "33333333-3333-3333-3333-333333333333";

Deno.test("outcomeFor: confident clean is visible, confident violating is rejected", () => {
  assertEquals(outcomeFor({ verdict: "clean", category: null, confidence: 0.95 }, 0.8), "visible");
  assertEquals(outcomeFor({ verdict: "violating", category: "sexual", confidence: 0.8 }, 0.8), "rejected");
});

Deno.test("outcomeFor: low confidence either way goes to review", () => {
  assertEquals(outcomeFor({ verdict: "clean", category: null, confidence: 0.79 }, 0.8), "review");
  assertEquals(outcomeFor({ verdict: "violating", category: "spam", confidence: 0.3 }, 0.8), "review");
});

Deno.test("outcomeFor: the threshold is the configured one, not a constant", () => {
  assertEquals(outcomeFor({ verdict: "clean", category: null, confidence: 0.85 }, 0.9), "review");
});

Deno.test("outcomeFor: timeout and error are 'error' for the caller's surface rule", () => {
  assertEquals(outcomeFor("timeout", 0.8), "error");
  assertEquals(outcomeFor("error", 0.8), "error");
});

Deno.test("chatStatusFor: maps onto messages.moderation_status, timeout stays unchecked", () => {
  assertEquals(chatStatusFor("visible"), "clean");
  assertEquals(chatStatusFor("review"), "review");
  assertEquals(chatStatusFor("rejected"), "removed");
  assertEquals(chatStatusFor("error"), "unchecked");
});

Deno.test("normaliseVerdict: clamps confidence and fills an unknown category", () => {
  assertEquals(normaliseVerdict({ verdict: "violating", category: "weird", confidence: 1.7 }), {
    verdict: "violating",
    category: "other",
    confidence: 1,
  });
  assertEquals(normaliseVerdict({ verdict: "clean", category: "sexual", confidence: "0.9" }), {
    verdict: "clean",
    category: null,
    confidence: 0.9,
  });
  assertEquals(normaliseVerdict({}).confidence, 0);
});

Deno.test("validateImageRequest: accepts a post with up to 4 of the author's photos", () => {
  const paths = [1, 2, 3, 4].map((n) => `${AUTHOR}/${n}.jpg`);
  assertEquals(validateImageRequest({ bucket: "post-media", paths, author_id: AUTHOR, subject_type: "post" }), null);
});

Deno.test("validateImageRequest: refuses a fifth photo, someone else's path, and traversal", () => {
  const five = [1, 2, 3, 4, 5].map((n) => `${AUTHOR}/${n}.jpg`);
  assertEquals(typeof validateImageRequest({ bucket: "post-media", paths: five, author_id: AUTHOR, subject_type: "post" }), "string");
  assertEquals(
    typeof validateImageRequest({ bucket: "post-media", paths: [`${OTHER}/a.jpg`], author_id: AUTHOR, subject_type: "post" }),
    "string"
  );
  assertEquals(
    typeof validateImageRequest({ bucket: "post-media", paths: [`${AUTHOR}/../${OTHER}/a.jpg`], author_id: AUTHOR, subject_type: "post" }),
    "string"
  );
});

Deno.test("validateImageRequest: bucket must match the subject", () => {
  assertEquals(
    typeof validateImageRequest({ bucket: "avatars", paths: [`${AUTHOR}/a.jpg`], author_id: AUTHOR, subject_type: "post" }),
    "string"
  );
  assertEquals(
    typeof validateImageRequest({ bucket: "confirmations", paths: [`${AUTHOR}/a.jpg`], author_id: AUTHOR, subject_type: "avatar", subject_id: AUTHOR }),
    "string"
  );
});

Deno.test("validateImageRequest: chat photos are {game}/{sender}/…, one per message, subject_id required", () => {
  const path = `${GAME}/${AUTHOR}/x.jpg`;
  assertEquals(
    validateImageRequest({ bucket: "chat-media", paths: [path], author_id: AUTHOR, subject_type: "message", subject_id: GAME }),
    null
  );
  assertEquals(typeof validateImageRequest({ bucket: "chat-media", paths: [path], author_id: AUTHOR, subject_type: "message" }), "string");
  assertEquals(
    typeof validateImageRequest({ bucket: "chat-media", paths: [`${GAME}/${OTHER}/x.jpg`], author_id: AUTHOR, subject_type: "message", subject_id: GAME }),
    "string"
  );
});
