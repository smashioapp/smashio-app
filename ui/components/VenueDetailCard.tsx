import { View, Text, Pressable, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { colors } from "../lib/theme";
import { haptics } from "../lib/haptics";
import { openDirections } from "../lib/directions";
import { formatDistance, haversineMeters } from "../lib/format";
import { useDistanceUnits } from "../lib/queries/settings";
import { useVenueDetail, useVenuePhotoUrls } from "../lib/queries/venues";
import { useUserLocation } from "../lib/location";
import type { Game } from "../lib/mockData";

// Game detail redesign artboard 04 — "the one question every player asks". Degrades to name +
// one honest line when there's no venue row to join against, never an empty map tile or invented
// amenities. No transit/drive-time ETA here (no directions API in this codebase) — distance only.
export function VenueDetailCard({ game }: { game: Pick<Game, "venue" | "venueId" | "venueLat" | "venueLng" | "venueAddress"> }) {
  const units = useDistanceUnits();
  const location = useUserLocation();
  const venueQuery = useVenueDetail(game.venueId);
  const venue = venueQuery.data;
  const photoUrls = useVenuePhotoUrls(venue?.photos.slice(0, 1).map((p) => p.storage_path) ?? []);
  const photoUrl = photoUrls.data?.[0];

  const distanceM =
    game.venueLat != null && game.venueLng != null ? haversineMeters(location.lat, location.lng, game.venueLat, game.venueLng) : null;

  const topAmenities = (venue?.amenities ?? []).filter((a) => a.availability === "yes").slice(0, 3);

  if (!game.venueId) {
    return (
      <View className="rounded-2xl p-4 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
        <Text className="font-body-bold text-[14.5px]" style={{ color: colors.text }}>
          {game.venue}
        </Text>
        <Text className="text-[12.5px] mt-1" style={{ color: colors.textSecondary }}>
          Exact address shared once you're approved.
        </Text>
      </View>
    );
  }

  return (
    <View className="rounded-2xl border overflow-hidden" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
      <View className="h-[100px]" style={{ backgroundColor: colors.surfaceAlt }}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Ionicons name="pin-outline" size={20} color={colors.textMuted} />
          </View>
        )}
      </View>
      <View className="p-4">
        <Text className="font-body-bold text-[14.5px]" style={{ color: colors.text }}>
          {game.venue}
        </Text>
        {distanceM != null && (
          <Text className="text-[12px] mt-0.5" style={{ color: colors.textSecondary }}>
            {formatDistance(distanceM, units)} away
          </Text>
        )}
        {topAmenities.length > 0 && (
          <View className="flex-row flex-wrap gap-1.5 mt-2.5">
            {topAmenities.map((a) => (
              <View key={a.slug} className="rounded-pill px-2.5 py-1 border" style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder }}>
                <Text className="font-body-bold text-[10.5px]" style={{ color: colors.textDim }}>
                  {a.label}
                </Text>
              </View>
            ))}
          </View>
        )}
        <View className="flex-row gap-2.5 mt-3.5">
          <Pressable
            className="flex-1 flex-row items-center justify-center gap-1.5 rounded-pill py-2.5 border"
            style={{ borderColor: colors.cardBorder, backgroundColor: colors.surfaceAlt }}
            onPress={() => {
              haptics.tap();
              openDirections(game);
            }}
          >
            <Ionicons name="navigate-outline" size={13} color={colors.text} />
            <Text className="font-body-bold text-[12.5px]" style={{ color: colors.text }}>
              Directions
            </Text>
          </Pressable>
          <Pressable
            className="flex-1 items-center justify-center rounded-pill py-2.5 border"
            style={{ borderColor: colors.cardBorder }}
            onPress={() => {
              haptics.tap();
              router.push(`/venue/${game.venueId}`);
            }}
          >
            <Text className="font-body-bold text-[12.5px]" style={{ color: colors.textDim }}>
              Venue page
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
