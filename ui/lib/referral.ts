import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "smashio.pending_referral";

// Captured off the onboarding deep link's `ref` param (see shareReferral) and held until the
// next sign-in completes, since account creation and link-open aren't the same event
// (profile-plan.md P5 — shareReferral shared a link with nothing to credit it to).
export async function savePendingReferral(referrerId: string) {
  await AsyncStorage.setItem(KEY, referrerId);
}

export async function consumePendingReferral(): Promise<string | null> {
  const value = await AsyncStorage.getItem(KEY);
  if (value) await AsyncStorage.removeItem(KEY);
  return value;
}
