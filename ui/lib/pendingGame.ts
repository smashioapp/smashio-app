import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "smashio.pending_path";

// Captured when an unauthenticated deep link opens /game/[id] or /game/claim/[token] and held
// until the next sign-in completes, so we can resume straight to the shared game or the claim
// flow after login/signup. Stores the full path (not just a game id) so a claim link's ?invite=
// token survives the auth detour — losing it here means a fresh signup lands on the game with
// their held spot still unclaimed (create-game-plan.md band 12 defect #5).
export async function savePendingPath(path: string) {
  await AsyncStorage.setItem(KEY, path);
}

export async function consumePendingPath(): Promise<string | null> {
  const value = await AsyncStorage.getItem(KEY);
  if (value) await AsyncStorage.removeItem(KEY);
  return value;
}
