import { Modal, Pressable, View, Image, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import * as Sharing from "expo-sharing";
import { colors } from "../lib/theme";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// Full-screen photo viewer — pinch to zoom, pan while zoomed, double-tap to reset.
export function ChatLightbox({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const reset = () => {
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedX.value = 0;
    savedY.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 5));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (savedScale.value <= 1) return;
      translateX.value = savedX.value + e.translationX;
      translateY.value = savedY.value + e.translationY;
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => reset());

  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }));

  if (!uri) return null;

  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1" style={{ backgroundColor: "rgba(0,0,0,0.96)" }}>
        <GestureDetector gesture={gesture}>
          <Animated.View className="flex-1 items-center justify-center" style={style}>
            <Image source={{ uri }} style={{ width: SCREEN_W, height: SCREEN_H * 0.85 }} resizeMode="contain" />
          </Animated.View>
        </GestureDetector>

        <View className="absolute flex-row justify-between px-5" style={{ top: insets.top + 8, left: 0, right: 0 }}>
          <Pressable
            onPress={() => {
              reset();
              onClose();
            }}
            className="w-9 h-9 rounded-full items-center justify-center"
            style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
          >
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => Sharing.isAvailableAsync().then((ok) => { if (ok) Sharing.shareAsync(uri); })}
            className="w-9 h-9 rounded-full items-center justify-center"
            style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
          >
            <Ionicons name="share-outline" size={18} color={colors.text} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
