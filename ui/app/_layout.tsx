import "../global.css";
import { useCallback, useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts as useBricolageFonts,
  BricolageGrotesque_500Medium,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from "@expo-google-fonts/bricolage-grotesque";
import {
  useFonts as useManropeFonts,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [bricolageLoaded] = useBricolageFonts({
    BricolageGrotesque_500Medium,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
  });
  const [manropeLoaded] = useManropeFonts({
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  const fontsLoaded = bricolageLoaded && manropeLoaded;

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  const onLayoutRootView = useCallback(() => {}, []);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0A0A0B" } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="game/[id]" options={{ presentation: "card" }} />
          <Stack.Screen name="chat/[id]" options={{ presentation: "card" }} />
          <Stack.Screen name="post-game/[id]" options={{ presentation: "card" }} />
          <Stack.Screen name="wizard" options={{ presentation: "modal" }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
