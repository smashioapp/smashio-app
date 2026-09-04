import { Platform, Share } from "react-native";
import * as Linking from "expo-linking";
import * as Clipboard from "expo-clipboard";
import type { Game } from "./mockData";
import { track } from "./analytics";

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
    const result = await Share.share(
      Platform.OS === "ios" ? { message: text, url } : { message: `${text} — ${url}` }
    );
    if (result.action === Share.sharedAction) track("share_sent", { kind: "game", game_id: game.id });
  } catch {}
}

// design-brief Prompt 7a's host-only quick-invite chip: copies the same text the ordinary share
// sheet sends, then opens Share too — WhatsApp's own share target strips a bare link's preview
// card if it isn't already on the clipboard when the picker opens.
export async function copyGameLinkForWhatsApp(game: Game) {
  const url = `https://smashio.com.au/game/${game.id}`;
  const text = `Join me for badminton at ${game.venue} · ${game.date} ${game.time} — ${url}`;
  await Clipboard.setStringAsync(text);
  try {
    const result = await Share.share({ message: text });
    if (result.action === Share.sharedAction) track("share_sent", { kind: "game_whatsapp", game_id: game.id });
  } catch {}
}

// Carries the sharer's id so the link can be credited (profile-plan.md P5) — captured by
// onboarding/index.tsx and attributed on next sign-in (lib/referral.ts).
export async function shareReferral(referrerId: string) {
  const url = Linking.createURL("onboarding", { queryParams: { ref: referrerId } });
  const text = "Come play badminton with me on Smashio — join here:";
  try {
    const result = await Share.share(
      Platform.OS === "ios" ? { message: text, url } : { message: `${text} ${url}` }
    );
    if (result.action === Share.sharedAction) track("share_sent", { kind: "referral" });
  } catch {}
}
