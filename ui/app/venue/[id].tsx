import { useState } from "react";
import { View, Text, Pressable, ScrollView, Alert, Linking, Image, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, CONFIDENCE_TONE, RESTRICTED_TONE } from "../../lib/theme";
import { openDirections } from "../../lib/directions";
import { useVenueDetail, useVenuePhotoUrls, useReportCorrection, VenueAmenity, confidenceState } from "../../lib/queries/venues";
import { VenueCourtHeader } from "../../components/VenueCourtHeader";
import { BackButton } from "../../components/BackButton";
import { Button } from "../../components/Button";
import { GameDetailSkeleton } from "../../components/Skeleton";
import { HatchPattern } from "../../components/HatchPattern";
import { haptics } from "../../lib/haptics";
import { formatTimeShort } from "../../lib/format";
import { useAppStore } from "../../lib/store";
import { track } from "../../lib/analytics";
import { Share } from "react-native";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const AMENITY_CATEGORY_LABELS: Record<string, string> = {
  essentials: "Essentials",
  gear: "Gear",
  comfort: "Comfort",
  access: "Access",
};

// Book link (item 2, 2026-08-23): prefer the venue's own booking_url, then its website, then a
// Google Maps place page (via google_place_id) so there's always somewhere to go beyond Directions.
function bookHref(venue: { google_place_id: string | null }, profile: { booking_url: string | null; website_url: string | null } | null): string | null {
  if (profile?.booking_url) return profile.booking_url;
  if (profile?.website_url) return profile.website_url;
  if (venue.google_place_id) return `https://www.google.com/maps/place/?q=place_id:${venue.google_place_id}`;
  return null;
}

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
    const result = await Share.share({ message: `Check out ${name} on Smashio`, url });
    if (result.action === Share.sharedAction) track("share_sent", { kind: "venue", venue_id: id });
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
        <Text style={{ color: colors.textSecondary }}>Can't find that venue</Text>
      </View>
    );
  }

  const profile = venue.profile;
  const bookable = profile?.bookability === "public";
  const bookLink = bookHref(venue, profile);
  const restricted = profile?.bookability === "club_only" || profile?.bookability === "members_only";
  const confidence = confidenceState(profile);
  const confidenceTone = CONFIDENCE_TONE[confidence];
  const priceHidden = confidence === "stale";
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
              onError: (e) => Alert.alert("Couldn't send that", e instanceof Error ? e.message : "Give it another go."),
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
          {restricted && <HatchPattern id="vd-header" opacity={0.1} />}
          <View className="absolute px-4" style={{ top: 56 }}>
            <BackButton dark onPress={() => router.back()} />
          </View>
          {confidence !== "none" && (
            <View
              className="absolute bottom-3 left-4 flex-row items-center gap-1.5 rounded-pill px-3 py-1.5"
              style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
            >
              <Ionicons name={confidenceTone.icon} size={12} color={confidenceTone.fg} />
              <Text className="text-[11px] font-body-bold" style={{ color: confidenceTone.fg }}>
                {confidence === "verified" && profile?.verified_at
                  ? `Verified ${new Date(profile.verified_at).toLocaleDateString()}`
                  : confidence === "stale" && profile?.verified_at
                    ? `Checked ${new Date(profile.verified_at).toLocaleDateString()}`
                    : confidenceTone.label}
              </Text>
            </View>
          )}
        </View>

        <View className="px-5 pt-4">
          <Text className="font-display text-[22px]" style={{ color: colors.text }}>
            {venue.name}
          </Text>
          <Text className="text-[14.5px] mt-1" style={{ color: colors.textTertiary }}>
            {venue.suburb}, {venue.state}
            {profile?.dedicated ? " · Dedicated badminton venue" : ""}
          </Text>

          {bookable && (
            <View className="flex-row items-center gap-1.5 rounded-pill px-3 py-1.5 mt-3 self-start" style={{ backgroundColor: CONFIDENCE_TONE.verified.bg }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.intermediate }} />
              <Text className="text-[11.5px] font-body-bold" style={{ color: colors.intermediate }}>
                Publicly bookable
              </Text>
            </View>
          )}

          {profile && profile.bookability !== "public" && (
            <View
              className="flex-row items-center gap-2 rounded-xl px-3.5 py-2.5 mt-3 border"
              style={{ backgroundColor: "rgba(255,182,72,0.1)", borderColor: "rgba(255,182,72,0.25)" }}
            >
              <Ionicons name="lock-closed-outline" size={15} color={colors.advanced} />
              <Text className="flex-1 text-[13px]" style={{ color: colors.advanced }}>
                {profile.bookability === "club_only"
                  ? "Club-hired venue, you can't book this one directly."
                  : profile.bookability === "members_only"
                    ? "Members-only venue."
                    : "We don't know yet if this venue takes casual bookings."}
                {profile.club_contact ? ` Contact: ${profile.club_contact}` : ""}
              </Text>
            </View>
          )}

          <View className="flex-row gap-2 mt-3.5">
            <ActionButton icon="navigate" label="Directions" onPress={() => openDirections({ venue: venue.name, venueLat: venue.lat, venueLng: venue.lng, venueAddress: venue.address })} />
            {bookable && bookLink && (
              <ActionButton
                icon="calendar-outline"
                label="Book"
                onPress={() => Linking.openURL(bookLink).catch(() => Alert.alert("Couldn't open that link"))}
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
                : "No games on here yet."}
            </Text>
            <View className="mt-3">
              <Button label="Host a game here" size="md" onPress={handleHostHere} />
            </View>
          </View>

          {venue.pricing_bands.length > 0 && (
            <>
              <SectionLabel>Pricing</SectionLabel>
              {priceHidden ? (
                <View
                  className="rounded-2xl p-4 border"
                  style={{ backgroundColor: colors.card, borderColor: "rgba(255,182,72,0.25)" }}
                >
                  <View className="flex-row items-center gap-1.5 self-start rounded-pill px-2.5 py-1" style={{ backgroundColor: CONFIDENCE_TONE.stale.bg }}>
                    <Ionicons name="time-outline" size={11} color={colors.advanced} />
                    <Text className="text-[10.5px] font-body-bold" style={{ color: colors.advanced }}>
                      Checked {profile?.verified_at ? new Date(profile.verified_at).toLocaleDateString() : "a while ago"}
                    </Text>
                  </View>
                  <Text className="text-[12.5px] mt-2 italic" style={{ color: colors.textSecondary }}>
                    Price hidden, might be out of date. Check with the venue before you head out.
                  </Text>
                </View>
              ) : (
                <>
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
                      As at {new Date(profile.verified_at).toLocaleDateString()}. Prices may change, so check with the venue.
                    </Text>
                  )}
                </>
              )}
            </>
          )}

          {Object.keys(amenitiesByCategory).length > 0 && (
            <>
              <SectionLabel>Amenities</SectionLabel>
              <View className="rounded-2xl border overflow-hidden" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
                {Object.entries(amenitiesByCategory).map(([category, amenities], ci) => (
                  <View key={category} style={ci > 0 ? { borderTopWidth: 1, borderTopColor: colors.cardBorder } : undefined}>
                    <Text className="text-[11.5px] font-body-bold uppercase tracking-wide px-4 pt-3.5 pb-1" style={{ color: colors.textMuted }}>
                      {AMENITY_CATEGORY_LABELS[category] ?? category}
                    </Text>
                    {amenities.map((a, ai) => (
                      <AmenityRow key={a.slug} amenity={a} divider={ai < amenities.length - 1} />
                    ))}
                  </View>
                ))}
              </View>
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
              {reportSent ? "Thanks, we'll take a look." : "Something wrong here?"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="font-body-extrabold text-[13px] uppercase tracking-wide mt-[22px] mb-2.5" style={{ color: colors.textTertiary }}>
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

// Five-state amenity treatment (design/23bc2cae panel 2) — border style + tone + label pair per
// state, never a single cue alone, so state reads without color vision either. The icon itself
// stays the amenity's own glyph (toilet, car, water, ...) so the row still says *what* the
// amenity is once the label truncates or the note wraps off-screen.
const AMENITY_STATE_STYLE: Record<
  VenueAmenity["availability"],
  { bg: string; border: string; borderStyle: "solid" | "dashed" | "dotted"; fg: string; statusLabel: string }
> = {
  yes: { bg: "rgba(53,214,166,0.12)", border: colors.intermediate, borderStyle: "solid", fg: colors.intermediate, statusLabel: "Yes" },
  paid: { bg: "rgba(255,182,72,0.1)", border: colors.beginner, borderStyle: "solid", fg: colors.beginner, statusLabel: "Paid" },
  nearby: { bg: "transparent", border: colors.textTertiary, borderStyle: "dashed", fg: colors.textTertiary, statusLabel: "Nearby" },
  no: { bg: "transparent", border: colors.surfaceAlt, borderStyle: "solid", fg: colors.textMuted, statusLabel: "No" },
  unknown: { bg: "transparent", border: colors.textMuted, borderStyle: "dotted", fg: colors.textMuted, statusLabel: "Not confirmed" },
};

function AmenityRow({ amenity, divider }: { amenity: VenueAmenity; divider: boolean }) {
  const s = AMENITY_STATE_STYLE[amenity.availability];
  const dim = amenity.availability === "unknown";
  return (
    <View
      className="flex-row items-center gap-3 px-4 py-2.5"
      style={{ opacity: dim ? 0.55 : 1, borderBottomWidth: divider ? 1 : 0, borderBottomColor: colors.cardBorder }}
    >
      <View
        className="items-center justify-center rounded-full"
        style={{ width: 30, height: 30, backgroundColor: s.bg, borderWidth: 1.5, borderColor: s.border, borderStyle: s.borderStyle }}
      >
        <Ionicons name={amenity.icon as keyof typeof Ionicons.glyphMap} size={14} color={s.fg} />
      </View>
      <View className="flex-1 min-w-0">
        <Text numberOfLines={1} className="text-[13.5px] font-body-semibold" style={{ color: colors.text }}>
          {amenity.label}
        </Text>
        {amenity.note && (
          <Text numberOfLines={1} className="text-[11.5px] mt-0.5" style={{ color: colors.textMuted }}>
            {amenity.note}
          </Text>
        )}
      </View>
      <Text className="text-[11.5px] font-body-bold" style={{ color: s.fg, fontStyle: dim ? "italic" : "normal" }}>
        {s.statusLabel}
      </Text>
    </View>
  );
}
