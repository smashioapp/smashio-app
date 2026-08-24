import { View, Text, Pressable, Switch, ScrollView, Alert } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../lib/theme";
import { Sheet } from "./Sheet";
import { Avatar } from "./Avatar";
import {
  useChatMembers,
  useChatPrefs,
  useChatGameMeta,
  useSetChatPrefs,
  useSetChatMode,
  useSetPlayerChatMute,
  useSetBroadcastSettings,
  useCloseChat,
  snoozeUntil,
  type ChatMember,
  type ChatPrefLevel,
} from "../lib/queries/messages";
import { useLeaveGame, useRemovePlayer } from "../lib/queries/gamePlayers";

const LEVEL_LABELS: Record<ChatPrefLevel, string> = { all: "All", mentions: "Mentions only", none: "Off" };
const SNOOZE_OPTIONS: { label: string; hours: number }[] = [
  { label: "1 hour", hours: 1 },
  { label: "8 hours", hours: 8 },
  { label: "Until the game ends", hours: -1 },
];

// The ⋯ sheet: host sees mode toggle + member moderation + close; player sees notif prefs,
// read-only members, leave. Same shape as WhatsApp/Slack/TeamSnap prior art in chat-plan.md.
export function ChatDetailsSheet({
  visible,
  onClose,
  gameId,
  organizerId,
  isHost,
  chatMode,
  chatClosedAt,
  gameEndsAt,
  gameStartsAt,
}: {
  visible: boolean;
  onClose: () => void;
  gameId: string;
  organizerId: string;
  isHost: boolean;
  chatMode: "open" | "announce";
  chatClosedAt: string | null;
  gameEndsAt: string;
  gameStartsAt: string;
}) {
  const membersQuery = useChatMembers(gameId, organizerId);
  const members = membersQuery.data ?? [];
  const prefsQuery = useChatPrefs(gameId);
  const prefs = prefsQuery.data;
  const setPrefs = useSetChatPrefs(gameId);
  const setMode = useSetChatMode(gameId);
  const setMute = useSetPlayerChatMute(gameId);
  const closeChat = useCloseChat(gameId);
  const leaveGame = useLeaveGame(gameId);
  const removePlayer = useRemovePlayer(gameId);
  const metaQuery = useChatGameMeta(gameId);
  const setBroadcast = useSetBroadcastSettings(gameId);
  const pauseUntil2h = new Date(new Date(gameStartsAt).getTime() - 2 * 60 * 60 * 1000).toISOString();
  const isPaused = !!metaQuery.data?.chatPauseUntil && new Date(metaQuery.data.chatPauseUntil) > new Date();

  const cycleLevel = () => {
    const order: ChatPrefLevel[] = ["all", "mentions", "none"];
    const next = order[(order.indexOf(prefs?.level ?? "all") + 1) % order.length];
    setPrefs.mutate({ level: next });
  };

  const snoozed = !!prefs?.mutedUntil && new Date(prefs.mutedUntil) > new Date();
  const snooze = (hours: number) => setPrefs.mutate({ mutedUntil: snoozeUntil(hours, gameEndsAt) });
  const unsnooze = () => setPrefs.mutate({ mutedUntil: null });

  const confirmLeave = () => {
    Alert.alert("Leave game?", "You'll lose your spot and stop seeing this chat.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: () => {
          leaveGame.mutate();
          onClose();
          router.replace("/(tabs)/chat");
        },
      },
    ]);
  };

  const confirmClose = () => {
    Alert.alert("Close this chat?", "No one will be able to post again, but history stays readable.", [
      { text: "Cancel", style: "cancel" },
      { text: "Close chat", style: "destructive", onPress: () => closeChat.mutate() },
    ]);
  };

  const confirmRemove = (member: ChatMember) => {
    Alert.alert(`Remove ${member.name}?`, "They'll lose their spot in this game.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => removePlayer.mutate(member.id) },
    ]);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Chat details">
      <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
        {isHost && (
          <View className="flex-row items-center justify-between py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <View className="flex-1 pr-3">
              <Text className="font-body-bold text-[14.5px]" style={{ color: colors.text }}>
                Announcements only
              </Text>
              <Text className="text-[12.5px] mt-0.5" style={{ color: colors.textTertiary }}>
                Only you can post
              </Text>
            </View>
            <Switch
              value={chatMode === "announce"}
              onValueChange={(v) => setMode.mutate(v ? "announce" : "open")}
              trackColor={{ true: colors.accent, false: "rgba(255,255,255,0.15)" }}
            />
          </View>
        )}

        {isHost && (
          <>
            <View className="flex-row items-center justify-between py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              <View className="flex-1 pr-3">
                <Text className="font-body-bold text-[14.5px]" style={{ color: colors.text }}>
                  Pause chat until 2h before start
                </Text>
                <Text className="text-[12.5px] mt-0.5" style={{ color: colors.textTertiary }}>
                  You can still post — players can react and DM you
                </Text>
              </View>
              <Switch
                value={isPaused}
                onValueChange={(v) => setBroadcast.mutate({ pauseUntil: v ? pauseUntil2h : null, photoApproval: metaQuery.data?.chatPhotoApproval ?? false })}
                trackColor={{ true: colors.accent, false: "rgba(255,255,255,0.15)" }}
              />
            </View>

            <View className="flex-row items-center justify-between py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              <View className="flex-1 pr-3">
                <Text className="font-body-bold text-[14.5px]" style={{ color: colors.text }}>
                  Photos need host approval
                </Text>
                <Text className="text-[12.5px] mt-0.5" style={{ color: colors.textTertiary }}>
                  Yours never do
                </Text>
              </View>
              <Switch
                value={metaQuery.data?.chatPhotoApproval ?? false}
                onValueChange={(v) => setBroadcast.mutate({ pauseUntil: metaQuery.data?.chatPauseUntil ?? null, photoApproval: v })}
                trackColor={{ true: colors.accent, false: "rgba(255,255,255,0.15)" }}
              />
            </View>
          </>
        )}

        <Pressable
          onPress={cycleLevel}
          className="flex-row items-center justify-between py-3 border-b"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
        >
          <Text className="font-body-bold text-[14.5px]" style={{ color: colors.text }}>
            Notifications
          </Text>
          <Text className="text-[13.5px]" style={{ color: colors.accent }}>
            {LEVEL_LABELS[prefs?.level ?? "all"]}
          </Text>
        </Pressable>

        <View className="flex-row flex-wrap gap-2 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          {snoozed ? (
            <Pressable onPress={unsnooze} className="rounded-pill px-3 py-1.5" style={{ backgroundColor: "rgba(255,103,103,0.14)" }}>
              <Text className="text-[12.5px] font-body-bold" style={{ color: colors.danger }}>
                Snoozed — tap to turn back on
              </Text>
            </Pressable>
          ) : (
            SNOOZE_OPTIONS.map((opt) => (
              <Pressable
                key={opt.label}
                onPress={() => snooze(opt.hours)}
                className="rounded-pill px-3 py-1.5"
                style={{ backgroundColor: colors.surfaceAlt }}
              >
                <Text className="text-[12.5px] font-body-bold" style={{ color: colors.textSecondary }}>
                  Mute {opt.label}
                </Text>
              </Pressable>
            ))
          )}
        </View>

        <Text className="font-body-bold text-[13px] mt-3 mb-1" style={{ color: colors.textTertiary }}>
          MEMBERS · {members.length}
        </Text>
        {members.map((m) => (
          <View key={m.id} className="flex-row items-center gap-3 py-2.5">
            <Pressable
              onPress={() => {
                onClose();
                router.push(`/player/${m.id}`);
              }}
              className="flex-row items-center gap-3 flex-1"
            >
              <Avatar id={m.id} name={m.name} color={m.color} photoUri={m.photoUri} avatarKey={m.avatarKey} size={32} />
              <View className="flex-1">
                <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
                  {m.name}
                </Text>
                {m.isHost && (
                  <Text className="text-[11.5px]" style={{ color: colors.accent }}>
                    Host
                  </Text>
                )}
              </View>
            </Pressable>
            {isHost && !m.isHost && (
              <View className="flex-row items-center gap-3">
                <Pressable onPress={() => setMute.mutate({ profileId: m.id, muted: !m.muted })}>
                  <Text className="text-[12px] font-body-bold" style={{ color: m.muted ? colors.danger : colors.textSecondary }}>
                    {m.muted ? "Muted" : "Can post"}
                  </Text>
                </Pressable>
                <Pressable onPress={() => confirmRemove(m)}>
                  <Ionicons name="person-remove-outline" size={17} color={colors.danger} />
                </Pressable>
              </View>
            )}
          </View>
        ))}

        <View className="mt-4 gap-2.5 pb-1">
          {isHost
            ? !chatClosedAt && (
                <Pressable onPress={confirmClose} className="py-3 items-center rounded-2xl" style={{ backgroundColor: "rgba(255,103,103,0.1)" }}>
                  <Text className="font-body-bold text-[14px]" style={{ color: colors.danger }}>
                    Close chat
                  </Text>
                </Pressable>
              )
            : (
                <Pressable onPress={confirmLeave} className="py-3 items-center rounded-2xl" style={{ backgroundColor: "rgba(255,103,103,0.1)" }}>
                  <Text className="font-body-bold text-[14px]" style={{ color: colors.danger }}>
                    Leave game
                  </Text>
                </Pressable>
              )}
        </View>
      </ScrollView>
    </Sheet>
  );
}
