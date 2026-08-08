import { ReactNode } from "react";
import { View, ViewStyle, Platform } from "react-native";
import { SafeAreaView, Edge } from "react-native-safe-area-context";
import { colors } from "../lib/theme";

// Web only: the design is a 402px phone frame. Native ignores this — a phone
// screen is already phone-width — but a wide desktop browser would otherwise
// stretch every screen edge-to-edge instead of reading as an app.
const webShellStyle =
  Platform.OS === "web"
    ? ({ maxWidth: 430, width: "100%", marginHorizontal: "auto", height: "100%" } as ViewStyle)
    : undefined;

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
  const content = (
    <SafeAreaView edges={edges} className={`flex-1 bg-base ${className ?? ""}`} style={style}>
      <View className="flex-1">{children}</View>
    </SafeAreaView>
  );

  if (Platform.OS !== "web") return content;

  return (
    <View style={{ flex: 1, backgroundColor: colors.base, alignItems: "center" }}>
      <View style={webShellStyle}>{content}</View>
    </View>
  );
}
