import { Modal, Pressable, View, Text } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients } from "../lib/theme";
import { Avatar } from "./Avatar";
import { usePlayerCard } from "../lib/queries/profile";
import type { ChatMember } from "../lib/queries/messages";

function StatLine({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View className="flex-row justify-between py-1.5">
      <Text className="text-[12px]" style={{ color: colors.textSecondary }}>
        {label}
      </Text>
      <Text className="text-[12.5px] font-body-bold" style={{ color: valueColor ?? colors.text }}>
        {value}
      </Text>
    </View>
  );
}

// Tapping an avatar never leaves the chat — a peek card with the facts you need about a
// stranger you're about to play (SMASHIO Chat Redesign mock, §4). Reuses player_card (the
// same RPC the full profile screen uses) rather than a new query.
export function ChatProfilePeek({
  member,
  onClose,
  onMessage,
}: {
  member: ChatMember | null;
  onClose: () => void;
  onMessage?: (member: ChatMember) => void;
}) {
  const cardQuery = usePlayerCard(member?.id);
  const card = cardQuery.data;

  if (!member) return null;

  return (
    <Modal visible={!!member} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-center px-5" style={{ backgroundColor: "rgba(0,0,0,0.55)" }} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          <LinearGradient colors={gradients.card} className="rounded-[20px] p-4 border gap-3" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
            <View className="flex-row items-center gap-3">
              <Avatar
                id={member.id}
                name={member.name}
                color={member.color}
                photoUri={member.photoUri}
                avatarKey={card?.avatarKey ?? member.avatarKey}
                size={52}
              />
              <View className="flex-1 min-w-0">
                <View className="flex-row items-center gap-1.5">
                  <Text numberOfLines={1} className="font-body-bold text-[16px]" style={{ color: colors.text }}>
                    {member.name}
                  </Text>
                  {member.isHost && (
                    <Text className="text-[10px] font-body-extrabold uppercase" style={{ color: colors.accent }}>
                      Host
                    </Text>
                  )}
                </View>
                {card && (
                  <Text className="text-[11.5px] mt-0.5" style={{ color: colors.textTertiary }}>
                    {card.homeSuburb ? `${card.homeSuburb} · ` : ""}Member since {new Date(card.memberSince).toLocaleDateString([], { month: "short", year: "numeric" })}
                  </Text>
                )}
              </View>
            </View>

            <View className="border-t pt-1" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
              {card ? (
                <>
                  {card.reliabilityScore != null && (
                    <StatLine
                      label="Reliability"
                      value={`${card.reliabilityScore}% · ${card.reliabilityBand}`}
                      valueColor={card.reliabilityScore >= 90 ? colors.intermediate : card.reliabilityScore >= 75 ? colors.accent : colors.textDim}
                    />
                  )}
                  <StatLine label="Games played" value={String(card.gamesPlayed)} />
                  {card.gamesTogether != null && <StatLine label="Played with you" value={`${card.gamesTogether} times`} />}
                </>
              ) : (
                <Text className="text-[12px] py-2" style={{ color: colors.textMuted }}>
                  {cardQuery.isLoading ? "Loading…" : "Profile unavailable"}
                </Text>
              )}
            </View>

            <View className="flex-row gap-2 mt-1">
              <Pressable
                onPress={() => {
                  onClose();
                  router.push(`/player/${member.id}`);
                }}
                className="flex-1 h-[38px] rounded-pill items-center justify-center"
                style={{ backgroundColor: colors.accent }}
              >
                <Text className="font-body-bold text-[12.5px]" style={{ color: colors.base }}>
                  Full profile
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  onClose();
                  onMessage?.(member);
                }}
                className="flex-1 h-[38px] rounded-pill items-center justify-center"
                style={{ backgroundColor: colors.surfaceAlt }}
              >
                <Text className="font-body-bold text-[12.5px]" style={{ color: colors.textDim }}>
                  Mention
                </Text>
              </Pressable>
            </View>
          </LinearGradient>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
