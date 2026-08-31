import { useMemo } from "react";
import { View, Text, FlatList, ActivityIndicator, RefreshControl, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, avatarColor, type TierId } from "../../lib/theme";
import { useTabBarSpace } from "../../lib/nav";
import { useUserLocation } from "../../lib/location";
import { useFeedHome, type FeedPost } from "../../lib/queries/feed";
import { Screen } from "../../components/Screen";
import { EmptyState } from "../../components/EmptyState";
import { Avatar } from "../../components/Avatar";
import { supabase } from "../../lib/supabase";
import { useAppStore } from "../../lib/store";
import { useSession } from "../../lib/session";
import { haptics } from "../../lib/haptics";

const VALID_TIERS: TierId[] = ["Beginner", "Intermediate", "Advanced", "Pro"];

// "Turn this into a game" (§5.2) — the point of looking_for_players. Reuses the same deferred
// wizard-prefill mechanism Rebook already established (useAppStore.rebookSeed) rather than
// inventing a second one.
function turnIntoGame(post: FeedPost) {
  const payload = (post.payload ?? {}) as Record<string, string | number | undefined>;
  if (!post.venueId) return;
  const label = payload.skill_tier_label as string | undefined;
  const skill = (VALID_TIERS.includes(label as TierId) ? label : "Intermediate") as TierId;
  useAppStore.getState().setRebookSeed({
    venueId: post.venueId,
    venueName: post.venueName ?? (payload.venue_name as string) ?? "",
    venueSuburb: (payload.venue_suburb as string) ?? "",
    venueAddress: "",
    skill,
    maxPlayers: (payload.max_players as number) ?? 4,
    courtsBooked: 1,
    durationHours: 1,
    cost: 8,
    startsAt: payload.starts_at ? new Date(payload.starts_at as string) : new Date(Date.now() + 3 * 60 * 60 * 1000),
  });
  router.push("/wizard");
}

// social-plan.md B1/N1 — the feed's own tab, mounted once feed_home has real data behind it
// (§13.6 step 4). Text-only, system posts for now; the composer (B2) hasn't shipped. No
// Realtime (§13.6: "pull-to-refresh and query invalidation only, same as Discover").
function systemPostCopy(post: FeedPost): { title: string; subtitle: string } {
  const payload = (post.payload ?? {}) as Record<string, string | number | undefined>;
  const venue = (payload.venue_name as string) ?? post.venueName ?? "a venue";
  switch (payload.event) {
    case "game_published":
      return { title: `Game at ${venue}`, subtitle: `${payload.max_players ?? "A few"} spots · ${venue}` };
    case "game_completed":
      return { title: `Played at ${venue}`, subtitle: "Game wrapped up" };
    case "game_filled":
      return { title: `${venue} just filled up`, subtitle: "Full game, waitlist is open" };
    case "new_venue":
      return { title: `New venue: ${venue}`, subtitle: "Just added to the directory" };
    case "achievement_awarded":
      return { title: `${post.authorDisplayName ?? "A player"} hit a milestone`, subtitle: String(payload.achievement_id ?? "") };
    default:
      return { title: venue, subtitle: "" };
  }
}

function FeedRow({ post }: { post: FeedPost }) {
  const isSystem = post.kind === "system";
  const photoUrl = post.authorPhotoPath ? supabase.storage.from("avatars").getPublicUrl(post.authorPhotoPath).data.publicUrl : null;
  const copy = isSystem ? systemPostCopy(post) : null;

  return (
    <View
      className="mx-5 mb-3 rounded-2xl p-4 border flex-row gap-3"
      style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}
    >
      {isSystem ? (
        <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: colors.surfaceAlt }}>
          <Ionicons name="flash-outline" size={16} color={colors.accent} />
        </View>
      ) : (
        <Avatar id={post.authorId ?? post.id} name={post.authorDisplayName ?? "Player"} color={avatarColor(post.authorId ?? post.id)} size={36} photoUri={photoUrl} avatarKey={post.authorAvatarKey} />
      )}
      <View className="flex-1 min-w-0">
        {isSystem ? (
          <>
            <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
              {copy!.title}
            </Text>
            {!!copy!.subtitle && (
              <Text className="text-[12.5px] mt-0.5" style={{ color: colors.textSecondary }}>
                {copy!.subtitle}
              </Text>
            )}
          </>
        ) : (
          <>
            <Text className="font-body-bold text-[13.5px]" style={{ color: colors.text }}>
              {post.authorDisplayName}
            </Text>
            <Text className="text-[14px] mt-0.5" style={{ color: colors.textSecondary }}>
              {post.body}
            </Text>
          </>
        )}
        <Text className="text-[11px] mt-1.5" style={{ color: colors.textMuted }}>
          {post.distanceBucket ? post.distanceBucket.replace("_", "–").replace("km", " km") : ""}
        </Text>
        {post.kind === "looking_for_players" && (
          <Pressable
            onPress={() => {
              haptics.tap();
              turnIntoGame(post);
            }}
            className="self-start rounded-pill px-3 py-1.5 mt-2 flex-row items-center gap-1.5"
            style={{ backgroundColor: colors.accent }}
          >
            <Ionicons name="add-circle-outline" size={14} color={colors.base} />
            <Text className="font-body-bold text-[12px]" style={{ color: colors.base }}>
              Turn this into a game
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function Feed() {
  const tabBarSpace = useTabBarSpace();
  const location = useUserLocation();
  const feedQuery = useFeedHome({ lat: location.lat, lng: location.lng });
  const posts = useMemo(() => feedQuery.data?.pages.flat() ?? [], [feedQuery.data]);
  const { session } = useSession();

  return (
    <Screen>
      <View className="flex-row items-center justify-between px-5 pt-3 pb-3.5">
        <Text className="font-display text-[26px]" style={{ color: colors.text }}>
          Feed
        </Text>
        {session && (
          <Pressable
            onPress={() => {
              haptics.tap();
              router.push("/compose");
            }}
            className="w-9 h-9 rounded-full items-center justify-center"
            style={{ backgroundColor: colors.accent }}
            testID="feed-compose"
          >
            <Ionicons name="add" size={20} color={colors.base} />
          </Pressable>
        )}
      </View>

      {feedQuery.isLoading ? (
        <View className="items-center justify-center py-16">
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : posts.length === 0 ? (
        <EmptyState
          character="kookaburra-shade"
          title="Nothing here yet"
          subtitle="Follow a few players or find a game, and the feed fills in around you."
          ctaLabel="Find a game"
          onCta={() => router.push("/(tabs)/discover")}
        />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <FeedRow post={item} />}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: tabBarSpace }}
          onEndReached={() => feedQuery.hasNextPage && feedQuery.fetchNextPage()}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={feedQuery.isRefetching} onRefresh={() => feedQuery.refetch()} tintColor={colors.accent} />}
          ListFooterComponent={feedQuery.isFetchingNextPage ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} /> : null}
        />
      )}
    </Screen>
  );
}
