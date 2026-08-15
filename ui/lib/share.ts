import { Platform, Share } from "react-native";
import * as Linking from "expo-linking";
import type { Game } from "./mockData";

// https://smashio.com.au/game/<id> — Universal Link, not smashio:// custom scheme.
// Custom schemes aren't reliably tappable in share targets and dead-end with no app installed.
// The https link opens the app directly on iOS (associatedDomains + AASA at
// website/.well-known/apple-app-site-association) and falls back to the marketing site
// otherwise (website/vercel.json rewrites /game/:id -> index.html).
// Share.share rejects on user-cancel on some platforms (notably web's navigator.share) —
// that's a normal dismissal, not an error worth surfacing.
// iOS surfaces `message` and `url` as two separate share items, so a share target that renders
// both (e.g. Messages) shows the link twice if it's also baked into the message text.
export async function shareGame(game: Game) {
  const url = `https://smashio.com.au/game/${game.id}`;
  const text = `Join me for badminton at ${game.venue} · ${game.date} ${game.time}`;
  try {
    await Share.share(
      Platform.OS === "ios" ? { message: text, url } : { message: `${text} — ${url}` }
    );
  } catch {}
}

// Carries the sharer's id so the link can be credited (profile-plan.md P5) — captured by
// onboarding/index.tsx and attributed on next sign-in (lib/referral.ts).
export async function shareReferral(referrerId: string) {
  const url = Linking.createURL("onboarding", { queryParams: { ref: referrerId } });
  const text = "Come play badminton with me on Smashio — join here:";
  try {
    await Share.share(
      Platform.OS === "ios" ? { message: text, url } : { message: `${text} ${url}` }
    );
  } catch {}
}
