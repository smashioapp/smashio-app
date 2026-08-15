import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, FlatList, KeyboardAvoidingView, Platform, Image, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import { colors } from "../../lib/theme";
import { useGameDetail } from "../../lib/queries/games";
import {
  useMarkThreadRead,
  useMessages,
  useSendMessage,
  useSendChatImage,
  useRetryMessage,
  useDeleteMessage,
  useChatMembers,
  useChatGameMeta,
  useSignedChatImageUrl,
  uuidv4,
  type ChatMessage,
  type ChatMember,
} from "../../lib/queries/messages";
import { buildChatTimeline, type TimelineEntry } from "../../lib/chatTimeline";
import { prepareConfirmationImage } from "../../lib/imagePrep";
import { useSession } from "../../lib/session";
import { Screen } from "../../components/Screen";
import { BackButton } from "../../components/BackButton";
import { Avatar } from "../../components/Avatar";
import { ChatEventHeader } from "../../components/ChatEventHeader";
import { ChatComposer, type ComposerState } from "../../components/ChatComposer";
import { ChatDetailsSheet } from "../../components/ChatDetailsSheet";
import { ChatLightbox } from "../../components/ChatLightbox";

const NEAR_BOTTOM_THRESHOLD = 120;
const HEADER_COLLAPSE_THRESHOLD = 40;

function memberName(members: ChatMember[], id: string | null): string {
  return members.find((m) => m.id === id)?.name ?? "Player";
}

function renderBodyWithMentions(body: string, members: ChatMember[], mine: boolean) {
  const names = members.map((m) => m.name).filter(Boolean).sort((a, b) => b.length - a.length);
  if (names.length === 0) return <Text style={{ color: mine ? "#EFFFC0" : colors.text }}>{body}</Text>;
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`@(${escaped.join("|")})\\b`, "g");
  const parts: { text: string; mention: boolean }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body))) {
    if (match.index > lastIndex) parts.push({ text: body.slice(lastIndex, match.index), mention: false });
    parts.push({ text: match[0], mention: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < body.length) parts.push({ text: body.slice(lastIndex), mention: false });
  return (
    <Text style={{ color: mine ? "#EFFFC0" : colors.text }}>
      {parts.map((p, i) => (
        <Text key={i} style={p.mention ? { color: colors.accent, fontWeight: "800" } : undefined}>
          {p.text}
        </Text>
      ))}
    </Text>
  );
}

function ChatImageBubble({ path, onPress }: { path: string | null; onPress: (uri: string) => void }) {
  const isLocal = !!path?.startsWith("file://");
  const signed = useSignedChatImageUrl(isLocal ? null : path);
  const uri = isLocal ? path : signed.data;
  if (!uri) {
    return <View style={{ width: 190, height: 190, borderRadius: 14, backgroundColor: colors.surfaceAlt }} />;
  }
  return (
    <Pressable onPress={() => onPress(uri)}>
      <Image source={{ uri }} style={{ width: 190, height: 190, borderRadius: 14 }} resizeMode="cover" />
    </Pressable>
  );
}

function SystemRow({ message }: { message: ChatMessage }) {
  const tinted = message.systemEvent === "rescheduled" || message.systemEvent === "cancelled";
  return (
    <View className="items-center py-1.5 px-8">
      <Text
        className="text-[12.5px] text-center"
        style={{ color: tinted ? colors.danger : colors.textMuted, fontWeight: tinted ? "700" : "400" }}
      >
        {message.body}
      </Text>
    </View>
  );
}

export default function ChatThread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const gameId = id ?? "";
  const { session } = useSession();
  const uid = session?.user.id;

  const gameQuery = useGameDetail(gameId);
  const game = gameQuery.data;
  const metaQuery = useChatGameMeta(gameId);
  const membersQuery = useChatMembers(gameId, game?.organizerId);
  const members = membersQuery.data ?? [];

  const messagesQuery = useMessages(gameId);
  const messages = messagesQuery.messages;
  const sendMessage = useSendMessage(gameId);
  const sendImage = useSendChatImage(gameId);
  const retryMessage = useRetryMessage(gameId);
  const deleteMessage = useDeleteMessage(gameId);
  useMarkThreadRead(gameId);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [newCount, setNewCount] = useState(0);

  const listRef = useRef<FlatList<TimelineEntry>>(null);
  const nearBottomRef = useRef(true);
  const prevLastIdRef = useRef<string | null>(null);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || prevLastIdRef.current === last.id) return;
    const firstRun = prevLastIdRef.current === null;
    if (firstRun || nearBottomRef.current || last.me) {
      requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: !firstRun }));
      setNewCount(0);
    } else {
      setNewCount((c) => c + 1);
    }
    prevLastIdRef.current = last.id;
  }, [messages.length]);

  const timeline = useMemo(() => buildChatTimeline(messages), [messages]);
  const inverted = useMemo(() => timeline.slice().reverse(), [timeline]);

  const isHost = !!game && game.organizerId === uid;
  const meMember = members.find((m) => m.id === uid);
  const closed = !!metaQuery.data?.chatClosedAt;
  const announce = metaQuery.data?.chatMode === "announce";

  const composerState: ComposerState = closed
    ? "locked_closed"
    : isHost
    ? announce
      ? "announce_host"
      : "can_post"
    : announce
    ? "locked_announce"
    : meMember?.muted
    ? "locked_muted"
    : "can_post";

  const onScroll = (offsetY: number) => {
    nearBottomRef.current = offsetY <= NEAR_BOTTOM_THRESHOLD;
    if (nearBottomRef.current) setNewCount(0);
    setCollapsed(offsetY > HEADER_COLLAPSE_THRESHOLD);
  };

  const scrollToBottom = () => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setNewCount(0);
  };

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo access to share a photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets[0];
    const preparedUri = await prepareConfirmationImage(asset.uri, asset.width, asset.height);
    sendImage.mutate({ clientId: uuidv4(), localUri: preparedUri, caption: "" });
  };

  const onLongPressMessage = (m: ChatMessage) => {
    if (m.kind !== "text" && m.kind !== "image") return;
    const canDelete = m.me || isHost;
    const options: { text: string; onPress?: () => void; style?: "default" | "destructive" | "cancel" }[] = [];
    if (!m.me && m.senderId) options.push({ text: "View profile", onPress: () => router.push(`/player/${m.senderId}`) });
    if (m.kind === "text") options.push({ text: "Copy", onPress: () => Clipboard.setStringAsync(m.body) });
    options.push({ text: "Report", onPress: () => Alert.alert("Reported", "Thanks — we'll take a look.") });
    if (canDelete) options.push({ text: "Delete", style: "destructive", onPress: () => deleteMessage.mutate(m.id) });
    options.push({ text: "Cancel", style: "cancel" });
    Alert.alert(m.me ? "Your message" : memberName(members, m.senderId), undefined, options);
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View className="flex-row items-center justify-between px-5 pt-1.5 pb-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <View className="flex-row items-center gap-3">
            <BackButton onPress={() => router.back()} />
            <Text className="font-body-bold text-[16.5px]" style={{ color: colors.text }}>
              {game?.venue ?? "Chat"}
            </Text>
          </View>
          <Pressable onPress={() => setDetailsOpen(true)} className="w-9 h-9 items-center justify-center" hitSlop={8}>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        {game && <ChatEventHeader game={game} collapsed={collapsed} onPress={() => router.push(`/game/${gameId}`)} />}

        <View style={{ flex: 1 }}>
          <FlatList
            ref={listRef}
            inverted
            style={{ flex: 1 }}
            data={inverted}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, gap: 4 }}
            onScroll={(e) => onScroll(e.nativeEvent.contentOffset.y)}
            scrollEventThrottle={32}
            onEndReachedThreshold={0.4}
            onEndReached={() => {
              if (messagesQuery.hasNextPage && !messagesQuery.isFetchingNextPage) messagesQuery.fetchNextPage();
            }}
            renderItem={({ item }) => {
              if (item.type === "day") {
                return (
                  <View className="items-center py-3">
                    <Text className="text-[12px] font-body-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>
                      {item.label}
                    </Text>
                  </View>
                );
              }
              if (item.type === "system") return <SystemRow message={item.message} />;

              const m = item.message;
              const member = members.find((x) => x.id === m.senderId);
              const isPending = m.status === "pending";
              const isFailed = m.status === "failed";

              return (
                <Pressable
                  onLongPress={() => onLongPressMessage(m)}
                  disabled={isFailed}
                  onPress={isFailed ? () => retryMessage(m) : undefined}
                  className={`flex-row gap-2 items-end ${m.me ? "flex-row-reverse" : ""}`}
                  style={{ marginTop: item.groupStart ? 10 : 2, opacity: isPending ? 0.6 : 1 }}
                >
                  {!m.me && (
                    <View style={{ width: 28 }}>
                      {item.groupStart && (
                        <Pressable onPress={() => m.senderId && router.push(`/player/${m.senderId}`)}>
                          <Avatar name={member?.name ?? "Player"} color={member?.color ?? colors.textSecondary} photoUri={member?.photoUri} size={28} />
                        </Pressable>
                      )}
                    </View>
                  )}
                  <View style={{ maxWidth: 240, alignItems: m.me ? "flex-end" : "flex-start" }}>
                    {!m.me && item.groupStart && (
                      <View className="flex-row items-center gap-1.5 mb-0.5">
                        <Pressable onPress={() => m.senderId && router.push(`/player/${m.senderId}`)}>
                          <Text className="text-[12px] font-body-bold" style={{ color: colors.textMuted }}>
                            {member?.name ?? "Player"}
                          </Text>
                        </Pressable>
                        {member?.isHost && (
                          <View className="rounded-pill px-1.5" style={{ backgroundColor: "rgba(214,255,63,0.16)" }}>
                            <Text className="text-[9px] font-body-extrabold" style={{ color: colors.accent }}>
                              HOST
                            </Text>
                          </View>
                        )}
                      </View>
                    )}

                    {m.kind === "image" ? (
                      <View className="gap-1">
                        <ChatImageBubble path={m.imagePath} onPress={setLightboxUri} />
                        {!!m.body && (
                          <View
                            className="px-3 py-2"
                            style={{ backgroundColor: m.me ? "rgba(214,255,63,0.16)" : colors.surfaceAlt, borderRadius: 14 }}
                          >
                            {renderBodyWithMentions(m.body, members, m.me)}
                          </View>
                        )}
                      </View>
                    ) : (
                      <View
                        className="px-3.5 py-2.5"
                        style={{
                          backgroundColor: m.me ? "rgba(214,255,63,0.16)" : colors.surfaceAlt,
                          borderRadius: 16,
                          borderBottomRightRadius: m.me ? 3 : 16,
                          borderBottomLeftRadius: m.me ? 16 : 3,
                        }}
                      >
                        {renderBodyWithMentions(m.body, members, m.me)}
                      </View>
                    )}

                    {item.groupEnd && (
                      <Text className="text-[11.5px] mt-0.5" style={{ color: isFailed ? colors.danger : colors.textMuted }}>
                        {isFailed ? "Failed — tap to retry" : isPending ? "Sending…" : m.time}
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            }}
          />

          {newCount > 0 && (
            <Pressable
              onPress={scrollToBottom}
              className="absolute self-center rounded-pill px-3.5 py-2 flex-row items-center gap-1.5"
              style={{ bottom: 12, backgroundColor: colors.accent }}
            >
              <Text className="font-body-bold text-[12.5px]" style={{ color: colors.base }}>
                {newCount} new
              </Text>
              <Ionicons name="arrow-down" size={13} color={colors.base} />
            </Pressable>
          )}
        </View>

        <ChatComposer
          state={composerState}
          members={members}
          memberCount={members.length}
          onSendText={(text, mentions) => sendMessage.mutate({ clientId: uuidv4(), text, mentions })}
          onPickImage={pickImage}
        />
      </KeyboardAvoidingView>

      {game && (
        <ChatDetailsSheet
          visible={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          gameId={gameId}
          organizerId={game.organizerId}
          isHost={isHost}
          chatMode={metaQuery.data?.chatMode ?? "open"}
          chatClosedAt={metaQuery.data?.chatClosedAt ?? null}
          gameEndsAt={game.endsAt}
        />
      )}

      <ChatLightbox uri={lightboxUri} onClose={() => setLightboxUri(null)} />
    </Screen>
  );
}
