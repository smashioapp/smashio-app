import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "smashio.sound_enabled";

// Sound is on by default (not-boring-plan.md) — this only persists an explicit off choice.
export async function loadSoundEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem(KEY);
  return value !== "false";
}

export async function saveSoundEnabled(value: boolean) {
  await AsyncStorage.setItem(KEY, String(value));
}
