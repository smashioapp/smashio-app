// Run:
//   SUPABASE_URL=http://localhost:54321 SUPABASE_SERVICE_ROLE_KEY=x \
//     deno test --allow-env supabase/functions/purge-confirmations/
//
// index.ts builds its Supabase client at module load (top-level, outside the import.meta.main
// guard), so importing it for the pure helpers alone still needs *parseable* env vars — never
// called over the network here, just used to construct the client.
//
// Only covers pure logic (orphanCutoffIso, retentionCutoffIso, pathsToRemove). purgeOrphans/
// purgeRetention touch the network and storage — cover those with integration tests against a
// local `supabase start` stack instead, not here.
import { assertEquals } from "jsr:@std/assert@1";
import { orphanCutoffIso, pathsToRemove, retentionCutoffIso } from "./index.ts";

Deno.test("orphanCutoffIso: 24 hours before the given instant", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");
  assertEquals(orphanCutoffIso(now), "2026-06-14T12:00:00.000Z");
});

Deno.test("retentionCutoffIso: 7 days before the given instant", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");
  assertEquals(retentionCutoffIso(now), "2026-06-08T12:00:00.000Z");
});

Deno.test("orphanCutoffIso and retentionCutoffIso default to the real clock when no instant is given", () => {
  const before = Date.now();
  const orphan = new Date(orphanCutoffIso()).getTime();
  const retention = new Date(retentionCutoffIso()).getTime();
  const after = Date.now();
  // Cutoff = call time minus the fixed window, so it must fall within [before, after] minus that window.
  assertEquals(orphan >= before - 24 * 60 * 60 * 1000 && orphan <= after - 24 * 60 * 60 * 1000, true);
  assertEquals(retention >= before - 7 * 24 * 60 * 60 * 1000 && retention <= after - 7 * 24 * 60 * 60 * 1000, true);
});

Deno.test("pathsToRemove: drops null storage_path rows", () => {
  const rows = [{ storage_path: "a/1.jpg" }, { storage_path: null }, { storage_path: "a/2.jpg" }];
  assertEquals(pathsToRemove(rows), ["a/1.jpg", "a/2.jpg"]);
});

Deno.test("pathsToRemove: empty input yields an empty array", () => {
  assertEquals(pathsToRemove([]), []);
});

Deno.test("pathsToRemove: all-null input yields an empty array", () => {
  assertEquals(pathsToRemove([{ storage_path: null }, { storage_path: null }]), []);
});
