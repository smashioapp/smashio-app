import "../global.css";
import "../lib/silenceExpoGoWarnings";
import "../lib/sentry";
import "../lib/analytics";
import { useCallback, useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import { cssInterop } from "nativewind";
import { LinearGradient } from "expo-linear-gradient";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "../lib/queryClient";
import { SessionProvider } from "../lib/session";
import * as Linking from "expo-linking";
import { sound } from "../lib/sound";
import { loadSoundEnabled } from "../lib/soundPrefs";
import { haptics } from "../lib/haptics";
import { loadHapticsEnabled } from "../lib/hapticsPrefs";
import { trackAppOpenFirst } from "../lib/analytics";
import { usePushRegistration, useTrackActiveRoute } from "../lib/notifications";
import { useAppIconBadgeSync, useNotificationRealtimeSync } from "../lib/queries/notifications";
import { AnimatedSplash } from "../components/AnimatedSplash";
import { ErrorBoundary } from "../components/ErrorBoundary";
import {
  useFonts as useSpaceGroteskFonts,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import {
  useFonts as useManropeFonts,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";

// expo-linear-gradient isn't a core RN component, so nativewind doesn't
// interop its className by default — web silently drops all styling
// (padding, radius, flex layout) on every gradient chip/button/pill.
cssInterop(LinearGradient, { className: "style" });

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  // v2 display face (docs/v2-design-plan.md §3.2) — Space Grotesk replaces Bricolage Grotesque
  // for headlines and every number that carries weight (price, countdown, reliability, spots).
  const [spaceGroteskLoaded] = useSpaceGroteskFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });
  const [manropeLoaded] = useManropeFonts({
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  const fontsLoaded = spaceGroteskLoaded && manropeLoaded;
  const [showSplash, setShowSplash] = useState(true);

  // Note: hiding the native splash is AnimatedSplash's job now, off its own onLayout — see the
  // comment there. Doing it here on fontsLoaded made the two splashes serial instead of
  // overlapping, which is what pushed a cold start past 2s.

  useEffect(() => {
    loadSoundEnabled().then((enabled) => sound.setMuted(!enabled));
    loadHapticsEnabled().then((enabled) => haptics.setMuted(!enabled));
  }, []);

  useEffect(() => {
    Linking.getInitialURL().then(trackAppOpenFirst).catch(() => {});
  }, []);

  const onLayoutRootView = useCallback(() => {}, []);

  // The providers mount before the fonts land, so auth and the profile fetch start during the
  // splash instead of after it, and so AnimatedSplash can read useAppReady() at all. Only the
  // Stack waits on fonts — rendering screens in a fallback face would flash on swap.
  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <PushRegistration />
            <SafeAreaProvider>
              <StatusBar style="light" />
              {fontsLoaded && (
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0A0A0B" } }}>
                  <Stack.Screen name="index" />
                  <Stack.Screen name="onboarding" />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="game/[id]" options={{ presentation: "card" }} />
                  <Stack.Screen name="venue/[id]" options={{ presentation: "card" }} />
                  <Stack.Screen name="venues/index" options={{ presentation: "card" }} />
                  <Stack.Screen name="game/edit/[id]" options={{ presentation: "modal" }} />
                  <Stack.Screen name="my-games/past" options={{ presentation: "card" }} />
                  <Stack.Screen name="chat/[id]" options={{ presentation: "card" }} />
                  <Stack.Screen name="post-game/[id]" options={{ presentation: "card" }} />
                  <Stack.Screen name="notifications" options={{ presentation: "card" }} />
                  <Stack.Screen name="wizard" options={{ presentation: "modal" }} />
                  <Stack.Screen name="compose" options={{ presentation: "modal" }} />
                </Stack>
              )}
              {showSplash && <AnimatedSplash onFinish={() => setShowSplash(false)} />}
            </SafeAreaProvider>
          </SessionProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

function PushRegistration() {
  usePushRegistration();
  useTrackActiveRoute();
  useNotificationRealtimeSync();
  useAppIconBadgeSync();
  return null;
}
