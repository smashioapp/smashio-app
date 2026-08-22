import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../lib/theme";
import { useReduceMotion } from "../../lib/motion";
import { haptics } from "../../lib/haptics";
import { Button } from "../../components/Button";
import { Screen } from "../../components/Screen";
import { CourtBackdrop } from "../../components/CourtBackdrop";
import { requestLocation, suburbForFix } from "../../lib/location";
import { useSetHomePoint, useUpdateProfile } from "../../lib/queries/profile";

function PulsePin({ reduceMotion }: { reduceMotion: boolean }) {
  const ring = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    ring.value = withDelay(
      200,
      withRepeat(withTiming(1, { duration: 2200, easing: Easing.out(Easing.cubic) }), -1, false),
    );
  }, [reduceMotion]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: (1 - ring.value) * 0.55,
    transform: [{ scale: 0.4 + ring.value * 2.2 }],
  }));

  return (
    <View className="items-center justify-center" style={{ height: 132 }}>
      <Animated.View
        pointerEvents="none"
        style={[
          { position: "absolute", width: 110, height: 110, borderRadius: 55, borderWidth: 1.5, borderColor: colors.accent },
          ringStyle,
        ]}
      />
      <View
        className="w-[72px] h-[72px] rounded-full items-center justify-center border"
        style={{ backgroundColor: "rgba(214,255,63,0.06)", borderColor: "rgba(214,255,63,0.28)" }}
      >
        <Ionicons name="location" size={32} color={colors.accent} />
      </View>
    </View>
  );
}

// A pre-prompt, not a gate. The OS dialog can only be asked once, so this screen spends the
// explanation first — and "Not now" is a real answer that still lands you in the app on the
// Sydney default (lib/location.ts).
export default function Nearby() {
  const reduceMotion = useReduceMotion();
  const [busy, setBusy] = useState(false);
  const updateProfile = useUpdateProfile();
  const setHomePoint = useSetHomePoint();

  const enter = () => router.replace("/");

  const enable = async () => {
    setBusy(true);
    const fix = await requestLocation();
    if (fix) {
      haptics.success();
      // Both writes are best-effort — a missing suburb is a cosmetic gap on the player card,
      // never a reason to strand someone on the last screen of onboarding.
      const suburb = await suburbForFix(fix.lat, fix.lng);
      await setHomePoint.mutateAsync({ lat: fix.lat, lng: fix.lng }).catch(() => {});
      if (suburb) await updateProfile.mutateAsync({ home_suburb: suburb }).catch(() => {});
    }
    setBusy(false);
    enter();
  };

  return (
    <Screen edges={["bottom"]}>
      <View style={{ flex: 1, backgroundColor: colors.base }}>
        <LinearGradient
          colors={["#0C0E07", colors.base, "#050506"]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
        <CourtBackdrop reduceMotion={!!reduceMotion} />

        <View className="flex-1 px-6 pt-16 pb-6 items-center">
          <PulsePin reduceMotion={!!reduceMotion} />

          <Text className="font-display text-[30px] text-center mt-6" style={{ color: colors.text }}>
            Games near you
          </Text>
          <Text
            className="text-center font-body-semibold text-[16px] mt-3"
            style={{ color: colors.textDim, lineHeight: 24, maxWidth: 320 }}
          >
            Turn on location and Smashio sorts every game by how far it is from you — and fills in
            your suburb so you never have to type it.
          </Text>

          <View className="gap-3 mt-6" style={{ maxWidth: 320 }}>
            {[
              "Only your suburb is ever shown to other players — never your exact location.",
              "You can hide it, or change it, any time in Settings.",
            ].map((line) => (
              <View key={line} className="flex-row gap-2.5">
                <Ionicons name="shield-checkmark-outline" size={16} color={colors.accent2} style={{ marginTop: 2 }} />
                <Text className="flex-1 text-[13.5px] font-body-semibold" style={{ color: colors.textSecondary }}>
                  {line}
                </Text>
              </View>
            ))}
          </View>

          <View style={{ flex: 1 }} />

          <View className="w-full gap-3">
            <Button label="Turn on location" loading={busy} onPress={enable} testID="nearby-enable" />
            <Pressable onPress={enter} hitSlop={10} disabled={busy} testID="nearby-skip" className="py-1">
              <Text className="text-center font-body-bold text-[14.5px]" style={{ color: colors.textTertiary }}>
                Not now
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Screen>
  );
}
