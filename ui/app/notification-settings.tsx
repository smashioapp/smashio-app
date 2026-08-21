import { useCallback, useState } from "react";
import { View, Text, Pressable, Linking, Platform, Switch } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as Notifications from "expo-notifications";
import { Ionicons } from "@expo/vector-icons";
import { colors, TIERS } from "../lib/theme";
import { Button } from "../components/Button";
import { Screen } from "../components/Screen";
import { BackButton } from "../components/BackButton";
import { useMyAlerts, useDeleteAlert } from "../lib/queries/alerts";
import {
  type NotificationCategory,
  useNotificationPrefs,
  useSetNotificationCategory,
  useSetQuietHours,
} from "../lib/queries/notificationPrefs";

// §6.3 — one row per category, in the order the plan's table lists them (§4). Description lines
// name the events that category covers so a toggle doesn't read as a mystery switch.
const CATEGORIES: { key: NotificationCategory; label: string; description: string }[] = [
  { key: "join_requests", label: "Join requests", description: "Someone wants to join your game" },
  { key: "roster_changes", label: "Roster changes", description: "A player drops out or your game fills up" },
  { key: "chat", label: "Chat messages", description: "New messages in your games' chats" },
  { key: "game_changes", label: "Game changes", description: "Cancellations, reschedules, and edits to games you're in" },
  { key: "reminders", label: "Reminders", description: "Upcoming games and post-game rating prompts" },
  { key: "alerts", label: "Discover alerts", description: "New games matching your saved alerts" },
];

function CategoryToggles() {
  const { data: prefs } = useNotificationPrefs();
  const setCategory = useSetNotificationCategory();

  return (
    <View className="rounded-2xl p-4 border gap-1" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
      <Text className="font-body-bold text-[15.5px] mb-2" style={{ color: colors.text }}>
        What you're notified about
      </Text>
      {CATEGORIES.map((c, i) => (
        <View
          key={c.key}
          className="flex-row items-center justify-between py-3"
          style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.cardBorder } : undefined}
        >
          <View className="flex-1 pr-3">
            <Text className="text-[14.5px] font-body-semibold" style={{ color: colors.text }}>
              {c.label}
            </Text>
            <Text className="text-[12.5px] mt-0.5" style={{ color: colors.textTertiary }}>
              {c.description}
            </Text>
          </View>
          <Switch
            value={prefs ? prefs[toField(c.key)] : true}
            onValueChange={(v) => setCategory.mutate({ category: c.key, enabled: v })}
            trackColor={{ true: colors.accent, false: "rgba(255,255,255,0.15)" }}
          />
        </View>
      ))}
    </View>
  );
}

function toField(key: NotificationCategory) {
  const map = {
    join_requests: "joinRequests",
    roster_changes: "rosterChanges",
    chat: "chat",
    reminders: "reminders",
    game_changes: "gameChanges",
    alerts: "alerts",
    nudges: "nudges",
    // Not in CATEGORIES above — marketing consent lives in Settings' Notifications group
    // (settings.tsx), not this screen. Listed here only so the map stays exhaustive over
    // NotificationCategory.
    marketing: "marketing",
  } as const;
  return map[key];
}

// Quiet hours only ever silences the "Low" tier (§3 priority tiers) — a join request or
// cancellation still comes through. Fixed 22:00-07:00 window for now; the DB already supports a
// custom range (notification_prefs.quiet_start/quiet_end), a time picker is a follow-up.
function QuietHoursRow() {
  const { data: prefs } = useNotificationPrefs();
  const setQuietHours = useSetQuietHours();

  return (
    <View className="rounded-2xl p-4 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="font-body-bold text-[15.5px]" style={{ color: colors.text }}>
            Quiet hours
          </Text>
          <Text className="text-[13px] mt-1" style={{ color: colors.textSecondary }}>
            Hold non-urgent notifications between {prefs?.quietStart ?? "22:00"} and {prefs?.quietEnd ?? "07:00"}.
            Join requests and cancellations still come through.
          </Text>
        </View>
        <Switch
          value={prefs?.quietHoursEnabled ?? false}
          onValueChange={(v) => setQuietHours.mutate({ enabled: v })}
          trackColor={{ true: colors.accent, false: "rgba(255,255,255,0.15)" }}
        />
      </View>
    </View>
  );
}

function alertLabel(tierSlugs: string[] | null, radiusM: number): string {
  const level = !tierSlugs || tierSlugs.length === 0 ? "Any level" : tierSlugs.map((s) => TIERS.find((t) => t.id.toLowerCase() === s)?.id ?? s).join(", ");
  return `${level} · within ${Math.round(radiusM / 1000)} km`;
}

function AlertsSection() {
  const { data: alerts } = useMyAlerts();
  const deleteAlert = useDeleteAlert();

  if (!alerts || alerts.length === 0) return null;

  return (
    <View className="rounded-2xl p-4 border gap-3" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
      <Text className="font-body-bold text-[15.5px]" style={{ color: colors.text }}>
        Your alerts
      </Text>
      <View className="gap-2">
        {alerts.map((a) => (
          <View key={a.id} className="flex-row items-center justify-between rounded-xl px-3.5 py-3 border" style={{ borderColor: colors.cardBorder }}>
            <Text className="text-[13.5px] font-body-semibold flex-1 pr-2" style={{ color: colors.textSecondary }}>
              {alertLabel(a.tierSlugs, a.radiusM)}
            </Text>
            <Pressable onPress={() => deleteAlert.mutate(a.id)} hitSlop={8}>
              <Ionicons name="trash-outline" size={16} color={colors.textTertiary} />
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

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
        <Text className="font-display text-[20px]" style={{ color: colors.text }}>
          Notifications
        </Text>
      </View>
      <View className="px-6 pt-4 gap-4">
        <View className="rounded-2xl p-4 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
          <Text className="font-body-bold text-[15.5px]" style={{ color: colors.text }}>
            Push notifications
          </Text>
          <Text className="text-[14.5px] mt-1.5" style={{ color: colors.textSecondary }}>
            Get notified about join requests, chat messages, and match updates.
          </Text>
          <View className="rounded-pill self-start px-2.5 py-1.5 mt-3" style={{ backgroundColor: granted ? "rgba(53,214,166,0.15)" : "rgba(255,182,72,0.15)" }}>
            <Text className="font-body-extrabold text-[11.5px] uppercase" style={{ color: granted ? colors.intermediate : colors.advanced }}>
              {status === null ? "Checking…" : granted ? "Enabled" : "Off"}
            </Text>
          </View>
        </View>

        {!granted && (
          <Button label={Platform.OS === "web" ? "Not available on web" : "Enable notifications"} onPress={enable} disabled={Platform.OS === "web"} />
        )}
        {granted && (
          <Pressable onPress={() => Linking.openSettings()}>
            <Text className="text-center text-[14.5px] font-body-bold" style={{ color: colors.textSecondary }}>
              Manage in system settings
            </Text>
          </Pressable>
        )}

        {granted && (
          <>
            <CategoryToggles />
            <QuietHoursRow />
          </>
        )}

        <AlertsSection />
      </View>
    </Screen>
  );
}
