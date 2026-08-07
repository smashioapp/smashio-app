import { View, Text, Pressable, FlatList } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useAppStore } from "../../lib/store";
import { colors, gradients } from "../../lib/theme";
import { GAMES, HOSTING, PAST } from "../../lib/mockData";
import { Screen } from "../../components/Screen";
import { Chip } from "../../components/Chip";
import { GameCard } from "../../components/GameCard";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";

export default function MyGames() {
  const { myGamesTab, setMyGamesTab } = useAppStore();
  const joined = GAMES.slice(0, 2);

  return (
    <Screen>
      <Text className="font-display text-[26px] px-5 pt-3 pb-2.5" style={{ color: colors.text }}>
        My Games
      </Text>
      <View className="flex-row gap-1.5 px-5 pb-3.5">
        <Chip label="Joined" active={myGamesTab === "joined"} onPress={() => setMyGamesTab("joined")} />
        <Chip label="Hosting" active={myGamesTab === "hosting"} onPress={() => setMyGamesTab("hosting")} />
        <Chip label="Past" active={myGamesTab === "past"} onPress={() => setMyGamesTab("past")} />
      </View>

      {myGamesTab === "joined" && (
        <FlatList
          style={{ flex: 1 }}
          data={joined}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ padding: 20, paddingTop: 0, paddingBottom: 110, gap: 12 }}
          renderItem={({ item }) => <GameCard game={item} onPress={() => router.push(`/game/${item.id}`)} />}
        />
      )}

      {myGamesTab === "hosting" && (
        <FlatList
          style={{ flex: 1 }}
          data={HOSTING}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ padding: 20, paddingTop: 0, paddingBottom: 110, gap: 12 }}
          ListEmptyComponent={
            <View className="items-center gap-2.5 pt-14">
              <Text className="text-[13px]" style={{ color: colors.textSecondary }}>
                No games hosted yet.
              </Text>
              <Button label="Host a game" fullWidth={false} onPress={() => router.push("/wizard")} />
            </View>
          }
          renderItem={({ item }) => (
            <LinearGradient colors={gradients.card} className="rounded-[18px] p-4 border gap-2" style={{ borderColor: colors.cardBorder }}>
              <View className="flex-row justify-between">
                <Text className="font-display-bold text-[15px]" style={{ color: colors.text }}>
                  {item.venue}
                </Text>
                <Badge state={item.verified ? "verified" : "pending"} label={item.verified ? "Verified" : "Pending review"} />
              </View>
              <Text className="text-[12px]" style={{ color: colors.textDim }}>
                {item.date} · {item.time}
              </Text>
              <Pressable
                onPress={() => router.push(`/game/${item.id}`)}
                className="self-start rounded-pill px-4 py-2 border-[1.5px]"
                style={{ borderColor: "rgba(255,255,255,0.15)" }}
              >
                <Text className="font-body-bold text-[12px]" style={{ color: colors.text }}>
                  Manage game
                </Text>
              </Pressable>
            </LinearGradient>
          )}
        />
      )}

      {myGamesTab === "past" && (
        <FlatList
          style={{ flex: 1 }}
          data={PAST}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ padding: 20, paddingTop: 0, paddingBottom: 110, gap: 12 }}
          renderItem={({ item }) => (
            <LinearGradient colors={gradients.card} className="rounded-[18px] p-4 border gap-2.5" style={{ borderColor: colors.cardBorder }}>
              <Text className="font-display-bold text-[15px]" style={{ color: colors.text }}>
                {item.venue}
              </Text>
              <Text className="text-[12px]" style={{ color: colors.textTertiary }}>
                {item.date} · {item.time}
              </Text>
              <View className="flex-row gap-2">
                <Button label="Rate players" size="sm" fullWidth={false} onPress={() => router.push(`/post-game/${item.id}`)} />
                <Pressable
                  onPress={() => router.push("/wizard")}
                  className="rounded-pill px-4 py-2 border-[1.5px] items-center justify-center"
                  style={{ borderColor: "rgba(255,255,255,0.15)" }}
                >
                  <Text className="font-body-bold text-[12px]" style={{ color: colors.text }}>
                    Rebook
                  </Text>
                </Pressable>
              </View>
            </LinearGradient>
          )}
        />
      )}
    </Screen>
  );
}
