import { useSession } from "./session";
import { useProfile, useProfileSports } from "./queries/profile";

export type LaunchTarget = "tabs" | "onboarding";

/**
 * The single answer to "can the app show its first real screen yet, and which one".
 *
 * Two callers need it and must never disagree: `app/index.tsx`, which does the actual
 * redirect, and `components/AnimatedSplash.tsx`, which holds the splash up until this
 * says yes. Before this hook existed the splash faded on a fixed timer while index
 * was still returning `null` through the profile fetch, so a cold start flashed black
 * between the two. Every query here is already in flight for index — react-query
 * dedupes them, so the splash's subscription costs nothing.
 */
export function useAppReady(): {
  ready: boolean;
  target: LaunchTarget | null;
  onboarded: boolean;
} {
  const { session, isLoading: sessionLoading } = useSession();
  const userId = session?.user.id;
  const { data: profile, isLoading: profileLoading } = useProfile(userId);
  const { data: profileSports, isLoading: sportsLoading } = useProfileSports(userId);

  if (sessionLoading) return { ready: false, target: null, onboarded: false };

  // G5 (gtm-plan.md §3.2): a session-less viewer goes straight to read-only Discover, so
  // there is no profile to wait on — it is ready the moment auth says "nobody".
  if (!session) return { ready: true, target: "tabs", onboarded: false };

  if (profileLoading || sportsLoading) return { ready: false, target: null, onboarded: false };

  const onboarded = !!profile?.display_name && (profileSports?.length ?? 0) > 0;
  return { ready: true, target: onboarded ? "tabs" : "onboarding", onboarded };
}
