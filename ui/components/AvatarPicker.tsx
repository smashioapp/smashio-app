import { useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { colors } from "../lib/theme";
import { SPRING } from "../lib/motion";
import { haptics } from "../lib/haptics";
import { Sheet } from "./Sheet";
import { ANIMALS, animalForId, type AnimalKey } from "../lib/avatars";

const COLUMNS = 4;
const CELL = 62;

function AnimalCell({
  animal,
  active,
  onPress,
}: {
  animal: (typeof ANIMALS)[number];
  active: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={animal.label}
        onPressIn={() => {
          scale.value = withSpring(0.9, SPRING.press);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, SPRING.press);
        }}
        onPress={() => {
          haptics.tick();
          onPress();
        }}
        style={{
          width: CELL,
          height: CELL,
          borderRadius: CELL / 2,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: active ? 2.5 : 0,
          borderColor: colors.accent,
        }}
      >
        <Image source={animal.src} style={{ width: CELL - (active ? 10 : 4), height: CELL - (active ? 10 : 4), borderRadius: (CELL - (active ? 10 : 4)) / 2 }} />
      </Pressable>
    </Animated.View>
  );
}

// Bottom sheet Smashimal picker (avatars-plan.md P2). 28 animals, 4 columns — one row taller
// than fits without scrolling (§6.3's tradeoff), so the grid scrolls inside a capped height.
export function AvatarPicker({
  visible,
  onClose,
  id,
  selectedKey,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  id: string;
  selectedKey: string | null | undefined;
  onSelect: (key: AnimalKey) => void;
}) {
  const [pending, setPending] = useState<AnimalKey | null>(null);
  const effectiveKey = pending ?? selectedKey ?? animalForId(id).key;

  const shuffle = () => {
    haptics.tick();
    const others = ANIMALS.filter((a) => a.key !== effectiveKey);
    const pick = others[Math.floor(Math.random() * others.length)] ?? ANIMALS[0];
    setPending(pick.key);
    onSelect(pick.key);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Pick a Smashimal">
      <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
        <View className="flex-row flex-wrap justify-between" style={{ rowGap: 10 }}>
          {ANIMALS.map((animal) => (
            <AnimalCell
              key={animal.key}
              animal={animal}
              active={animal.key === effectiveKey}
              onPress={() => {
                setPending(animal.key);
                onSelect(animal.key);
              }}
            />
          ))}
        </View>
      </ScrollView>
      <Pressable
        onPress={shuffle}
        className="flex-row items-center justify-center gap-2 rounded-pill py-3 mt-2"
        style={{ backgroundColor: colors.surfaceAlt }}
      >
        <Ionicons name="shuffle" size={16} color={colors.accent} />
        <Text className="font-body-extrabold text-[13.5px]" style={{ color: colors.accent }}>
          Shuffle
        </Text>
      </Pressable>
    </Sheet>
  );
}
