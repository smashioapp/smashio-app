import { useEffect } from "react";
import { View, Text } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { colors } from "../lib/theme";
import { Button } from "./Button";
import { Glow } from "./Glow";

// Smashimals cast (docs/smashimals-plan.md §3.2/B1) — replaces the one shared splash-icon logo
// every empty state used to show. `require()` calls must be static literals for Metro.
export type EmptyStateCharacter = "kookaburra-shade" | "kookaburra-asleep" | "wombat-racquet" | "quokka-shelf" | "quokka-map" | "galah-net";

const CHARACTER_SRC: Record<EmptyStateCharacter, number> = {
  "kookaburra-shade": require("../assets/smashimals/kookaburra/shade.png"),
  "kookaburra-asleep": require("../assets/smashimals/kookaburra/asleep.png"),
  "wombat-racquet": require("../assets/smashimals/wombat/racquet.png"),
  "quokka-shelf": require("../assets/smashimals/quokka/shelf.png"),
  "quokka-map": require("../assets/smashimals/quokka/map.png"),
  "galah-net": require("../assets/smashimals/galah/net.png"),
};

// Natural pixel aspect ratios (ui/scripts/smashimals/process.mjs output) — locks proportions
// since these are full-body illustrations, not the square avatar busts.
const CHARACTER_ASPECT: Record<EmptyStateCharacter, number> = {
  "kookaburra-shade": 560 / 718,
  "kookaburra-asleep": 560 / 740,
  "wombat-racquet": 560 / 656,
  "quokka-shelf": 560 / 548,
  "quokka-map": 560 / 856,
  "galah-net": 560 / 773,
};

// Gentle idle float — never distracting, just enough to feel alive instead of static.
function FloatingCharacter({ character, height = 112 }: { character: EmptyStateCharacter; height?: number }) {
  const translateY = useSharedValue(0);
  const rotate = useSharedValue(-4);

  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
    rotate.value = withRepeat(
      withSequence(
        withTiming(4, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(-4, { duration: 1800, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { rotate: `${rotate.value}deg` }],
  }));

  const width = height * CHARACTER_ASPECT[character];
  // The bloom is far wider than the character, so the box is sized to the bloom and the overflow
  // is pulled back with a negative margin — Android clips absolutely-positioned children that
  // spill outside their parent, which would put the hard edge straight back.
  const bloom = height * 2.2;
  const bleedY = (bloom - height) / 2;
  const bleedX = (bloom - width) / 2;

  return (
    <View style={{ width: bloom, height: bloom, marginVertical: -bleedY, marginHorizontal: -bleedX, alignItems: "center", justifyContent: "center" }}>
      <Glow size={bloom} intensity={0.26} />
      <Animated.Image source={CHARACTER_SRC[character]} resizeMode="contain" style={[{ width, height }, style]} />
    </View>
  );
}

export function EmptyState({
  character,
  title,
  subtitle,
  ctaLabel,
  onCta,
}: {
  character: EmptyStateCharacter;
  title: string;
  subtitle: string;
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <View className="items-center gap-3 pt-12 px-6">
      <FloatingCharacter character={character} />
      <Text className="font-display-bold text-[19px] text-center" style={{ color: colors.text }}>
        {title}
      </Text>
      <Text className="text-[14.5px] text-center max-w-[250px] leading-5" style={{ color: colors.textSecondary }}>
        {subtitle}
      </Text>
      <View className="mt-1">
        <Button label={ctaLabel} fullWidth={false} onPress={onCta} />
      </View>
    </View>
  );
}
