import { useState } from "react";
import { View, Text, TextInput, ActivityIndicator, ScrollView } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../lib/theme";
import { useVenuesDirectory, useAmenityTypes } from "../../lib/queries/venues";
import { BackButton } from "../../components/BackButton";
import { Chip } from "../../components/Chip";
import { VenueCard } from "../../components/VenueCard";
import { EmptyState } from "../../components/EmptyState";

type FilterKey = "bookable" | "min4" | "dedicated";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "bookable", label: "Bookable now" },
  { key: "min4", label: "4+ courts" },
  { key: "dedicated", label: "Dedicated" },
];

// Venue Screen Redesign panel 6 ("Courts near me") — the facility directory as its own
// destination, separate from Discover's game-anchored map. Reached via a header button on
// Discover; venues_directory (20260817000100) backs the search + filter chips.
export default function VenuesDirectoryScreen() {
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<Set<FilterKey>>(new Set());
  const [activeAmenities, setActiveAmenities] = useState<Set<string>>(new Set());
  const amenityTypesQuery = useAmenityTypes();

  const toggle = (key: FilterKey) => {
    setActive((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleAmenity = (slug: string) => {
    setActiveAmenities((prev) => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      return next;
    });
  };

  const query = useVenuesDirectory({
    search: search.trim() || undefined,
    bookableNow: active.has("bookable") || undefined,
    minCourts: active.has("min4") ? 4 : undefined,
    dedicated: active.has("dedicated") || undefined,
    amenitySlugs: activeAmenities.size > 0 ? Array.from(activeAmenities) : undefined,
  });

  const venues = query.data ?? [];
  const total = venues[0]?.total_count ?? venues.length;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.base }}>
      <View className="px-5 pt-14 pb-2">
        <View className="flex-row items-center gap-3">
          <BackButton onPress={() => router.back()} />
          <Text className="font-display text-[22px] flex-1" style={{ color: colors.text }}>
            Courts near me
          </Text>
        </View>

        <View
          className="flex-row items-center gap-2 rounded-pill px-4 mt-4 border"
          style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder, height: 44 }}
        >
          <Ionicons name="search" size={16} color={colors.textTertiary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search venues, suburbs..."
            placeholderTextColor={colors.textTertiary}
            className="flex-1 text-[14px]"
            style={{ color: colors.text }}
          />
        </View>

        <Text className="text-[11.5px] font-body-bold uppercase tracking-wide mt-3" style={{ color: colors.textSecondary }}>
          NSW · {query.isLoading ? "…" : `${total} ${total === 1 ? "venue" : "venues"}`}
        </Text>

        <View className="flex-row flex-wrap gap-2 mt-3">
          {FILTERS.map((f) => (
            <Chip key={f.key} label={f.label} active={active.has(f.key)} onPress={() => toggle(f.key)} size="sm" />
          ))}
        </View>

        {(amenityTypesQuery.data?.length ?? 0) > 0 && (
          <>
            <Text className="text-[11.5px] font-body-bold uppercase tracking-wide mt-4" style={{ color: colors.textSecondary }}>
              Court amenities
            </Text>
            <View className="flex-row flex-wrap gap-2 mt-2">
              {amenityTypesQuery.data!.map((a) => (
                <Chip key={a.slug} label={a.label} active={activeAmenities.has(a.slug)} onPress={() => toggleAmenity(a.slug)} size="sm" />
              ))}
            </View>
          </>
        )}
      </View>

      {query.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : venues.length === 0 ? (
        <EmptyState
          title="No venues match"
          subtitle="Try clearing a filter, or search a different suburb."
          ctaLabel="Clear filters"
          onCta={() => {
            setActive(new Set());
            setActiveAmenities(new Set());
            setSearch("");
          }}
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32, gap: 10 }}>
          {venues.map((v) => (
            <VenueCard key={v.id} venue={v} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
