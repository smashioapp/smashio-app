import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { queryClient } from "../queryClient";

// Games this user is hosting that haven't happened yet. Deleting the account cancels every one
// of them and pushes the joined players, so the confirm screen has to say the number out loud
// before anyone taps through.
export function useHostedUpcomingCount(profileId: string | undefined) {
  return useQuery({
    queryKey: ["hosted_upcoming_count", profileId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("games")
        .select("id", { count: "exact", head: true })
        .eq("organizer_id", profileId!)
        .eq("status", "published")
        .gt("starts_at", new Date().toISOString());
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!profileId,
    staleTime: 0,
  });
}

// functions.invoke collapses any non-2xx into a generic "non-2xx status code" message and hangs
// the actual Response off `context` — dig the server's message back out so the user sees why.
async function functionErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: Response }).context;
  if (context && typeof context.json === "function") {
    try {
      const body = (await context.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // Non-JSON body (401/403/405 return plain text) — fall through to the SDK message.
    }
  }
  return error instanceof Error ? error.message : "Try again.";
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("delete-account", { body: {} });
      if (error) throw new Error(await functionErrorMessage(error));

      // The auth user no longer exists server-side, so a normal sign-out would 403 on the
      // revoke call. Drop the local session and every cached query keyed to it instead.
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      queryClient.clear();
    },
  });
}
