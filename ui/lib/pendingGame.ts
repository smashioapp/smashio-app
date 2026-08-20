import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "smashio.pending_game";

// Captured when an unauthenticated deep link opens /game/[id] (see game/[id].tsx) and held until
// the next sign-in completes, so we can resume straight to the shared game after login/signup.
export async function savePendingGame(gameId: string) {
  await AsyncStorage.setItem(KEY, gameId);
}

export async function consumePendingGame(): Promise<string | null> {
  const value = await AsyncStorage.getItem(KEY);
  if (value) await AsyncStorage.removeItem(KEY);
  return value;
}
