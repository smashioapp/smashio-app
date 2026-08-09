import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

// expo-haptics has no web implementation — guard so web preview doesn't throw.
const supported = Platform.OS === "ios" || Platform.OS === "android";

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export const haptics = {
  tap: () => supported && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  success: () => supported && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  error: () => supported && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),

  // Sharp, discrete tick — scrubbing, star selection, tab switch.
  tick: () => supported && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid),

  // Escalating Light -> Heavy ticks over `ms`, for a sustained hold (HoldButton fill).
  // Returns a cancel function — call it if the hold is released early.
  ramp: (ms: number) => {
    if (!supported) return () => {};
    const steps: Haptics.ImpactFeedbackStyle[] = [
      Haptics.ImpactFeedbackStyle.Light,
      Haptics.ImpactFeedbackStyle.Light,
      Haptics.ImpactFeedbackStyle.Medium,
      Haptics.ImpactFeedbackStyle.Medium,
      Haptics.ImpactFeedbackStyle.Heavy,
    ];
    let cancelled = false;
    const interval = ms / steps.length;
    steps.forEach((style, i) => {
      setTimeout(() => {
        if (!cancelled) Haptics.impactAsync(style);
      }, interval * i);
    });
    return () => {
      cancelled = true;
    };
  },

  // Heavy -> Heavy -> Medium -> Light sequenced over ~180ms. Reads as an "explosion" —
  // a single Heavy impact does not carry the same payoff.
  burst: async () => {
    if (!supported) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await wait(50);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await wait(50);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await wait(50);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },
};
