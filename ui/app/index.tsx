import { useEffect, useState } from "react";
import { Redirect, router } from "expo-router";
import { useAppReady } from "../lib/appReady";
import { consumePendingPath } from "../lib/pendingGame";

export default function Index() {
  // Shared with AnimatedSplash so the splash can't lift before this screen can route — see
  // lib/appReady.ts.
  const { ready, target, onboarded } = useAppReady();
  const [pendingGameChecked, setPendingGameChecked] = useState(false);

  // Resume a shared game link that forced a login/signup detour (game/[id].tsx) once the
  // account is actually ready to view it — before onboarding finishes there's no profile yet.
  useEffect(() => {
    if (!onboarded) return;
    consumePendingPath().then((path) => {
      if (path) router.replace(path);
      setPendingGameChecked(true);
    });
  }, [onboarded]);

  // These `null`s are no longer a visible black frame: AnimatedSplash covers the whole of this
  // resolve now, because it waits on the same useAppReady().
  if (!ready) return null;
  if (onboarded && !pendingGameChecked) return null;

  // Signed in but no profile yet goes to setup, not the landing screen — the landing screen
  // is now the sign-in surface, and offering it to someone already signed in is a dead end.
  // A session-less viewer gets read-only Discover rather than the onboarding wall (G5,
  // gtm-plan.md §3.2); join/host still gate to login further in.
  return <Redirect href={target === "onboarding" ? "/onboarding/setup" : "/(tabs)/discover"} />;
}
