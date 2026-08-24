import { View, Text, Image } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { colors, initial } from "../lib/theme";
import { animalFor, GHOST_KEY } from "../lib/avatars";

export function Avatar({
  id,
  name,
  color,
  size = 28,
  overlap = false,
  photoUri,
  avatarKey,
}: {
  id?: string;
  name: string;
  color: string;
  size?: number;
  overlap?: boolean;
  photoUri?: string | null;
  avatarKey?: string | null;
}) {
  // Ladder: photo -> chosen/id-hash animal -> letter. The letter only survives as a guard for
  // callers that don't pass `id` yet.
  const animal = id ? animalFor(avatarKey, id) : null;
  const isGhost = avatarKey === GHOST_KEY;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: animal ? colors.surfaceAlt : color,
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
      ) : animal && !isGhost ? (
        <Image source={animal.src} style={{ width: size, height: size }} />
      ) : animal && isGhost ? (
        <Text style={{ color: colors.textMuted, fontSize: size * 0.5, fontWeight: "600" }}>?</Text>
      ) : (
        <Text style={{ color: colors.base, fontSize: size * 0.38, fontWeight: "800" }}>{initial(name)}</Text>
      )}
    </View>
  );
}

type AvatarStackPerson = {
  id: string;
  name: string;
  color: string;
  photoUri?: string | null;
  avatarKey?: string | null;
};

export function AvatarStack({ people, max = 3 }: { people: AvatarStackPerson[]; max?: number }) {
  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;
  return (
    <View className="flex-row items-center">
      {shown.map((p, i) => (
        <Animated.View key={p.id} entering={FadeIn.delay(i * 70).duration(220)}>
          <Avatar
            id={p.id}
            name={p.name}
            color={p.color}
            photoUri={p.photoUri}
            avatarKey={p.avatarKey}
            size={26}
            overlap={i > 0}
          />
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
