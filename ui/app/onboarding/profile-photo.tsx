import { View, Text, TextInput } from "react-native";
import { router } from "expo-router";
import { useAppStore } from "../../lib/store";
import { colors } from "../../lib/theme";
import { Button } from "../../components/Button";
import { Screen } from "../../components/Screen";

export default function ProfilePhoto() {
  const { name, suburb, setName, setSuburb } = useAppStore();

  return (
    <Screen>
      <View className="flex-1 px-6 pt-10 gap-3.5">
        <Text className="font-display text-[24px]" style={{ color: colors.text }}>
          Set up your profile
        </Text>
        <Text className="text-[13px] -mt-1.5 mb-1" style={{ color: colors.textSecondary }}>
          Step 1 of 2
        </Text>

        <View
          className="self-center w-24 h-24 rounded-full items-center justify-center mb-2"
          style={{ borderWidth: 2, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.2)" }}
        >
          <Text className="text-center text-[11px] font-body-bold" style={{ color: colors.textMuted }}>
            Add{"\n"}photo
          </Text>
        </View>

        <Text className="font-body-extrabold text-[11px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
          Full name
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Chloe Bennett"
          placeholderTextColor={colors.textMuted}
          className="rounded-2xl px-4 py-4 border font-body-semibold text-[15px]"
          style={{ backgroundColor: colors.surfaceAlt, borderColor: "rgba(255,255,255,0.1)", color: colors.text }}
        />

        <Text className="font-body-extrabold text-[11px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
          Suburb
        </Text>
        <TextInput
          value={suburb}
          onChangeText={setSuburb}
          placeholder="e.g. Albert Park VIC"
          placeholderTextColor={colors.textMuted}
          className="rounded-2xl px-4 py-4 border font-body-semibold text-[15px]"
          style={{ backgroundColor: colors.surfaceAlt, borderColor: "rgba(255,255,255,0.1)", color: colors.text }}
        />

        <View className="flex-1" />
        <View className="pb-6">
          <Button
            label="Next"
            disabled={!name.trim()}
            onPress={() => router.push("/onboarding/profile-skill")}
          />
        </View>
      </View>
    </Screen>
  );
}
