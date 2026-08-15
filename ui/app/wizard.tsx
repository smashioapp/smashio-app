import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, Alert, Image, TextInput, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { MAX_COST_PER_PLAYER_PER_HOUR, MAX_COURTS_BOOKED, MIN_COURTS_BOOKED, useAppStore } from "../lib/store";
import { colors, gradients, TIERS } from "../lib/theme";
import { formatDate, formatTimeRange, formatTimeShort } from "../lib/format";
import { MAX_DURATION_HOURS, MIN_DURATION_HOURS, TIME_OPTIONS, dateOptions, durationMs, isSlotBookable, slotAt } from "../lib/schedule";
import { useUpsertPlaceVenue } from "../lib/queries/venues";
import { useSkillTiers, useSports } from "../lib/queries/sports";
import { useAttachConfirmation, useCreateGame, useParseConfirmation, useUploadConfirmation, type ParsedBooking } from "../lib/queries/games";
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

// Host flow plan (docs/host-flow-plan.md): step 0 asks for a booking confirmation photo before
// anything else. Manual keeps the original 6-step flow untouched; receipt replaces
// venue+date+upload with a single review step, since the parse already answered those.
const MANUAL_STEP_KEYS = ["venue", "datetime", "level", "price", "upload", "success"] as const;
const RECEIPT_STEP_KEYS = ["review", "level", "price", "success"] as const;
const EMPTY_STEP_KEYS: readonly string[] = [];
const SPORT_SLUG = "badminton";

// Loose "do these names refer to the same place" check for auto-accepting the top Places
// prediction against what Claude read off the receipt — real venue-name matching (chain
// branches, abbreviations) is out of scope; this just guards against confidently picking a
// venue that shares nothing with what the receipt said.
function sharesToken(a: string, b: string): boolean {
  const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2));
  const wordsA = words(a);
  for (const w of words(b)) if (wordsA.has(w)) return true;
  return false;
}

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
  const {
    wizard,
    resetWizard,
    selectVenue,
    setStartsAt,
    selectWizardTier,
    incPlayers,
    decPlayers,
    incCourts,
    decCourts,
    incHours,
    decHours,
    incCost,
    decCost,
    setMaxPlayers,
    setCourtsBooked,
    setDurationHours,
    setCost,
  } = useAppStore();

  const { data: sports = [] } = useSports();
  const { data: tiers = [] } = useSkillTiers(SPORT_SLUG);
  const { data: popularVenues = [] } = useVenues();
  const createGame = useCreateGame();
  const uploadConfirmation = useUploadConfirmation();
  const parseConfirmation = useParseConfirmation();
  const attachConfirmation = useAttachConfirmation();
  const upsertPlaceVenue = useUpsertPlaceVenue();

  const [confirmationUri, setConfirmationUri] = useState<string | null>(null);
  const [createdGameId, setCreatedGameId] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Receipt-first flow state (host-flow-plan.md). entryMode is null until the host picks a
  // path on the entry screen; parsing is a transient overlay between "picked a photo" and
  // "landed on the review step" (or fell back to manual on a failure-ladder branch).
  const [entryMode, setEntryMode] = useState<"manual" | "receipt" | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedBooking | null>(null);
  const [draftConfirmationId, setDraftConfirmationId] = useState<string | null>(null);
  const [parsedSlot, setParsedSlot] = useState<Date | null>(null);
  const [venueAutoResolved, setVenueAutoResolved] = useState(false);
  const [editedFields, setEditedFields] = useState<Set<string>>(new Set());
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
  const [priceSuggestionApplied, setPriceSuggestionApplied] = useState(false);

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
      setCourtsBooked(seed.courtsBooked);
      setDurationHours(seed.durationHours);
      setCost(seed.cost);
      setSelectedVenue({ name: seed.venueName, suburb: seed.venueSuburb, address: seed.venueAddress });
      setVenueQuery(seed.venueName);
      setEntryMode("manual");
    } else if (hostHereSeed) {
      // Discover map's dim "no games here" pin (map-plan.md §5.10) — only the venue is known,
      // everything else starts at the wizard's normal defaults.
      useAppStore.getState().clearHostHereSeed();
      resetWizard();
      selectVenue(hostHereSeed.venueId);
      setSelectedVenue({ name: hostHereSeed.venueName, suburb: hostHereSeed.venueSuburb, address: hostHereSeed.venueAddress });
      setVenueQuery(hostHereSeed.venueName);
      setVenueResults([]);
      setEntryMode("manual");
    } else {
      resetWizard();
      setVenueQuery("");
      setVenueResults([]);
      setSelectedVenue(null);
      setEntryMode(null);
    }
    setConfirmationUri(null);
    setCreatedGameId(null);
    setVerified(false);
    setParsing(false);
    setParsedData(null);
    setDraftConfirmationId(null);
    setParsedSlot(null);
    setVenueAutoResolved(false);
    setEditedFields(new Set());
    setExpandedFields(new Set());
    setPriceSuggestionApplied(false);
    setStep(0);
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

  const stepKeys = entryMode === "manual" ? MANUAL_STEP_KEYS : entryMode === "receipt" ? RECEIPT_STEP_KEYS : EMPTY_STEP_KEYS;
  const currentKey = stepKeys[step];
  const publishStepIndex = stepKeys.length - 2;
  const successStepIndex = stepKeys.length - 1;

  const venue = selectedVenue;
  const maxCost = wizard.durationHours * MAX_COST_PER_PLAYER_PER_HOUR;
  // The store's default slot is 7pm today, which is already gone if you open the wizard in the
  // evening — block Continue rather than letting a past-dated game reach the DB.
  const startInPast = !isSlotBookable(wizard.startsAt, wizard.startsAt.getHours(), wizard.startsAt.getMinutes());
  const nextDisabled =
    (currentKey === "venue" && !wizard.venueId) ||
    (currentKey === "datetime" && startInPast) ||
    (currentKey === "review" && (!wizard.venueId || startInPast));
  const endsAt = new Date(wizard.startsAt.getTime() + durationMs(wizard.durationHours));

  // Price suggestion (host-flow-plan.md §Cost/price suggestion): opens the price step on
  // ceil(total ÷ players), applied once so a later manual edit isn't clobbered by re-entering
  // the step or bumping the player count.
  const suggestedCost = parsedData?.total_cost_aud
    ? Math.min(maxCost, Math.max(1, Math.ceil(parsedData.total_cost_aud / wizard.maxPlayers)))
    : null;
  useEffect(() => {
    if (currentKey === "price" && entryMode === "receipt" && suggestedCost !== null && !priceSuggestionApplied) {
      setCost(suggestedCost);
      setPriceSuggestionApplied(true);
    }
  }, [currentKey, entryMode, suggestedCost, priceSuggestionApplied]);

  const markEdited = (field: string) => setEditedFields((s) => new Set(s).add(field));
  const toggleExpanded = (field: string) =>
    setExpandedFields((s) => {
      const next = new Set(s);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  const bumpCourts = (dir: 1 | -1) => {
    markEdited("for");
    if (dir === 1) incCourts();
    else decCourts();
  };
  const bumpHours = (dir: 1 | -1) => {
    markEdited("for");
    if (dir === 1) incHours();
    else decHours();
  };

  const goBack = () => {
    if (entryMode === null) {
      router.back();
      return;
    }
    if (step !== 0) {
      setStep(step - 1);
      return;
    }
    if (entryMode === "manual" && !venueQuery.trim() && !selectedVenue) {
      setEntryMode(null);
      return;
    }
    Alert.alert(
      entryMode === "receipt" ? "Discard this booking confirmation?" : "Discard match setup?",
      entryMode === "receipt" ? "You'll lose the details we read from your photo." : "You'll lose your venue search.",
      [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => setEntryMode(null) },
      ],
    );
  };

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
      markEdited("venue");
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
    markEdited("venue");
  };

  // host-flow-plan.md §Venue resolution: feed the parsed venue name (+ address) to Places, take
  // the top prediction only if it shares a token with what was read — otherwise don't guess,
  // drop into the normal search with the query prefilled. Returns whether it auto-resolved, so
  // the caller can decide whether the review step's venue row starts expanded.
  const resolveVenueFromParsed = async (parsed: ParsedBooking): Promise<boolean> => {
    if (!parsed.venue_name) return false;
    setVenueQuery(parsed.venue_name);
    setVenueResolving(true);
    try {
      const query = [parsed.venue_name, parsed.venue_address].filter(Boolean).join(", ");
      const results = await searchPlaces(query, sessionTokenRef.current);
      const top = results[0];
      if (top && sharesToken(top.mainText, parsed.venue_name)) {
        const details = await getPlaceDetails(top.placeId, sessionTokenRef.current);
        const venueId = await upsertPlaceVenue.mutateAsync(details);
        selectVenue(venueId);
        setSelectedVenue({ name: details.name, suburb: details.suburb, address: details.address });
        setVenueQuery(details.name);
        setVenueResults([]);
        sessionTokenRef.current = newSessionToken();
        setVenueAutoResolved(true);
        return true;
      }
      setVenueResults(results);
      setVenueAutoResolved(false);
      return false;
    } catch {
      setVenueAutoResolved(false);
      return false;
    } finally {
      setVenueResolving(false);
    }
  };

  const pickConfirmationForParse = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo access to upload your booking confirmation.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setConfirmationUri(asset.uri);
    setParsing(true);
    try {
      const { confirmation_id, parsed } = await parseConfirmation.mutateAsync({
        localUri: asset.uri,
        width: asset.width,
        height: asset.height,
      });
      if (!parsed.is_booking_confirmation) {
        // Failure ladder #1: not a booking confirmation — manual path, draft discarded.
        setParsing(false);
        setConfirmationUri(null);
        Alert.alert("That doesn't look like a court booking", "Want to type it in instead?", [
          {
            text: "Type it in",
            onPress: () => {
              resetWizard();
              setEntryMode("manual");
            },
          },
        ]);
        return;
      }

      setParsedData(parsed);
      setDraftConfirmationId(confirmation_id);
      if (parsed.courts) {
        setCourtsBooked(Math.min(MAX_COURTS_BOOKED, Math.max(MIN_COURTS_BOOKED, parsed.courts)));
      }
      if (parsed.starts_at_local && parsed.ends_at_local) {
        const start = new Date(parsed.starts_at_local);
        const end = new Date(parsed.ends_at_local);
        const hours = Math.ceil((end.getTime() - start.getTime()) / 3_600_000);
        if (hours > 0) setDurationHours(Math.min(MAX_DURATION_HOURS, Math.max(MIN_DURATION_HOURS, hours)));
      }

      let dateApplied = false;
      if (parsed.starts_at_local) {
        const slot = new Date(parsed.starts_at_local);
        if (!isNaN(slot.getTime())) {
          setParsedSlot(slot);
          // Failure ladder #6: a parsed date in the past is surfaced, never silently applied.
          if (isSlotBookable(slot, slot.getHours(), slot.getMinutes())) {
            setStartsAt(slot);
            dateApplied = true;
          }
        }
      }

      const venueResolved = await resolveVenueFromParsed(parsed);

      const expanded = new Set<string>();
      if (!venueResolved) expanded.add("venue"); // failure ladder #5
      if (!dateApplied) expanded.add("when");
      setExpandedFields(expanded);

      setParsing(false);
      setEntryMode("receipt");
      setStep(0);
    } catch (e) {
      // Failure ladder #2: parse errored or timed out — manual path, photo stays attached and
      // still verifies via the legacy upload-at-publish path (confirmationUri is already set).
      setParsing(false);
      Alert.alert("Couldn't read that one", "Your photo's saved — type the details and we'll still verify.", [
        {
          text: "OK",
          onPress: () => {
            setEntryMode("manual");
          },
        },
      ]);
    }
  };

  const pickConfirmationManual = async () => {
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
        courtsBooked: wizard.courtsBooked,
        durationHours: wizard.durationHours,
        costPerPlayerCents: Math.round(wizard.cost * 100),
      });
    } catch (e) {
      haptics.error();
      Alert.alert("Couldn't publish match", e instanceof Error ? e.message : "Try again.");
      setPublishing(false);
      return;
    }
    // Match is live at this point — a failure below is only the (best-effort) verification
    // step, so it must not surface as a publish failure or block the success screen.
    setCreatedGameId(id);
    if (draftConfirmationId) {
      try {
        await attachConfirmation.mutateAsync({ confirmationId: draftConfirmationId, gameId: id });
        setVerified(parsedData?.is_booking_confirmation === true);
      } catch (e) {
        haptics.error();
        Alert.alert(
          "Match published",
          "Your booking confirmation couldn't be attached, so the match isn't verified yet. You can try again from the match page."
        );
      }
    } else if (confirmationUri) {
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
    if (step === successStepIndex) {
      router.back();
      return;
    }
    if (step === publishStepIndex) {
      publish();
      return;
    }
    setStep(step + 1);
  };

  const nextLabel = step === successStepIndex ? "Let's go!" : step === publishStepIndex ? "Publish match" : "Continue";

  // A parsed datetime is a first-class value (host-flow-plan.md §Date/time fidelity) — injected
  // into both option lists as an extra chip alongside the standard ones, never snapped onto the
  // nearest existing one. Only offered when it's actually still bookable; a past parsed slot is
  // surfaced via the "already passed" copy below instead of being selectable.
  const parsedSlotBookable = parsedSlot != null && isSlotBookable(parsedSlot, parsedSlot.getHours(), parsedSlot.getMinutes());
  const parsedDateExtra =
    parsedSlot && parsedSlotBookable && !dateOptions().some((d) => d.date.toDateString() === parsedSlot.toDateString())
      ? { label: formatDate(parsedSlot.toISOString()), date: new Date(parsedSlot.getFullYear(), parsedSlot.getMonth(), parsedSlot.getDate()) }
      : null;
  const parsedTimeExtra =
    parsedSlot && parsedSlotBookable && !TIME_OPTIONS.some((t) => t.h === parsedSlot.getHours() && t.m === parsedSlot.getMinutes())
      ? { label: formatTimeShort(parsedSlot.toISOString()), h: parsedSlot.getHours(), m: parsedSlot.getMinutes() }
      : null;

  const renderVenuePicker = () => (
    <View>
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
                markEdited("venue");
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
  );

  const renderDateTimePicker = () => (
    <View>
      {parsedSlot && !parsedSlotBookable && (
        <View className="rounded-2xl px-3.5 py-3 mb-3.5 border" style={{ backgroundColor: "rgba(255,182,72,0.1)", borderColor: "rgba(255,182,72,0.3)" }}>
          <Text className="text-[13px]" style={{ color: colors.advanced }}>
            Your confirmation said {formatDate(parsedSlot.toISOString())} at {formatTimeShort(parsedSlot.toISOString())}, but
            that's already passed — pick a new time below.
          </Text>
        </View>
      )}
      <Label>Date</Label>
      <View className="flex-row flex-wrap gap-2 mb-5">
        {dateOptions().map(({ label, date }) => {
          const active = date.toDateString() === wizard.startsAt.toDateString();
          return (
            <Chip
              key={label}
              label={label}
              active={active}
              onPress={() => {
                setStartsAt(slotAt(date, wizard.startsAt.getHours(), wizard.startsAt.getMinutes()));
                markEdited("when");
              }}
            />
          );
        })}
        {parsedDateExtra && (
          <Chip
            label={parsedDateExtra.label}
            active={parsedDateExtra.date.toDateString() === wizard.startsAt.toDateString()}
            onPress={() => setStartsAt(slotAt(parsedDateExtra.date, wizard.startsAt.getHours(), wizard.startsAt.getMinutes()))}
          />
        )}
      </View>
      <Label>Time slot</Label>
      <View className="flex-row flex-wrap gap-2">
        {TIME_OPTIONS.map(({ label, h, m }) => {
          const active = wizard.startsAt.getHours() === h && wizard.startsAt.getMinutes() === m;
          const bookable = isSlotBookable(wizard.startsAt, h, m);
          return (
            <View key={label} style={{ opacity: bookable ? 1 : 0.35 }}>
              <Chip
                label={label}
                active={active && bookable}
                onPress={() => {
                  if (!bookable) return;
                  setStartsAt(slotAt(wizard.startsAt, h, m));
                  markEdited("when");
                }}
              />
            </View>
          );
        })}
        {parsedTimeExtra && (
          <Chip
            label={parsedTimeExtra.label}
            active={wizard.startsAt.getHours() === parsedTimeExtra.h && wizard.startsAt.getMinutes() === parsedTimeExtra.m}
            onPress={() => setStartsAt(slotAt(wizard.startsAt, parsedTimeExtra.h, parsedTimeExtra.m))}
          />
        )}
      </View>
      {startInPast && (
        <Text className="text-[13.5px] mt-3.5" style={{ color: colors.advanced }}>
          That slot has already passed today. Pick a later time or another day.
        </Text>
      )}
    </View>
  );

  const renderTierAndPlayers = () => (
    <View>
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
  );

  const renderCourtsDurationControls = () => (
    <View>
      <Label style={{ marginTop: 20 }}>Courts booked</Label>
      <View className="flex-row items-center justify-center gap-6 rounded-2xl p-4.5 mb-5 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
        <Stepper onPress={() => bumpCourts(-1)} icon="remove" disabled={wizard.courtsBooked <= MIN_COURTS_BOOKED} />
        <Text className="font-display text-[28px]" style={{ color: colors.accent }}>
          {wizard.courtsBooked}
        </Text>
        <Stepper onPress={() => bumpCourts(1)} icon="add" disabled={wizard.courtsBooked >= MAX_COURTS_BOOKED} />
      </View>

      <Label>Duration (hours)</Label>
      <View className="flex-row items-center justify-center gap-6 rounded-2xl p-4.5 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
        <Stepper onPress={() => bumpHours(-1)} icon="remove" disabled={wizard.durationHours <= MIN_DURATION_HOURS} />
        <Text className="font-display text-[28px]" style={{ color: colors.accent }}>
          {wizard.durationHours}
        </Text>
        <Stepper onPress={() => bumpHours(1)} icon="add" disabled={wizard.durationHours >= MAX_DURATION_HOURS} />
      </View>
    </View>
  );

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

      {entryMode !== null && !parsing && <StepProgress step={step} count={stepKeys.length} />}

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 20 }}>
        {parsing && (
          <View className="items-center pt-24 gap-4">
            <ActivityIndicator size="large" color={colors.accent} />
            <Text className="font-body-bold text-[15px]" style={{ color: colors.textSecondary }}>
              Reading your booking confirmation…
            </Text>
          </View>
        )}

        {!parsing && entryMode === null && (
          <View>
            <StepIcon name="camera" />
            <StepHeading title="Got a booking confirmation?" subtitle="Upload the photo and we'll fill in the venue, time and price for you." />
            <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} className="rounded-pill mb-3">
              <Pressable onPress={pickConfirmationForParse} className="py-4 items-center flex-row justify-center gap-2">
                <Ionicons name="camera" size={17} color={colors.base} />
                <Text className="font-body-extrabold text-[16.5px]" style={{ color: colors.base }}>
                  Upload a photo
                </Text>
              </Pressable>
            </LinearGradient>
            <Pressable
              onPress={() => {
                resetWizard();
                setEntryMode("manual");
              }}
              className="items-center py-3.5"
            >
              <Text className="font-body-bold text-[14.5px]" style={{ color: colors.textSecondary }}>
                I'll type it in instead →
              </Text>
            </Pressable>
          </View>
        )}

        {!parsing && currentKey === "venue" && (
          <View>
            <StepIcon name="location" />
            <StepHeading title="Pick your court" subtitle="Search for the venue you've booked." />
            {renderVenuePicker()}
          </View>
        )}

        {!parsing && currentKey === "datetime" && (
          <View>
            <StepIcon name="calendar" />
            <StepHeading title="When's it on?" subtitle="Lock in a day and time that suits the squad." />
            {renderDateTimePicker()}
          </View>
        )}

        {!parsing && currentKey === "review" && (
          <View>
            <StepIcon name="receipt" />
            <StepHeading title="Here's what we read" subtitle="Check the details before we set up the rest." />
            {confirmationUri && <Image source={{ uri: confirmationUri }} className="w-full h-40 rounded-2xl mb-3.5" resizeMode="cover" />}
            {parsedData?.confidence === "low" && (
              <View className="rounded-2xl px-3.5 py-3 mb-3.5 border" style={{ backgroundColor: "rgba(255,182,72,0.1)", borderColor: "rgba(255,182,72,0.3)" }}>
                <Text className="text-[13px]" style={{ color: colors.advanced }}>
                  We're not totally sure we read this right — double check the details below.
                </Text>
              </View>
            )}

            <ReviewField
              label="Venue"
              value={selectedVenue?.name ?? null}
              tag={venueAutoResolved && !editedFields.has("venue")}
              expanded={expandedFields.has("venue")}
              onToggle={() => toggleExpanded("venue")}
            >
              {renderVenuePicker()}
            </ReviewField>

            <ReviewField
              label="When"
              value={!startInPast ? `${formatDate(wizard.startsAt.toISOString())} · ${formatTimeShort(wizard.startsAt.toISOString())}` : null}
              tag={!editedFields.has("when") && !startInPast && parsedSlot != null}
              expanded={expandedFields.has("when")}
              onToggle={() => toggleExpanded("when")}
            >
              {renderDateTimePicker()}
            </ReviewField>

            <ReviewField
              label="For"
              value={`${wizard.durationHours}h · ${wizard.courtsBooked} court${wizard.courtsBooked === 1 ? "" : "s"}`}
              tag={!editedFields.has("for") && (parsedData?.courts != null || parsedData?.ends_at_local != null)}
              expanded={expandedFields.has("for")}
              onToggle={() => toggleExpanded("for")}
            >
              {renderCourtsDurationControls()}
            </ReviewField>

            {parsedData?.total_cost_aud != null && (
              <View className="rounded-2xl px-3.5 py-3 flex-row justify-between items-center border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
                <Text className="text-[13.5px]" style={{ color: colors.textSecondary }}>
                  You paid
                </Text>
                <Text className="font-body-bold text-[15px]" style={{ color: colors.text }}>
                  ${Math.round(parsedData.total_cost_aud)}
                </Text>
              </View>
            )}
          </View>
        )}

        {!parsing && currentKey === "level" && (
          <View>
            <StepIcon name="ribbon" />
            <StepHeading title="Set the level" subtitle="Match players at the right intensity." />
            {renderTierAndPlayers()}
            {entryMode === "manual" && renderCourtsDurationControls()}
          </View>
        )}

        {!parsing && currentKey === "price" && (
          <View>
            <StepIcon name="cash" />
            <StepHeading title="Price per player" subtitle="Set what each player pays — your call, not an even split." />
            {entryMode === "receipt" && parsedData?.total_cost_aud != null && suggestedCost != null && (
              <View className="rounded-2xl p-3.5 mb-3.5 border" style={{ backgroundColor: "rgba(214,255,63,0.08)", borderColor: "rgba(214,255,63,0.2)" }}>
                <Text className="text-[13.5px]" style={{ color: colors.textSecondary }}>
                  Your booking was ${Math.round(parsedData.total_cost_aud)}. At {wizard.maxPlayers} players that's ${suggestedCost} each —
                  you'd cover it.
                </Text>
              </View>
            )}
            <View className="flex-row items-center justify-center gap-6 rounded-2xl p-5 mb-4 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
              <Stepper onPress={decCost} icon="remove" disabled={wizard.cost <= 1} />
              <Text className="font-display text-[30px]" style={{ color: colors.accent }}>
                ${wizard.cost}
              </Text>
              <Stepper onPress={incCost} icon="add" disabled={wizard.cost >= maxCost} />
            </View>
            <View
              className="rounded-2xl p-4 flex-row justify-between items-center border"
              style={{ backgroundColor: "rgba(214,255,63,0.1)", borderColor: "rgba(214,255,63,0.25)" }}
            >
              <Text className="text-[14.5px] font-body-bold" style={{ color: colors.accent }}>
                If full · {wizard.maxPlayers} players
              </Text>
              <Text className="font-display-bold text-[20px]" style={{ color: colors.accent }}>
                ${wizard.cost * wizard.maxPlayers}
              </Text>
            </View>
            <Text className="text-[13px] mt-3" style={{ color: colors.textMuted }}>
              Capped at ${MAX_COST_PER_PLAYER_PER_HOUR}/hour · ${maxCost} max for this {wizard.durationHours}h booking.
            </Text>
          </View>
        )}

        {!parsing && currentKey === "upload" && (
          <View>
            <StepIcon name="shield-checkmark" />
            <StepHeading
              title="Lock it in"
              subtitle="Upload your booking confirmation and other players see a Verified badge on your game."
            />
            <Pressable
              onPress={pickConfirmationManual}
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

        {!parsing && currentKey === "success" && (
          <PublishStamp active={currentKey === "success"}>
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

      {entryMode !== null && !parsing && (
        <View className="px-5 pb-8 pt-3.5">
          {nextDisabled ? (
            <View className="rounded-pill py-4 items-center" style={{ backgroundColor: colors.surfaceAlt }}>
              <Text className="font-body-extrabold text-[16.5px]" style={{ color: colors.textMuted }}>
                {nextLabel}
              </Text>
            </View>
          ) : (
            <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} className="rounded-pill">
              <Pressable onPress={goNext} disabled={publishing} className="py-4 items-center" style={{ opacity: publishing ? 0.6 : 1 }}>
                <Text className="font-body-extrabold text-[16.5px]" style={{ color: colors.base }}>
                  {publishing ? "Publishing…" : nextLabel}
                </Text>
              </Pressable>
            </LinearGradient>
          )}
        </View>
      )}
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

function Stepper({
  onPress,
  icon,
  disabled = false,
}: {
  onPress: () => void;
  icon: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="w-[38px] h-[38px] rounded-full items-center justify-center"
      style={{ backgroundColor: colors.surfaceAlt, opacity: disabled ? 0.4 : 1 }}
    >
      <Ionicons name={icon} size={16} color={colors.text} />
    </Pressable>
  );
}

// Review step field (host-flow-plan.md §Review step details): label + value + "from your
// confirmation" tag, tappable to reveal the same picker used on the equivalent manual step.
// Editing clears the tag (handled by the caller via editedFields) so provenance stays visible.
function ReviewField({
  label,
  value,
  tag,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  value: string | null;
  tag: boolean;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View
      className="rounded-2xl px-3.5 py-3.5 mb-3 border-[1.5px]"
      style={{ backgroundColor: colors.card, borderColor: value ? "rgba(255,255,255,0.07)" : colors.advanced }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-2">
          <Text className="font-body-extrabold text-[11.5px] uppercase" style={{ color: colors.textTertiary }}>
            {label}
          </Text>
          {value ? (
            <Text className="font-body-bold text-[15.5px] mt-1" style={{ color: colors.text }}>
              {value}
            </Text>
          ) : (
            <Text className="text-[14px] mt-1" style={{ color: colors.advanced }}>
              Needs your input
            </Text>
          )}
          {tag && (
            <View className="rounded-pill self-start px-2 py-0.5 mt-1.5" style={{ backgroundColor: "rgba(214,255,63,0.15)" }}>
              <Text className="font-body-extrabold text-[10px] uppercase" style={{ color: colors.accent }}>
                From your confirmation
              </Text>
            </View>
          )}
        </View>
        <Pressable onPress={onToggle} hitSlop={8}>
          <Text className="font-body-bold text-[13px]" style={{ color: colors.accent }}>
            {expanded ? "Done" : value ? "Change" : "Set"}
          </Text>
        </Pressable>
      </View>
      {expanded && (
        <View className="mt-3.5 pt-3.5 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          {children}
        </View>
      )}
    </View>
  );
}
