import { supabase } from "./supabase";

// avatars bucket is private (security-audit-2026-09-11.md L1) — every read needs a signed URL.
// Batched per screen so a roster/feed/follow list of N faces costs one storage request, not N.
const SIGNED_URL_TTL_SECONDS = 3600;

export async function signAvatarUrls(paths: Array<string | null | undefined>): Promise<Map<string, string>> {
  const unique = Array.from(new Set(paths.filter((p): p is string => !!p)));
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.storage.from("avatars").createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  const map = new Map<string, string>();
  (data ?? []).forEach((d, i) => {
    if (d.signedUrl) map.set(unique[i], d.signedUrl);
  });
  return map;
}

export async function signAvatarUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const map = await signAvatarUrls([path]);
  return map.get(path) ?? null;
}
