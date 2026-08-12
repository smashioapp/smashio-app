// In-app account deletion. Play's User Data policy (and App Store 5.1.1(v)) require an in-app
// path, not just the web form at website/delete-account.html — this is the endpoint behind it.
//
// Auth is the caller's own session JWT (verify_jwt on, see config.toml). The user id comes from
// that JWT and nothing else: there is deliberately no id in the request body, so this can only
// ever delete the caller. Auth-user removal needs the service role, which is why it can't live
// in the client.
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

type DeleteResult = { cancelled_game_ids?: string[]; confirmation_paths?: string[] };

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization") ?? "";
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
  } = await callerClient.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // 1. Postgres side, one transaction: cancel upcoming hosted games (players get pushed),
  //    drop the per-user rows, scrub the profile down to a tombstone.
  const { data, error: rpcError } = await serviceClient.rpc("delete_account", {
    p_profile_id: user.id,
  });
  if (rpcError) return json({ error: rpcError.message }, 500);
  const result = (data ?? {}) as DeleteResult;

  // 2. Storage. Avatars are {uid}/…, so the folder listing is the user's whole set;
  //    confirmations are keyed by game, so the RPC hands back the exact paths it deleted rows for.
  const { data: avatarFiles } = await serviceClient.storage.from("avatars").list(user.id);
  if (avatarFiles?.length) {
    await serviceClient.storage.from("avatars").remove(avatarFiles.map((f) => `${user.id}/${f.name}`));
  }
  if (result.confirmation_paths?.length) {
    await serviceClient.storage.from("confirmations").remove(result.confirmation_paths);
  }

  // 3. Auth user last. The reverse order would, on a failure, leave someone locked out of an
  //    account whose data is still sitting there — this way a retry just re-runs an idempotent
  //    scrub and finishes the job.
  const { error: deleteError } = await serviceClient.auth.admin.deleteUser(user.id);
  if (deleteError) return json({ error: deleteError.message }, 500);

  return json({ ok: true, cancelled_games: result.cancelled_game_ids?.length ?? 0 }, 200);
});
