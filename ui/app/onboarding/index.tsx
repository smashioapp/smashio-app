import { useCallback, useEffect, useState } from "react";
import { AccessibilityInfo, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { colors } from "../../lib/theme";
import { haptics } from "../../lib/haptics";
import { Button } from "../../components/Button";
import { Screen } from "../../components/Screen";
import { CourtBackdrop } from "../../components/CourtBackdrop";

// Reminder: nativewind className only works on components registered with cssInterop
// (RN core + LinearGradient). Animated.* elements take style objects only.

// Elastic bounce-in for the mark, in the spirit of (Not Boring) Habits' juicy logo pop:
// no fly-in prop, the logo just lands with an overshoot-settle spring and a soft impact pulse.
const BOUNCE_MS = 620; // rough budget for the spring chain, used to time what follows

export default function Splash() {
  const goNext = () => router.push("/onboarding/login");
  const { height: h } = useWindowDimensions();

  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduceMotion(v))
      .catch(() => alive && setReduceMotion(false));
    return () => {
      alive = false;
    };
  }, []);

  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.4);
  const logoRotate = useSharedValue(-10);
  const ring = useSharedValue(0); // impact ring pulse
  const markIn = useSharedValue(0); // wordmark
  const underline = useSharedValue(0);
  const copyIn = useSharedValue(0);
  const ctaIn = useSharedValue(0);

  const settle = useCallback(() => {
    haptics.tap();
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return;

    if (reduceMotion) {
      logoOpacity.value = 1;
      logoScale.value = 1;
      logoRotate.value = 0;
      markIn.value = 1;
      underline.value = 1;
      copyIn.value = 1;
      ctaIn.value = 1;
      return;
    }

    logoOpacity.value = withTiming(1, { duration: 180 });
    logoRotate.value = withSpring(0, { damping: 8, stiffness: 200, mass: 0.8 });
    logoScale.value = withSequence(
      withSpring(1.18, { damping: 5, stiffness: 260, mass: 0.9 }, (done) => {
        if (done) runOnJS(settle)();
      }),
      withSpring(0.94, { damping: 7, stiffness: 280, mass: 0.8 }),
      withSpring(1, { damping: 10, stiffness: 260, mass: 0.8 }),
    );

    ring.value = withDelay(160, withTiming(1, { duration: 680, easing: Easing.out(Easing.cubic) }));

    markIn.value = withDelay(BOUNCE_MS, withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) }));
    underline.value = withDelay(BOUNCE_MS + 150, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
    copyIn.value = withDelay(BOUNCE_MS + 230, withTiming(1, { duration: 500, easing: Easing.out(Easing.quad) }));
    ctaIn.value = withDelay(BOUNCE_MS + 370, withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) }));
  }, [reduceMotion, settle]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ring.value === 0 ? 0 : (1 - ring.value) * 0.7,
    transform: [{ scale: 0.25 + ring.value * 2.3 }],
  }));

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }, { rotate: `${logoRotate.value}deg` }],
  }));
  const markStyle = useAnimatedStyle(() => ({
    opacity: markIn.value,
    transform: [{ translateY: (1 - markIn.value) * 14 }],
  }));
  const underlineStyle = useAnimatedStyle(() => ({
    opacity: underline.value,
    width: 8 + underline.value * 56,
  }));
  const copyStyle = useAnimatedStyle(() => ({
    opacity: copyIn.value,
    transform: [{ translateY: (1 - copyIn.value) * 16 }],
  }));
  const ctaStyle = useAnimatedStyle(() => ({
    opacity: ctaIn.value,
    transform: [{ translateY: (1 - ctaIn.value) * 22 }],
  }));

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={{ flex: 1, backgroundColor: colors.base }}>
        <LinearGradient
          colors={["#0C0E07", colors.base, "#050506"]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />

        <CourtBackdrop reduceMotion={!!reduceMotion} />

        {/* Seats the CTA block over the court lines without hiding them. */}
        <LinearGradient
          colors={["rgba(10,10,11,0)", "rgba(10,10,11,0.82)", colors.base]}
          locations={[0, 0.55, 1]}
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: h * 0.42 }}
          pointerEvents="none"
        />

        <View style={{ flex: 1, paddingHorizontal: 32, paddingTop: 48, paddingBottom: 28, alignItems: "center" }}>
          <View style={{ height: 8 }} />

          <View style={{ alignItems: "center", justifyContent: "center" }}>
            {/* Impact ring, centred on the mark, pulses out as the logo lands. */}
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: "absolute",
                  width: 96,
                  height: 96,
                  borderRadius: 48,
                  borderWidth: 1.5,
                  borderColor: colors.accent,
                },
                ringStyle,
              ]}
            />
            <Animated.View style={logoStyle}>
              <Image
                source={require("../../assets/smashio-logo.png")}
                style={{ width: 84, height: 84 }}
                resizeMode="contain"
              />
            </Animated.View>
          </View>

          <Animated.View style={[{ alignItems: "center", marginTop: 22 }, markStyle]}>
            <Text
              className="font-display text-[46px] text-center"
              numberOfLines={1}
              style={{ color: colors.text, letterSpacing: -1 }}
            >
              SMASH<Text style={{ color: colors.accent }}>IO</Text>
            </Text>
          </Animated.View>

          <Animated.View
            style={[{ height: 3, borderRadius: 2, backgroundColor: colors.accent, marginTop: 12 }, underlineStyle]}
          />

          <Animated.View style={[{ alignItems: "center", marginTop: 22, gap: 18 }, copyStyle]}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 100,
                borderWidth: 1,
                borderColor: "rgba(214,255,63,0.22)",
                backgroundColor: "rgba(214,255,63,0.05)",
              }}
            >
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent }} />
              <Text
                className="font-body-extrabold text-[12px] uppercase"
                style={{ color: colors.accent2, letterSpacing: 2.4 }}
              >
                Badminton · Australia
              </Text>
            </View>

            <Text
              className="text-center font-body-semibold text-[16.5px]"
              style={{ color: colors.textDim, lineHeight: 24, maxWidth: 300 }}
            >
              Find your court. Match your level.{"\n"}Never scramble for a fourth again.
            </Text>
          </Animated.View>

          <View style={{ flex: 1 }} />

          <Animated.View style={[{ width: "100%", gap: 16 }, ctaStyle]}>
            <Button label="Get Started" onPress={goNext} />
            <Pressable onPress={goNext} hitSlop={10}>
              <Text className="text-center font-body-bold text-[14.5px]" style={{ color: colors.textTertiary }}>
                I already have an account
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </Screen>
  );
}
