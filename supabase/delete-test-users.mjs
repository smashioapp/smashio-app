#!/usr/bin/env node
// Deletes the fixed set of test accounts created by create-test-users.mjs, against the
// LINKED hosted Supabase project. Cascades (profiles -> games/players/messages/ratings/
// rating_tags/game_alerts/push_tokens/chat_prefs) via `on delete cascade` FKs — no separate
// data wipe needed. Venues (supabase/seed.sql) are untouched.
//
// Usage: node supabase/delete-test-users.mjs

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const TEST_EMAILS = [
  "test@smashio.dev",
  "ajay@smashio.dev",
  "maitri@smashio.dev",
  "bot1@smashio.dev",
  "bot2@smashio.dev",
  "bot3@smashio.dev",
  "bot4@smashio.dev",
  "bot5@smashio.dev",
];

function projectRef() {
  const ref = readFileSync(new URL("./.temp/project-ref", import.meta.url), "utf8").trim();
  if (!ref) throw new Error("Could not resolve linked project ref");
  return ref;
}

function serviceRoleKey(ref) {
  const out = execFileSync(
    "npx",
    ["supabase", "projects", "api-keys", "--project-ref", ref, "--reveal", "-o", "json"],
    { encoding: "utf8", shell: true }
  );
  const keys = JSON.parse(out);
  const secret = keys.find((k) => k.type === "secret") ?? keys.find((k) => k.name === "service_role");
  if (!secret) throw new Error("Could not find service_role key in `supabase projects api-keys` output");
  return secret.api_key;
}

async function main() {
  const ref = projectRef();
  const url = `https://${ref}.supabase.co`;
  const serviceKey = serviceRoleKey(ref);
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  for (const email of TEST_EMAILS) {
    const listRes = await fetch(`${url}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, { headers });
    const listBody = await listRes.json();
    const existing = (listBody.users ?? []).find((u) => u.email === email);

    if (!existing) {
      console.log(`skip  ${email} (not found)`);
      continue;
    }

    const delRes = await fetch(`${url}/auth/v1/admin/users/${existing.id}`, {
      method: "DELETE",
      headers,
    });

    if (!delRes.ok) {
      const err = await delRes.text();
      console.error(`FAIL  ${email}: ${delRes.status} ${err}`);
      continue;
    }

    console.log(`delete ${email} (id=${existing.id})`);
  }

  console.log("\nDone. Test accounts + their games/rosters/chat/ratings/alerts removed via cascade.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
