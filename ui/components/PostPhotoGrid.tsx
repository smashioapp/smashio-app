import { useState } from "react";
import { View, Text, Pressable, Image, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../lib/theme";
import { haptics } from "../lib/haptics";
import { useSession } from "../lib/session";
import { useReportContent, type ContentReportReason } from "../lib/queries/settings";
import type { PostMedia } from "../lib/queries/feed";
import { ChatLightbox } from "./ChatLightbox";

const GAP = 4;
const RADIUS = 14;

const REPORT_REASONS: { label: string; reason: ContentReportReason }[] = [
  { label: "Nudity or sexual", reason: "sexual" },
  { label: "Violence", reason: "violence" },
  { label: "Hate", reason: "hate" },
  { label: "Spam or scam", reason: "spam" },
  { label: "Something else", reason: "other" },
];

// Feed photos (image-moderation-plan.md §2, social-plan B3a). 1 photo = one wide tile, 2 = side by
// side, 3 = one tall + two stacked, 4 = a 2x2 grid. A 'review' photo only ever reaches its author
// (RLS), shown with a "Being checked" tag. A 'rejected' one never has a URL; the author gets a
// line saying it was removed, everyone else never sees the row at all.
export function PostPhotoGrid({ media }: { media: PostMedia[] }) {
  const { session } = useSession();
  const reportContent = useReportContent();
  const [open, setOpen] = useState<PostMedia | null>(null);

  const shown = media.filter((m) => m.status !== "rejected" && m.url);
  const removedCount = media.filter((m) => m.status === "rejected").length;

  if (shown.length === 0 && removedCount === 0) return null;

  const report = (m: PostMedia) => {
    Alert.alert("Report this photo?", "What's wrong with it?", [
      ...REPORT_REASONS.map((r) => ({
        text: r.label,
        onPress: () => {
          haptics.tap();
          reportContent.mutate(
            { subjectType: "photo", subjectId: m.id, reportedId: m.authorId, reason: r.reason },
            {
              onSuccess: () => {
                setOpen(null);
                Alert.alert("Thanks for letting us know", "We'll take a look.");
              },
              onError: (e) => Alert.alert("Couldn't send that report", e instanceof Error ? e.message : "Give it another go."),
            }
          );
        },
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const tile = (m: PostMedia, style: object) => (
    <Pressable
      key={m.id}
      onPress={(e) => {
        e.stopPropagation?.();
        haptics.tick();
        setOpen(m);
      }}
      style={[{ overflow: "hidden", borderRadius: RADIUS, backgroundColor: colors.surfaceAlt }, style]}
      accessibilityRole="imagebutton"
      accessibilityLabel="Open photo"
    >
      <Image source={{ uri: m.url! }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
      {m.status === "review" && (
        <View
          className="absolute flex-row items-center gap-1 rounded-pill px-2 py-1"
          style={{ left: 8, bottom: 8, backgroundColor: "rgba(0,0,0,0.65)" }}
        >
          <Ionicons name="time-outline" size={11} color={colors.text} />
          <Text className="font-body-bold" style={{ fontSize: 10.5, color: colors.text }}>
            Being checked
          </Text>
        </View>
      )}
    </Pressable>
  );

  let grid: React.ReactNode = null;
  if (shown.length === 1) {
    grid = <View style={{ aspectRatio: 4 / 3 }}>{tile(shown[0], { flex: 1 })}</View>;
  } else if (shown.length === 2) {
    grid = (
      <View style={{ flexDirection: "row", gap: GAP, aspectRatio: 2 }}>
        {shown.map((m) => tile(m, { flex: 1 }))}
      </View>
    );
  } else if (shown.length === 3) {
    grid = (
      <View style={{ flexDirection: "row", gap: GAP, aspectRatio: 3 / 2 }}>
        {tile(shown[0], { flex: 2 })}
        <View style={{ flex: 1, gap: GAP }}>{shown.slice(1).map((m) => tile(m, { flex: 1 }))}</View>
      </View>
    );
  } else if (shown.length >= 4) {
    grid = (
      <View style={{ gap: GAP, aspectRatio: 1 }}>
        <View style={{ flex: 1, flexDirection: "row", gap: GAP }}>{shown.slice(0, 2).map((m) => tile(m, { flex: 1 }))}</View>
        <View style={{ flex: 1, flexDirection: "row", gap: GAP }}>{shown.slice(2, 4).map((m) => tile(m, { flex: 1 }))}</View>
      </View>
    );
  }

  const isMine = !!open && open.authorId === session?.user.id;

  return (
    <View style={{ gap: 6 }}>
      {grid}
      {removedCount > 0 && (
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="eye-off-outline" size={12} color={colors.textTertiary} />
          <Text className="text-[12px] font-body-semibold" style={{ color: colors.textTertiary }}>
            {removedCount === 1
              ? "One photo was removed, it didn't fit our guidelines."
              : `${removedCount} photos were removed, they didn't fit our guidelines.`}
          </Text>
        </View>
      )}
      <ChatLightbox uri={open?.url ?? null} onClose={() => setOpen(null)} onReport={open && !isMine ? () => report(open) : undefined} />
    </View>
  );
}
