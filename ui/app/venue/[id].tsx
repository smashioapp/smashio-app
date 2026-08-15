import { useState } from "react";
import { View, Text, Pressable, ScrollView, Alert, Linking, Image, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../lib/theme";
import { openDirections } from "../../lib/directions";
import { useVenueDetail, useVenuePhotoUrls, useReportCorrection, VenueAmenity } from "../../lib/queries/venues";
import { VenueCourtHeader } from "../../components/VenueCourtHeader";
import { BackButton } from "../../components/BackButton";
import { Button } from "../../components/Button";
import { GameDetailSkeleton } from "../../components/Skeleton";
import { haptics } from "../../lib/haptics";
import { formatTimeShort } from "../../lib/format";
import { useAppStore } from "../../lib/store";
import { Share } from "react-native";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const AMENITY_CATEGORY_LABELS: Record<string, string> = {
  essentials: "Essentials",
  gear: "Gear",
  comfort: "Comfort",
  access: "Access",
};

function formatMoney(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

function unitLabel(unit: string): string {
  if (unit === "court_hour") return "/court/hr";
  if (unit === "person_hour") return "/person/hr";
  return "/person";
}

async function shareVenue(id: string, name: string) {
  const url = `https://smashio.com.au/venue/${id}`;
  try {
    await Share.share({ message: `Check out ${name} on Smashio`, url });
  } catch {}
}

export default function VenueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const venueId = id ?? "";
  const { width } = useWindowDimensions();
  const venueQuery = useVenueDetail(venueId);
  const venue = venueQuery.data;
  const photoPaths = (venue?.photos ?? []).map((p) => p.storage_path);
  const photoUrlsQuery = useVenuePhotoUrls(photoPaths);
  const reportCorrection = useReportCorrection();
  const [reportSent, setReportSent] = useState(false);

  if (venueQuery.isLoading) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.base }}>
        <View className="px-4 pt-14 pb-2">
          <BackButton onPress={() => router.back()} />
        </View>
        <GameDetailSkeleton />
      </View>
    );
  }

  if (!venue) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.base }}>
        <Text style={{ color: colors.textSecondary }}>Venue not found</Text>
      </View>
    );
  }

  const profile = venue.profile;
  const bookable = profile?.bookability === "public";
  const amenitiesByCategory = (venue.amenities ?? []).reduce<Record<string, VenueAmenity[]>>((acc, a) => {
    (acc[a.category] ??= []).push(a);
    return acc;
  }, {});

  const handleReport = () => {
    Alert.alert("Something wrong here?", "Let us know what's off and we'll take a look.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Report an issue",
        onPress: () => {
          reportCorrection.mutate(
            { venueId: venue.id, field: "general", note: "Flagged from venue screen — see app for context." },
            {
              onSuccess: () => setReportSent(true),
              onError: (e) => Alert.alert("Couldn't send report", e instanceof Error ? e.message : "Try again."),
            }
          );
        },
      },
    ]);
  };

  const handleHostHere = () => {
    haptics.tap();
    useAppStore.getState().setHostHereSeed({
      venueId: venue.id,
      venueName: venue.name,
      venueSuburb: venue.suburb,
      venueAddress: venue.address ?? `${venue.suburb}, ${venue.state}`,
    });
    router.push("/wizard");
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.base }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={{ width, height: 180 }}>
          {photoUrlsQuery.data && photoUrlsQuery.data.length > 0 ? (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
              {photoUrlsQuery.data.map((url) => (
                <Image key={url} source={{ uri: url }} style={{ width, height: 180 }} resizeMode="cover" />
              ))}
            </ScrollView>
          ) : (
            <VenueCourtHeader venueKey={venue.id} width={width} />
          )}
          <View className="absolute px-4" style={{ top: 56 }}>
            <BackButton dark onPress={() => router.back()} />
          </View>
        </View>

        <View className="px-5 pt-4">
          <Text className="font-display text-[22px]" style={{ color: colors.text }}>
            {venue.name}
          </Text>
          <Text className="text-[14.5px] mt-1" style={{ color: colors.textTertiary }}>
            {venue.suburb}, {venue.state}
            {profile?.dedicated ? " · Dedicated badminton venue" : ""}
          </Text>

          {profile && profile.bookability !== "public" && (
            <View
              className="flex-row items-center gap-2 rounded-xl px-3.5 py-2.5 mt-3 border"
              style={{ backgroundColor: "rgba(255,182,72,0.1)", borderColor: "rgba(255,182,72,0.25)" }}
            >
              <Ionicons name="lock-closed-outline" size={15} color={colors.advanced} />
              <Text className="flex-1 text-[13px]" style={{ color: colors.advanced }}>
                {profile.bookability === "club_only"
                  ? "Club-hired venue — you can't book this directly."
                  : profile.bookability === "members_only"
                    ? "Members-only venue."
                    : "We don't yet know if this venue takes casual bookings."}
                {profile.club_contact ? ` Contact: ${profile.club_contact}` : ""}
              </Text>
            </View>
          )}

          <View className="flex-row gap-2 mt-3.5">
            <ActionButton icon="navigate" label="Directions" onPress={() => openDirections({ venue: venue.name, venueLat: venue.lat, venueLng: venue.lng, venueAddress: venue.address })} />
            {bookable && profile?.booking_url && (
              <ActionButton
                icon="calendar-outline"
                label="Book"
                onPress={() => Linking.openURL(profile.booking_url!).catch(() => Alert.alert("Couldn't open link"))}
              />
            )}
            {profile?.phone && (
              <ActionButton icon="call-outline" label="Call" onPress={() => Linking.openURL(`tel:${profile.phone}`).catch(() => {})} />
            )}
            <ActionButton icon="share-outline" label="Share" onPress={() => shareVenue(venue.id, venue.name)} />
          </View>

          {(profile?.courts_badminton != null || profile?.surface) && (
            <View className="flex-row flex-wrap gap-2 mt-3.5">
              {profile?.courts_badminton != null && (
                <InfoChip label={`${profile.courts_badminton} ${profile.courts_badminton === 1 ? "court" : "courts"}`} />
              )}
              {profile?.surface && <InfoChip label={profile.surface[0].toUpperCase() + profile.surface.slice(1)} />}
              {profile?.dedicated != null && <InfoChip label={profile.dedicated ? "Dedicated" : "Multi-purpose"} />}
            </View>
          )}

          <SectionLabel>Play here</SectionLabel>
          <View className="rounded-2xl p-4 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
            <Text className="text-[14.5px]" style={{ color: colors.textSecondary }}>
              {venue.upcoming_game_count > 0
                ? `${venue.upcoming_game_count} upcoming ${venue.upcoming_game_count === 1 ? "game" : "games"}${venue.next_game_at ? ` · next ${formatTimeShort(venue.next_game_at)}` : ""}`
                : "No games scheduled here yet."}
            </Text>
            <View className="mt-3">
              <Button label="Host a game here" size="md" onPress={handleHostHere} />
            </View>
          </View>

          {venue.pricing_bands.length > 0 && (
            <>
              <SectionLabel>Pricing</SectionLabel>
              <View className="rounded-2xl border overflow-hidden" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
                {venue.pricing_bands.map((band, i) => (
                  <View
                    key={band.id}
                    className="flex-row items-center justify-between px-4 py-3"
                    style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.cardBorder } : undefined}
                  >
                    <View className="flex-1 pr-3">
                      <Text className="text-[14px] font-body-semibold" style={{ color: colors.text }}>
                        {band.label}
                      </Text>
                      <Text className="text-[12.5px] mt-0.5" style={{ color: colors.textMuted }}>
                        {band.days.map((d) => DAY_LABELS[d - 1]).join(", ")}
                        {band.starts_time && band.ends_time ? ` · ${band.starts_time.slice(0, 5)}–${band.ends_time.slice(0, 5)}` : ""}
                      </Text>
                    </View>
                    <Text className="font-body-bold text-[14.5px]" style={{ color: colors.text }}>
                      {formatMoney(band.cents)}
                      <Text style={{ color: colors.textMuted }}>{unitLabel(band.unit)}</Text>
                    </Text>
                  </View>
                ))}
              </View>
              {profile?.verified_at && (
                <Text className="text-[11.5px] mt-2" style={{ color: colors.textMuted }}>
                  As at {new Date(profile.verified_at).toLocaleDateString()}. Prices may change — check with the venue.
                </Text>
              )}
            </>
          )}

          {Object.keys(amenitiesByCategory).length > 0 && (
            <>
              <SectionLabel>Amenities</SectionLabel>
              {Object.entries(amenitiesByCategory).map(([category, amenities]) => (
                <View key={category} className="mb-3">
                  <Text className="text-[12px] font-body-bold uppercase tracking-wide mb-1.5" style={{ color: colors.textMuted }}>
                    {AMENITY_CATEGORY_LABELS[category] ?? category}
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {amenities
                      .filter((a) => a.availability !== "unknown")
                      .map((a) => (
                        <AmenityChip key={a.slug} amenity={a} />
                      ))}
                  </View>
                </View>
              ))}
            </>
          )}

          {profile?.opening_hours && (
            <>
              <SectionLabel>Hours</SectionLabel>
              <View className="rounded-2xl p-4 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
                {DAY_LABELS.map((label, i) => {
                  const key = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"][i];
                  const ranges = profile.opening_hours?.[key];
                  return (
                    <View key={key} className="flex-row justify-between py-1">
                      <Text className="text-[13.5px]" style={{ color: colors.textSecondary }}>
                        {label}
                      </Text>
                      <Text className="text-[13.5px]" style={{ color: colors.text }}>
                        {ranges === undefined ? "Unknown" : ranges.length === 0 ? "Closed" : ranges.map((r) => `${r[0]}–${r[1]}`).join(", ")}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {profile?.access_notes && (
            <>
              <SectionLabel>Access notes</SectionLabel>
              <Text className="text-[14px]" style={{ color: colors.textSecondary }}>
                {profile.access_notes}
              </Text>
            </>
          )}

          <Pressable onPress={reportSent ? undefined : handleReport} className="mt-6 py-2" disabled={reportSent}>
            <Text className="text-[13px] text-center" style={{ color: colors.textMuted }}>
              {reportSent ? "Thanks — we'll take a look." : "Something wrong here?"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="font-body-extrabold text-[13px] uppercase tracking-wide mt-5.5 mb-2.5" style={{ color: colors.textTertiary }}>
      {children}
    </Text>
  );
}

function ActionButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      className="flex-1 items-center gap-1 rounded-xl py-2.5 border"
      style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}
    >
      <Ionicons name={icon} size={17} color={colors.accent} />
      <Text className="text-[11.5px] font-body-semibold" style={{ color: colors.textDim }}>
        {label}
      </Text>
    </Pressable>
  );
}

function InfoChip({ label }: { label: string }) {
  return (
    <View className="rounded-pill px-3 py-1.5 border" style={{ backgroundColor: colors.surfaceAlt, borderColor: colors.cardBorder }}>
      <Text className="text-[12.5px] font-body-semibold" style={{ color: colors.textDim }}>
        {label}
      </Text>
    </View>
  );
}

function AmenityChip({ amenity }: { amenity: VenueAmenity }) {
  const muted = amenity.availability === "paid" || amenity.availability === "nearby";
  const struck = amenity.availability === "no";
  return (
    <View
      className="flex-row items-center gap-1.5 rounded-pill px-3 py-1.5 border"
      style={{ backgroundColor: colors.surfaceAlt, borderColor: colors.cardBorder, opacity: struck ? 0.45 : muted ? 0.7 : 1 }}
    >
      <Ionicons name={amenity.icon as keyof typeof Ionicons.glyphMap} size={13} color={struck ? colors.textMuted : colors.accent} />
      <Text
        className={`text-[12.5px] ${struck ? "" : "font-body-semibold"}`}
        style={{ color: struck ? colors.textMuted : colors.textDim, textDecorationLine: struck ? "line-through" : "none" }}
      >
        {amenity.label}
        {amenity.availability === "paid" ? " (paid)" : amenity.availability === "nearby" ? " (nearby)" : ""}
      </Text>
    </View>
  );
}
