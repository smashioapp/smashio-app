import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, Alert, Image, TextInput, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useAppStore } from "../lib/store";
import { colors, gradients, TIERS } from "../lib/theme";
import { formatDate, formatTimeRange } from "../lib/format";
import { GAME_DURATION_MS, TIME_OPTIONS, dateOptions, isSlotBookable, slotAt } from "../lib/schedule";
import { useUpsertPlaceVenue } from "../lib/queries/venues";
import { useSkillTiers, useSports } from "../lib/queries/sports";
import { useCreateGame, useUploadConfirmation } from "../lib/queries/games";
import { newSessionToken, searchPlaces, getPlaceDetails, type PlacePrediction } from "../lib/places";
import { useVenues } from "../lib/queries/venues";
import { Chip } from "../components/Chip";
import { StepProgress } from "../components/StepProgress";
import { Burst } from "../components/Burst";
import { haptics } from "../lib/haptics";
import { SPRING, useReduceMotion } from "../lib/motion";
import Animated, {
  Easing,
  FadeInUp,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const STEP_COUNT = 6;
const NEXT_LABELS = ["Continue", "Continue", "Continue", "Continue", "Publish match", "Let's go!"];
const SPORT_SLUG = "badminton";

// Layers the publish moment: two lines sweep in from the edges, the checkmark stamps
// with an overshoot + rotation whip, a burst fires at peak, then the summary card
// slides up from underneath rather than fading in. Runs once when `active` flips true.
function PublishStamp({ active, children }: { active: boolean; children: React.ReactNode }) {
  const reduceMotion = useReduceMotion();
  const lineLeft = useSharedValue(0);
  const lineRight = useSharedValue(0);
  const checkScale = useSharedValue(0.3);
  const checkRotate = useSharedValue(-14);
  const cardY = useSharedValue(36);
  const cardOpacity = useSharedValue(0);
  const [circleSize, setCircleSize] = useState<{ width: number; height: number } | null>(null);
  const [showBurst, setShowBurst] = useState(false);

  useEffect(() => {
    if (!active) return;
    if (reduceMotion) {
      lineLeft.value = 1;
      lineRight.value = 1;
      checkScale.value = 1;
      checkRotate.value = 0;
      cardY.value = 0;
      cardOpacity.value = 1;
      return;
    }

    lineLeft.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
    lineRight.value = withDelay(60, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));

    checkScale.value = withDelay(
      160,
      withSequence(
        withTiming(1.3, { duration: 180, easing: Easing.out(Easing.quad) }, (done) => {
          if (done) runOnJS(setShowBurst)(true);
        }),
        withSpring(0.95, SPRING.pop),
        withSpring(1, SPRING.settle),
      ),
    );
    checkRotate.value = withDelay(
      160,
      withSequence(withTiming(-12, { duration: 120 }), withTiming(6, { duration: 140 }), withSpring(0, SPRING.settle)),
    );

    cardY.value = withDelay(420, withSpring(0, SPRING.settle));
    cardOpacity.value = withDelay(420, withTiming(1, { duration: 320 }));
  }, [active, reduceMotion]);

  useEffect(() => {
    if (!showBurst) return;
    haptics.burst();
  }, [showBurst]);

  const lineLeftStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: lineLeft.value }] }));
  const lineRightStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: lineRight.value }] }));
  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }, { rotate: `${checkRotate.value}deg` }],
  }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardY.value }],
  }));

  return (
    <View className="items-center gap-3.5 pt-3.5">
      <View style={{ width: "100%", height: 30, justifyContent: "center" }} pointerEvents="none">
        <Animated.View
          style={[
            { position: "absolute", left: 0, width: "50%", height: 2, backgroundColor: colors.accent, opacity: 0.5, transformOrigin: "left" },
            lineLeftStyle,
          ]}
        />
        <Animated.View
          style={[
            { position: "absolute", right: 0, width: "50%", height: 2, backgroundColor: colors.accent, opacity: 0.5, transformOrigin: "right" },
            lineRightStyle,
          ]}
        />
      </View>

      <View
        onLayout={(e) => setCircleSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        style={{ width: 72, height: 72 }}
      >
        <Animated.View
          className="w-[72px] h-[72px] rounded-full items-center justify-center"
          style={[{ backgroundColor: "rgba(214,255,63,0.15)" }, checkStyle]}
        >
          <Ionicons name="checkmark" size={30} color={colors.accent} />
        </Animated.View>
        {showBurst && circleSize && (
          <Burst
            origin={{ x: circleSize.width / 2, y: circleSize.height / 2 }}
            onDone={() => setShowBurst(false)}
          />
        )}
      </View>

      <Animated.Text entering={FadeInUp.delay(150).duration(300)} className="font-display text-[23.5px]" style={{ color: colors.text }}>
        You're hosting!
      </Animated.Text>

      <Animated.View style={[{ width: "100%" }, cardStyle]}>{children}</Animated.View>
    </View>
  );
}

export default function Wizard() {
  const [step, setStep] = useState(0);
  const { wizard, resetWizard, selectVenue, setStartsAt, selectWizardTier, incPlayers, decPlayers, incCost, decCost, setMaxPlayers, setCost } =
    useAppStore();

  const { data: sports = [] } = useSports();
  const { data: tiers = [] } = useSkillTiers(SPORT_SLUG);
  const { data: popularVenues = [] } = useVenues();
  const createGame = useCreateGame();
  const uploadConfirmation = useUploadConfirmation();
  const upsertPlaceVenue = useUpsertPlaceVenue();

  const [confirmationUri, setConfirmationUri] = useState<string | null>(null);
  const [createdGameId, setCreatedGameId] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [venueQuery, setVenueQuery] = useState("");
  const [venueResults, setVenueResults] = useState<PlacePrediction[]>([]);
  const [venueSearching, setVenueSearching] = useState(false);
  const [venueResolving, setVenueResolving] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<{ name: string; suburb: string; address: string } | null>(null);
  const sessionTokenRef = useRef(newSessionToken());

  useEffect(() => {
    // Rebook (my-games-plan.md §M4) seeds the draft before navigating here — consume it once
    // instead of the usual resetWizard, and seed the venue step's local display state too,
    // since that's held outside the store (see RebookSeed's comment in store.ts).
    const seed = useAppStore.getState().rebookSeed;
    const hostHereSeed = useAppStore.getState().hostHereSeed;
    if (seed) {
      useAppStore.getState().clearRebookSeed();
      selectVenue(seed.venueId);
      setStartsAt(seed.startsAt);
      selectWizardTier(seed.skill);
      setMaxPlayers(seed.maxPlayers);
      setCost(seed.cost);
      setSelectedVenue({ name: seed.venueName, suburb: seed.venueSuburb, address: seed.venueAddress });
      setVenueQuery(seed.venueName);
    } else if (hostHereSeed) {
      // Discover map's dim "no games here" pin (map-plan.md §5.10) — only the venue is known,
      // everything else starts at the wizard's normal defaults.
      useAppStore.getState().clearHostHereSeed();
      resetWizard();
      selectVenue(hostHereSeed.venueId);
      setSelectedVenue({ name: hostHereSeed.venueName, suburb: hostHereSeed.venueSuburb, address: hostHereSeed.venueAddress });
      setVenueQuery(hostHereSeed.venueName);
      setVenueResults([]);
    } else {
      resetWizard();
      setVenueQuery("");
      setVenueResults([]);
      setSelectedVenue(null);
    }
    setConfirmationUri(null);
    setCreatedGameId(null);
    setVerified(false);
    sessionTokenRef.current = newSessionToken();
  }, []);

  useEffect(() => {
    if (selectedVenue) return; // don't re-search right after picking a result
    const handle = setTimeout(async () => {
      if (venueQuery.trim().length < 3) {
        setVenueResults([]);
        return;
      }
      setVenueSearching(true);
      try {
        const results = await searchPlaces(venueQuery, sessionTokenRef.current);
        setVenueResults(results);
      } catch (e) {
        // Search errors surface as an empty result list — the input stays usable.
      } finally {
        setVenueSearching(false);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [venueQuery, selectedVenue]);

  const pickVenue = async (prediction: PlacePrediction) => {
    setVenueResolving(true);
    try {
      const details = await getPlaceDetails(prediction.placeId, sessionTokenRef.current);
      const venueId = await upsertPlaceVenue.mutateAsync(details);
      selectVenue(venueId);
      setSelectedVenue({ name: details.name, suburb: details.suburb, address: details.address });
      setVenueResults([]);
      setVenueQuery(details.name);
      sessionTokenRef.current = newSessionToken();
    } catch (e) {
      Alert.alert("Couldn't load that venue", e instanceof Error ? e.message : "Try again.");
    } finally {
      setVenueResolving(false);
    }
  };

  const changeVenueQuery = (text: string) => {
    setVenueQuery(text);
    if (selectedVenue) {
      setSelectedVenue(null);
      selectVenue("");
    }
  };

  const venue = selectedVenue;
  const perPlayer = (wizard.cost / wizard.maxPlayers).toFixed(0);
  // The store's default slot is 7pm today, which is already gone if you open the wizard in the
  // evening — block Continue rather than letting a past-dated game reach the DB.
  const startInPast = !isSlotBookable(wizard.startsAt, wizard.startsAt.getHours(), wizard.startsAt.getMinutes());
  const nextDisabled = (step === 0 && !wizard.venueId) || (step === 1 && startInPast);
  const endsAt = new Date(wizard.startsAt.getTime() + GAME_DURATION_MS);

  const goBack = () => {
    if (step !== 0) {
      setStep(step - 1);
      return;
    }
    if (!venueQuery.trim() && !selectedVenue) {
      router.back();
      return;
    }
    Alert.alert("Discard match setup?", "You'll lose your venue search.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.back() },
    ]);
  };

  const pickConfirmation = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo access to upload your booking confirmation.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled) setConfirmationUri(result.assets[0].uri);
  };

  const publish = async () => {
    if (createdGameId) {
      setStep(step + 1);
      return;
    }
    const sport = sports.find((s) => s.slug === SPORT_SLUG);
    const tier = tiers.find((t) => t.label === wizard.skill);
    if (!sport || !tier || !wizard.venueId) {
      Alert.alert("Not ready yet", "Still loading match settings, try again in a moment.");
      return;
    }
    setPublishing(true);
    let id: string;
    try {
      id = await createGame.mutateAsync({
        venueId: wizard.venueId,
        sportId: sport.id,
        skillTierId: tier.id,
        startsAt: wizard.startsAt,
        maxPlayers: wizard.maxPlayers,
        costTotalCents: Math.round(wizard.cost * 100),
      });
    } catch (e) {
      haptics.error();
      Alert.alert("Couldn't publish match", e instanceof Error ? e.message : "Try again.");
      setPublishing(false);
      return;
    }
    // Match is live at this point — a failure below is only the (best-effort) verification
    // upload, so it must not surface as a publish failure or block the success screen.
    setCreatedGameId(id);
    if (confirmationUri) {
      try {
        await uploadConfirmation.mutateAsync({ gameId: id, localUri: confirmationUri });
        setVerified(true);
      } catch (e) {
        haptics.error();
        Alert.alert(
          "Match published",
          "Your booking confirmation couldn't be uploaded, so the match isn't verified yet. You can try again from the match page."
        );
      }
    }
    setStep(step + 1);
    setPublishing(false);
  };

  const goNext = () => {
    if (step === STEP_COUNT - 1) {
      router.back();
      return;
    }
    if (step === 4) {
      publish();
      return;
    }
    setStep(step + 1);
  };

  return (
    <View className="flex-1 pt-14" style={{ backgroundColor: "#08080A" }}>
      <View className="flex-row items-center gap-3 px-5 pb-1">
        <Pressable onPress={goBack} className="w-[34px] h-[34px] rounded-full items-center justify-center" style={{ backgroundColor: "#17171A" }}>
          <Ionicons name="chevron-back" size={16} color={colors.text} />
        </Pressable>
        <Text className="font-display text-[20px]" style={{ color: colors.text }}>
          Host a Match
        </Text>
      </View>

      <StepProgress step={step} count={STEP_COUNT} />

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 20 }}>
        {step === 0 && (
          <View>
            <StepIcon name="location" />
            <StepHeading title="Pick your court" subtitle="Search for the venue you've booked." />
            <View
              className="flex-row items-center gap-2 rounded-2xl px-3.5 border-[1.5px] mb-2"
              style={{ backgroundColor: colors.card, borderColor: selectedVenue ? colors.accent : "rgba(255,255,255,0.07)" }}
            >
              <Ionicons name="search" size={15} color={colors.textMuted} />
              <TextInput
                value={venueQuery}
                onChangeText={changeVenueQuery}
                placeholder="Search venues, courts, sports centres…"
                placeholderTextColor={colors.textMuted}
                className="flex-1 py-3.5 text-[15.5px]"
                style={{ color: colors.text }}
              />
              {(venueSearching || venueResolving) && <ActivityIndicator size="small" color={colors.accent} />}
              {selectedVenue && !venueSearching && !venueResolving && (
                <View className="w-6 h-6 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent }}>
                  <Ionicons name="checkmark" size={13} color={colors.base} />
                </View>
              )}
            </View>

            {!selectedVenue &&
              venueResults.map((p) => (
                <Pressable
                  key={p.placeId}
                  onPress={() => pickVenue(p)}
                  className="flex-row items-center gap-3 rounded-2xl px-3.5 py-3.5 mb-2 border-[1.5px]"
                  style={{ backgroundColor: colors.card, borderColor: "rgba(255,255,255,0.07)" }}
                >
                  <View className="w-1 self-stretch rounded" style={{ backgroundColor: colors.beginner }} />
                  <View className="flex-1">
                    <Text className="font-body-bold text-[15.5px]" style={{ color: colors.text }}>
                      {p.mainText}
                    </Text>
                    <Text className="text-[13.5px] mt-0.5" style={{ color: colors.textSecondary }}>
                      {p.secondaryText}
                    </Text>
                  </View>
                </Pressable>
              ))}

            {!selectedVenue && !venueSearching && venueQuery.trim().length >= 3 && venueResults.length === 0 && (
              <Text className="text-[14.5px] mt-2" style={{ color: colors.textMuted }}>
                No venues found. Try a different search.
              </Text>
            )}

            {!selectedVenue && venueQuery.trim().length === 0 && popularVenues.length > 0 && (
              <View className="mt-1">
                <Label>Popular near you</Label>
                {popularVenues.map((v) => (
                  <Pressable
                    key={v.id}
                    onPress={() => {
                      selectVenue(v.id);
                      setSelectedVenue({ name: v.name, suburb: v.suburb, address: v.address ?? `${v.suburb}, ${v.state}` });
                      setVenueQuery(v.name);
                    }}
                    className="flex-row items-center gap-3 rounded-2xl px-3.5 py-3.5 mb-2 border-[1.5px]"
                    style={{ backgroundColor: colors.card, borderColor: "rgba(255,255,255,0.07)" }}
                  >
                    <View className="w-1 self-stretch rounded" style={{ backgroundColor: colors.intermediate }} />
                    <View className="flex-1">
                      <Text className="font-body-bold text-[15.5px]" style={{ color: colors.text }}>
                        {v.name}
                      </Text>
                      <Text className="text-[13.5px] mt-0.5" style={{ color: colors.textSecondary }}>
                        {v.suburb}, {v.state}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}

            {selectedVenue && (
              <View className="rounded-2xl px-3.5 py-3.5 border-[1.5px]" style={{ backgroundColor: "#1D2416", borderColor: colors.accent }}>
                <Text className="font-body-bold text-[15.5px]" style={{ color: colors.text }}>
                  {selectedVenue.name}
                </Text>
                <Text className="text-[13.5px] mt-0.5" style={{ color: colors.textSecondary }}>
                  {selectedVenue.address}
                </Text>
              </View>
            )}
          </View>
        )}

        {step === 1 && (
          <View>
            <StepIcon name="calendar" />
            <StepHeading title="When's it on?" subtitle="Lock in a day and time that suits the squad." />
            <Label>Date</Label>
            <View className="flex-row flex-wrap gap-2 mb-5">
              {dateOptions().map(({ label, date }) => {
                const active = date.toDateString() === wizard.startsAt.toDateString();
                return (
                  <Chip
                    key={label}
                    label={label}
                    active={active}
                    onPress={() => setStartsAt(slotAt(date, wizard.startsAt.getHours(), wizard.startsAt.getMinutes()))}
                  />
                );
              })}
            </View>
            <Label>Time slot</Label>
            <View className="flex-row flex-wrap gap-2">
              {TIME_OPTIONS.map(({ label, h, m }) => {
                const active = wizard.startsAt.getHours() === h && wizard.startsAt.getMinutes() === m;
                const bookable = isSlotBookable(wizard.startsAt, h, m);
                return (
                  <View key={label} style={{ opacity: bookable ? 1 : 0.35 }}>
                    <Chip label={label} active={active && bookable} onPress={() => bookable && setStartsAt(slotAt(wizard.startsAt, h, m))} />
                  </View>
                );
              })}
            </View>
            {startInPast && (
              <Text className="text-[13.5px] mt-3.5" style={{ color: colors.advanced }}>
                That slot has already passed today. Pick a later time or another day.
              </Text>
            )}
          </View>
        )}

        {step === 2 && (
          <View>
            <StepIcon name="ribbon" />
            <StepHeading title="Set the level" subtitle="Match players at the right intensity." />
            {TIERS.map((t) => {
              const active = wizard.skill === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => selectWizardTier(t.id)}
                  className="flex-row items-center rounded-2xl px-3.5 py-3 mb-2 border-[1.5px]"
                  style={{ backgroundColor: active ? colors.surfaceAlt : colors.surface, borderColor: active ? t.color : "rgba(255,255,255,0.07)" }}
                >
                  <View className="w-2.5 h-2.5 rounded-full mr-2.5" style={{ backgroundColor: t.color }} />
                  <Text className="font-body-extrabold text-[15.5px]" style={{ color: colors.text }}>
                    {t.id}
                  </Text>
                </Pressable>
              );
            })}
            <Label style={{ marginTop: 8 }}>Max players</Label>
            <View className="flex-row items-center justify-center gap-6 rounded-2xl p-4.5 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
              <Stepper onPress={decPlayers} icon="remove" />
              <Text className="font-display text-[28px]" style={{ color: colors.accent }}>
                {wizard.maxPlayers}
              </Text>
              <Stepper onPress={incPlayers} icon="add" />
            </View>
          </View>
        )}

        {step === 3 && (
          <View>
            <StepIcon name="cash" />
            <StepHeading title="Split the cost" subtitle="Court fees, shared evenly, no awkward math." />
            <View className="flex-row items-center justify-center gap-6 rounded-2xl p-5 mb-4 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
              <Stepper onPress={decCost} icon="remove" />
              <Text className="font-display text-[30px]" style={{ color: colors.accent }}>
                ${wizard.cost}
              </Text>
              <Stepper onPress={incCost} icon="add" />
            </View>
            <View
              className="rounded-2xl p-4 flex-row justify-between items-center border"
              style={{ backgroundColor: "rgba(214,255,63,0.1)", borderColor: "rgba(214,255,63,0.25)" }}
            >
              <Text className="text-[14.5px] font-body-bold" style={{ color: colors.accent }}>
                Even split · {wizard.maxPlayers} players
              </Text>
              <Text className="font-display-bold text-[20px]" style={{ color: colors.accent }}>
                ${perPlayer}
              </Text>
            </View>
          </View>
        )}

        {step === 4 && (
          <View>
            <StepIcon name="shield-checkmark" />
            <StepHeading
              title="Lock it in"
              subtitle="Upload your booking confirmation and other players see a Verified badge on your game."
            />
            <Pressable
              onPress={pickConfirmation}
              className="rounded-2xl p-6.5 items-center overflow-hidden"
              style={{
                borderWidth: 2,
                borderStyle: "dashed",
                borderColor: confirmationUri ? colors.intermediate : "rgba(255,255,255,0.2)",
              }}
            >
              {confirmationUri ? (
                <Image source={{ uri: confirmationUri }} className="w-full h-32 rounded-xl mb-2" resizeMode="cover" />
              ) : null}
              <Text className="font-body-bold text-[14.5px]" style={{ color: confirmationUri ? colors.intermediate : colors.textMuted }}>
                {confirmationUri ? "✓ Selected, uploads when you publish" : "Tap to upload confirmation (photo)"}
              </Text>
            </Pressable>
          </View>
        )}

        {step === 5 && (
          <PublishStamp active={step === 5}>
            <View className="items-center gap-3.5">
              <Text className="text-[14.5px] text-center max-w-[230px]" style={{ color: colors.textSecondary }}>
                Your match at {venue?.name ?? "your venue"} is live. Players will start joining any moment.
              </Text>
              <View className="w-full rounded-2xl p-4 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
                <Text className="font-body-bold text-[15.5px]" style={{ color: colors.text }}>
                  {venue?.name ?? "your venue"}
                </Text>
                <Text className="text-[14px] mt-1" style={{ color: colors.textSecondary }}>
                  {formatDate(wizard.startsAt.toISOString())} · {formatTimeRange(wizard.startsAt.toISOString(), endsAt.toISOString())}
                </Text>
                <View
                  className="rounded-pill self-start px-2.5 py-1.5 mt-2.5"
                  style={{ backgroundColor: verified ? "rgba(76,217,100,0.15)" : "rgba(255,182,72,0.15)" }}
                >
                  <Text
                    className="font-body-extrabold text-[11.5px] uppercase"
                    style={{ color: verified ? colors.intermediate : colors.advanced }}
                  >
                    {verified ? "Verified" : "Awaiting booking upload"}
                  </Text>
                </View>
              </View>
            </View>
          </PublishStamp>
        )}
      </ScrollView>

      <View className="px-5 pb-8 pt-3.5">
        {nextDisabled ? (
          <View className="rounded-pill py-4 items-center" style={{ backgroundColor: colors.surfaceAlt }}>
            <Text className="font-body-extrabold text-[16.5px]" style={{ color: colors.textMuted }}>
              {NEXT_LABELS[step]}
            </Text>
          </View>
        ) : (
          <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} className="rounded-pill">
            <Pressable onPress={goNext} disabled={publishing} className="py-4 items-center" style={{ opacity: publishing ? 0.6 : 1 }}>
              <Text className="font-body-extrabold text-[16.5px]" style={{ color: colors.base }}>
                {publishing ? "Publishing…" : NEXT_LABELS[step]}
              </Text>
            </Pressable>
          </LinearGradient>
        )}
      </View>
    </View>
  );
}

function StepIcon({ name }: { name: keyof typeof Ionicons.glyphMap }) {
  return (
    <View className="w-11 h-11 rounded-2xl items-center justify-center mb-3.5" style={{ backgroundColor: "rgba(214,255,63,0.14)" }}>
      <Ionicons name={name} size={20} color={colors.accent} />
    </View>
  );
}

function StepHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View className="mb-4.5">
      <Text className="font-display text-[22.5px] mb-1" style={{ color: colors.text }}>
        {title}
      </Text>
      <Text className="text-[14.5px]" style={{ color: "#8A8A92" }}>
        {subtitle}
      </Text>
    </View>
  );
}

function Label({ children, style }: { children: string; style?: object }) {
  return (
    <Text className="font-body-extrabold text-[13px] uppercase mb-2.5" style={{ color: colors.textTertiary, ...(style ?? {}) }}>
      {children}
    </Text>
  );
}

function Stepper({ onPress, icon }: { onPress: () => void; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <Pressable onPress={onPress} className="w-[38px] h-[38px] rounded-full items-center justify-center" style={{ backgroundColor: colors.surfaceAlt }}>
      <Ionicons name={icon} size={16} color={colors.text} />
    </Pressable>
  );
}
