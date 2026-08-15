// Host flow plan (docs/host-flow-plan.md), P0. Invoked by pg_cron via pg_net (never by the
// client) — same shared-secret pattern as push-dispatch (verify_jwt off, PURGE_CONFIRMATIONS_KEY
// checked here). Owns the actual deleting: dropping rows out of storage.objects from SQL isn't a
// reliable way to free the underlying blob, so both sweeps go through the Storage API here.
//
//   { type: 'orphan' }    — hourly. Drafts (game_id is null) older than 24h: a host who bailed
//                            mid-wizard leaves nothing behind.
//   { type: 'retention' } — daily. Confirmations whose game is completed and ended >7 days ago:
//                            delete the storage object, null storage_path, keep parsed/review_status.
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function purgeOrphans(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from("game_confirmations")
    .select("id, storage_path")
    .is("game_id", null)
    .lt("created_at", cutoff);
  if (error) throw error;
  if (!rows?.length) return 0;

  const paths = rows.map((r) => r.storage_path).filter((p): p is string => !!p);
  if (paths.length) {
    const { error: removeErr } = await supabase.storage.from("confirmations").remove(paths);
    if (removeErr) throw removeErr;
  }
  const { error: deleteErr } = await supabase
    .from("game_confirmations")
    .delete()
    .in("id", rows.map((r) => r.id));
  if (deleteErr) throw deleteErr;
  return rows.length;
}

async function purgeRetention(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: games, error: gamesErr } = await supabase
    .from("games")
    .select("id")
    .eq("status", "completed")
    .lt("ends_at", cutoff);
  if (gamesErr) throw gamesErr;
  if (!games?.length) return 0;

  const { data: rows, error } = await supabase
    .from("game_confirmations")
    .select("id, storage_path")
    .in("game_id", games.map((g) => g.id))
    .not("storage_path", "is", null);
  if (error) throw error;
  if (!rows?.length) return 0;

  const paths = rows.map((r) => r.storage_path).filter((p): p is string => !!p);
  if (paths.length) {
    const { error: removeErr } = await supabase.storage.from("confirmations").remove(paths);
    if (removeErr) throw removeErr;
  }
  const { error: updateErr } = await supabase
    .from("game_confirmations")
    .update({ storage_path: null })
    .in("id", rows.map((r) => r.id));
  if (updateErr) throw updateErr;
  return rows.length;
}

Deno.serve(async (req) => {
  const expectedKey = Deno.env.get("PURGE_CONFIRMATIONS_KEY");
  const auth = req.headers.get("Authorization");
  if (!expectedKey || auth !== `Bearer ${expectedKey}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { type } = (await req.json()) as { type?: "orphan" | "retention" };
  try {
    const count = type === "retention" ? await purgeRetention() : await purgeOrphans();
    return new Response(JSON.stringify({ type: type ?? "orphan", purged: count }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("purge-confirmations failed:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "purge failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
