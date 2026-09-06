// Supabase surfaces an expired/invalid session two ways: a PostgrestError with code PGRST301
// ("JWT expired") from a direct table call, or a 401/403 status on the auth/REST response
// itself. This is deliberately loose on message text too, since supabase-js's own "Not signed
// in." (thrown by our queries after a null getUser()) and its AuthApiError messages both vary
// by version.
export function isAuthSessionError(error: unknown): boolean {
  if (!error) return false;
  const err = error as { message?: unknown; code?: unknown; status?: unknown };
  const code = typeof err.code === "string" ? err.code : undefined;
  const status = typeof err.status === "number" ? err.status : undefined;
  if (code === "PGRST301" || code === "PGRST302") return true;
  if (status === 401 || status === 403) return true;
  const message = typeof err.message === "string" ? err.message : error instanceof Error ? error.message : String(error);
  return /not signed in|jwt expired|refresh token|session (is |has )?(missing|expired|not found)|invalid refresh token/i.test(message);
}
