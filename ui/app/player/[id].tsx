import { useState } from "react";
import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../../components/Screen";
import { BackButton } from "../../components/BackButton";
import { PlayerCard } from "../../components/PlayerCard";
import { Sheet } from "../../components/Sheet";
import { colors } from "../../lib/theme";
import { useSession } from "../../lib/session";
import { useBlockPlayer, useReportUser, type ReportReason } from "../../lib/queries/settings";

const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: "harassment", label: "Harassment or abuse" },
  { key: "unsafe", label: "Made me feel unsafe" },
  { key: "no_show", label: "No-showed without notice" },
  { key: "fake_profile", label: "Fake profile" },
  { key: "spam", label: "Spam" },
  { key: "other", label: "Something else" },
];

// The public player card (profile-plan.md P1) — wired from roster avatars, join-request rows,
// the organizer row, chat headers and the post-game rating list. Was previously dead: no
// route existed, so every avatar in the app was inert.
export default function PlayerProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const isSelf = session?.user.id === id;
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const blockPlayer = useBlockPlayer();
  const reportUser = useReportUser();

  const confirmBlock = () => {
    setMenuOpen(false);
    Alert.alert(
      "Block this player?",
      "They won't be able to see your profile or request to join your games, and their games disappear from your Discover.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            if (!id) return;
            try {
              await blockPlayer.mutateAsync(id);
              router.back();
            } catch (e) {
              Alert.alert("Couldn't block", e instanceof Error ? e.message : "Try again.");
            }
          },
        },
      ]
    );
  };

  const submitReport = async (reason: ReportReason) => {
    setReportOpen(false);
    if (!id) return;
    try {
      await reportUser.mutateAsync({ reportedId: id, reason });
      Alert.alert("Report sent", "Thanks — a moderator will take a look.");
    } catch (e) {
      Alert.alert("Couldn't send report", e instanceof Error ? e.message : "You may have already reported this player today.");
    }
  };

  return (
    <Screen>
      <View className="flex-row items-center justify-between gap-3 px-5 pt-2 pb-1">
        <View className="flex-row items-center gap-3">
          <BackButton onPress={() => router.back()} />
          <Text className="font-display text-[18px]" style={{ color: colors.text }}>
            Player
          </Text>
        </View>
        {!isSelf && id && (
          <Pressable onPress={() => setMenuOpen(true)} hitSlop={10} className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: colors.surface }}>
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {id ? <PlayerCard profileId={id} mode={isSelf ? "me" : "them"} /> : null}
      </ScrollView>

      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} title="Player options">
        <Pressable
          className="flex-row items-center gap-3 py-3"
          onPress={() => {
            setMenuOpen(false);
            setReportOpen(true);
          }}
        >
          <Ionicons name="flag-outline" size={18} color={colors.textSecondary} />
          <Text className="font-body-semibold text-[14.5px]" style={{ color: colors.text }}>
            Report this player
          </Text>
        </Pressable>
        <Pressable className="flex-row items-center gap-3 py-3" onPress={confirmBlock}>
          <Ionicons name="ban-outline" size={18} color={colors.danger} />
          <Text className="font-body-semibold text-[14.5px]" style={{ color: colors.danger }}>
            Block this player
          </Text>
        </Pressable>
      </Sheet>

      <Sheet visible={reportOpen} onClose={() => setReportOpen(false)} title="Why are you reporting this player?">
        {REPORT_REASONS.map((r) => (
          <Pressable key={r.key} className="py-3" style={{ borderTopWidth: 1, borderTopColor: colors.cardBorder }} onPress={() => submitReport(r.key)}>
            <Text className="font-body-semibold text-[14px]" style={{ color: colors.text }}>
              {r.label}
            </Text>
          </Pressable>
        ))}
      </Sheet>
    </Screen>
  );
}
