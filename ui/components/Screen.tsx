import { ReactNode } from "react";
import { View, ViewStyle } from "react-native";
import { SafeAreaView, Edge } from "react-native-safe-area-context";

export function Screen({
  children,
  edges = ["top"],
  className,
  style,
}: {
  children: ReactNode;
  edges?: Edge[];
  className?: string;
  style?: ViewStyle;
}) {
  return (
    <SafeAreaView edges={edges} className={`flex-1 bg-base ${className ?? ""}`} style={style}>
      <View className="flex-1">{children}</View>
    </SafeAreaView>
  );
}
