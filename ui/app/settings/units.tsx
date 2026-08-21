import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients } from "../../lib/theme";
import { Screen } from "../../components/Screen";
import { BackButton } from "../../components/BackButton";
import { useSession } from "../../lib/session";
import { useProfile, useUpdateProfile } from "../../lib/queries/profile";

const OPTIONS: { value: "km" | "mi"; label: string }[] = [
  { value: "km", label: "Kilometres" },
  { value: "mi", label: "Miles" },
];

export default function UnitsSettings() {
  const { session } = useSession();
  const { data: profile } = useProfile(session?.user.id);
  const update = useUpdateProfile();

  const current = profile?.distance_units === "mi" ? "mi" : "km";

  return (
    <Screen>
      <View className="flex-row items-center gap-3 px-5 pt-2 pb-1">
        <BackButton onPress={() => router.back()} />
        <Text className="font-display text-[20px]" style={{ color: colors.text }}>
          Distance units
        </Text>
      </View>
      <View className="px-5 pt-6 gap-3">
        {OPTIONS.map((o) => {
          const active = current === o.value;
          return (
            <Pressable key={o.value} onPress={() => update.mutate({ distance_units: o.value })}>
              <LinearGradient
                colors={active ? gradients.accentDiagonal : gradients.card}
                className="rounded-2xl p-4 border flex-row items-center justify-between"
                style={{ borderColor: active ? colors.accent : colors.cardBorder }}
              >
                <Text className="font-body-bold text-[15px]" style={{ color: active ? colors.base : colors.text }}>
                  {o.label}
                </Text>
                {active && <Ionicons name="checkmark-circle" size={18} color={colors.base} />}
              </LinearGradient>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}
