import { useEffect } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { router } from "expo-router";
import { supabase } from "./supabase";
import { useSession } from "./session";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

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
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

  await supabase
    .from("push_tokens")
    .upsert(
      { profile_id: profileId, expo_token: token, platform: Platform.OS, updated_at: new Date().toISOString() },
      { onConflict: "profile_id,expo_token" },
    );
}

function handleNotificationTap(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data as { screen?: string; game_id?: string };
  if (!data.game_id) return;
  if (data.screen === "chat") router.push(`/chat/${data.game_id}`);
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
