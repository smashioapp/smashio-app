import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, CONFIDENCE_TONE, RESTRICTED_TONE } from "../lib/theme";
import { confidenceState, VenueDirectoryRow } from "../lib/queries/venues";
import { VenueCourtHeader } from "./VenueCourtHeader";
import { HatchPattern } from "./HatchPattern";
import { haptics } from "../lib/haptics";

const THUMB = 56;

function formatMoney(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

function unitLabel(unit: string): string {
  if (unit === "court_hour") return "/court/hr";
  if (unit === "person_hour") return "/person/hr";
  return "/person";
}

// Venue Screen Redesign panel 6 ("Courts near me" browse surface) — compact directory row.
// Three visual states via the confidence system: bookable (solid badge + price), community/
// unknown (dimmer signal, price-not-listed reads as italic not broken), restricted (hatch
// texture on the thumbnail + no price — "can't book this" never depends on reading copy).
export function VenueCard({ venue }: { venue: VenueDirectoryRow }) {
  const state = confidenceState(venue);
  const tone = CONFIDENCE_TONE[state];
  const restricted = venue.bookability === "club_only" || venue.bookability === "members_only";

  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        router.push(`/venue/${venue.id}`);
      }}
      className="rounded-2xl border p-3 flex-row items-center gap-3"
      style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}
    >
      <View style={{ width: THUMB, height: THUMB, borderRadius: 12, overflow: "hidden", backgroundColor: colors.surfaceAlt }}>
        <VenueCourtHeader venueKey={venue.id} width={THUMB} />
        {restricted && <HatchPattern id={`vc-${venue.id}`} opacity={0.14} />}
      </View>

      <View className="flex-1 min-w-0">
        <Text numberOfLines={1} className="font-body-bold text-[13.5px]" style={{ color: colors.text }}>
          {venue.name}
        </Text>
        <Text numberOfLines={1} className="text-[11px] mt-0.5" style={{ color: colors.textSecondary }}>
          {venue.suburb}
          {venue.courts_badminton != null ? ` · ${venue.courts_badminton} ${venue.courts_badminton === 1 ? "court" : "courts"}` : ""}
        </Text>

        <View className="flex-row items-center gap-2 mt-1.5">
          {restricted ? (
            <View className="flex-row items-center gap-1.5 rounded-pill px-2 py-1" style={{ backgroundColor: RESTRICTED_TONE.bg }}>
              <Ionicons name="lock-closed-outline" size={10} color={RESTRICTED_TONE.fg} />
              <Text className="text-[9.5px] font-body-bold" style={{ color: RESTRICTED_TONE.fg }}>
                Club only
              </Text>
            </View>
          ) : (
            <View className="flex-row items-center gap-1 rounded-pill px-2 py-1" style={{ backgroundColor: tone.bg }}>
              <Ionicons name={tone.icon} size={9.5} color={tone.fg} />
            </View>
          )}
          {restricted ? null : state === "stale" ? (
            <Text className="text-[11px] italic" style={{ color: colors.textTertiary }}>
              Price may be old
            </Text>
          ) : venue.cheapest_cents != null ? (
            <Text className="font-body-bold text-[11.5px]" style={{ color: colors.textDim }}>
              {formatMoney(venue.cheapest_cents)}
              <Text style={{ color: colors.textTertiary, fontWeight: "500" }}>{unitLabel(venue.cheapest_unit ?? "court_hour")}</Text>
            </Text>
          ) : (
            <Text className="text-[11px] italic" style={{ color: colors.textTertiary }}>
              Pricing not listed
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}
