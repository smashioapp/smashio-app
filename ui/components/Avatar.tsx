import { View, Text, Image } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { colors, initial } from "../lib/theme";

export function Avatar({
  name,
  color,
  size = 28,
  overlap = false,
  photoUri,
}: {
  name: string;
  color: string;
  size?: number;
  overlap?: boolean;
  photoUri?: string | null;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        marginLeft: overlap ? -8 : 0,
        borderWidth: 2,
        borderColor: colors.base,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={{ width: size, height: size }} />
      ) : (
        <Text style={{ color: colors.base, fontSize: size * 0.38, fontWeight: "800" }}>{initial(name)}</Text>
      )}
    </View>
  );
}

export function AvatarStack({ people, max = 3 }: { people: { name: string; color: string }[]; max?: number }) {
  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;
  return (
    <View className="flex-row items-center">
      {shown.map((p, i) => (
        <Animated.View key={`${p.name}-${i}`} entering={FadeIn.delay(i * 70).duration(220)}>
          <Avatar name={p.name} color={p.color} size={26} overlap={i > 0} />
        </Animated.View>
      ))}
      {overflow > 0 && (
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: colors.surfaceAlt,
            marginLeft: -8,
            borderWidth: 1.5,
            borderColor: colors.base,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: "800" }}>+{overflow}</Text>
        </View>
      )}
    </View>
  );
}
