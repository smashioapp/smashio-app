import { ReactNode } from "react";
import { Pressable, Text, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { colors, gradients } from "../lib/theme";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg" | "sm";

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "lg",
  disabled = false,
  loading = false,
  icon,
  fullWidth = true,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
}) {
  const pad = size === "lg" ? "py-4" : size === "md" ? "py-3.5" : "py-2.5";
  const textSize = size === "sm" ? "text-[14.5px]" : size === "md" ? "text-[15.5px]" : "text-[16.5px]";
  const isDisabled = disabled || loading;

  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const onPressIn = () => {
    if (!isDisabled) scale.value = withSpring(0.96, { damping: 18, stiffness: 320 });
  };
  const onPressOut = () => {
    scale.value = withSpring(1, { damping: 18, stiffness: 320 });
  };

  const content = (
    <>
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? colors.base : colors.text} />
      ) : (
        <>
          {icon}
          <Text
            className={`font-body-extrabold ${textSize}`}
            style={{ color: variant === "primary" ? colors.base : variant === "secondary" ? colors.accent : colors.textSecondary }}
          >
            {label}
          </Text>
        </>
      )}
    </>
  );

  if (variant === "primary") {
    return (
      <Animated.View style={[animatedStyle, fullWidth ? { width: "100%" } : undefined]}>
        <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} disabled={isDisabled} className={fullWidth ? "w-full" : ""}>
          <LinearGradient
            colors={isDisabled ? [colors.surfaceAlt, colors.surfaceAlt] : gradients.accent}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className={`rounded-pill ${pad} px-6 flex-row items-center justify-center gap-2`}
          >
            {isDisabled && !loading ? (
              <Text className={`font-body-extrabold ${textSize}`} style={{ color: colors.textMuted }}>
                {label}
              </Text>
            ) : (
              content
            )}
          </LinearGradient>
        </Pressable>
      </Animated.View>
    );
  }

  if (variant === "secondary") {
    return (
      <Animated.View style={[animatedStyle, fullWidth ? { width: "100%" } : undefined]}>
        <Pressable
          onPress={onPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={isDisabled}
          className={`rounded-pill ${pad} px-6 flex-row items-center justify-center gap-2 border-[1.5px] ${fullWidth ? "w-full" : ""}`}
          style={{ borderColor: colors.accent, opacity: isDisabled ? 0.5 : 1 }}
        >
          {content}
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[animatedStyle, fullWidth ? { width: "100%" } : undefined]}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={isDisabled}
        className={`rounded-pill ${pad} px-6 flex-row items-center justify-center gap-2 ${fullWidth ? "w-full" : ""}`}
        style={{ opacity: isDisabled ? 0.5 : 1 }}
      >
        {content}
      </Pressable>
    </Animated.View>
  );
}
