import { Platform, Share } from "react-native";
import * as Linking from "expo-linking";
import type { Game } from "./mockData";

// smashio://game/<id> on native; expo-router resolves it straight to game/[id.]tsx.
// Web preview gets an http(s) URL instead — Linking.createURL degrades gracefully there.
// Share.share rejects on user-cancel on some platforms (notably web's navigator.share) —
// that's a normal dismissal, not an error worth surfacing.
// iOS surfaces `message` and `url` as two separate share items, so a share target that renders
// both (e.g. Messages) shows the link twice if it's also baked into the message text.
export async function shareGame(game: Game) {
  const url = Linking.createURL(`game/${game.id}`);
  const text = `Join me for badminton at ${game.venue} · ${game.date} ${game.time}`;
  try {
    await Share.share(
      Platform.OS === "ios" ? { message: text, url } : { message: `${text} — ${url}` }
    );
  } catch {}
}

export async function shareReferral() {
  const url = Linking.createURL("onboarding");
  const text = "Come play badminton with me on Smashio — join here:";
  try {
    await Share.share(
      Platform.OS === "ios" ? { message: text, url } : { message: `${text} ${url}` }
    );
  } catch {}
}
