import { View, Text, Image, Pressable } from "react-native";
import { router } from "expo-router";
import { colors } from "../../lib/theme";
import { Button } from "../../components/Button";
import { Screen } from "../../components/Screen";

export default function Splash() {
  const goNext = () => router.push("/onboarding/login");

  return (
    <Screen edges={["top", "bottom"]}>
      <View className="flex-1 items-center justify-center px-8 py-16 gap-6" style={{ backgroundColor: colors.baseAlt }}>
        <View
          className="absolute rounded-full"
          style={{ top: -40, right: -40, width: 180, height: 180, backgroundColor: colors.accent, opacity: 0.12 }}
        />

        <Image
          source={require("../../assets/smashio-logo.png")}
          style={{ width: 96, height: 96 }}
          resizeMode="contain"
        />

        <Text className="font-body-extrabold text-[10.5px] tracking-[3px] uppercase" style={{ color: colors.accent2 }}>
          Badminton · Australia
        </Text>

        <Text
          className="font-display text-[58px] text-center"
          style={{ color: colors.text, lineHeight: 56, letterSpacing: -1 }}
        >
          SMASH{"\n"}
          <Text style={{ color: colors.accent }}>IO</Text>
        </Text>

        <Text
          className="text-center font-body-semibold text-[14.5px] px-4"
          style={{ color: "#9A9AA2", lineHeight: 22 }}
        >
          Find your court. Match your level. Never scramble for a fourth again.
        </Text>

        <View className="flex-1" />

        <View className="w-full gap-4">
          <Button label="Get Started" onPress={goNext} />
          <Pressable onPress={goNext}>
            <Text className="text-center font-body-bold text-[13px]" style={{ color: colors.textTertiary }}>
              I already have an account
            </Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
