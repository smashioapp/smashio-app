// Run:
//   SUPABASE_URL=http://localhost:54321 SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x \
//     deno test --allow-env supabase/functions/delete-account/
//
// index.ts builds its Supabase clients at module load (top-level, outside the import.meta.main
// guard), so importing it for avatarPathsFor alone still needs *parseable* URL/key env vars —
// they're never called over the network here, just used to construct the client.
//
// Only covers pure logic (avatarPathsFor). The delete_account RPC, storage removal and
// auth.admin.deleteUser all touch the network — cover those with integration tests against a
// local `supabase start` stack instead, not here.
import { assertEquals } from "jsr:@std/assert@1";
import { avatarPathsFor } from "./index.ts";

Deno.test("avatarPathsFor: prefixes every filename with the user id", () => {
  const files = [{ name: "avatar.jpg" }, { name: "avatar-old.jpg" }];
  assertEquals(avatarPathsFor("user-1", files), ["user-1/avatar.jpg", "user-1/avatar-old.jpg"]);
});

Deno.test("avatarPathsFor: empty file list yields an empty array", () => {
  assertEquals(avatarPathsFor("user-1", []), []);
});
