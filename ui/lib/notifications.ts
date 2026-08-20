import { useEffect } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { router, usePathname } from "expo-router";
import { supabase } from "./supabase";
import { useSession } from "./session";

// The screen currently on top, so a push about the chat you're already looking at doesn't bank a
// banner over it. Module-level (like currentToken below) because the notification handler is
// registered once, outside React, and needs the latest value without a re-render each nav.
let activeRoute: { screen: "chat" | null; gameId: string | null } = { screen: null, gameId: null };

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as PushData;
    const suppressed =
      data.screen === "chat" && activeRoute.screen === "chat" && !!data.game_id && data.game_id === activeRoute.gameId;
    return {
      shouldShowBanner: !suppressed,
      shouldShowList: !suppressed,
      shouldPlaySound: !suppressed,
      shouldSetBadge: false,
    };
  },
});

// Mounted once at the root (ui/app/_layout.tsx). Only /chat/:id sets activeRoute today since
// that's the one reported banner-over-open-screen complaint (§4 "Banner shows even when you're
// already in that chat") — extend the regex list if another screen needs the same suppression.
export function useTrackActiveRoute() {
  const pathname = usePathname();
  useEffect(() => {
    const chatMatch = pathname.match(/^\/chat\/([^/]+)/);
    activeRoute = chatMatch ? { screen: "chat", gameId: chatMatch[1] } : { screen: null, gameId: null };
  }, [pathname]);
}

// One channel per notification category, importance matching the tier the edge function sends
// (supabase/functions/push-dispatch/format.ts). Ids must stay in sync with PushChannel there:
// an unknown channelId on an Expo push falls back to 'default' and loses its importance.
const ANDROID_CHANNELS: { id: string; name: string; importance: Notifications.AndroidImportance }[] = [
  { id: "requests", name: "Join requests", importance: Notifications.AndroidImportance.HIGH },
  { id: "game-updates", name: "Game changes", importance: Notifications.AndroidImportance.HIGH },
  { id: "chat", name: "Chat messages", importance: Notifications.AndroidImportance.HIGH },
  { id: "reminders", name: "Reminders", importance: Notifications.AndroidImportance.DEFAULT },
  { id: "discovery", name: "Games near you", importance: Notifications.AndroidImportance.LOW },
];

// The token this device is currently registered with, so sign-out can delete exactly this row
// rather than every device on the account. Module-level because signOut runs outside the hook.
let currentToken: string | null = null;

async function registerForPush(profileId: string) {
  // Push tokens require a physical device (simulators/emulators have no APNs/FCM registration)
  // and Expo's push service, unavailable on web.
  if (!Device.isDevice || Platform.OS === "web") return;

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") return;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    for (const channel of ANDROID_CHANNELS) {
      await Notifications.setNotificationChannelAsync(channel.id, {
        name: channel.name,
        importance: channel.importance,
      });
    }
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  currentToken = token;

  await supabase
    .from("push_tokens")
    .upsert(
      { profile_id: profileId, expo_token: token, platform: Platform.OS, updated_at: new Date().toISOString() },
      { onConflict: "profile_id,expo_token" },
    );
}

// Nothing ever deleted a token, so on a shared or resold device the previous account kept
// receiving this account's pushes — chat message bodies included. Call before signOut, while the
// session still satisfies push_tokens' self-only RLS. Best effort: a failed delete must not
// block the user from signing out.
export async function unregisterPushToken() {
  if (!currentToken) return;
  const token = currentToken;
  currentToken = null;
  try {
    await supabase.from("push_tokens").delete().eq("expo_token", token);
  } catch {
    // ignored — sign-out proceeds regardless
  }
}

type PushData = { screen?: string; game_id?: string; type?: string; notification_id?: string };

function handleNotificationTap(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data as PushData;

  // Best-effort — a tap should navigate regardless of whether this write lands. A coalesced push
  // (P2 §6.2) carries only its triggering row's id, so opening from a coalesced tap marks that
  // one read; the rest clear from the inbox screen the normal way.
  if (data.notification_id) {
    supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", data.notification_id).then(
      () => {},
      () => {},
    );
  }

  // A declined request lands on Discover, not on the game that said no — there's nothing to do
  // there. Every other screen needs the game id.
  if (data.screen === "discover") {
    router.push("/(tabs)/discover");
    return;
  }
  if (!data.game_id) return;

  if (data.screen === "chat") router.push(`/chat/${data.game_id}`);
  else if (data.screen === "post_game") router.push(`/post-game/${data.game_id}`);
  else if (data.screen === "game_requests") router.push(`/game/${data.game_id}?focus=requests`);
  else if (data.screen === "game") router.push(`/game/${data.game_id}`);
}

// Registers (or re-registers) this device's push token whenever a session becomes active, and
// deep-links a tapped notification to the relevant screen. Fire-and-forget — a denied
// permission or registration failure shouldn't block the app.
export function usePushRegistration() {
  const { session } = useSession();

  useEffect(() => {
    if (!session?.user.id) return;
    registerForPush(session.user.id).catch(() => {});
  }, [session?.user.id]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(handleNotificationTap);
    return () => subscription.remove();
  }, []);
}
