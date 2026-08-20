import { LogBox } from "react-native";

// expo-notifications warns on import when running inside Expo Go (push notifications
// were removed from Expo Go in SDK 53+). We know about this — dev/prod builds use a
// real dev client where push works fine — so silence the LogBox toast it triggers on
// every screen, including the pre-auth splash.
LogBox.ignoreLogs(["`expo-notifications` functionality is not fully supported in Expo Go"]);

// Maestro flows tap blind at fixed coordinates on real devices; the yellow warnings banner
// (Reanimated reduced-motion, etc.) can pop up over anything and eat the tap. Same __DEV__ +
// E2E-email gate lib/session.tsx uses for auto-login, so this never fires in a real dev
// session — only under the e2e runner (docs/e2e-test-plan.md P-6).
if (__DEV__ && process.env.EXPO_PUBLIC_E2E_EMAIL) {
  LogBox.ignoreAllLogs();
}
