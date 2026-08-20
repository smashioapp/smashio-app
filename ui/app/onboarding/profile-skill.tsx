import { useState } from "react";
import { View, Text, Pressable, ScrollView, Alert } from "react-native";
import { router } from "expo-router";
import { colors, TIERS, TierId } from "../../lib/theme";
import { Button } from "../../components/Button";
import { Screen } from "../../components/Screen";
import { StepProgress } from "../../components/StepProgress";
import { useSports, useSkillTiers } from "../../lib/queries/sports";
import { useUpsertProfileSport } from "../../lib/queries/profile";
import { consumePendingGame } from "../../lib/pendingGame";

export default function ProfileSkill() {
  const [skill, setSkill] = useState<TierId>("Intermediate");

  const { data: sports } = useSports();
  const { data: tiers } = useSkillTiers("badminton");
  const upsertProfileSport = useUpsertProfileSport();

  const badminton = sports?.find((s) => s.slug === "badminton");

  const finish = async () => {
    const tierRow = tiers?.find((t) => t.label === skill);
    if (!badminton || !tierRow) {
      Alert.alert("Still loading", "Give it a second and try again.");
      return;
    }
    try {
      await upsertProfileSport.mutateAsync({ sportId: badminton.id, skillTierId: tierRow.id });
      // Every login/signup passes through here (see login.tsx), so this — not index.tsx — is
      // where a shared game link deferred by an unauthenticated open (game/[id].tsx) resumes.
      const pendingGameId = await consumePendingGame();
      router.replace(pendingGameId ? `/game/${pendingGameId}` : "/(tabs)/discover");
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : "Try again.");
    }
  };

  return (
    <Screen>
      <StepProgress step={1} count={2} />
      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 24, gap: 14 }}>
        <Text className="font-display text-[24.5px]" style={{ color: colors.text }}>
          Your game
        </Text>

        <Text className="font-body-extrabold text-[13px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
          Sport
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <View className="rounded-pill px-4 py-2.5" style={{ backgroundColor: colors.accent }}>
            <Text className="font-body-extrabold text-[14.5px]" style={{ color: colors.base }}>
              Badminton
            </Text>
          </View>
          {["Pickleball · soon", "Tennis · soon"].map((label) => (
            <View
              key={label}
              className="rounded-pill px-4 py-2.5 border"
              style={{ backgroundColor: "#17171A", borderColor: "rgba(255,255,255,0.06)" }}
            >
              <Text className="font-body-bold text-[14.5px]" style={{ color: colors.textMuted }}>
                {label}
              </Text>
            </View>
          ))}
        </View>

        <Text className="font-body-extrabold text-[13px] uppercase tracking-wide mt-1.5" style={{ color: colors.textTertiary }}>
          Skill level
        </Text>
        {TIERS.map((t) => {
          const active = skill === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => setSkill(t.id)}
              className="flex-row items-center rounded-2xl px-3.5 py-3.5 border-[1.5px]"
              style={{ backgroundColor: active ? colors.surfaceAlt : colors.surface, borderColor: active ? t.color : "rgba(255,255,255,0.07)" }}
            >
              <View className="w-2.5 h-2.5 rounded-full mr-3" style={{ backgroundColor: t.color }} />
              <View className="flex-1">
                <Text className="font-body-extrabold text-[15.5px]" style={{ color: colors.text }}>
                  {t.id}
                </Text>
                <Text className="text-[13px] mt-0.5" style={{ color: colors.textSecondary }}>
                  {t.desc}
                </Text>
              </View>
            </Pressable>
          );
        })}

        <View className="mt-2">
          <Button label="Finish setup" loading={upsertProfileSport.isPending} onPress={finish} />
        </View>
      </ScrollView>
    </Screen>
  );
}
