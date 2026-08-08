import { View, Text } from "react-native";
import { colors } from "../lib/theme";
import type { GameMapProps } from "./GameMap";

// react-native-maps has no web-safe build (native codegen components crash react-native-web).
// Map view is native-only for now; web preview gets a plain notice instead of a crash.
export function GameMap(_props: GameMapProps) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="font-body-bold text-[13px] text-center" style={{ color: colors.textSecondary }}>
        Map view is available in the mobile app.
      </Text>
    </View>
  );
}
