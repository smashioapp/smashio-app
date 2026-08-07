import { View, Text, Pressable, ScrollView, FlatList } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../../lib/store";
import { colors } from "../../lib/theme";
import { GAMES } from "../../lib/mockData";
import { Screen } from "../../components/Screen";
import { Chip } from "../../components/Chip";
import { GameCard } from "../../components/GameCard";
import { Button } from "../../components/Button";

const FILTERS = ["All levels", "Beginner", "Intermediate", "Advanced", "Pro", "Tonight"];

export default function Discover() {
  const { activeFilter, setActiveFilter, discoverView, setDiscoverView, showEmptyState, toggleEmptyState } = useAppStore();

  let list = GAMES;
  if (activeFilter !== "All levels" && activeFilter !== "Tonight") {
    list = GAMES.filter((g) => g.skill === activeFilter);
  }
  const games = showEmptyState ? [] : list;

  return (
    <Screen>
      <View className="px-5 pt-3 pb-2.5 flex-row justify-between items-start">
        <View>
          <View className="flex-row items-center gap-1">
            <Ionicons name="location-outline" size={12} color={colors.textTertiary} />
            <Text className="text-[11px] font-body-bold" style={{ color: colors.textTertiary }}>
              Melbourne, VIC
            </Text>
          </View>
          <Text className="font-display text-[26px] mt-0.5" style={{ color: colors.text }}>
            Discover
          </Text>
        </View>
        <Pressable
          onPress={toggleEmptyState}
          className="w-[38px] h-[38px] rounded-full items-center justify-center border"
          style={{ backgroundColor: "#17171A", borderColor: "rgba(255,255,255,0.08)" }}
        >
          <Ionicons name="notifications-outline" size={16} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingVertical: 4 }}
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
        <FlatList
          style={{ flex: 1 }}
          data={games}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ padding: 20, paddingTop: 4, paddingBottom: 110, gap: 12 }}
          renderItem={({ item }) => <GameCard game={item} onPress={() => router.push(`/game/${item.id}`)} />}
          ListEmptyComponent={
            <View className="items-center gap-3 pt-16 px-5">
              <View
                className="w-16 h-16 rounded-full items-center justify-center border"
                style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}
              >
                <Ionicons name="tennisball-outline" size={26} color={colors.textMuted} />
              </View>
              <Text className="font-display-bold text-[16px]" style={{ color: colors.text }}>
                No games nearby yet
              </Text>
              <Text className="text-[12.5px] text-center max-w-[220px]" style={{ color: colors.textSecondary }}>
                Be the first to host a match this week — it takes under a minute.
              </Text>
              <Button label="Create a game" fullWidth={false} onPress={() => router.push("/wizard")} />
            </View>
          }
        />
      ) : (
        <View className="flex-1 relative overflow-hidden mx-0" style={{ backgroundColor: "#111113" }}>
          {[
            { top: "22%", left: "30%", color: colors.intermediate },
            { top: "44%", left: "62%", color: colors.advanced },
            { top: "60%", left: "38%", color: colors.accent },
            { top: "35%", left: "20%", color: colors.beginner },
          ].map((p, i) => (
            <View
              key={i}
              style={{
                position: "absolute",
                top: p.top as any,
                left: p.left as any,
                width: 14,
                height: 14,
                borderRadius: 7,
                backgroundColor: p.color,
              }}
            />
          ))}
          <Pressable
            onPress={() => router.push(`/game/${GAMES[0].id}`)}
            className="absolute left-4 right-4 bottom-4 rounded-2xl p-3.5 flex-row justify-between items-center border"
            style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}
          >
            <View>
              <Text className="font-body-bold text-[13px]" style={{ color: colors.text }}>
                {GAMES[0].venue}
              </Text>
              <Text className="text-[11px] mt-0.5" style={{ color: colors.textTertiary }}>
                {GAMES[0].date} · {GAMES[0].time}
              </Text>
            </View>
            <View className="flex-row items-center gap-1">
              <Text className="font-body-extrabold text-[13px]" style={{ color: colors.accent }}>
                View
              </Text>
              <Ionicons name="arrow-forward" size={13} color={colors.accent} />
            </View>
          </Pressable>
        </View>
      )}
    </Screen>
  );
}
