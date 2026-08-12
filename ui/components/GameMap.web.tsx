import { forwardRef } from "react";
import { View, Text } from "react-native";
import { colors } from "../lib/theme";
import type { GameMapProps, GameMapHandle } from "./GameMap";

// react-native-maps has no web-safe build (native codegen components crash react-native-web).
// Map view is native-only for now; web preview gets a plain notice instead of a crash.
export const GameMap = forwardRef<GameMapHandle, GameMapProps>(function GameMap(_props, _ref) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="font-body-bold text-[14.5px] text-center" style={{ color: colors.textSecondary }}>
        Map view is available in the mobile app.
      </Text>
    </View>
  );
});
