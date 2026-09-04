import { useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Sheet } from "./Sheet";
import { colors } from "../lib/theme";
import { haptics } from "../lib/haptics";
import { useReportUser, useBlockPlayer, type ReportReason } from "../lib/queries/settings";

// Game detail redesign artboard 07 — report and block reachable from the page where you meet a
// stranger. Reuses the already-shipped report_user RPC/useReportUser and blocks table/
// useBlockPlayer (social-plan B5/B7) — no new backend. The mockup's three reasons don't map
// 1:1 onto the existing ReportReason enum, so "not what the listing says" and "asked for money
// outside the app" both go through as "other" with the tapped label as the detail text.
const REASONS: { label: string; reason: ReportReason }[] = [
  { label: "It's not what the listing says", reason: "other" },
  { label: "The host asked for money outside the app", reason: "other" },
  { label: "Something made me uncomfortable", reason: "unsafe" },
];

export function ReportSheet({
  visible,
  onClose,
  hostId,
  hostName,
  gameId,
}: {
  visible: boolean;
  onClose: () => void;
  hostId: string;
  hostName: string;
  gameId: string;
}) {
  const reportUser = useReportUser();
  const blockPlayer = useBlockPlayer();
  const [sent, setSent] = useState<string | null>(null);

  const report = (r: (typeof REASONS)[number]) => {
    haptics.tap();
    reportUser.mutate(
      { reportedId: hostId, reason: r.reason, detail: r.label, contextGameId: gameId },
      {
        onSuccess: () => setSent(r.label),
        onError: (e) => Alert.alert("Couldn't send that report", e instanceof Error ? e.message : "Give it another go."),
      }
    );
  };

  const block = () => {
    Alert.alert(`Block ${hostName}?`, "Blocking hides you from each other everywhere in Smashio, and pulls you out of this game.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Block",
        style: "destructive",
        onPress: () => {
          haptics.tap();
          blockPlayer.mutate(hostId, {
            onSuccess: onClose,
            onError: (e) => Alert.alert("Couldn't block", e instanceof Error ? e.message : "Give it another go."),
          });
        },
      },
    ]);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Report this game">
      {sent ? (
        <Text className="text-[13.5px]" style={{ color: colors.textSecondary, lineHeight: 20 }}>
          Thanks, we've got it. We'll take a look.
        </Text>
      ) : (
        <>
          {REASONS.map((r) => (
            <Pressable
              key={r.label}
              className="flex-row items-center py-3 border-b"
              style={{ borderColor: colors.cardBorder }}
              onPress={() => report(r)}
            >
              <Text className="flex-1 font-body-semibold text-[13.5px]" style={{ color: colors.text }}>
                {r.label}
              </Text>
              <Ionicons name="chevron-forward-outline" size={14} color={colors.textTertiary} />
            </Pressable>
          ))}
          <Pressable className="flex-row items-center gap-2.5 py-3.5 mt-1" onPress={block}>
            <Ionicons name="shield-checkmark-outline" size={16} color={colors.danger} />
            <Text className="font-body-bold text-[13.5px]" style={{ color: colors.danger }}>
              Block {hostName}
            </Text>
          </Pressable>
        </>
      )}
    </Sheet>
  );
}
