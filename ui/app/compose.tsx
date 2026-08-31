import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Alert, ActivityIndicator, Platform } from "react-native";
import { router } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors, tierColor } from "../lib/theme";
import { Screen } from "../components/Screen";
import { BackButton } from "../components/BackButton";
import { SegmentedToggle } from "../components/SegmentedToggle";
import { useVenuesDirectory } from "../lib/queries/venues";
import { useSkillTiers } from "../lib/queries/sports";
import { useCreatePost } from "../lib/queries/feed";
import { SPORT_SLUG } from "../lib/queries/games";
import { haptics } from "../lib/haptics";

type Kind = "looking_for_players" | "question";

const BODY_LIMIT = 280;

// social-plan.md B2 — the composer, last and riskiest slice of the feed release.
// looking_for_players ships as the default tab (§13.1: "ships before plain text, build the flow
// that justifies the feature first"). Text only — no images, no comments (both cut to B3).
export default function Compose() {
  const [kind, setKind] = useState<Kind>("looking_for_players");
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

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedVenueQuery(venueQuery.trim()), 350);
    return () => clearTimeout(handle);
  }, [venueQuery]);

  const venuesQuery = useVenuesDirectory({ search: debouncedVenueQuery || undefined });
  const tiersQuery = useSkillTiers(SPORT_SLUG);
  const createPost = useCreatePost();

  const canSubmit = body.trim().length > 0 && (kind === "question" || !!venueId) && !createPost.isPending;

  const submit = async () => {
    haptics.tap();
    try {
      await createPost.mutateAsync(
        kind === "looking_for_players"
          ? { kind, body: body.trim(), venueId: venueId!, startsAt, skillTierLabel: tierLabel ?? undefined, maxPlayers: 4 }
          : { kind, body: body.trim() }
      );
      haptics.success();
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
              { key: "looking_for_players" as const, label: "Looking for players" },
              { key: "question" as const, label: "Ask a question" },
            ]}
          />
        </View>

        <View className="px-5 mb-4">
          <TextInput
            value={body}
            onChangeText={(t) => setBody(t.slice(0, BODY_LIMIT))}
            placeholder={kind === "looking_for_players" ? "Anyone free at NBC Thursday 8pm?" : "Best stringing tension for a beginner racquet?"}
            placeholderTextColor={colors.textTertiary}
            multiline
            className="rounded-2xl p-4 border text-[15px]"
            style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder, color: colors.text, minHeight: 100, textAlignVertical: "top" }}
          />
          <Text className="text-[11px] mt-1 text-right" style={{ color: colors.textMuted }}>
            {body.length}/{BODY_LIMIT}
          </Text>
        </View>

        {kind === "looking_for_players" && (
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

        {venueId && kind === "looking_for_players" && (
          <View className="mx-5 rounded-2xl p-3.5 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
            <Text className="text-[12px]" style={{ color: colors.textSecondary }}>
              This posts to the local feed. Anyone can reply "I'm in" by turning it into a game.
            </Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
