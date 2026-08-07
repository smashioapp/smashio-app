import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { colors } from "../../lib/theme";
import { Button } from "../../components/Button";
import { Screen } from "../../components/Screen";

function SocialButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-pill py-3.5 items-center border"
      style={{ backgroundColor: colors.surfaceAlt, borderColor: "rgba(255,255,255,0.1)" }}
    >
      <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function Login() {
  return (
    <Screen>
      <View className="flex-1 px-6 pt-10 gap-4">
        <Text className="font-display text-[26px]" style={{ color: colors.text }}>
          Sign in to SMASHIO
        </Text>
        <Text className="text-[13px] -mt-2 mb-1" style={{ color: colors.textSecondary }}>
          Australia's badminton-only match-up app.
        </Text>

        <Text className="font-body-extrabold text-[11px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
          Mobile number
        </Text>
        <View
          className="rounded-2xl px-4 py-4 border"
          style={{ backgroundColor: colors.surfaceAlt, borderColor: "rgba(255,255,255,0.1)" }}
        >
          <Text className="font-body-semibold text-[15px]" style={{ color: colors.text }}>
            +61 4XX XXX XXX
          </Text>
        </View>

        <View className="mt-1">
          <Button label="Send code" onPress={() => router.push("/onboarding/profile-photo")} />
        </View>

        <View className="flex-row items-center gap-2.5 my-2">
          <View className="flex-1 h-px" style={{ backgroundColor: "rgba(255,255,255,0.1)" }} />
          <Text className="text-[11px] font-body-bold" style={{ color: colors.textMuted }}>
            OR
          </Text>
          <View className="flex-1 h-px" style={{ backgroundColor: "rgba(255,255,255,0.1)" }} />
        </View>

        <SocialButton label="Continue with Apple" onPress={() => router.push("/onboarding/profile-photo")} />
        <SocialButton label="Continue with Google" onPress={() => router.push("/onboarding/profile-photo")} />
      </View>
    </Screen>
  );
}
