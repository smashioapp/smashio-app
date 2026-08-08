import { useCallback, useState } from "react";
import { View, Text, Pressable, Linking, Platform } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as Notifications from "expo-notifications";
import { colors } from "../lib/theme";
import { Button } from "../components/Button";
import { Screen } from "../components/Screen";
import { BackButton } from "../components/BackButton";

export default function NotificationSettings() {
  const [status, setStatus] = useState<Notifications.PermissionStatus | null>(null);

  const refresh = useCallback(() => {
    Notifications.getPermissionsAsync().then((r) => setStatus(r.status));
  }, []);

  useFocusEffect(refresh);

  const enable = async () => {
    const result = await Notifications.requestPermissionsAsync();
    setStatus(result.status);
    if (result.status !== "granted") {
      Linking.openSettings();
    }
  };

  const granted = status === Notifications.PermissionStatus.GRANTED;

  return (
    <Screen>
      <View className="flex-row items-center gap-3 px-5 pt-2 pb-1">
        <BackButton onPress={() => router.back()} />
        <Text className="font-display text-[19px]" style={{ color: colors.text }}>
          Notifications
        </Text>
      </View>
      <View className="px-6 pt-4 gap-4">
        <View className="rounded-2xl p-4 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
          <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
            Push notifications
          </Text>
          <Text className="text-[12.5px] mt-1.5" style={{ color: colors.textSecondary }}>
            Get notified about join requests, chat messages, and match updates.
          </Text>
          <View className="rounded-pill self-start px-2.5 py-1.5 mt-3" style={{ backgroundColor: granted ? "rgba(53,214,166,0.15)" : "rgba(255,182,72,0.15)" }}>
            <Text className="font-body-extrabold text-[9.5px] uppercase" style={{ color: granted ? colors.intermediate : colors.advanced }}>
              {status === null ? "Checking…" : granted ? "Enabled" : "Off"}
            </Text>
          </View>
        </View>

        {!granted && (
          <Button label={Platform.OS === "web" ? "Not available on web" : "Enable notifications"} onPress={enable} disabled={Platform.OS === "web"} />
        )}
        {granted && (
          <Pressable onPress={() => Linking.openSettings()}>
            <Text className="text-center text-[12.5px] font-body-bold" style={{ color: colors.textSecondary }}>
              Manage in system settings
            </Text>
          </Pressable>
        )}
      </View>
    </Screen>
  );
}
