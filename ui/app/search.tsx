import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, LAYOUT } from "../lib/theme";
import { useSession } from "../lib/session";
import { useAppStore } from "../lib/store";
import { useUserLocation } from "../lib/location";
import { useDiscoverGames, useMyHostingGames, useMyPastGames } from "../lib/queries/games";
import { useVenuesDirectory } from "../lib/queries/venues";
import { useDistanceUnits } from "../lib/queries/settings";
import { suburbHits, roundedPoint } from "../lib/suburbs";
import { spotsLeft, type Game } from "../lib/mockData";
import { BackButton } from "../components/BackButton";
import { GameCard } from "../components/GameCard";
import { VenueCard } from "../components/VenueCard";
import { haptics } from "../lib/haptics";

// One search (short-a-player-ux-plan.md §4.3, F2). Discover's magnifier used to open the venue
// directory, so "find me a game in Auburn" landed on a list of buildings. G9's reason for it
// still holds (typing "Alpha Auburn" must work), so venues stay, they just come second:
// GAMES, then VENUES, then SUBURBS. The directory itself lives on at /venues.
const SEARCH_RADIUS_KM = 25;

type DayWord = "today" | "tomorrow" | null;

function dayWord(q: string): DayWord {
  const t = q.trim().toLowerCase();
  if (t === "tonight" || t === "today") return "today";
  if (t === "tomorrow") return "tomorrow";
  return null;
}

function onDay(iso: string, word: Exclude<DayWord, null>): boolean {
  const d = new Date(iso);
  const target = new Date();
  if (word === "tomorrow") target.setDate(target.getDate() + 1);
  return d.toDateString() === target.toDateString();
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text className="font-body-extrabold text-[12px] uppercase mt-5 mb-2" style={{ color: colors.textTertiary, letterSpacing: 0.8 }}>
      {children}
    </Text>
  );
}

export default function SearchScreen() {
  const { session } = useSession();
  const units = useDistanceUnits();
  const deviceLocation = useUserLocation();
  const discoverPlace = useAppStore((s) => s.discoverPlace);
  const setDiscoverPlace = useAppStore((s) => s.setDiscoverPlace);
  const center = roundedPoint(discoverPlace ?? deviceLocation);

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const h = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(h);
  }, [query]);

  // One wide, spots-open pool; matching is client-side so a venue name, a suburb and "tonight"
  // all search the same games.
  const gamesQuery = useDiscoverGames(
    { when: "all", radiusKm: SEARCH_RADIUS_KM, hasSpotsOnly: true, sortBy: "fewest_needed" },
    center,
    { units, anon: !session }
  );
  const venueSearch = dayWord(debounced) ? "" : debounced;
  const venuesQuery = useVenuesDirectory({ search: venueSearch || undefined, near: center }, { enabled: !!session && venueSearch.length >= 2 });
  const hostingQuery = useMyHostingGames();
  const pastQuery = useMyPastGames();

  const pool = gamesQuery.data ?? [];
  const word = dayWord(debounced);
  const needle = debounced.toLowerCase();

  const games: Game[] = useMemo(() => {
    if (!debounced) return [];
    if (word) return pool.filter((g) => onDay(g.startsAt, word));
    return pool.filter((g) => g.venue.toLowerCase().includes(needle) || g.suburb.toLowerCase().includes(needle));
  }, [pool, debounced, word, needle]);

  const venues = venueSearch.length >= 2 ? venuesQuery.data ?? [] : [];

  const suburbs = useMemo(() => {
    if (debounced.length < 2 || word) return [];
    return suburbHits(
      venues.map((v) => ({ suburb: v.suburb, lat: v.lat, lng: v.lng })),
      pool.map((g) => ({ suburb: g.suburb, lat: g.venueLat, lng: g.venueLng })),
      debounced
    ).slice(0, 5);
  }, [venues, pool, debounced, word]);

  // Empty query: something to tap straight away, not a blank page.
  const tonight = useMemo(() => pool.filter((g) => onDay(g.startsAt, "today") && spotsLeft(g) > 0).slice(0, 5), [pool]);
  const yourVenues = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; suburb: string }>();
    for (const g of [...(hostingQuery.data ?? []), ...(pastQuery.data ?? [])]) {
      if (!g.venueId || seen.has(g.venueId)) continue;
      seen.set(g.venueId, { id: g.venueId, name: g.venue, suburb: g.suburb });
      if (seen.size >= 3) break;
    }
    return Array.from(seen.values());
  }, [hostingQuery.data, pastQuery.data]);

  const pickSuburb = (s: { suburb: string; lat: number; lng: number }) => {
    haptics.tap();
    setDiscoverPlace({ lat: s.lat, lng: s.lng, label: s.suburb });
    router.back();
  };

  const loading = gamesQuery.isLoading || (venueSearch.length >= 2 && venuesQuery.isLoading && !!session);
  const nothing = !!debounced && !loading && games.length === 0 && venues.length === 0 && suburbs.length === 0;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.base }}>
      <View className="pt-14 pb-2" style={{ paddingHorizontal: LAYOUT.SCREEN_PAD }}>
        <View className="flex-row items-center gap-3">
          <BackButton onPress={() => router.back()} />
          <View
            className="flex-1 flex-row items-center gap-2 rounded-pill px-4 border"
            style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder, height: 44 }}
          >
            <Ionicons name="search" size={16} color={colors.textTertiary} />
            <TextInput
              testID="search-input"
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder={'Suburb, venue or "tonight"'}
              placeholderTextColor={colors.textTertiary}
              returnKeyType="search"
              className="flex-1 text-[14.5px]"
              style={{ color: colors.text }}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
              </Pressable>
            )}
          </View>
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: LAYOUT.SCREEN_PAD, paddingBottom: 40 }}>
        {!debounced ? (
          <>
            <SectionTitle>Tonight near you</SectionTitle>
            {gamesQuery.isLoading ? (
              <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />
            ) : tonight.length > 0 ? (
              tonight.map((g) => <GameCard key={g.id} game={g} onPress={() => router.push(`/game/${g.id}`)} testID={`search-game-${g.id}`} />)
            ) : (
              <Text className="text-[13.5px]" style={{ color: colors.textSecondary }}>
                Nothing on tonight nearby yet. Try a suburb or "tomorrow".
              </Text>
            )}
            {yourVenues.length > 0 && (
              <>
                <SectionTitle>Your venues</SectionTitle>
                {yourVenues.map((v) => (
                  <Pressable
                    key={v.id}
                    onPress={() => router.push(`/venue/${v.id}`)}
                    className="flex-row items-center gap-3 py-3 border-b"
                    style={{ borderColor: colors.cardBorder }}
                  >
                    <Ionicons name="business-outline" size={16} color={colors.textTertiary} />
                    <View className="flex-1">
                      <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
                        {v.name}
                      </Text>
                      <Text className="text-[12px]" style={{ color: colors.textSecondary }}>
                        {v.suburb}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} />
                  </Pressable>
                ))}
              </>
            )}
          </>
        ) : (
          <>
            {loading && <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />}
            {games.length > 0 && (
              <>
                <SectionTitle>Games</SectionTitle>
                {games.slice(0, 10).map((g) => (
                  <GameCard key={g.id} game={g} onPress={() => router.push(`/game/${g.id}`)} testID={`search-game-${g.id}`} />
                ))}
              </>
            )}
            {venues.length > 0 && (
              <>
                <SectionTitle>Venues</SectionTitle>
                <View style={{ gap: 10 }}>
                  {venues.slice(0, 6).map((v) => (
                    <VenueCard key={v.id} venue={v} />
                  ))}
                </View>
              </>
            )}
            {suburbs.length > 0 && (
              <>
                <SectionTitle>Suburbs</SectionTitle>
                {suburbs.map((s) => (
                  <Pressable
                    key={s.suburb}
                    testID={`search-suburb-${s.suburb}`}
                    onPress={() => pickSuburb(s)}
                    className="flex-row items-center gap-3 py-3 border-b"
                    style={{ borderColor: colors.cardBorder }}
                  >
                    <Ionicons name="location-outline" size={16} color={colors.textTertiary} />
                    <Text className="flex-1 font-body-bold text-[14px]" style={{ color: colors.text }}>
                      {s.suburb}
                      <Text className="font-body text-[12.5px]" style={{ color: colors.textSecondary }}>
                        {"  "}
                        {[
                          s.venueCount > 0 ? `${s.venueCount} ${s.venueCount === 1 ? "venue" : "venues"}` : null,
                          s.gameCount > 0 ? `${s.gameCount} ${s.gameCount === 1 ? "game" : "games"}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </Text>
                    <Text className="font-body-bold text-[12px]" style={{ color: colors.accent }}>
                      Look here
                    </Text>
                  </Pressable>
                ))}
              </>
            )}
            {nothing && (
              <Text className="text-[13.5px] mt-6 text-center" style={{ color: colors.textSecondary }}>
                Nothing matching "{debounced}" with a spot open. Try a nearby suburb, or "tomorrow".
              </Text>
            )}
          </>
        )}

        <Pressable
          onPress={() => router.push(session ? "/venues" : "/onboarding")}
          className="flex-row items-center justify-center gap-1.5 mt-8 py-2"
        >
          <Text className="font-body-bold text-[13.5px]" style={{ color: colors.textSecondary }}>
            Browse all venues
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
        </Pressable>
      </ScrollView>
    </View>
  );
}
