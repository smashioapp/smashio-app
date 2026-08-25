import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Modal } from "react-native";
import { colors, gradients } from "../lib/theme";
import { LinearGradient } from "expo-linear-gradient";
import { useVenueDetail } from "../lib/queries/venues";

function TrayItem({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 items-center justify-center gap-1.5 rounded-2xl border py-4"
      style={{ backgroundColor: colors.surfaceAlt, borderColor: colors.cardBorder }}
    >
      <Ionicons name={icon} size={20} color={colors.accent} />
      <Text className="text-[10.5px] font-body-semibold text-center" style={{ color: colors.textDim }}>
        {label}
      </Text>
    </Pressable>
  );
}

function venueInfoText(venue: ReturnType<typeof useVenueDetail>["data"]): string {
  if (!venue) return "";
  const parking = venue.amenities.find((a) => a.slug === "parking");
  const lines = [venue.name, [venue.address, venue.suburb].filter(Boolean).join(", ")];
  if (parking) lines.push(`Parking: ${parking.availability === "yes" ? "Available" : parking.availability}${parking.note ? ` (${parking.note})` : ""}`);
  if (venue.profile?.access_notes) lines.push(venue.profile.access_notes);
  return lines.filter(Boolean).join("\n");
}

// Four app-specific attachments, deliberately — no files, no contacts, no location pin
// (SMASHIO Chat Redesign mock, §3). Camera/photo post an image; share-game and venue-info
// post a templated text/game_share message into the current (only) thread they can target.
export function ChatAttachTray({
  visible,
  onClose,
  venueId,
  onPickPhoto,
  onPickCamera,
  onShareGame,
  onShareVenueInfo,
}: {
  visible: boolean;
  onClose: () => void;
  venueId: string | undefined;
  onPickPhoto: () => void;
  onPickCamera: () => void;
  onShareGame: () => void;
  onShareVenueInfo: (text: string) => void;
}) {
  const venueQuery = useVenueDetail(visible ? venueId : undefined);

  const run = (fn: () => void) => {
    onClose();
    fn();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end" style={{ backgroundColor: "rgba(0,0,0,0.6)" }} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          <LinearGradient
            colors={gradients.card}
            className="rounded-t-[24px] p-5 pb-9 border-t border-x gap-3"
            style={{ borderColor: colors.cardBorder }}
          >
            <View className="w-9 h-1 rounded-pill self-center mb-1" style={{ backgroundColor: "rgba(255,255,255,0.2)" }} />
            <View className="flex-row gap-2.5">
              <TrayItem icon="image-outline" label="Photo" onPress={() => run(onPickPhoto)} />
              <TrayItem icon="camera-outline" label="Camera" onPress={() => run(onPickCamera)} />
              <TrayItem icon="people-outline" label="Share game" onPress={() => run(onShareGame)} />
              <TrayItem
                icon="location-outline"
                label="Venue info"
                onPress={() => run(() => onShareVenueInfo(venueInfoText(venueQuery.data)))}
              />
            </View>
          </LinearGradient>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
