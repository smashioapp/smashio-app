import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, FlatList, ActivityIndicator, RefreshControl, Pressable, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, avatarColor, tierColor, LAYOUT, type TierId } from "../../lib/theme";
import { NAV, useTabBarSpace } from "../../lib/nav";
import { useUserLocation } from "../../lib/location";
import { useFeedHome, useMyReactedPostIds, useToggleReaction, useSuggestedFollows, type FeedPost } from "../../lib/queries/feed";
import { useFollowPlayer } from "../../lib/queries/follows";
import { useAppStore, FEED_RADIUS_OPTIONS_KM, DEFAULT_FEED_RADIUS_KM, type FeedKind } from "../../lib/store";
import { dayLabel, formatTimeShort, relativeTime } from "../../lib/format";
import { Screen } from "../../components/Screen";
import { EmptyState } from "../../components/EmptyState";
import { Avatar } from "../../components/Avatar";
import { Chip } from "../../components/Chip";
import { SegmentedToggle } from "../../components/SegmentedToggle";
import { Sheet } from "../../components/Sheet";
import { Button } from "../../components/Button";
import { supabase } from "../../lib/supabase";
import { useSession } from "../../lib/session";
import { haptics } from "../../lib/haptics";
import { track } from "../../lib/analytics";

const VALID_TIERS: TierId[] = ["Beginner", "Intermediate", "Advanced", "Pro"];

const KIND_OPTIONS: { key: FeedKind; label: string }[] = [
  { key: "games", label: "Games" },
  { key: "looking_for_players", label: "Looking for players" },
  { key: "question", label: "Questions" },
  { key: "achievement", label: "Achievements" },
];

// "Turn this into a game" (§5.2) — the point of looking_for_players. Reuses the same deferred
// wizard-prefill mechanism Rebook already established (useAppStore.rebookSeed) rather than
// inventing a second one.
function turnIntoGame(post: FeedPost) {
  const payload = (post.payload ?? {}) as Record<string, string | number | undefined>;
  if (!post.venueId) return;
  useAppStore.getState().setWizardFromPost(true);
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

const PTAG: Record<string, { label: string; bg: string; fg: string }> = {
  looking_for_players: { label: "LOOKING FOR PLAYERS", bg: "rgba(214,255,63,0.14)", fg: colors.accent3 },
  question: { label: "Q&A", bg: "rgba(53,214,166,0.14)", fg: colors.intermediate },
};

// v3 Feed design's "small live-game-card treatment" — the one place a Feed item is allowed to
// look like a GameRow, reserved for system posts that are actionable listings (still open).
function SystemGameCard({ post }: { post: FeedPost }) {
  const payload = (post.payload ?? {}) as Record<string, string | number | undefined>;
  const venue = (payload.venue_name as string) ?? post.venueName ?? "A venue";
  const tierLabel = payload.skill_tier_label as string | undefined;
  const dotColor = tierLabel ? tierColor(tierLabel) : colors.pro;
  const startsAt = payload.starts_at as string | undefined;
  const maxPlayers = payload.max_players as number | undefined;
  const isFilled = payload.event === "game_filled";
  const timePart = startsAt ? `${dayLabel(startsAt)}, ${formatTimeShort(startsAt)}` : "";
  const tail = isFilled ? "Full, waitlist open" : maxPlayers ? `${maxPlayers} spots` : null;

  return (
    <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 4 }}>
      <Text className="font-body-bold text-[10.5px] uppercase mb-2" style={{ color: colors.textTertiary, letterSpacing: 1 }}>
        {isFilled ? "Just filled up" : "Game published"}
      </Text>
      <Pressable
        onPress={() => post.gameId && router.push(`/game/${post.gameId}`)}
        className="rounded-2xl px-3.5 py-3 border flex-row items-center gap-3"
        style={{ borderColor: colors.cardBorder }}
      >
        <View className="w-[7px] h-[7px] rounded-full" style={{ backgroundColor: dotColor }} />
        <View className="flex-1 min-w-0">
          <Text className="font-body-bold text-[14px]" style={{ color: colors.text }} numberOfLines={1}>
            {venue}
          </Text>
          <Text className="text-[12.5px] mt-0.5" style={{ color: colors.textSecondary }}>
            {[timePart, tail].filter(Boolean).join(" · ")}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

// The other system treatment: a compact icon+sentence row, same shape a notification would take.
function SystemRow({ post }: { post: FeedPost }) {
  const payload = (post.payload ?? {}) as Record<string, string | number | undefined>;
  const venue = (payload.venue_name as string) ?? post.venueName ?? "a venue";
  let sentence: React.ReactNode;
  switch (payload.event) {
    case "new_venue":
      sentence = (
        <>
          <Text className="font-body-bold" style={{ color: colors.textDim }}>
            {venue}
          </Text>{" "}
          was added near you
        </>
      );
      break;
    case "game_completed":
      sentence = (
        <>
          Played at{" "}
          <Text className="font-body-bold" style={{ color: colors.textDim }}>
            {venue}
          </Text>
        </>
      );
      break;
    case "achievement_awarded":
      sentence = (
        <>
          <Text className="font-body-bold" style={{ color: colors.textDim }}>
            {post.authorDisplayName ?? "A player"}
          </Text>{" "}
          hit a milestone
        </>
      );
      break;
    default:
      sentence = venue;
  }

  return (
    <View className="flex-row items-center gap-3" style={{ paddingHorizontal: 24, paddingVertical: 13 }}>
      <View className="w-[30px] h-[30px] rounded-full items-center justify-center" style={{ backgroundColor: colors.surfaceAlt }}>
        <Ionicons name="flash-outline" size={14} color={colors.textDim} />
      </View>
      <Text className="flex-1 text-[13.5px]" style={{ color: colors.textSecondary }}>
        {sentence}
      </Text>
      <Text className="text-[12.5px] font-body-bold" style={{ color: colors.textTertiary }}>
        {relativeTime(post.createdAt)}
      </Text>
    </View>
  );
}

function ReactionStrip({ post, reacted, onToggle }: { post: FeedPost; reacted: boolean; onToggle: () => void }) {
  return (
    <View className="flex-row items-center gap-4 mt-0.5">
      <Pressable onPress={onToggle} className="flex-row items-center gap-1.5" hitSlop={8}>
        <Ionicons name={reacted ? "heart" : "heart-outline"} size={15} color={reacted ? colors.danger : colors.textSecondary} />
        <Text className="font-body-semibold text-[12.5px]" style={{ color: reacted ? colors.danger : colors.textSecondary }}>
          {post.reactionCount}
        </Text>
      </Pressable>
      <View className="flex-row items-center gap-1.5">
        <Ionicons name="chatbubble-outline" size={13} color={colors.textSecondary} />
        <Text className="font-body-semibold text-[12.5px]" style={{ color: colors.textSecondary }}>
          {post.replyCount}
        </Text>
      </View>
    </View>
  );
}

function FeedRow({ post, reacted, onToggleReaction }: { post: FeedPost; reacted: boolean; onToggleReaction: () => void }) {
  const isSystem = post.kind === "system";
  const payload = (post.payload ?? {}) as Record<string, string | number | undefined>;
  const photoUrl = post.authorPhotoPath ? supabase.storage.from("avatars").getPublicUrl(post.authorPhotoPath).data.publicUrl : null;
  const tag = PTAG[post.kind];
  const isQuestion = post.kind === "question";

  if (isSystem) {
    const isCard = payload.event === "game_published" || payload.event === "game_filled";
    return isCard ? <SystemGameCard post={post} /> : <SystemRow post={post} />;
  }

  return (
    <Pressable
      disabled={!isQuestion}
      onPress={() => {
        haptics.tick();
        router.push(`/post/${post.id}`);
      }}
      style={{ paddingHorizontal: 24, paddingVertical: 16, gap: 9 }}
    >
      <View className="flex-row items-center gap-2.5">
        <Avatar id={post.authorId ?? post.id} name={post.authorDisplayName ?? "Player"} color={avatarColor(post.authorId ?? post.id)} size={34} photoUri={photoUrl} avatarKey={post.authorAvatarKey} />
        <View className="flex-1 min-w-0">
          <Text className="font-body-bold text-[14px]" style={{ color: colors.text }} numberOfLines={1}>
            {post.authorDisplayName}
          </Text>
          <Text className="text-[12px] font-body-semibold" style={{ color: colors.textTertiary }}>
            {relativeTime(post.createdAt)}
          </Text>
        </View>
        {tag && (
          <View className="rounded-pill px-2 py-1" style={{ backgroundColor: tag.bg }}>
            <Text className="font-body-extrabold" style={{ fontSize: 10, color: tag.fg, letterSpacing: 0.3 }}>
              {tag.label}
            </Text>
          </View>
        )}
      </View>

      <Text className="text-[14.5px]" style={{ color: colors.textDim, lineHeight: 21 }}>
        {post.body}
      </Text>

      {post.kind === "looking_for_players" && (
        <>
          <View className="rounded-xl px-3 py-2 flex-row items-center gap-2.5" style={{ backgroundColor: colors.cardAlt }}>
            <View className="w-[7px] h-[7px] rounded-full" style={{ backgroundColor: colors.intermediate }} />
            <Text className="flex-1 font-body-bold text-[13px]" style={{ color: colors.text }} numberOfLines={1}>
              {(payload.venue_name as string) ?? post.venueName ?? "Venue TBC"}
              {payload.starts_at ? ` · ${dayLabel(payload.starts_at as string)} ${formatTimeShort(payload.starts_at as string)}` : ""}
            </Text>
          </View>
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              haptics.tap();
              turnIntoGame(post);
            }}
            className="self-start rounded-pill px-3.5 py-2 flex-row items-center gap-1.5"
            style={{ backgroundColor: colors.accent }}
          >
            <Ionicons name="add-circle-outline" size={14} color={colors.base} />
            <Text className="font-body-bold text-[12px]" style={{ color: colors.base }}>
              Turn this into a game
            </Text>
          </Pressable>
        </>
      )}

      <ReactionStrip post={post} reacted={reacted} onToggle={onToggleReaction} />
    </Pressable>
  );
}

function FilterChipsRow({
  mode,
  onChangeMode,
  activeCount,
  chips,
  onPressFilters,
}: {
  mode: "nearby" | "following";
  onChangeMode: (m: "nearby" | "following") => void;
  activeCount: number;
  chips: { key: string; label: string; onClear: () => void }[];
  onPressFilters: () => void;
}) {
  return (
    <View style={{ position: "relative" }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: LAYOUT.SCREEN_PAD, paddingBottom: 12, alignItems: "center" }}
      >
        <SegmentedToggle
          options={[
            { key: "nearby" as const, label: "Nearby" },
            { key: "following" as const, label: "Following" },
          ]}
          value={mode}
          onChange={onChangeMode}
        />
        <Pressable
          onPress={onPressFilters}
          className="flex-row items-center gap-1.5 rounded-pill pl-3 pr-3.5 py-2 border"
          style={{ backgroundColor: colors.surfaceAlt, borderColor: colors.cardBorder }}
        >
          <Ionicons name="options-outline" size={14} color={colors.text} />
          <Text className="font-body-bold text-[12.5px]" style={{ color: colors.text }}>
            Filters
          </Text>
          {activeCount > 0 && (
            <View className="rounded-full items-center justify-center" style={{ width: 17, height: 17, backgroundColor: colors.accent }}>
              <Text className="font-body-extrabold" style={{ fontSize: 10.5, color: colors.base }}>
                {activeCount}
              </Text>
            </View>
          )}
        </Pressable>
        {chips.slice(0, 2).map((c) => (
          <Pressable key={c.key} onPress={c.onClear} className="flex-row items-center gap-1.5 rounded-pill px-3 py-2" style={{ backgroundColor: colors.accent }}>
            <Text className="font-body-bold text-[12.5px]" style={{ color: colors.base }}>
              {c.label}
            </Text>
            <Ionicons name="close" size={13} color={colors.base} />
          </Pressable>
        ))}
      </ScrollView>
      <LinearGradient
        pointerEvents="none"
        colors={["transparent", colors.base]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ position: "absolute", right: 0, top: 0, bottom: 12, width: 28 }}
      />
    </View>
  );
}

function FeedFiltersSheet({ visible, onClose, postCount }: { visible: boolean; onClose: () => void; postCount: number }) {
  const { feedMode, setFeedMode, feedKindFilters, toggleFeedKindFilter, feedRadiusKm, setFeedRadiusKm, clearFeedFilters } = useAppStore();

  return (
    <Sheet visible={visible} onClose={onClose} title="Filters">
      <View className="gap-4 mt-1">
        <View className="flex-row justify-between items-center">
          <Text className="font-display text-[18px]" style={{ color: colors.text }}>
            Filters
          </Text>
          <Text className="text-[13px] font-body-bold" style={{ color: colors.textSecondary }}>
            {postCount} post{postCount === 1 ? "" : "s"}
          </Text>
        </View>

        <View className="gap-2">
          <Text className="text-[12.5px] font-body-bold" style={{ color: colors.textTertiary }}>
            SHOW
          </Text>
          <SegmentedToggle
            fullWidth
            options={[
              { key: "nearby" as const, label: "Nearby" },
              { key: "following" as const, label: "Following" },
            ]}
            value={feedMode}
            onChange={setFeedMode}
          />
        </View>

        <View className="gap-2">
          <Text className="text-[12.5px] font-body-bold" style={{ color: colors.textTertiary }}>
            POST TYPE · MULTI-SELECT
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {KIND_OPTIONS.map((k) => (
              <Chip key={k.key} label={k.label} active={feedKindFilters.includes(k.key)} onPress={() => toggleFeedKindFilter(k.key)} size="sm" />
            ))}
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-[12.5px] font-body-bold" style={{ color: colors.textTertiary }}>
            DISTANCE
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {FEED_RADIUS_OPTIONS_KM.map((km) => (
              <Chip key={km} label={`${km} km`} active={feedRadiusKm === km} onPress={() => setFeedRadiusKm(km)} size="sm" />
            ))}
          </View>
        </View>

        <View className="flex-row gap-2.5 mt-1">
          <Pressable onPress={clearFeedFilters} className="flex-1 rounded-pill py-3 items-center border" style={{ borderColor: colors.cardBorder }}>
            <Text className="font-body-bold text-[14px]" style={{ color: colors.textSecondary }}>
              Reset all
            </Text>
          </Pressable>
          <Pressable onPress={onClose} className="flex-1 rounded-pill py-3 items-center" style={{ backgroundColor: colors.accent }}>
            <Text className="font-body-extrabold text-[14px]" style={{ color: colors.base }}>
              Done
            </Text>
          </Pressable>
        </View>
      </View>
    </Sheet>
  );
}

function SuggestedFollowRow({ player }: { player: { id: string; displayName: string; photoPath: string | null; avatarKey: string | null; homeSuburb: string | null; skillTierLabel: string | null } }) {
  const followPlayer = useFollowPlayer();
  const [followed, setFollowed] = useState(false);
  const photoUrl = player.photoPath ? supabase.storage.from("avatars").getPublicUrl(player.photoPath).data.publicUrl : null;
  const line = [player.homeSuburb ? `Plays near ${player.homeSuburb}` : null, player.skillTierLabel].filter(Boolean).join(" · ");

  return (
    <View className="flex-row items-center gap-3" style={{ height: 60 }}>
      <Avatar id={player.id} name={player.displayName} color={avatarColor(player.id)} size={32} photoUri={photoUrl} avatarKey={player.avatarKey} />
      <View className="flex-1 min-w-0">
        <Text className="font-body-bold text-[13.5px]" style={{ color: colors.text }} numberOfLines={1}>
          {player.displayName}
        </Text>
        {!!line && (
          <Text className="text-[11.5px] mt-0.5" style={{ color: colors.textSecondary }} numberOfLines={1}>
            {line}
          </Text>
        )}
      </View>
      <Pressable
        disabled={followed || followPlayer.isPending}
        onPress={() => {
          haptics.tap();
          setFollowed(true);
          followPlayer.mutate(player.id, { onError: () => setFollowed(false) });
        }}
        className="rounded-pill px-3.5 py-2"
        style={{ backgroundColor: followed ? colors.surfaceAlt : colors.surfaceAlt, borderWidth: 1, borderColor: colors.cardBorder, opacity: followed ? 0.6 : 1 }}
      >
        <Text className="font-body-bold text-[12px]" style={{ color: colors.text }}>
          {followed ? "Following" : "Follow"}
        </Text>
      </Pressable>
    </View>
  );
}

function ColdStartEmpty({ location }: { location: { lat: number; lng: number } }) {
  const suggestedQuery = useSuggestedFollows(location);
  const suggested = suggestedQuery.data ?? [];

  return (
    <View>
      <EmptyState
        character="quokka-shelf"
        title="Nothing here yet"
        subtitle="No one nearby has posted. Find a game tonight, or follow players to see what they're up to."
        ctaLabel="Find a game"
        onCta={() => router.push("/(tabs)/discover")}
      />
      {suggested.length > 0 && (
        <View className="px-6 mt-6">
          <Text className="text-[12.5px] font-body-bold uppercase mb-2" style={{ color: colors.textTertiary, letterSpacing: 0.6 }}>
            Suggested players to follow
          </Text>
          <View className="rounded-2xl px-3.5 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
            {suggested.map((p, i) => (
              <View key={p.id}>
                <SuggestedFollowRow player={p} />
                {i < suggested.length - 1 && <View className="h-px" style={{ backgroundColor: colors.cardBorder }} />}
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function FilteredEmpty({
  location,
  activeFilterLabel,
}: {
  location: { lat: number; lng: number };
  activeFilterLabel: string;
}) {
  // Relaxed pools (D5-style ladder, kept simple for Feed): unfiltered kinds at the same radius,
  // and the widest radius with the same kinds/mode — each an honest count, capped by page size.
  const { feedMode, feedKindFilters, feedRadiusKm, setFeedKindFilters, setFeedRadiusKm } = useAppStore();
  const widerRadius = FEED_RADIUS_OPTIONS_KM[FEED_RADIUS_OPTIONS_KM.length - 1];
  const anyKindQuery = useFeedHome(location, { mode: feedMode, kinds: [], radiusKm: feedRadiusKm });
  const widerRadiusQuery = useFeedHome(location, { mode: feedMode, kinds: feedKindFilters, radiusKm: widerRadius });
  const anyKindCount = anyKindQuery.data?.pages.flat().length ?? 0;
  const widerRadiusCount = widerRadiusQuery.data?.pages.flat().length ?? 0;

  const rungs: { key: string; label: string; onPress: () => void }[] = [];
  if (feedKindFilters.length > 0 && anyKindCount > 0) {
    rungs.push({
      key: "anykind",
      label: `${anyKindCount}${anyKindQuery.hasNextPage ? "+" : ""} post${anyKindCount === 1 ? "" : "s"} of any type nearby`,
      onPress: () => setFeedKindFilters([]),
    });
  }
  if (feedRadiusKm < widerRadius && widerRadiusCount > 0) {
    rungs.push({
      key: "widerradius",
      label: `${widerRadiusCount}${widerRadiusQuery.hasNextPage ? "+" : ""} post${widerRadiusCount === 1 ? "" : "s"} within ${widerRadius}km`,
      onPress: () => setFeedRadiusKm(widerRadius),
    });
  }

  return (
    <View className="items-center gap-3 pt-8 px-6">
      <Ionicons name="search-outline" size={32} color={colors.textTertiary} />
      <Text className="font-display-bold text-[19px] text-center" style={{ color: colors.text }}>
        Nothing matches right now
      </Text>
      <Text className="text-[13.5px] text-center max-w-[280px] leading-5" style={{ color: colors.textSecondary }}>
        {activeFilterLabel} near you are quiet right now. Try loosening a filter.
      </Text>
      {rungs.length > 0 && (
        <View className="w-full rounded-2xl px-4 border mt-1" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
          {rungs.map((r, i) => (
            <Pressable key={r.key} onPress={r.onPress} className="flex-row items-center justify-between" style={{ height: 56, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.cardBorder }}>
              <Text className="flex-1 font-body-bold text-[14px]" style={{ color: colors.text }}>
                {r.label}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Pressable>
          ))}
        </View>
      )}
      <View className="w-full mt-2">
        <Button label="Post something" onPress={() => router.push("/compose")} />
      </View>
    </View>
  );
}

export default function Feed() {
  const tabBarSpace = useTabBarSpace();
  const location = useUserLocation();
  const { feedMode, setFeedMode, feedKindFilters, setFeedKindFilters, feedRadiusKm, clearFeedFilters } = useAppStore();
  const feedQuery = useFeedHome(location, { mode: feedMode, kinds: feedKindFilters, radiusKm: feedRadiusKm });
  const posts = useMemo(() => feedQuery.data?.pages.flat() ?? [], [feedQuery.data]);
  const { session } = useSession();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const composeGuard = useRef(false);

  const reactedQuery = useMyReactedPostIds(
    posts.filter((p) => p.kind !== "system").map((p) => p.id),
    { enabled: !!session }
  );
  const toggleReaction = useToggleReaction();

  useEffect(() => {
    track("feed_viewed");
  }, []);

  const advancedCount = (feedKindFilters.length > 0 ? 1 : 0) + (feedRadiusKm !== DEFAULT_FEED_RADIUS_KM ? 1 : 0);
  const activeChips = [
    feedKindFilters.length > 0
      ? {
          key: "kind",
          label: feedKindFilters.length === 1 ? KIND_OPTIONS.find((k) => k.key === feedKindFilters[0])?.label ?? "Type" : `${feedKindFilters.length} types`,
          onClear: () => setFeedKindFilters([]),
        }
      : null,
    feedRadiusKm !== DEFAULT_FEED_RADIUS_KM ? { key: "radius", label: `${feedRadiusKm}km`, onClear: () => useAppStore.getState().setFeedRadiusKm(DEFAULT_FEED_RADIUS_KM) } : null,
  ].filter((c): c is { key: string; label: string; onClear: () => void } => c !== null);

  const isFiltered = feedMode !== "nearby" || advancedCount > 0;
  const activeFilterLabel = feedKindFilters.length === 1 ? KIND_OPTIONS.find((k) => k.key === feedKindFilters[0])?.label ?? "Posts" : "Posts";

  return (
    <Screen>
      <View className="flex-row items-center justify-between px-5 pt-3 pb-3.5">
        <View>
          <Text className="font-display text-[26px]" style={{ color: colors.text }}>
            Feed
          </Text>
          <Text className="text-[12.5px] font-body-bold mt-0.5" style={{ color: colors.textSecondary }}>
            Near you · {feedRadiusKm}km
          </Text>
        </View>
        {session && (
          <Pressable
            onPress={() => {
              if (composeGuard.current) return;
              composeGuard.current = true;
              setTimeout(() => {
                composeGuard.current = false;
              }, 600);
              haptics.tap();
              router.push("/compose");
            }}
            className="w-9 h-9 rounded-full items-center justify-center"
            style={{ backgroundColor: colors.accent }}
            testID="feed-compose"
            accessibilityRole="button"
            accessibilityLabel="New post"
          >
            <Ionicons name="send" size={15} color={colors.base} style={{ marginLeft: -1, marginTop: 1 }} />
          </Pressable>
        )}
      </View>

      <FilterChipsRow mode={feedMode} onChangeMode={setFeedMode} activeCount={advancedCount} chips={activeChips} onPressFilters={() => setFiltersOpen(true)} />

      {feedQuery.isLoading ? (
        <View className="items-center justify-center py-16">
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : posts.length === 0 ? (
        isFiltered ? <FilteredEmpty location={location} activeFilterLabel={activeFilterLabel} /> : <ColdStartEmpty location={location} />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <FeedRow post={item} reacted={reactedQuery.data?.has(item.id) ?? false} onToggleReaction={() => toggleReaction.mutate(item.id)} />
          )}
          ItemSeparatorComponent={() => <View className="h-px" style={{ backgroundColor: colors.cardBorder, marginHorizontal: 24 }} />}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: tabBarSpace + NAV.FAB_RISE }}
          onEndReached={() => feedQuery.hasNextPage && feedQuery.fetchNextPage()}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={feedQuery.isRefetching} onRefresh={() => feedQuery.refetch()} tintColor={colors.accent} />}
          ListFooterComponent={feedQuery.isFetchingNextPage ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} /> : null}
        />
      )}

      <FeedFiltersSheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} postCount={posts.length} />
    </Screen>
  );
}
