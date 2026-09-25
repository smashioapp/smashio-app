import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Alert, ActivityIndicator, Platform, Image } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import { colors, tierColor } from "../lib/theme";
import { Screen } from "../components/Screen";
import { BackButton } from "../components/BackButton";
import { SegmentedToggle } from "../components/SegmentedToggle";
import { useVenuesDirectory } from "../lib/queries/venues";
import { useSkillTiers } from "../lib/queries/sports";
import { useCreatePost, MAX_POST_PHOTOS, type PickedPhoto } from "../lib/queries/feed";
import { SPORT_SLUG } from "../lib/queries/games";
import { useCreateAlert } from "../lib/queries/alerts";
import { useProfileSports } from "../lib/queries/profile";
import { useSession } from "../lib/session";
import { useUserLocation } from "../lib/location";
import { useAppStore } from "../lib/store";
import { SPOT_ALERT_RADIUS_KM } from "../lib/alertPool";
import { haptics } from "../lib/haptics";

type Kind = "looking_for_players" | "question";

const BODY_LIMIT = 280;

// social-plan.md B2 — the composer, last and riskiest slice of the feed release.
// looking_for_players ships as the default tab (§13.1: "ships before plain text, build the flow
// that justifies the feature first"). Up to 4 photos on either kind (B3a, image-moderation-plan
// IM3); create_post classifies them server-side before anything publishes.
// D-U5 (short-a-player-ux-plan.md §7): "Looking for players" forked two different people. With a
// court, the default is a game (roster, trust signals, spot alerts); the text post is the fallback.
// Without one, it's "Looking for a game", and posting also saves an alert so the post turns into a
// ping the moment a matching spot opens.
export default function Compose() {
  const [kind, setKind] = useState<Kind>("looking_for_players");
  const [hasCourt, setHasCourt] = useState<boolean | null>(null);
  const [textWithCourt, setTextWithCourt] = useState(false);
  const [body, setBody] = useState("");
  const [venueId, setVenueId] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState<Date>(() => {
    const d = new Date();
    d.setHours(d.getHours() + 3, 0, 0, 0);
    return d;
  });
  const [showPicker, setShowPicker] = useState(false);
  const [tierLabel, setTierLabel] = useState<string | null>(null);
  const [venueQuery, setVenueQuery] = useState("");
  const [debouncedVenueQuery, setDebouncedVenueQuery] = useState("");
  const [selectedVenueName, setSelectedVenueName] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedVenueQuery(venueQuery.trim()), 350);
    return () => clearTimeout(handle);
  }, [venueQuery]);

  const venuesQuery = useVenuesDirectory({ search: debouncedVenueQuery || undefined });
  const tiersQuery = useSkillTiers(SPORT_SLUG);
  const createPost = useCreatePost();
  const createAlert = useCreateAlert();
  const { session } = useSession();
  const profileSportsQuery = useProfileSports(session?.user.id);
  const location = useUserLocation();

  const lookingForGame = kind === "looking_for_players" && hasCourt === false;
  const showForm = kind === "question" || lookingForGame || (hasCourt === true && textWithCourt);
  const canSubmit = showForm && body.trim().length > 0 && (kind === "question" || !!venueId) && !createPost.isPending;

  const postAsGame = () => {
    haptics.tap();
    const v = (venuesQuery.data ?? []).find((x) => x.id === venueId);
    if (v) useAppStore.getState().setHostHereSeed({ venueId: v.id, venueName: v.name, venueSuburb: v.suburb, venueAddress: `${v.suburb}, ${v.state}` });
    router.replace("/wizard");
  };

  const pickPhotos = async () => {
    const remaining = MAX_POST_PHOTOS - photos.length;
    if (remaining <= 0) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo access so you can add photos to your post.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });
    if (result.canceled) return;
    haptics.tick();
    setPhotos((prev) =>
      [...prev, ...result.assets.map((a) => ({ uri: a.uri, width: a.width, height: a.height }))].slice(0, MAX_POST_PHOTOS)
    );
  };

  const submit = async () => {
    haptics.tap();
    try {
      const result = await createPost.mutateAsync(
        kind === "looking_for_players"
          ? { kind, body: body.trim(), venueId: venueId!, startsAt, skillTierLabel: tierLabel ?? undefined, maxPlayers: 4, photos }
          : { kind, body: body.trim(), photos }
      );
      if (lookingForGame) {
        // Best effort: the post is up either way. Centred on the venue they named, else on them.
        const v = (venuesQuery.data ?? []).find((x) => x.id === venueId);
        const tierSlug =
          (tiersQuery.data ?? []).find((t) => t.label === tierLabel)?.slug ??
          (profileSportsQuery.data?.[0]?.skill_tiers as { slug: string } | null)?.slug ??
          null;
        await createAlert
          .mutateAsync({
            tierSlugs: tierSlug ? [tierSlug] : [],
            radiusKm: SPOT_ALERT_RADIUS_KM,
            center: v ? { lat: v.lat, lng: v.lng } : { lat: location.lat, lng: location.lng },
          })
          .catch(() => {});
      }
      haptics.success();
      if (result.photosDropped > 0) {
        Alert.alert("Posted, but without your photos", "We couldn't check your photos in time. Give them another go.");
      } else if (result.photosInReview > 0) {
        Alert.alert(
          "Posted",
          result.photosInReview === 1
            ? "One of your photos is being checked. It'll show for everyone once it's sorted."
            : "A few of your photos are being checked. They'll show for everyone once they're sorted."
        );
      }
      router.back();
    } catch (e) {
      Alert.alert("Couldn't post that", e instanceof Error ? e.message : "Give it another go.");
    }
  };

  return (
    <Screen>
      <View className="flex-row items-center justify-between px-5 pt-2 pb-3">
        <View className="flex-row items-center gap-3">
          <BackButton onPress={() => router.back()} />
          <Text className="font-display text-[18px]" style={{ color: colors.text }}>
            New post
          </Text>
        </View>
        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          className="rounded-pill px-4 py-2"
          style={{ backgroundColor: canSubmit ? colors.accent : colors.surfaceAlt, opacity: canSubmit ? 1 : 0.6 }}
        >
          {createPost.isPending ? (
            <ActivityIndicator size="small" color={colors.base} />
          ) : (
            <Text className="font-body-extrabold text-[13px]" style={{ color: canSubmit ? colors.base : colors.textTertiary }}>
              Post
            </Text>
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View className="px-5 mb-4">
          <SegmentedToggle
            fullWidth
            value={kind}
            onChange={setKind}
            options={[
              { key: "looking_for_players" as const, label: hasCourt === false ? "Looking for a game" : "Looking for players" },
              { key: "question" as const, label: "Ask a question" },
            ]}
          />
        </View>

        {kind === "looking_for_players" && hasCourt === null && (
          <View className="px-5 mb-4 gap-2.5">
            <Text className="font-body-bold text-[12px] uppercase" style={{ color: colors.textTertiary, letterSpacing: 0.5 }}>
              Got a court?
            </Text>
            <Pressable
              testID="compose-has-court"
              onPress={() => {
                haptics.tap();
                setHasCourt(true);
              }}
              className="rounded-2xl p-4 border flex-row items-center gap-3"
              style={{ backgroundColor: colors.card, borderColor: "rgba(214,255,63,0.3)" }}
            >
              <Ionicons name="flash-outline" size={18} color={colors.accent} />
              <View className="flex-1">
                <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
                  Yep, I've got a court
                </Text>
                <Text className="text-[12.5px] mt-0.5" style={{ color: colors.textSecondary }}>
                  Short a player or two
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} />
            </Pressable>
            <Pressable
              testID="compose-no-court"
              onPress={() => {
                haptics.tap();
                setHasCourt(false);
              }}
              className="rounded-2xl p-4 border flex-row items-center gap-3"
              style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}
            >
              <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
              <View className="flex-1">
                <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
                  No, I'm after a game
                </Text>
                <Text className="text-[12.5px] mt-0.5" style={{ color: colors.textSecondary }}>
                  Tell people you're keen, and we'll ping you when a spot opens
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} />
            </Pressable>
          </View>
        )}

        {/* short-a-player-plan S6 (A14, D3), now the default: a booked court belongs in a game,
            where it gets the roster, the trust signals and spot alerts. */}
        {kind === "looking_for_players" && hasCourt === true && !textWithCourt && (
          <View className="px-5 mb-4 gap-3">
            <Pressable
              testID="compose-post-as-game"
              onPress={postAsGame}
              className="rounded-pill py-4 items-center flex-row justify-center gap-2"
              style={{ backgroundColor: colors.accent }}
            >
              <Ionicons name="flash" size={16} color={colors.base} />
              <Text className="font-body-extrabold text-[15px]" style={{ color: colors.base }}>
                Post as a game, nearby players get pinged
              </Text>
            </Pressable>
            <Pressable onPress={() => setTextWithCourt(true)} className="items-center py-1">
              <Text className="font-body-bold text-[13px]" style={{ color: colors.textSecondary }}>
                Or just post it to the feed
              </Text>
            </Pressable>
          </View>
        )}

        {showForm && (
        <View className="px-5 mb-4">
          <TextInput
            value={body}
            onChangeText={(t) => setBody(t.slice(0, BODY_LIMIT))}
            placeholder={
              kind === "question"
                ? "Best stringing tension for a beginner racquet?"
                : lookingForGame
                  ? "Keen for a hit around Homebush Thursday night"
                  : "Anyone free at NBC Thursday 8pm?"
            }
            placeholderTextColor={colors.textTertiary}
            multiline
            className="rounded-2xl p-4 border text-[15px]"
            style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder, color: colors.text, minHeight: 100, textAlignVertical: "top" }}
          />
          <Text className="text-[11px] mt-1 text-right" style={{ color: colors.textMuted }}>
            {body.length}/{BODY_LIMIT}
          </Text>
        </View>
        )}

        {showForm && (
        <View className="px-5 mb-4">
          <View className="flex-row flex-wrap gap-2">
            {photos.map((p, i) => (
              <View key={p.uri} style={{ width: 72, height: 72 }}>
                <Image source={{ uri: p.uri }} style={{ width: 72, height: 72, borderRadius: 12 }} resizeMode="cover" />
                <Pressable
                  onPress={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute w-6 h-6 rounded-full items-center justify-center"
                  style={{ top: -6, right: -6, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.cardBorder }}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                >
                  <Ionicons name="close" size={13} color={colors.text} />
                </Pressable>
              </View>
            ))}
            {photos.length < MAX_POST_PHOTOS && (
              <Pressable
                onPress={pickPhotos}
                className="rounded-xl items-center justify-center border"
                style={{ width: 72, height: 72, borderColor: colors.cardBorder, borderStyle: "dashed", backgroundColor: colors.surface }}
                testID="compose-add-photos"
                accessibilityRole="button"
                accessibilityLabel="Add photos"
              >
                <Ionicons name="image-outline" size={20} color={colors.textSecondary} />
                <Text className="font-body-bold text-[10.5px] mt-1" style={{ color: colors.textSecondary }}>
                  {photos.length === 0 ? "Add photos" : `${photos.length}/${MAX_POST_PHOTOS}`}
                </Text>
              </Pressable>
            )}
          </View>
          {photos.length > 0 && (
            <Text className="text-[11.5px] mt-2" style={{ color: colors.textMuted }}>
              We check photos before they go up. Location data gets stripped.
            </Text>
          )}
        </View>
        )}

        {kind === "looking_for_players" && showForm && (
          <>
            <View className="px-5 mb-4">
              <Text className="font-body-bold text-[12px] uppercase mb-2" style={{ color: colors.textTertiary, letterSpacing: 0.5 }}>
                Venue
              </Text>
              {venueId ? (
                <Pressable
                  onPress={() => {
                    setVenueId(null);
                    setSelectedVenueName(null);
                    setVenueQuery("");
                  }}
                  className="rounded-pill self-start px-3.5 py-2 border flex-row items-center gap-1.5"
                  style={{ backgroundColor: colors.accent, borderColor: colors.accent }}
                >
                  <Text className="font-body-bold text-[13px]" style={{ color: colors.base }}>
                    {selectedVenueName}
                  </Text>
                  <Text className="font-body-bold text-[13px]" style={{ color: colors.base }}>
                    ×
                  </Text>
                </Pressable>
              ) : (
                <>
                  <TextInput
                    value={venueQuery}
                    onChangeText={setVenueQuery}
                    placeholder="Search venues (e.g. NBC, Homebush)"
                    placeholderTextColor={colors.textTertiary}
                    className="rounded-2xl px-4 py-3 border text-[14px]"
                    style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder, color: colors.text }}
                  />
                  <View className="mt-2 gap-1.5">
                    {(venuesQuery.data ?? []).slice(0, 8).map((v) => (
                      <Pressable
                        key={v.id}
                        onPress={() => {
                          setVenueId(v.id);
                          setSelectedVenueName(v.name);
                        }}
                        className="rounded-xl px-3.5 py-2.5 border"
                        style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder }}
                      >
                        <Text className="font-body-bold text-[13.5px]" style={{ color: colors.text }}>
                          {v.name}
                        </Text>
                        <Text className="text-[11.5px] mt-0.5" style={{ color: colors.textMuted }}>
                          {v.suburb}
                        </Text>
                      </Pressable>
                    ))}
                    {venuesQuery.isFetching && (venuesQuery.data ?? []).length === 0 && (
                      <ActivityIndicator size="small" color={colors.accent} style={{ marginTop: 8 }} />
                    )}
                    {!venuesQuery.isFetching && debouncedVenueQuery.length > 0 && (venuesQuery.data ?? []).length === 0 && (
                      <Text className="text-[11.5px] mt-1" style={{ color: colors.textMuted }}>
                        No venues match "{debouncedVenueQuery}".
                      </Text>
                    )}
                  </View>
                  <Text className="text-[11.5px] mt-1.5" style={{ color: colors.textMuted }}>
                    Pick a venue so hosts nearby can find this.
                  </Text>
                </>
              )}
            </View>

            <View className="px-5 mb-4">
              <Text className="font-body-bold text-[12px] uppercase mb-2" style={{ color: colors.textTertiary, letterSpacing: 0.5 }}>
                When
              </Text>
              <Pressable
                onPress={() => setShowPicker(true)}
                className="rounded-2xl px-4 py-3 border flex-row items-center justify-between"
                style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder }}
              >
                <Text className="font-body-semibold text-[14px]" style={{ color: colors.text }}>
                  {startsAt.toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                </Text>
              </Pressable>
              {showPicker && (
                <DateTimePicker
                  value={startsAt}
                  mode="datetime"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(_, date) => {
                    setShowPicker(Platform.OS === "ios");
                    if (date) setStartsAt(date);
                  }}
                />
              )}
            </View>

            <View className="px-5 mb-4">
              <Text className="font-body-bold text-[12px] uppercase mb-2" style={{ color: colors.textTertiary, letterSpacing: 0.5 }}>
                Level (optional)
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {(tiersQuery.data ?? []).map((t) => {
                  const c = tierColor(t.label);
                  const selected = tierLabel === t.label;
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() => setTierLabel(selected ? null : t.label)}
                      className="rounded-pill px-3 py-1.5 border"
                      style={{ backgroundColor: selected ? c + "33" : "transparent", borderColor: selected ? c : colors.cardBorder }}
                    >
                      <Text className="font-body-bold text-[12.5px]" style={{ color: selected ? c : colors.textSecondary }}>
                        {t.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </>
        )}

        {venueId && kind === "looking_for_players" && showForm && (
          <View className="mx-5 rounded-2xl p-3.5 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
            <Text className="text-[12px]" style={{ color: colors.textSecondary }}>
              {lookingForGame
                ? "This posts to the local feed, and we'll ping you when a spot opens at your level near here."
                : "This posts to the local feed. Anyone can reply \"I'm in\" by turning it into a game."}
            </Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
