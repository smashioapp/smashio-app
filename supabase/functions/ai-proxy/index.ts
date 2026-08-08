// Slice 9: booking-confirmation parser. Client uploads to the 'confirmations' storage bucket
// first, then calls this function with the path so a server-side step can validate the upload
// belongs to the caller's own game before touching game_confirmations (organizer-only writes
// per the table's RLS comment). Auth-gated via the caller's JWT (verify_jwt on, see config.toml).
//
// STUBBED: returns a fixed fake `parsed` payload and always sets review_status='verified'.
// Real parsing (ANTHROPIC_API_KEY, already provisioned as a function secret but unused here)
// lands later behind this same request/response shape — the client does not change.
// AGENTS.md rule: the client never calls the LLM directly, only through this function.
import { createClient } from "jsr:@supabase/supabase-js@2";

const RATE_LIMIT_PER_MINUTE = 5;

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization") ?? "";
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
  } = await callerClient.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { game_id, storage_path } = (await req.json()) as { game_id?: string; storage_path?: string };
  if (!game_id || !storage_path) {
    return new Response(JSON.stringify({ error: "game_id and storage_path are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: game, error: gameErr } = await serviceClient
    .from("games")
    .select("id, organizer_id")
    .eq("id", game_id)
    .single();
  if (gameErr || !game || game.organizer_id !== user.id) {
    return new Response("Forbidden", { status: 403 });
  }

  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count } = await serviceClient
    .from("game_confirmations")
    .select("id", { count: "exact", head: true })
    .eq("uploaded_by", user.id)
    .gte("created_at", oneMinuteAgo);
  if ((count ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    return new Response("Too Many Requests", { status: 429 });
  }

  // Fake parse result — no OCR/LLM call yet.
  const parsed = {
    stub: true,
    confidence: 0.92,
    note: "Stub parse — real OCR/LLM extraction pending.",
  };

  const { data: confirmation, error: insertErr } = await serviceClient
    .from("game_confirmations")
    .insert({
      game_id,
      storage_path,
      uploaded_by: user.id,
      parsed,
      review_status: "verified",
    })
    .select()
    .single();
  if (insertErr) {
    return new Response(JSON.stringify({ error: insertErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { error: updateErr } = await serviceClient
    .from("games")
    .update({ verification_status: "verified" })
    .eq("id", game_id);
  if (updateErr) {
    return new Response(JSON.stringify({ error: updateErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(confirmation), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
