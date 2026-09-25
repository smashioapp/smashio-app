import { useEffect } from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSetNotificationCategory } from "./queries/notificationPrefs";

// D1 (short-a-player-plan §6): last-minute spot alerts are on by default for anyone with a home
// point and a level, riding the existing `alerts` pref. New players see a pre-ticked toggle in
// onboarding (onboarding/nearby.tsx); everyone who onboarded before that gets this one-time
// heads up instead, so nobody's first spot alert is a surprise.
const SEEN_KEY = "smashio.spot_alerts_intro_seen";

export async function markSpotAlertsIntroSeen() {
  try {
    await AsyncStorage.setItem(SEEN_KEY, "1");
  } catch {}
}

export function useSpotAlertsIntro(signedIn: boolean) {
  const setCategory = useSetNotificationCategory();

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    (async () => {
      let seen: string | null = "1";
      try {
        seen = await AsyncStorage.getItem(SEEN_KEY);
      } catch {}
      if (seen || cancelled) return;
      await markSpotAlertsIntroSeen();
      Alert.alert(
        "Heads up on last-minute spots",
        "When someone near you at your level is short a player, we'll give you a quick ping. Two a day, max, and never overnight.",
        [
          { text: "Turn off", style: "cancel", onPress: () => setCategory.mutate({ category: "alerts", enabled: false }) },
          { text: "Keep it on" },
        ],
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);
}
