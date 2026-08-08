import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

// expo-haptics has no web implementation — guard so web preview doesn't throw.
const supported = Platform.OS === "ios" || Platform.OS === "android";

export const haptics = {
  tap: () => supported && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  success: () => supported && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  error: () => supported && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
};
