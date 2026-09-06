import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "smashio.haptics_enabled";

// Device-local, mirrors soundPrefs.ts — haptics is on by default, this only persists an
// explicit off choice.
export async function loadHapticsEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem(KEY);
  return value !== "false";
}

export async function saveHapticsEnabled(value: boolean) {
  await AsyncStorage.setItem(KEY, String(value));
}
