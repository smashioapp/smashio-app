import { Share } from "react-native";
import * as Linking from "expo-linking";
import type { Game } from "./mockData";

// smashio://game/<id> on native; expo-router resolves it straight to game/[id.]tsx.
// Web preview gets an http(s) URL instead — Linking.createURL degrades gracefully there.
// Share.share rejects on user-cancel on some platforms (notably web's navigator.share) —
// that's a normal dismissal, not an error worth surfacing.
export async function shareGame(game: Game) {
  const url = Linking.createURL(`game/${game.id}`);
  try {
    await Share.share({
      message: `Join me for badminton at ${game.venue} · ${game.date} ${game.time} — ${url}`,
      url,
    });
  } catch {}
}

export async function shareReferral() {
  const url = Linking.createURL("onboarding");
  try {
    await Share.share({
      message: `Come play badminton with me on SMASHIO — join here: ${url}`,
      url,
    });
  } catch {}
}
