import { useEffect, useState } from "react";
import { Redirect, router } from "expo-router";
import { useSession } from "../lib/session";
import { useProfile, useProfileSports } from "../lib/queries/profile";
import { consumePendingGame } from "../lib/pendingGame";

export default function Index() {
  const { session, isLoading: sessionLoading } = useSession();
  const userId = session?.user.id;
  const { data: profile, isLoading: profileLoading } = useProfile(userId);
  const { data: profileSports, isLoading: sportsLoading } = useProfileSports(userId);
  const [pendingGameChecked, setPendingGameChecked] = useState(false);

  const onboarded = !!profile?.display_name && (profileSports?.length ?? 0) > 0;

  // Resume a shared game link that forced a login/signup detour (game/[id].tsx) once the
  // account is actually ready to view it — before onboarding finishes there's no profile yet.
  useEffect(() => {
    if (!onboarded) return;
    consumePendingGame().then((gameId) => {
      if (gameId) router.replace(`/game/${gameId}`);
      setPendingGameChecked(true);
    });
  }, [onboarded]);

  if (sessionLoading) return null;
  // G5 (gtm-plan.md §3.2): a session-less viewer browses Discover read-only instead of hitting
  // the onboarding wall immediately — join/host still gate to login (game/[id].tsx's
  // GamePreviewTeaser, and the host CTAs in Discover/TabBar).
  if (!session) return <Redirect href="/(tabs)/discover" />;
  if (profileLoading || sportsLoading) return null;
  if (onboarded && !pendingGameChecked) return null;

  // Signed in but no profile yet goes to setup, not the landing screen — the landing screen
  // is now the sign-in surface, and offering it to someone already signed in is a dead end.
  return <Redirect href={onboarded ? "/(tabs)/discover" : "/onboarding/setup"} />;
}
