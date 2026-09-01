import { useState } from "react";
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, avatarColor } from "../../lib/theme";
import { relativeTime } from "../../lib/format";
import { usePostDetail, usePostReplies, useCreateReply, useAcceptReply, useToggleReaction, useMyReactedPostIds, type PostReply } from "../../lib/queries/feed";
import { Screen } from "../../components/Screen";
import { BackButton } from "../../components/BackButton";
import { Avatar } from "../../components/Avatar";
import { supabase } from "../../lib/supabase";
import { useSession } from "../../lib/session";
import { haptics } from "../../lib/haptics";

function ReplyRow({ reply, isOwner, onAccept }: { reply: PostReply; isOwner: boolean; onAccept: (id: string | null) => void }) {
  const photoUrl = reply.authorPhotoPath ? supabase.storage.from("avatars").getPublicUrl(reply.authorPhotoPath).data.publicUrl : null;

  return (
    <View style={{ paddingHorizontal: 24, paddingVertical: 10, gap: 6 }}>
      <View className="flex-row items-center gap-2">
        <Avatar id={reply.authorId ?? reply.id} name={reply.authorDisplayName ?? "Player"} color={avatarColor(reply.authorId ?? reply.id)} size={28} photoUri={photoUrl} avatarKey={reply.authorAvatarKey} />
        <Text className="flex-1 font-body-bold text-[13.5px]" style={{ color: colors.text }} numberOfLines={1}>
          {reply.authorDisplayName ?? "Player"}
        </Text>
        <Text className="text-[11.5px] font-body-semibold" style={{ color: colors.textTertiary }}>
          {relativeTime(reply.createdAt)}
        </Text>
      </View>

      {reply.isAccepted ? (
        <View className="flex-row items-start gap-2.5 rounded-xl px-3 py-2.5" style={{ backgroundColor: colors.cardAlt, marginLeft: 34 }}>
          <View className="w-[17px] h-[17px] rounded-full items-center justify-center mt-0.5" style={{ backgroundColor: colors.intermediate }}>
            <Ionicons name="checkmark" size={11} color={colors.base} />
          </View>
          <View className="flex-1 min-w-0">
            <Text className="font-body-extrabold" style={{ fontSize: 11, color: colors.intermediate, letterSpacing: 0.4 }}>
              ACCEPTED ANSWER
            </Text>
            <Text className="text-[13.5px] mt-0.5" style={{ color: colors.textDim, lineHeight: 19 }}>
              {reply.body}
            </Text>
          </View>
        </View>
      ) : (
        <Text className="text-[13.5px]" style={{ color: colors.textDim, lineHeight: 19, marginLeft: 34 }}>
          {reply.body}
        </Text>
      )}

      {isOwner && (
        <Pressable onPress={() => onAccept(reply.isAccepted ? null : reply.id)} style={{ marginLeft: 34 }}>
          <Text className="font-body-bold text-[11.5px]" style={{ color: reply.isAccepted ? colors.textTertiary : colors.intermediate }}>
            {reply.isAccepted ? "Unmark accepted" : "Mark as accepted answer"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export default function QuestionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = id ?? "";
  const { session } = useSession();
  const postQuery = usePostDetail(postId);
  const repliesQuery = usePostReplies(postId);
  const createReply = useCreateReply();
  const acceptReply = useAcceptReply();
  const toggleReaction = useToggleReaction();
  const reactedQuery = useMyReactedPostIds([postId], { enabled: !!session });
  const [draft, setDraft] = useState("");

  const post = postQuery.data;
  const replies = repliesQuery.data ?? [];
  const isOwner = !!session && post?.authorId === session.user.id;
  const reacted = reactedQuery.data?.has(postId) ?? false;
  const photoUrl = post?.authorPhotoPath ? supabase.storage.from("avatars").getPublicUrl(post.authorPhotoPath).data.publicUrl : null;

  const submitReply = async () => {
    const body = draft.trim();
    if (!body) return;
    if (!session) {
      router.push("/onboarding");
      return;
    }
    haptics.tap();
    setDraft("");
    try {
      await createReply.mutateAsync({ postId, body });
    } catch (e) {
      Alert.alert("Couldn't post that reply", e instanceof Error ? e.message : "Give it another go.");
    }
  };

  return (
    <Screen>
      <View className="flex-row items-center gap-3.5 px-5 pb-3">
        <BackButton onPress={() => router.back()} />
        <Text className="font-display text-[17px]" style={{ color: colors.text }}>
          Question
        </Text>
      </View>

      {postQuery.isLoading || !post ? (
        <View className="items-center justify-center py-16">
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
          <ScrollView contentContainerStyle={{ paddingBottom: 90 }}>
            <View style={{ paddingHorizontal: 24, paddingTop: 6, paddingBottom: 12, gap: 9 }}>
              <View className="flex-row items-center gap-2.5">
                <Avatar id={post.authorId ?? post.id} name={post.authorDisplayName ?? "Player"} color={avatarColor(post.authorId ?? post.id)} size={36} photoUri={photoUrl} avatarKey={post.authorAvatarKey} />
                <View className="flex-1 min-w-0">
                  <Text className="font-body-bold text-[15px]" style={{ color: colors.text }} numberOfLines={1}>
                    {post.authorDisplayName}
                  </Text>
                  <Text className="text-[12px] font-body-semibold" style={{ color: colors.textTertiary }}>
                    {relativeTime(post.createdAt)}
                  </Text>
                </View>
                <View className="rounded-pill px-2 py-1" style={{ backgroundColor: "rgba(53,214,166,0.14)" }}>
                  <Text className="font-body-extrabold" style={{ fontSize: 10, color: colors.intermediate, letterSpacing: 0.3 }}>
                    Q&A
                  </Text>
                </View>
              </View>

              <Text className="text-[15px]" style={{ color: colors.textDim, lineHeight: 22 }}>
                {post.body}
              </Text>

              <View className="flex-row items-center gap-4 mt-0.5">
                <Pressable onPress={() => toggleReaction.mutate(postId)} className="flex-row items-center gap-1.5" hitSlop={8}>
                  <Ionicons name={reacted ? "heart" : "heart-outline"} size={15} color={reacted ? colors.danger : colors.textSecondary} />
                  <Text className="font-body-semibold text-[12.5px]" style={{ color: reacted ? colors.danger : colors.textSecondary }}>
                    {post.reactionCount}
                  </Text>
                </Pressable>
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="chatbubble-outline" size={13} color={colors.textSecondary} />
                  <Text className="font-body-semibold text-[12.5px]" style={{ color: colors.textSecondary }}>
                    {post.replyCount}
                  </Text>
                </View>
              </View>
            </View>

            <View className="h-px" style={{ backgroundColor: colors.cardBorder, marginHorizontal: 24 }} />

            {repliesQuery.isLoading ? (
              <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
            ) : replies.length === 0 ? (
              <Text className="text-[13.5px] text-center mt-6 px-6" style={{ color: colors.textSecondary }}>
                No replies yet, be the first to help out.
              </Text>
            ) : (
              <>
                <Text className="text-[10.5px] font-body-extrabold uppercase" style={{ color: colors.textTertiary, letterSpacing: 1, paddingHorizontal: 24, paddingTop: 14 }}>
                  {replies.length} repl{replies.length === 1 ? "y" : "ies"}
                </Text>
                {replies.map((r, i) => (
                  <View key={r.id}>
                    <ReplyRow reply={r} isOwner={isOwner} onAccept={(replyId) => acceptReply.mutate({ postId, replyId })} />
                    {i < replies.length - 1 && <View className="h-px" style={{ backgroundColor: colors.cardBorder, marginHorizontal: 24 }} />}
                  </View>
                ))}
              </>
            )}
          </ScrollView>

          <LinearGradient pointerEvents="none" colors={["transparent", colors.base]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 70 }} />
          <View className="flex-row gap-2.5 items-center px-5 pb-4 pt-2">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Write a reply…"
              placeholderTextColor={colors.textMuted}
              className="flex-1 rounded-pill px-4 border text-[14px]"
              style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder, color: colors.text, height: 44 }}
              multiline={false}
              returnKeyType="send"
              onSubmitEditing={submitReply}
            />
            <Pressable
              onPress={submitReply}
              disabled={!draft.trim() || createReply.isPending}
              className="w-[44px] h-[44px] rounded-full items-center justify-center"
              style={{ backgroundColor: colors.accent, opacity: !draft.trim() || createReply.isPending ? 0.5 : 1 }}
            >
              {createReply.isPending ? <ActivityIndicator size="small" color={colors.base} /> : <Ionicons name="send" size={16} color={colors.base} />}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </Screen>
  );
}
