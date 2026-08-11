import { LogBox } from "react-native";

// expo-notifications warns on import when running inside Expo Go (push notifications
// were removed from Expo Go in SDK 53+). We know about this — dev/prod builds use a
// real dev client where push works fine — so silence the LogBox toast it triggers on
// every screen, including the pre-auth splash.
LogBox.ignoreLogs(["`expo-notifications` functionality is not fully supported in Expo Go"]);
