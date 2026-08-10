import { useState } from "react";
import { View, Text, Pressable, ScrollView, Linking, Platform } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../../lib/store";
import { colors } from "../../lib/theme";
import { useDiscoverGames } from "../../lib/queries/games";
import { useUserLocation } from "../../lib/location";
import { Screen } from "../../components/Screen";
import { Chip } from "../../components/Chip";
import { GameCard } from "../../components/GameCard";
import { Button } from "../../components/Button";
import { GameMap } from "../../components/GameMap";
import { RefreshableList } from "../../components/RefreshableList";
import type { Game } from "../../lib/mockData";

function openDirections(game: Game) {
  if (game.venueLat == null || game.venueLng == null) return;
  const label = encodeURIComponent(game.venue);
  const url = Platform.select({
    ios: `https://maps.apple.com/?ll=${game.venueLat},${game.venueLng}&q=${label}`,
    android: `geo:0,0?q=${game.venueLat},${game.venueLng}(${label})`,
    default: `https://www.google.com/maps/search/?api=1&query=${game.venueLat},${game.venueLng}`,
  });
  Linking.openURL(url!);
}

const FILTERS = ["All levels", "Beginner", "Intermediate", "Advanced", "Pro", "Tonight"];

const TIER_SLUGS: Record<string, string> = {
  Beginner: "beginner",
  Intermediate: "intermediate",
  Advanced: "advanced",
  Pro: "pro",
};

export default function Discover() {
  const { activeFilter, setActiveFilter, discoverView, setDiscoverView } = useAppStore();
  const userLocation = useUserLocation();
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

  const discoverQuery = useDiscoverGames(
    {
      tierSlug: TIER_SLUGS[activeFilter],
      tonightOnly: activeFilter === "Tonight",
    },
    userLocation
  );
  const games = discoverQuery.data ?? [];
  const pinnedGames = games.filter((g) => g.venueLat != null && g.venueLng != null);
  const selectedGame = pinnedGames.find((g) => g.id === selectedGameId) ?? pinnedGames[0];

  return (
    <Screen>
      <View className="px-5 pt-3 pb-2.5 flex-row justify-between items-start">
        <View>
          <View className="flex-row items-center gap-1">
            <Ionicons name="location-outline" size={12} color={colors.textTertiary} />
            <Text className="text-[13px] font-body-bold" style={{ color: colors.textTertiary }}>
              Sydney, NSW
            </Text>
          </View>
          <Text className="font-display text-[26px] mt-0.5" style={{ color: colors.text }}>
            Discover
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/notification-settings")}
          className="w-[38px] h-[38px] rounded-full items-center justify-center border"
          style={{ backgroundColor: "#17171A", borderColor: "rgba(255,255,255,0.08)" }}
        >
          <Ionicons name="notifications-outline" size={16} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingVertical: 4, alignItems: "center" }}
      >
        {FILTERS.map((f) => (
          <Chip key={f} label={f} active={activeFilter === f} onPress={() => setActiveFilter(f)} size="sm" />
        ))}
      </ScrollView>

      <View className="flex-row gap-1.5 px-5 pb-2.5 pt-1">
        <Chip label="List" active={discoverView === "list"} onPress={() => setDiscoverView("list")} />
        <Chip label="Map" active={discoverView === "map"} onPress={() => setDiscoverView("map")} />
      </View>

      {discoverView === "list" ? (
        <RefreshableList
          data={games}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ padding: 20, paddingTop: 4, paddingBottom: 110, gap: 12 }}
          refreshing={discoverQuery.isRefetching}
          onRefresh={() => discoverQuery.refetch()}
          renderItem={({ item, index }) => <GameCard game={item} index={index} onPress={() => router.push(`/game/${item.id}`)} />}
          ListEmptyComponent={
            <View className="items-center gap-3 pt-16 px-5">
              <View
                className="w-16 h-16 rounded-full items-center justify-center border"
                style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}
              >
                <Ionicons name="tennisball-outline" size={26} color={colors.textMuted} />
              </View>
              <Text className="font-display-bold text-[17px]" style={{ color: colors.text }}>
                No games nearby yet
              </Text>
              <Text className="text-[14.5px] text-center max-w-[220px]" style={{ color: colors.textSecondary }}>
                Be the first to host a match this week, it takes under a minute.
              </Text>
              <Button label="Create a game" fullWidth={false} onPress={() => router.push("/wizard")} />
            </View>
          }
        />
      ) : (
        <View className="flex-1 relative overflow-hidden mx-0" style={{ backgroundColor: "#111113" }}>
          <GameMap games={pinnedGames} center={userLocation} onSelectGame={setSelectedGameId} />
          {selectedGame && (
            <View
              className="absolute left-4 right-4 rounded-2xl p-3.5 border"
              style={{ bottom: 92, backgroundColor: colors.card, borderColor: colors.cardBorder }}
            >
              <Pressable onPress={() => router.push(`/game/${selectedGame.id}`)} className="flex-row justify-between items-center">
                <View className="flex-1 pr-2">
                  <Text className="font-body-bold text-[14.5px]" style={{ color: colors.text }} numberOfLines={1}>
                    {selectedGame.venue}
                  </Text>
                  <Text className="text-[13px] mt-0.5" style={{ color: colors.textTertiary }}>
                    {selectedGame.date} · {selectedGame.time}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1">
                  <Text className="font-body-extrabold text-[14.5px]" style={{ color: colors.accent }}>
                    View
                  </Text>
                  <Ionicons name="arrow-forward" size={13} color={colors.accent} />
                </View>
              </Pressable>
              <Pressable onPress={() => openDirections(selectedGame)} className="flex-row items-center gap-1 mt-2.5">
                <Ionicons name="navigate-outline" size={13} color={colors.textSecondary} />
                <Text className="text-[13.5px] font-body-bold" style={{ color: colors.textSecondary }}>
                  Directions
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </Screen>
  );
}
