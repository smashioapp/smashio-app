import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, RESTRICTED_TONE } from "../lib/theme";
import { formatDistance } from "../lib/format";
import { haptics } from "../lib/haptics";
import type { NoGameVenue } from "./GameMap";

// Courts mode's sheet row (P2, discover-map-ux-plan.md §4.1/§4.2) — the medal/lock/hollow-ring
// badges retired off the map pin land here instead, where there's room for the word "Members
// only". No price/open-now yet: venues_near carries no pricing or opening-hours columns (that's
// venue_detail's job, an N+1 per pin) — deferred with "open now" to P3 (§4.3).
export function MapCourtCard({ venue, onPress }: { venue: NoGameVenue & { distanceM: number }; onPress: (venue: NoGameVenue) => void }) {
  const restricted = venue.bookability === "club_only" || venue.bookability === "members_only";
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress(venue);
      }}
      className="rounded-xl px-4 py-3 border flex-row items-center gap-3"
      style={{ backgroundColor: colors.surfaceAlt, borderColor: colors.cardBorder }}
    >
      <View className="flex-1 min-w-0">
        <Text numberOfLines={1} className="font-body-bold text-[14px]" style={{ color: colors.text }}>
          {venue.name}
        </Text>
        <Text numberOfLines={1} className="text-[12px] mt-0.5" style={{ color: colors.textSecondary }}>
          {formatDistance(venue.distanceM)}
          {venue.courtsBadminton != null ? ` · ${venue.courtsBadminton} ${venue.courtsBadminton === 1 ? "court" : "courts"}` : ""}
        </Text>
        <View className="flex-row items-center gap-1.5 mt-1.5">
          {restricted && (
            <View className="flex-row items-center gap-1 rounded-pill px-2 py-0.5" style={{ backgroundColor: RESTRICTED_TONE.bg }}>
              <Ionicons name="lock-closed-outline" size={9} color={RESTRICTED_TONE.fg} />
              <Text className="text-[9.5px] font-body-bold" style={{ color: RESTRICTED_TONE.fg }}>
                {venue.bookability === "members_only" ? "Members only" : "Club only"}
              </Text>
            </View>
          )}
          {venue.dedicated && (
            <View className="rounded-pill px-2 py-0.5" style={{ backgroundColor: "rgba(214,255,63,0.1)" }}>
              <Text className="text-[9.5px] font-body-bold" style={{ color: colors.accent }}>
                Dedicated
              </Text>
            </View>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
    </Pressable>
  );
}
