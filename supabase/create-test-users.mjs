#!/usr/bin/env node
// Creates/verifies the fixed set of test accounts used by seed-test-data.sql against the
// LINKED hosted Supabase project. Idempotent — skips any email that already exists.
//
// Usage: node supabase/create-test-users.mjs
//
// Never persists the service-role key: fetched fresh from the Supabase CLI (which is
// already authenticated + linked) for the duration of this process only.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PASSWORD = "Test1234!";

// [email, display_name] — first three are named personal accounts (App Store review + team);
// bot1-5 are "existing user" accounts that host events so discover/map aren't empty on first run.
const TEST_USERS = [
  ["test@smashio.dev", "Test User"],
  ["ajay@smashio.dev", "Ajay"],
  ["maitri@smashio.dev", "Maitri"],
  ["bot1@smashio.dev", "Priya Nair"],
  ["bot2@smashio.dev", "Jordan Lee"],
  ["bot3@smashio.dev", "Mia Chen"],
  ["bot4@smashio.dev", "Liam O'Brien"],
  ["bot5@smashio.dev", "Ava Singh"],
];

function projectRef() {
  const configText = readFileSync(new URL("./config.toml", import.meta.url), "utf8");
  const idMatch = configText.match(/project_id\s*=\s*"([^"]+)"/);
  const ref = readFileSync(new URL("./.temp/project-ref", import.meta.url), "utf8").trim();
  if (!ref) throw new Error(`Could not resolve linked project ref (project_id=${idMatch?.[1]})`);
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

  for (const [email, displayName] of TEST_USERS) {
    const listRes = await fetch(`${url}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, { headers });
    const listBody = await listRes.json();
    const existing = (listBody.users ?? []).find((u) => u.email === email);

    if (existing) {
      console.log(`skip  ${email} (already exists, id=${existing.id})`);
      continue;
    }

    const createRes = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      console.error(`FAIL  ${email}: ${createRes.status} ${err}`);
      continue;
    }

    const created = await createRes.json();
    console.log(`create ${email} (id=${created.id})`);
  }

  console.log(`\nDone. Password for all seeded accounts: ${PASSWORD}`);
  console.log("Log in with test@smashio.dev on the app's email/password form.");
  console.log("\nNext: npx supabase db query --linked -f supabase/seed-test-data.sql");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
