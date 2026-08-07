import { View, Text, Pressable, ScrollView } from "react-native";
import { router } from "expo-router";
import { useAppStore } from "../../lib/store";
import { colors, TIERS } from "../../lib/theme";
import { Button } from "../../components/Button";
import { Screen } from "../../components/Screen";

export default function ProfileSkill() {
  const { skill, setSkill, finishOnboarding } = useAppStore();

  const finish = () => {
    finishOnboarding();
    router.replace("/(tabs)/discover");
  };

  return (
    <Screen>
      <ScrollView className="flex-1 px-6 pt-10" contentContainerStyle={{ paddingBottom: 24, gap: 14 }}>
        <Text className="font-display text-[24px]" style={{ color: colors.text }}>
          Your game
        </Text>
        <Text className="text-[13px] -mt-2" style={{ color: colors.textSecondary }}>
          Step 2 of 2
        </Text>

        <Text className="font-body-extrabold text-[11px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
          Sport
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <View className="rounded-pill px-4 py-2.5" style={{ backgroundColor: colors.accent }}>
            <Text className="font-body-extrabold text-[13px]" style={{ color: colors.base }}>
              Badminton
            </Text>
          </View>
          {["Pickleball · soon", "Tennis · soon"].map((label) => (
            <View
              key={label}
              className="rounded-pill px-4 py-2.5 border"
              style={{ backgroundColor: "#17171A", borderColor: "rgba(255,255,255,0.06)" }}
            >
              <Text className="font-body-bold text-[13px]" style={{ color: colors.textMuted }}>
                {label}
              </Text>
            </View>
          ))}
        </View>

        <Text className="font-body-extrabold text-[11px] uppercase tracking-wide mt-1.5" style={{ color: colors.textTertiary }}>
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
                <Text className="font-body-extrabold text-[14px]" style={{ color: colors.text }}>
                  {t.id}
                </Text>
                <Text className="text-[11px] mt-0.5" style={{ color: colors.textSecondary }}>
                  {t.desc}
                </Text>
              </View>
            </Pressable>
          );
        })}

        <View className="mt-2">
          <Button label="Finish setup" onPress={finish} />
        </View>
      </ScrollView>
    </Screen>
  );
}
