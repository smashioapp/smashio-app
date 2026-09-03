import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, Alert, Image, TextInput, ActivityIndicator, PanResponder, Share, Platform } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { MAX_COST_PER_PLAYER_PER_HOUR, MAX_COURTS_BOOKED, MAX_PLAYERS, MIN_COURTS_BOOKED, MIN_PLAYERS, useAppStore } from "../lib/store";
import { colors, gradients, TIERS, tierColor, type TierId } from "../lib/theme";
import { formatDate, formatTimeRange, formatTimeShort } from "../lib/format";
import {
  DURATION_STEP_HOURS,
  MAX_DURATION_HOURS,
  MIN_DURATION_HOURS,
  durationMs,
  formatDuration,
  isSlotBookable,
  slotAt,
} from "../lib/schedule";
import { useUpsertPlaceVenue, useVenuesDirectory, confidenceState, type VenueDirectoryRow } from "../lib/queries/venues";
import { useSkillTiers, useSports } from "../lib/queries/sports";
import {
  useAttachConfirmation,
  useCreateGame,
  useParseConfirmation,
  useUploadConfirmationFiles,
  type ParsedBooking,
} from "../lib/queries/games";
import { usePlayerSearch } from "../lib/queries/reservedSpots";
import { newSessionToken, searchPlaces, getPlaceDetails, type PlacePrediction } from "../lib/places";
import { Burst } from "../components/Burst";
import { Glow } from "../components/Glow";
import { PropOverlay } from "../components/PropOverlay";
import { Sheet } from "../components/Sheet";
import { LineupStrip, lineupSummary, type LineupSlot } from "../components/LineupStrip";
import { AccordionRow, PriceSlider, RowLabel, Stepper } from "../components/DraftCardParts";
import { animalFor } from "../lib/avatars";
import { useSession } from "../lib/session";
import { useProfile } from "../lib/queries/profile";
import { haptics } from "../lib/haptics";
import { sound } from "../lib/sound";
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

// Host a Game v3 (docs/create-game-plan.md, design-brief.md Prompt 6/6a/6b). Two moves, not six
// steps: the fork (got a booking confirmation?), then one scrolling draft card that IS the
// GameCard players will see — the host edits the artifact, not a form about it.
const SPORT_SLUG = "badminton";
const COURT_CHIPS = [1, 2, 3, 4, 5, 6];
const DURATION_CHIPS = [1, 1.5, 2, 2.5];

type RowKey = "where" | "when" | "who" | "cost" | null;
type FieldKey = "where" | "when" | "who" | "cost";

function sharesToken(a: string, b: string): boolean {
  const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2));
  const wordsA = words(a);
  for (const w of words(b)) if (wordsA.has(w)) return true;
  return false;
}

function PublishStamp({ active, animalSrc, children }: { active: boolean; animalSrc: number; children: React.ReactNode }) {
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
    sound.play("sparkle");
  }, [showBurst]);

  const lineLeftStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: lineLeft.value }] }));
  const lineRightStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: lineRight.value }] }));
  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: checkScale.value }, { rotate: `${checkRotate.value}deg` }] }));
  const cardStyle = useAnimatedStyle(() => ({ opacity: cardOpacity.value, transform: [{ translateY: cardY.value }] }));

  return (
    <View className="items-center gap-3.5 pt-3.5">
      <View style={{ width: "100%", height: 30, justifyContent: "center" }} pointerEvents="none">
        <Animated.View
          style={[{ position: "absolute", left: 0, width: "50%", height: 2, backgroundColor: colors.accent, opacity: 0.5, transformOrigin: "left" }, lineLeftStyle]}
        />
        <Animated.View
          style={[{ position: "absolute", right: 0, width: "50%", height: 2, backgroundColor: colors.accent, opacity: 0.5, transformOrigin: "right" }, lineRightStyle]}
        />
      </View>
      <View style={{ width: 176, height: 176, margin: -52, alignItems: "center", justifyContent: "center" }}>
        <Glow size={176} intensity={0.3} />
        <View onLayout={(e) => setCircleSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })} style={{ width: 72, height: 72 }}>
          <Animated.View className="w-[72px] h-[72px] rounded-full items-center justify-center" style={[{ backgroundColor: "rgba(214,255,63,0.15)" }, checkStyle]}>
            <Ionicons name="checkmark" size={30} color={colors.accent} />
          </Animated.View>
          {showBurst && circleSize && <Burst origin={{ x: circleSize.width / 2, y: circleSize.height / 2 }} onDone={() => setShowBurst(false)} />}
        </View>
      </View>
      <Animated.Text entering={FadeInUp.delay(150).duration(300)} className="font-display text-[23.5px]" style={{ color: colors.text }}>
        You're hosting!
      </Animated.Text>
      <Animated.View entering={FadeInUp.delay(450).duration(340)}>
        <PropOverlay animalSrc={animalSrc} prop="banner" label="Game on." size={112} />
      </Animated.View>
      <Animated.View style={[{ width: "100%" }, cardStyle]}>{children}</Animated.View>
    </View>
  );
}

export default function Wizard() {
  const {
    wizard,
    resetWizard,
    selectVenue,
    setStartsAt,
    selectWizardTier,
    setSkillMax,
    incCourts,
    decCourts,
    setMaxPlayers,
    setCourtsBooked,
    setCourtLabel,
    setDurationHours,
    setCost,
    addNamedSpot,
    removeNamedSpot,
    setFormat,
    setVisibility,
    setAutoApprove,
    setShuttles,
    setNotes,
  } = useAppStore();

  const { session } = useSession();
  const { data: profile } = useProfile(session?.user.id);
  const animal = animalFor(profile?.avatar_key, session?.user.id ?? "");
  const myName = profile?.display_name || "You";

  const { data: sports = [] } = useSports();
  const { data: tiers = [] } = useSkillTiers(SPORT_SLUG);
  const createGame = useCreateGame();
  const uploadConfirmationFiles = useUploadConfirmationFiles();
  const parseConfirmation = useParseConfirmation();
  const attachConfirmation = useAttachConfirmation();
  const upsertPlaceVenue = useUpsertPlaceVenue();

  const [confirmationUri, setConfirmationUri] = useState<string | null>(null);
  const [confirmationIsPdf, setConfirmationIsPdf] = useState(false);
  const [confirmationFileName, setConfirmationFileName] = useState<string | null>(null);
  const [createdGameId, setCreatedGameId] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  const [entryMode, setEntryMode] = useState<"manual" | "receipt" | null>(null);
  const [uploadSheet, setUploadSheet] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedBooking | null>(null);
  const [draftConfirmationId, setDraftConfirmationId] = useState<string | null>(null);
  const [parsedSlot, setParsedSlot] = useState<Date | null>(null);
  const [venueAutoResolved, setVenueAutoResolved] = useState(false);
  const [dateApplied, setDateApplied] = useState(false);
  const [editedFields, setEditedFields] = useState<Set<FieldKey>>(new Set());
  const [expandedRow, setExpandedRow] = useState<RowKey>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [addSomeoneOpen, setAddSomeoneOpen] = useState(false);
  const [mismatchField, setMismatchField] = useState<FieldKey | null>(null);
  const [sourceDocOpen, setSourceDocOpen] = useState(false);
  const [priceSuggestionApplied, setPriceSuggestionApplied] = useState(false);
  const [priceOfferAccepted, setPriceOfferAccepted] = useState(false);
  const [courtsExpanded, setCourtsExpanded] = useState(false);

  const [venueQuery, setVenueQuery] = useState("");
  const [venueResults, setVenueResults] = useState<PlacePrediction[]>([]);
  const [venueSearching, setVenueSearching] = useState(false);
  const [venueResolving, setVenueResolving] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<{ name: string; suburb: string; address: string } | null>(null);
  const sessionTokenRef = useRef(newSessionToken());

  const [debouncedVenueQuery, setDebouncedVenueQuery] = useState("");
  const { data: smashioVenues = [] } = useVenuesDirectory({ search: debouncedVenueQuery || undefined });

  useEffect(() => {
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
    setConfirmationIsPdf(false);
    setConfirmationFileName(null);
    setCreatedGameId(null);
    setVerified(false);
    setPublished(false);
    setParsing(false);
    setParsedData(null);
    setDraftConfirmationId(null);
    setParsedSlot(null);
    setVenueAutoResolved(false);
    setDateApplied(false);
    setEditedFields(new Set());
    setExpandedRow(null);
    setPriceSuggestionApplied(false);
    setPriceOfferAccepted(false);
    sessionTokenRef.current = newSessionToken();
  }, []);

  useEffect(() => {
    if (selectedVenue) return;
    const handle = setTimeout(async () => {
      if (venueQuery.trim().length < 3) {
        setVenueResults([]);
        return;
      }
      setVenueSearching(true);
      try {
        const results = await searchPlaces(venueQuery, sessionTokenRef.current, "establishment");
        setVenueResults(results);
      } catch {
      } finally {
        setVenueSearching(false);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [venueQuery, selectedVenue]);

  useEffect(() => {
    if (selectedVenue) return;
    const handle = setTimeout(() => setDebouncedVenueQuery(venueQuery.trim()), 350);
    return () => clearTimeout(handle);
  }, [venueQuery, selectedVenue]);

  const venue = selectedVenue;
  const maxCost = wizard.durationHours * MAX_COST_PER_PLAYER_PER_HOUR;
  const startInPast = !isSlotBookable(wizard.startsAt, wizard.startsAt.getHours(), wizard.startsAt.getMinutes());
  const endsAt = new Date(wizard.startsAt.getTime() + durationMs(wizard.durationHours));

  const suggestedCost = parsedData?.total_cost_aud
    ? Math.min(maxCost, Math.max(1, Math.ceil(parsedData.total_cost_aud / wizard.maxPlayers)))
    : null;
  useEffect(() => {
    if (entryMode === "receipt" && suggestedCost !== null && !priceSuggestionApplied) {
      setCost(suggestedCost);
      setPriceSuggestionApplied(true);
    }
  }, [entryMode, suggestedCost, priceSuggestionApplied]);

  // High-confidence-only locking (create-game-plan.md §9.3): a field locks only when the whole
  // parse came back "high" confidence AND it actually auto-filled without the host touching it.
  // Our parser reports one overall confidence, not per-field — this is the closest honest
  // approximation without a schema change to the AI proxy's output.
  const isLocked = (field: FieldKey): boolean => {
    if (entryMode !== "receipt" || parsedData?.confidence !== "high" || editedFields.has(field)) return false;
    if (field === "where") return venueAutoResolved;
    if (field === "when") return dateApplied;
    return false;
  };
  const hasProvenance = (field: FieldKey): boolean => {
    if (entryMode !== "receipt" || editedFields.has(field)) return false;
    if (field === "where") return venueAutoResolved;
    if (field === "when") return dateApplied;
    if (field === "cost") return parsedData?.total_cost_aud != null;
    return false;
  };

  const markEdited = (field: FieldKey) => setEditedFields((s) => new Set(s).add(field));

  const goBack = () => {
    if (entryMode === null) {
      router.back();
      return;
    }
    Alert.alert(
      entryMode === "receipt" ? "Discard this booking confirmation?" : "Discard game setup?",
      entryMode === "receipt" ? "You'll lose the details we read from your photo." : "You'll lose what you've entered.",
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
      markEdited("where");
    } catch (e) {
      Alert.alert("Couldn't load that venue", e instanceof Error ? e.message : "Give it another go.");
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
    markEdited("where");
  };

  const resolveVenueFromParsed = async (parsed: ParsedBooking): Promise<boolean> => {
    if (!parsed.venue_name) return false;
    setVenueQuery(parsed.venue_name);
    setVenueResolving(true);
    try {
      const query = [parsed.venue_name, parsed.venue_address].filter(Boolean).join(", ");
      const results = await searchPlaces(query, sessionTokenRef.current, "establishment");
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

  // Shared by the camera and file pickers in the upload action sheet — both funnel into the same
  // parse call, branching on mime for the downscale-vs-upload-as-is treatment (queries/games.ts).
  const parseFromPicked = async (localUri: string, width: number, height: number, mimeType: string, fileName?: string) => {
    setUploadSheet(false);
    const isPdf = mimeType === "application/pdf";
    setConfirmationUri(isPdf ? null : localUri);
    setConfirmationIsPdf(isPdf);
    setConfirmationFileName(isPdf ? fileName ?? "confirmation.pdf" : null);
    setParsing(true);
    try {
      const { confirmation_id, parsed } = await parseConfirmation.mutateAsync({ localUri, width, height, mimeType, fileName });
      if (!parsed.is_booking_confirmation) {
        setParsing(false);
        setConfirmationUri(null);
        setConfirmationIsPdf(false);
        Alert.alert("Couldn't find a booking in there", "That might not be a confirmation, or it's a bit blurry. Try another file, or type it in yourself.", [
          { text: "Try a different file", onPress: () => setUploadSheet(true) },
          { text: "Type it in instead", onPress: () => { resetWizard(); setEntryMode("manual"); } },
        ]);
        return;
      }

      setParsedData(parsed);
      setDraftConfirmationId(confirmation_id);
      if (parsed.courts) setCourtsBooked(Math.min(MAX_COURTS_BOOKED, Math.max(MIN_COURTS_BOOKED, parsed.courts)));
      if (parsed.starts_at_local && parsed.ends_at_local) {
        const start = new Date(parsed.starts_at_local);
        const end = new Date(parsed.ends_at_local);
        const hours = Math.round(((end.getTime() - start.getTime()) / 3_600_000) * 4) / 4;
        if (hours > 0) setDurationHours(Math.min(MAX_DURATION_HOURS, Math.max(MIN_DURATION_HOURS, hours)));
      }

      let applied = false;
      if (parsed.starts_at_local) {
        const slot = new Date(parsed.starts_at_local);
        if (!isNaN(slot.getTime())) {
          setParsedSlot(slot);
          if (isSlotBookable(slot, slot.getHours(), slot.getMinutes())) {
            setStartsAt(slot);
            applied = true;
          }
        }
      }
      setDateApplied(applied);

      await resolveVenueFromParsed(parsed);
      setParsing(false);
      setEntryMode("receipt");
    } catch (e) {
      setParsing(false);
      Alert.alert("Couldn't read that one", "Your file's saved, type the details and we'll still verify.", [
        { text: "OK", onPress: () => setEntryMode("manual") },
      ]);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setUploadSheet(false);
      Alert.alert("Can't get to your camera", "Turn it on in Settings, or choose a file instead, works the same either way.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets[0];
    await parseFromPicked(asset.uri, asset.width, asset.height, "image/jpeg");
  };

  const chooseFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setUploadSheet(false);
      Alert.alert("Can't get to your photos", "Turn it on in Settings, or choose a file instead, works the same either way.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets[0];
    await parseFromPicked(asset.uri, asset.width, asset.height, "image/jpeg");
  };

  const chooseFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ["image/*", "application/pdf"], copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? (asset.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
    await parseFromPicked(asset.uri, 0, 0, mimeType, asset.name);
  };

  const publish = async () => {
    if (createdGameId) {
      setPublished(true);
      return;
    }
    const sport = sports.find((s) => s.slug === SPORT_SLUG);
    const tier = tiers.find((t) => t.label === wizard.skill);
    const tierMax = tiers.find((t) => t.label === wizard.skillMax) ?? tier;
    if (!sport || !tier || !wizard.venueId) {
      Alert.alert("Not ready yet", "Still loading game settings, try again in a moment.");
      return;
    }
    setPublishing(true);
    let id: string;
    try {
      id = await createGame.mutateAsync({
        venueId: wizard.venueId,
        sportId: sport.id,
        skillTierId: tier.id,
        skillTierMaxId: tierMax?.id,
        startsAt: wizard.startsAt,
        maxPlayers: wizard.maxPlayers,
        courtsBooked: wizard.courtsBooked,
        courtLabel: wizard.courtLabel,
        durationHours: wizard.durationHours,
        costPerPlayerCents: Math.round(wizard.cost * 100),
        visibility: wizard.visibility,
        autoApprove: wizard.autoApprove,
        shuttles: wizard.shuttles,
        notes: wizard.notes,
        spots: wizard.namedSpots.map((s) => ({ label: s.label, invitedProfileId: s.invitedProfileId })),
      });
    } catch (e) {
      haptics.error();
      Alert.alert("Couldn't publish that game", e instanceof Error ? e.message : "Give it another go.");
      setPublishing(false);
      return;
    }
    setCreatedGameId(id);
    if (draftConfirmationId) {
      try {
        await attachConfirmation.mutateAsync({ confirmationId: draftConfirmationId, gameId: id });
        setVerified(parsedData?.is_booking_confirmation === true);
      } catch {
        haptics.error();
        Alert.alert("Game published", "Your booking confirmation couldn't be attached, so the game isn't verified yet. You can try again from the game page.");
      }
    }
    setPublished(true);
    setPublishing(false);
  };

  const parsedSlotBookable = parsedSlot != null && isSlotBookable(parsedSlot, parsedSlot.getHours(), parsedSlot.getMinutes());
  const newAddressResults = venueResults.filter((p) => !smashioVenues.some((v) => sharesToken(v.name, p.mainText)));

  const venueBadge = (v: VenueDirectoryRow) => {
    const state = confidenceState(v.has_profile ? { confidence: v.confidence, verified_at: v.verified_at } : null);
    if (state === "verified") return { label: "✓", color: colors.intermediate, bg: "rgba(53,214,166,.14)" };
    return { label: "Community", color: colors.beginner, bg: "rgba(111,203,255,.13)" };
  };

  // ---- Lineup slots for the strip: host, joined (none yet pre-publish), named holds, anon
  // holds, then open. Draft-time only — post-publish this same shape is built in game/[id].tsx.
  const namedSlots: LineupSlot[] = wizard.namedSpots.map((s) => ({ kind: "named", id: s.localId, label: s.invitedName ?? s.label, claimed: false }));
  const anonSlots: LineupSlot[] = Array.from({ length: wizard.reservedSpots }, (_, i) => ({ kind: "anon", id: `anon-${i}` }));
  const filledCount = 1 + namedSlots.length + anonSlots.length;
  const openCount = Math.max(0, wizard.maxPlayers - filledCount);
  const openSlots: LineupSlot[] = Array.from({ length: openCount }, (_, i) => ({ kind: "open", id: `open-${i}` }));
  const lineupSlots: LineupSlot[] = [
    { kind: "host", id: session?.user.id ?? "host", name: myName, avatarKey: profile?.avatar_key },
    ...namedSlots,
    ...anonSlots,
    ...openSlots,
  ];

  const renderVenuePicker = () => (
    <View>
      <View className="flex-row items-center gap-2 rounded-2xl px-3.5 border-[1.5px] mb-2" style={{ backgroundColor: colors.card, borderColor: selectedVenue ? colors.accent : "rgba(255,255,255,0.07)" }}>
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

      {!selectedVenue && !venueSearching && venueQuery.trim().length >= 3 && smashioVenues.length === 0 && newAddressResults.length === 0 && (
        <Text className="text-[14.5px] mt-2" style={{ color: colors.textMuted }}>
          No venues found. Try a different search.
        </Text>
      )}

      {!selectedVenue && smashioVenues.length > 0 && (
        <View className="mt-1">
          <RowLabel>{venueQuery.trim().length === 0 ? "Popular near you" : "Smashio venues"}</RowLabel>
          {smashioVenues.slice(0, 6).map((v) => {
            const badge = venueBadge(v);
            return (
              <Pressable
                key={v.id}
                onPress={() => {
                  selectVenue(v.id);
                  setSelectedVenue({ name: v.name, suburb: v.suburb, address: `${v.suburb}, ${v.state}` });
                  setVenueQuery(v.name);
                  setVenueResults([]);
                  markEdited("where");
                }}
                className="flex-row items-center gap-3 rounded-2xl px-3.5 py-3.5 mb-2 border-[1.5px]"
                style={{ backgroundColor: colors.card, borderColor: "rgba(255,255,255,0.07)" }}
              >
                <View className="w-11 h-11 rounded-xl items-center justify-center" style={{ backgroundColor: colors.surfaceAlt }}>
                  <Ionicons name="business" size={17} color={colors.textMuted} />
                </View>
                <View className="flex-1">
                  <Text className="font-body-bold text-[15.5px]" style={{ color: colors.text }}>{v.name}</Text>
                  <Text className="text-[13.5px] mt-0.5" style={{ color: colors.textSecondary }}>{v.suburb} · {v.courts_badminton ?? "?"} courts</Text>
                </View>
                <View className="rounded-pill px-2.5 py-1" style={{ backgroundColor: badge.bg }}>
                  <Text className="font-body-extrabold text-[10.5px]" style={{ color: badge.color }}>{badge.label}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {!selectedVenue && newAddressResults.length > 0 && (
        <View className="mt-4">
          <RowLabel>New address</RowLabel>
          {newAddressResults.map((p) => (
            <Pressable
              key={p.placeId}
              onPress={() => pickVenue(p)}
              className="flex-row items-center gap-3 rounded-2xl px-3.5 py-3.5 mb-2 border-[1.5px]"
              style={{ backgroundColor: colors.card, borderColor: "rgba(255,255,255,0.07)" }}
            >
              <View className="w-11 h-11 rounded-xl items-center justify-center border" style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder }}>
                <Ionicons name="location" size={16} color={colors.textDim} />
              </View>
              <View className="flex-1">
                <Text className="font-body-bold text-[15.5px]" style={{ color: colors.text }}>{p.mainText}</Text>
                <Text className="text-[13.5px] mt-0.5" style={{ color: colors.textSecondary }}>{p.secondaryText}</Text>
              </View>
              <View className="rounded-pill px-2.5 py-1" style={{ backgroundColor: "rgba(214,255,63,.12)" }}>
                <Text className="font-body-extrabold text-[10.5px]" style={{ color: colors.accent }}>New</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );

  const renderDateTimePicker = () => (
    <View>
      {parsedSlot && !parsedSlotBookable && (
        <View className="rounded-2xl px-3.5 py-3 mb-3.5 border" style={{ backgroundColor: "rgba(255,182,72,0.1)", borderColor: "rgba(255,182,72,0.3)" }}>
          <Text className="text-[13px]" style={{ color: colors.advanced }}>
            Your confirmation said {formatDate(parsedSlot.toISOString())} at {formatTimeShort(parsedSlot.toISOString())}, but that's already passed, pick a new time below.
          </Text>
        </View>
      )}
      <RowLabel>Date</RowLabel>
      <View className="rounded-2xl p-2 mb-5 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
        <DateTimePicker
          value={wizard.startsAt}
          mode="date"
          display="inline"
          minimumDate={new Date()}
          themeVariant="dark"
          accentColor={colors.accent}
          onChange={(_e, date) => {
            if (!date) return;
            setStartsAt(slotAt(date, wizard.startsAt.getHours(), wizard.startsAt.getMinutes()));
            markEdited("when");
          }}
        />
      </View>
      <RowLabel>Time</RowLabel>
      <View className="rounded-2xl items-center border mb-5" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
        <DateTimePicker
          value={wizard.startsAt}
          mode="time"
          display="spinner"
          minuteInterval={5}
          themeVariant="dark"
          textColor={colors.text}
          onChange={(_e, date) => {
            if (!date) return;
            setStartsAt(slotAt(wizard.startsAt, date.getHours(), date.getMinutes()));
            markEdited("when");
          }}
        />
      </View>
      {startInPast && (
        <Text className="text-[13.5px] mb-3 text-center" style={{ color: colors.advanced }}>
          That slot has already passed. Pick a later time or another day.
        </Text>
      )}

      <RowLabel>Duration</RowLabel>
      <View className="flex-row items-center justify-center gap-5 rounded-2xl p-4 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
        <Stepper
          onPress={() => {
            markEdited("when");
            setDurationHours(Math.max(MIN_DURATION_HOURS, Math.round((wizard.durationHours - DURATION_STEP_HOURS) * 100) / 100));
          }}
          icon="remove"
          disabled={wizard.durationHours <= MIN_DURATION_HOURS}
        />
        <Text className="font-display text-[24px]" style={{ color: colors.accent, minWidth: 90, textAlign: "center" }}>
          {formatDuration(wizard.durationHours)}
        </Text>
        <Stepper
          onPress={() => {
            markEdited("when");
            setDurationHours(Math.min(MAX_DURATION_HOURS, Math.round((wizard.durationHours + DURATION_STEP_HOURS) * 100) / 100));
          }}
          icon="add"
          disabled={wizard.durationHours >= MAX_DURATION_HOURS}
        />
      </View>
      <View className="flex-row gap-2 mt-2.5 flex-wrap">
        {DURATION_CHIPS.map((h) => (
          <Pressable
            key={h}
            onPress={() => {
              markEdited("when");
              setDurationHours(h);
            }}
            className="rounded-pill px-3.5 py-2"
            style={{ backgroundColor: wizard.durationHours === h ? colors.accent : colors.surface, borderWidth: 1, borderColor: wizard.durationHours === h ? colors.accent : colors.cardBorder }}
          >
            <Text className="font-body-bold text-[12.5px]" style={{ color: wizard.durationHours === h ? colors.base : colors.textDim }}>
              {formatDuration(h)}
            </Text>
          </Pressable>
        ))}
      </View>

      <RowLabel style={{ marginTop: 18 }}>Courts booked</RowLabel>
      {!courtsExpanded && wizard.courtsBooked <= 6 ? (
        <View className="flex-row gap-2 flex-wrap">
          {COURT_CHIPS.map((c) => (
            <Pressable
              key={c}
              onPress={() => {
                markEdited("when");
                setCourtsBooked(c);
              }}
              className="rounded-pill px-4 py-2.5"
              style={{ backgroundColor: wizard.courtsBooked === c ? colors.accent : colors.surface, borderWidth: 1, borderColor: wizard.courtsBooked === c ? colors.accent : colors.cardBorder }}
            >
              <Text className="font-body-extrabold text-[13px]" style={{ color: wizard.courtsBooked === c ? colors.base : colors.textDim }}>{c}</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => {
              markEdited("when");
              setCourtsExpanded(true);
              if (wizard.courtsBooked <= 6) setCourtsBooked(7);
            }}
            className="rounded-pill px-4 py-2.5"
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder }}
          >
            <Text className="font-body-extrabold text-[13px]" style={{ color: colors.textDim }}>7+</Text>
          </Pressable>
        </View>
      ) : (
        <View className="flex-row items-center justify-center gap-5 rounded-2xl p-4 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
          <Stepper onPress={() => { markEdited("when"); decCourts(); }} icon="remove" disabled={wizard.courtsBooked <= MIN_COURTS_BOOKED} />
          <Text className="font-display text-[24px]" style={{ color: colors.accent, minWidth: 60, textAlign: "center" }}>{wizard.courtsBooked} courts</Text>
          <Stepper onPress={() => { markEdited("when"); incCourts(); }} icon="add" disabled={wizard.courtsBooked >= MAX_COURTS_BOOKED} />
        </View>
      )}
      <Text className="text-[11.5px] mt-2" style={{ color: colors.textMuted }}>
        {wizard.courtsBooked > 1 ? `Lineup splits into ${wizard.courtsBooked} court groups.` : "One court — everyone rotates together."}
      </Text>

      <RowLabel style={{ marginTop: 18 }}>Court number (optional)</RowLabel>
      <TextInput
        value={wizard.courtLabel}
        onChangeText={(v) => { markEdited("when"); setCourtLabel(v); }}
        placeholder="e.g. Court 3"
        placeholderTextColor={colors.textMuted}
        maxLength={20}
        className="rounded-2xl p-4 border text-[15px]"
        style={{ backgroundColor: colors.card, borderColor: colors.cardBorder, color: colors.text }}
      />
    </View>
  );

  const renderWhoRow = () => (
    <View>
      <RowLabel>Total players (including you)</RowLabel>
      <View className="flex-row items-center justify-center gap-6 rounded-2xl p-4 mb-2 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
        <Stepper onPress={() => setMaxPlayers(Math.max(MIN_PLAYERS, 1 + wizard.namedSpots.length, wizard.maxPlayers - 1))} icon="remove" disabled={wizard.maxPlayers <= Math.max(MIN_PLAYERS, 1 + wizard.namedSpots.length)} />
        <Text className="font-display text-[26px]" style={{ color: colors.accent }}>{wizard.maxPlayers}</Text>
        <Stepper onPress={() => setMaxPlayers(Math.min(MAX_PLAYERS, wizard.maxPlayers + 1))} icon="add" disabled={wizard.maxPlayers >= MAX_PLAYERS} />
      </View>

      <RowLabel style={{ marginTop: 14 }}>Skill range</RowLabel>
      <View className="flex-row gap-2 flex-wrap mb-4">
        {TIERS.map((t) => {
          const minOrd = TIERS.findIndex((x) => x.id === wizard.skill);
          const maxOrd = TIERS.findIndex((x) => x.id === wizard.skillMax);
          const ord = TIERS.findIndex((x) => x.id === t.id);
          const inRange = ord >= minOrd && ord <= maxOrd;
          return (
            <Pressable
              key={t.id}
              onPress={() => {
                // Tap floor if it's currently the min, ceiling if it's the max, otherwise widen
                // whichever edge is closer — a simple range picker without a two-thumb slider.
                if (ord < minOrd) selectWizardTier(t.id);
                else if (ord > maxOrd) setSkillMax(t.id);
                else if (t.id === wizard.skill) selectWizardTier(t.id);
                else setSkillMax(t.id);
              }}
              className="rounded-pill px-3.5 py-2 flex-row items-center gap-1.5"
              style={{ backgroundColor: inRange ? colors.surfaceAlt : colors.surface, borderWidth: 1.5, borderColor: inRange ? t.color : "rgba(255,255,255,0.07)" }}
            >
              <View className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
              <Text className="font-body-bold text-[12.5px]" style={{ color: inRange ? colors.text : colors.textMuted }}>{t.id}</Text>
            </Pressable>
          );
        })}
      </View>

      <RowLabel>Who's coming</RowLabel>
      <LineupStrip slots={lineupSlots} courtsBooked={wizard.courtsBooked} onTapSlot={(slot) => { if (slot.kind === "open") { haptics.tap(); setAddSomeoneOpen(true); } }} />
      <Pressable onPress={() => { haptics.tap(); setAddSomeoneOpen(true); }} className="flex-row items-center gap-1.5 mt-3">
        <Ionicons name="add-circle-outline" size={16} color={colors.accent} />
        <Text className="font-body-bold text-[13.5px]" style={{ color: colors.accent }}>Add someone</Text>
      </Pressable>
    </View>
  );

  const renderMoreOptions = () => (
    <Sheet visible={moreOpen} onClose={() => setMoreOpen(false)} title="More options">
      <RowLabel style={{ marginTop: 4 }}>Format</RowLabel>
      <View className="flex-row gap-2 flex-wrap mb-4">
        {[
          { slug: "social", label: "Social" },
          { slug: "competitive", label: "Competitive" },
          { slug: "drills", label: "Drills" },
          { slug: "doubles_rotation", label: "Doubles rotation" },
        ].map((f) => (
          <Pressable
            key={f.slug}
            onPress={() => setFormat(f.slug)}
            className="rounded-pill px-3.5 py-2"
            style={{ backgroundColor: wizard.format === f.slug ? colors.accent : colors.surface, borderWidth: 1, borderColor: wizard.format === f.slug ? colors.accent : colors.cardBorder }}
          >
            <Text className="font-body-bold text-[12.5px]" style={{ color: wizard.format === f.slug ? colors.base : colors.textDim }}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      <RowLabel>Visibility</RowLabel>
      <View className="flex-row gap-2 mb-4">
        {[
          { v: "public" as const, label: "Public", desc: "Shows on Discover" },
          { v: "link_only" as const, label: "Link only", desc: "Only people you share the link with" },
        ].map((o) => (
          <Pressable
            key={o.v}
            onPress={() => setVisibility(o.v)}
            className="flex-1 rounded-2xl p-3 border-[1.5px]"
            style={{ backgroundColor: wizard.visibility === o.v ? colors.surfaceAlt : colors.surface, borderColor: wizard.visibility === o.v ? colors.accent : "rgba(255,255,255,0.07)" }}
          >
            <Text className="font-body-bold text-[13.5px]" style={{ color: colors.text }}>{o.label}</Text>
            <Text className="text-[11px] mt-0.5" style={{ color: colors.textMuted }}>{o.desc}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable onPress={() => setAutoApprove(!wizard.autoApprove)} className="flex-row items-center justify-between rounded-2xl p-3.5 mb-4 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
        <View className="flex-1 pr-2">
          <Text className="font-body-bold text-[13.5px]" style={{ color: colors.text }}>Auto-approve joins</Text>
          <Text className="text-[11px] mt-0.5" style={{ color: colors.textMuted }}>Off means you'll review every request first</Text>
        </View>
        <View className="w-11 h-6 rounded-pill justify-center px-0.5" style={{ backgroundColor: wizard.autoApprove ? colors.accent : colors.surfaceAlt }}>
          <View className="w-5 h-5 rounded-full" style={{ backgroundColor: colors.base, alignSelf: wizard.autoApprove ? "flex-end" : "flex-start" }} />
        </View>
      </Pressable>

      <RowLabel>Shuttles</RowLabel>
      <TextInput
        value={wizard.shuttles}
        onChangeText={setShuttles}
        placeholder="e.g. I'll bring feather shuttles"
        placeholderTextColor={colors.textMuted}
        maxLength={80}
        className="rounded-2xl p-3.5 mb-4 border text-[14px]"
        style={{ backgroundColor: colors.card, borderColor: colors.cardBorder, color: colors.text }}
      />

      <RowLabel>Say something about this game</RowLabel>
      <TextInput
        value={wizard.notes}
        onChangeText={setNotes}
        placeholder="Casual hit, first-timers welcome…"
        placeholderTextColor={colors.textMuted}
        maxLength={280}
        multiline
        className="rounded-2xl p-3.5 border text-[14px]"
        style={{ backgroundColor: colors.card, borderColor: colors.cardBorder, color: colors.text, minHeight: 80, textAlignVertical: "top" }}
      />
      <Text className="text-[11px] mt-1.5 text-right" style={{ color: colors.textMuted }}>{wizard.notes.length}/280</Text>

      <Pressable onPress={() => setMoreOpen(false)} className="rounded-pill py-3.5 items-center mt-4" style={{ backgroundColor: colors.accent }}>
        <Text className="font-body-extrabold text-[15px]" style={{ color: colors.base }}>Done</Text>
      </Pressable>
    </Sheet>
  );

  const moreOptionsSummary = [
    { social: "Social", competitive: "Competitive", drills: "Drills", doubles_rotation: "Doubles rotation" }[wizard.format] ?? "Social",
    wizard.visibility === "public" ? "Public" : "Link only",
    wizard.autoApprove ? "Auto-approve" : "Review joins",
    wizard.shuttles.trim() ? wizard.shuttles : "No shuttle note",
  ].join(" · ");

  const publishDisabledReason = !wizard.venueId ? "Pick a venue first" : startInPast ? "Pick a time that hasn't passed" : null;

  if (published && createdGameId) {
    return (
      <View className="flex-1 pt-14" style={{ backgroundColor: "#08080A" }}>
        <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 20 }}>
          <PublishStamp active={published} animalSrc={animal.src}>
            <View className="items-center gap-3.5">
              <Text className="text-[14.5px] text-center max-w-[260px]" style={{ color: colors.textSecondary }}>
                Your game at {venue?.name ?? "your venue"} is live. Now's the moment to get people in.
              </Text>
              <View className="w-full rounded-2xl p-4 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
                <Text className="font-body-bold text-[15.5px]" style={{ color: colors.text }}>{venue?.name ?? "your venue"}</Text>
                <Text className="text-[14px] mt-1" style={{ color: colors.textSecondary }}>
                  {formatDate(wizard.startsAt.toISOString())} · {formatTimeRange(wizard.startsAt.toISOString(), endsAt.toISOString())}
                </Text>
                <View className="rounded-pill self-start px-2.5 py-1.5 mt-2.5" style={{ backgroundColor: verified ? "rgba(76,217,100,0.15)" : "rgba(255,182,72,0.15)" }}>
                  <Text className="font-body-extrabold text-[11.5px] uppercase" style={{ color: verified ? colors.intermediate : colors.advanced }}>
                    {verified ? "Verified" : "Awaiting booking upload"}
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={async () => {
                  haptics.tap();
                  const url = `https://smashio.com.au/game/${createdGameId}`;
                  const text = `Come play badminton with me at ${venue?.name ?? "the courts"} · ${formatDate(wizard.startsAt.toISOString())} ${formatTimeShort(wizard.startsAt.toISOString())}`;
                  try {
                    await Share.share(Platform.OS === "ios" ? { message: text, url } : { message: `${text} — ${url}` });
                  } catch {}
                }}
                className="w-full rounded-pill py-4 items-center flex-row justify-center gap-2"
                style={{ backgroundColor: colors.accent }}
              >
                <Ionicons name="share-outline" size={17} color={colors.base} />
                <Text className="font-body-extrabold text-[15.5px]" style={{ color: colors.base }}>Share the link</Text>
              </Pressable>
              <Pressable onPress={() => router.replace(`/game/${createdGameId}`)} className="w-full rounded-pill py-3.5 items-center border" style={{ borderColor: colors.cardBorder }}>
                <Text className="font-body-bold text-[14.5px]" style={{ color: colors.textDim }}>View the game</Text>
              </Pressable>
            </View>
          </PublishStamp>
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="flex-1 pt-14" style={{ backgroundColor: "#08080A" }}>
      <View className="flex-row items-center gap-3 px-5 pb-1">
        <Pressable onPress={goBack} className="w-[34px] h-[34px] rounded-full items-center justify-center" style={{ backgroundColor: "#17171A" }}>
          <Ionicons name="chevron-back" size={16} color={colors.text} />
        </Pressable>
        <Text className="font-display text-[20px]" style={{ color: colors.text }}>
          {entryMode === null ? "Host a game" : "Your game"}
        </Text>
        {!parsing && (
          <View className="ml-auto rounded-pill px-2 py-1" style={{ backgroundColor: colors.surfaceAlt }}>
            <Text className="font-body-extrabold text-[9.5px]" style={{ color: colors.textTertiary, letterSpacing: 0.5 }}>
              {entryMode === null ? "STEP 1 OF 2" : "STEP 2 OF 2"}
            </Text>
          </View>
        )}
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: entryMode ? 110 : 20 }}>
        {parsing && (
          <View className="items-center pt-24 gap-4">
            {confirmationIsPdf ? (
              <View className="w-24 h-30 rounded-xl border items-center justify-center gap-2 px-3 py-4" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
                <Ionicons name="document-text-outline" size={26} color={colors.textDim} />
                <Text numberOfLines={1} className="text-[10px] font-body-bold text-center" style={{ color: colors.textDim }}>{confirmationFileName}</Text>
              </View>
            ) : confirmationUri ? (
              <Image source={{ uri: confirmationUri }} style={{ width: 110, height: 88, borderRadius: 14, opacity: 0.7 }} resizeMode="cover" />
            ) : null}
            <ActivityIndicator size="large" color={colors.accent} />
            <Text className="font-body-bold text-[15px]" style={{ color: colors.textSecondary }}>Reading your booking…</Text>
            <Text className="text-[13px] text-center max-w-[260px]" style={{ color: colors.textMuted }}>
              Pulling the venue, the time and what you paid. Won't be a tick.
            </Text>
          </View>
        )}

        {!parsing && entryMode === null && (
          <View className="items-center pt-10">
            <Text className="font-display text-[28px] text-center" style={{ color: colors.text }}>Got a booking{"\n"}confirmation?</Text>
            <Text className="text-[13.5px] text-center mt-3 max-w-[300px]" style={{ color: colors.textSecondary }}>
              Hand it over and we'll fill in the venue and time for you, and mark your game verified. No competitor here can do that.
            </Text>
            <View className="w-[170px] h-[170px] rounded-3xl items-center justify-center mt-8 border-[1.5px]" style={{ backgroundColor: "#1d2110", borderColor: "rgba(214,255,63,.35)" }}>
              <Ionicons name="receipt-outline" size={54} color={colors.accent} />
            </View>
            <View className="w-full mt-10">
              <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} className="rounded-pill mb-3">
                <Pressable onPress={() => setUploadSheet(true)} className="py-4 items-center flex-row justify-center gap-2">
                  <Ionicons name="cloud-upload-outline" size={17} color={colors.base} />
                  <Text className="font-body-extrabold text-[16.5px]" style={{ color: colors.base }}>Upload confirmation</Text>
                </Pressable>
              </LinearGradient>
              <Pressable onPress={() => { resetWizard(); setEntryMode("manual"); }} className="items-center py-3.5">
                <Text className="font-body-bold text-[14.5px]" style={{ color: colors.textSecondary }}>I'll type it in instead →</Text>
              </Pressable>
            </View>
          </View>
        )}

        {!parsing && entryMode !== null && (
          <View>
            {/* Draft-card cover preview — the actual GameCard players will see, re-rendering as
                rows are edited. Deliberately a hand-built preview, not the shared GameCard
                component: GameCard expects a fully-hydrated Game row (id, host stats, etc.) that
                doesn't exist until publish. */}
            <View className="rounded-3xl overflow-hidden" style={{ height: 150, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder }}>
              <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.75)"]} style={{ position: "absolute", inset: 0 }} />
              <View className="flex-row justify-between px-3.5 pt-3">
                {entryMode === "receipt" && parsedData?.is_booking_confirmation ? (
                  <View className="flex-row items-center gap-1.5 rounded-pill px-2.5 py-1" style={{ backgroundColor: "rgba(53,214,166,0.18)", borderWidth: 1, borderColor: "rgba(53,214,166,0.35)" }}>
                    <Text className="font-body-extrabold text-[10px]" style={{ color: colors.intermediate }}>✓ VERIFIED</Text>
                  </View>
                ) : (
                  <View />
                )}
                <View className="rounded-pill px-2.5 py-1" style={{ backgroundColor: colors.surfaceAlt }}>
                  <Text className="font-body-extrabold text-[10px]" style={{ color: colors.textDim }}>DRAFT</Text>
                </View>
              </View>
              <View className="absolute left-3.5 right-3.5 bottom-3">
                <Text numberOfLines={1} className="font-display text-[17px]" style={{ color: colors.text }}>
                  {venue?.name ?? "Pick a venue to get started"}
                </Text>
                {venue && (
                  <Text className="text-[12px] font-body-bold mt-0.5" style={{ color: colors.textDim }}>
                    {startInPast ? "Pick a time" : formatDate(wizard.startsAt.toISOString())} · {startInPast ? "" : formatTimeShort(wizard.startsAt.toISOString())} · {wizard.skill}
                    {wizard.skillMax !== wizard.skill ? `–${wizard.skillMax}` : ""}
                  </Text>
                )}
                <View className="flex-row items-center justify-between mt-2">
                  <View className="flex-row items-center gap-1.5">
                    <View className="w-2 h-2 rounded-full" style={{ backgroundColor: tierColor(wizard.skill) }} />
                    <Text className="text-[11.5px]" style={{ color: colors.textSecondary }}>{filledCount}/{wizard.maxPlayers}</Text>
                  </View>
                  <Text className="font-display text-[15px]" style={{ color: colors.text }}>${wizard.cost}/player</Text>
                </View>
              </View>
            </View>
            <Text className="text-[11.5px] font-body-bold text-center mt-2" style={{ color: colors.textSecondary }}>
              This is what players will see on Discover
            </Text>

            <AccordionRow
              label="WHERE"
              value={venue?.name ?? null}
              placeholder="Search for a venue"
              locked={isLocked("where")}
              provenance={hasProvenance("where") ? "FROM YOUR CONFIRMATION" : null}
              onViewSource={hasProvenance("where") ? () => setSourceDocOpen(true) : undefined}
              onMismatch={isLocked("where") ? () => setMismatchField("where") : undefined}
              expanded={expandedRow === "where"}
              onToggle={() => setExpandedRow(expandedRow === "where" ? null : "where")}
            >
              {renderVenuePicker()}
            </AccordionRow>

            <AccordionRow
              label="WHEN"
              value={
                startInPast
                  ? null
                  : `${formatDate(wizard.startsAt.toISOString())} · ${formatTimeShort(wizard.startsAt.toISOString())} · ${formatDuration(wizard.durationHours)} · ${wizard.courtsBooked} court${wizard.courtsBooked === 1 ? "" : "s"}`
              }
              placeholder="Pick a date and time"
              locked={isLocked("when")}
              provenance={hasProvenance("when") ? "FROM YOUR CONFIRMATION" : null}
              onViewSource={hasProvenance("when") ? () => setSourceDocOpen(true) : undefined}
              onMismatch={isLocked("when") ? () => setMismatchField("when") : undefined}
              expanded={expandedRow === "when"}
              onToggle={() => setExpandedRow(expandedRow === "when" ? null : "when")}
            >
              {renderDateTimePicker()}
            </AccordionRow>

            <AccordionRow
              label="WHO"
              value={lineupSummary(lineupSlots, wizard.cost)}
              placeholder=""
              expanded={expandedRow === "who"}
              onToggle={() => setExpandedRow(expandedRow === "who" ? null : "who")}
            >
              {renderWhoRow()}
            </AccordionRow>

            {entryMode === "receipt" && parsedData?.total_cost_aud != null && suggestedCost != null && !priceOfferAccepted ? (
              <View className="rounded-2xl px-3.5 py-3.5 mb-3 border-[1.5px]" style={{ backgroundColor: "#171d07", borderColor: "rgba(214,255,63,.32)" }}>
                <View className="flex-row justify-between items-start">
                  <View>
                    <Text className="font-body-extrabold text-[10.5px] uppercase" style={{ color: colors.textTertiary }}>COST</Text>
                    <Text className="font-body-bold text-[15px] mt-0.5" style={{ color: colors.text }}>${wizard.cost} <Text className="text-[12px] font-body" style={{ color: colors.textSecondary }}>per player, suggested</Text></Text>
                  </View>
                  <Pressable onPress={() => setExpandedRow(expandedRow === "cost" ? null : "cost")}>
                    <Ionicons name={expandedRow === "cost" ? "chevron-up" : "chevron-forward"} size={16} color={colors.textTertiary} />
                  </Pressable>
                </View>
                <Text className="text-[12.5px] mt-2" style={{ color: colors.textDim }}>
                  Your booking was ${Math.round(parsedData.total_cost_aud)}. At {wizard.maxPlayers} players that's ${(parsedData.total_cost_aud / wizard.maxPlayers).toFixed(2)} each, we rounded up so you cover it.
                </Text>
                <View className="flex-row justify-between items-center mt-2.5">
                  <View className="rounded-pill px-2 py-1" style={{ backgroundColor: "rgba(174,230,42,.14)" }}>
                    <Text className="font-body-extrabold text-[9px]" style={{ color: colors.accent3 }}>SUGGESTED · FROM YOUR TOTAL</Text>
                  </View>
                  <Pressable onPress={() => setPriceOfferAccepted(true)} className="rounded-pill px-3 py-1.5" style={{ backgroundColor: colors.accent }}>
                    <Text className="font-body-extrabold text-[12px]" style={{ color: colors.base }}>Use ${wizard.cost}</Text>
                  </Pressable>
                </View>
                {expandedRow === "cost" && <View className="mt-3.5 pt-3.5 border-t" style={{ borderColor: "rgba(255,255,255,0.1)" }}>{renderCostControl()}</View>}
              </View>
            ) : (
              <AccordionRow
                label="COST"
                value={`$${wizard.cost} per player`}
                placeholder="Set a price per player"
                expanded={expandedRow === "cost"}
                onToggle={() => setExpandedRow(expandedRow === "cost" ? null : "cost")}
              >
                {renderCostControl()}
              </AccordionRow>
            )}

            <Pressable onPress={() => setMoreOpen(true)} className="rounded-2xl px-3.5 py-3.5 mb-3 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
              <View className="flex-row justify-between items-center">
                <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>More options</Text>
                <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} />
              </View>
              <Text numberOfLines={1} className="text-[12px] mt-1" style={{ color: colors.textSecondary }}>{moreOptionsSummary}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {!parsing && entryMode !== null && (
        <View className="px-5 pb-8 pt-3.5" style={{ backgroundColor: colors.base }}>
          {publishDisabledReason ? (
            <View className="rounded-pill py-4 items-center" style={{ backgroundColor: colors.surfaceAlt }}>
              <Text className="font-body-extrabold text-[16.5px]" style={{ color: colors.textMuted }}>{publishDisabledReason}</Text>
            </View>
          ) : (
            <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} className="rounded-pill">
              <Pressable onPress={publish} disabled={publishing} className="py-4 items-center" style={{ opacity: publishing ? 0.6 : 1 }}>
                <Text className="font-body-extrabold text-[16.5px]" style={{ color: colors.base }}>{publishing ? "Publishing…" : "Publish game"}</Text>
              </Pressable>
            </LinearGradient>
          )}
        </View>
      )}

      {/* Upload action sheet — camera + library + file, equal footing (create-game-plan.md §Step1). */}
      <Sheet visible={uploadSheet} onClose={() => setUploadSheet(false)} title="Add your booking confirmation">
        <Text className="text-[13px]" style={{ color: colors.textSecondary }}>
          A photo of the printed receipt, a screenshot, or the PDF the venue emailed you all work.
        </Text>
        <View className="flex-row gap-2.5 mt-3">
          <Pressable onPress={takePhoto} className="flex-1 rounded-2xl py-4 items-center gap-2 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
            <Ionicons name="camera-outline" size={22} color={colors.text} />
            <Text className="font-body-bold text-[13px]" style={{ color: colors.text }}>Take a photo</Text>
          </Pressable>
          <Pressable onPress={chooseFromLibrary} className="flex-1 rounded-2xl py-4 items-center gap-2 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
            <Ionicons name="images-outline" size={22} color={colors.text} />
            <Text className="font-body-bold text-[13px]" style={{ color: colors.text }}>Photo library</Text>
          </Pressable>
          <Pressable onPress={chooseFile} className="flex-1 rounded-2xl py-4 items-center gap-2 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
            <Ionicons name="document-outline" size={22} color={colors.text} />
            <Text className="font-body-bold text-[13px]" style={{ color: colors.text }}>Choose a file</Text>
          </Pressable>
        </View>
      </Sheet>

      {/* "Doesn't match my booking?" — the unlock ladder for a locked field (create-game-plan §9.3). */}
      <Sheet visible={mismatchField != null} onClose={() => setMismatchField(null)} title="Doesn't match your booking?">
        <Text className="text-[13px]" style={{ color: colors.textSecondary }}>
          This came straight off your confirmation. If it's wrong, a wrong {mismatchField === "where" ? "venue" : "time"} can send people to the wrong court.
        </Text>
        <Pressable onPress={() => { setMismatchField(null); setUploadSheet(true); }} className="rounded-pill py-3.5 items-center mt-4" style={{ backgroundColor: colors.accent }}>
          <Text className="font-body-extrabold text-[14.5px]" style={{ color: colors.base }}>Re-upload a different confirmation</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (mismatchField) {
              markEdited(mismatchField);
              setExpandedRow(mismatchField);
            }
            setMismatchField(null);
          }}
          className="rounded-pill py-3.5 items-center mt-2.5 border"
          style={{ borderColor: colors.cardBorder }}
        >
          <Text className="font-body-bold text-[14.5px]" style={{ color: colors.text }}>Just unlock this one field</Text>
        </Pressable>
        <Pressable onPress={() => setMismatchField(null)} className="items-center py-3">
          <Text className="font-body-bold text-[13.5px]" style={{ color: colors.textSecondary }}>Never mind, it's right</Text>
        </Pressable>
      </Sheet>

      {/* Source document viewer, opened from a provenance tag's "view" link. */}
      <Sheet visible={sourceDocOpen} onClose={() => setSourceDocOpen(false)} title="Your confirmation">
        {confirmationIsPdf ? (
          <View className="rounded-2xl p-4 items-center gap-2 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
            <Ionicons name="document-text-outline" size={40} color={colors.textDim} />
            <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>{confirmationFileName}</Text>
          </View>
        ) : confirmationUri ? (
          <Image source={{ uri: confirmationUri }} style={{ width: "100%", height: 340, borderRadius: 16 }} resizeMode="contain" />
        ) : (
          <Text style={{ color: colors.textMuted }}>No document to show.</Text>
        )}
      </Sheet>

      {addSomeoneOpen && (
        <AddSomeoneSheet
          visible={addSomeoneOpen}
          onClose={() => setAddSomeoneOpen(false)}
          onAdd={(spot) => { addNamedSpot(spot); setAddSomeoneOpen(false); }}
        />
      )}

      {renderMoreOptions()}
    </View>
  );

  function renderCostControl() {
    return (
      <View>
        <View className="items-center mb-4">
          <View className="flex-row items-baseline">
            <Text className="font-display text-[26px]" style={{ color: colors.textTertiary }}>$</Text>
            <TextInput
              value={String(wizard.cost)}
              onChangeText={(t) => {
                const digits = t.replace(/[^0-9]/g, "");
                setCost(digits === "" ? 1 : Math.min(maxCost, Math.max(1, parseInt(digits, 10))));
              }}
              keyboardType="number-pad"
              maxLength={3}
              selectTextOnFocus
              className="font-display text-[48px] text-center px-1"
              style={{ color: colors.text, borderBottomWidth: 2, borderBottomColor: colors.accent, minWidth: 64 }}
            />
          </View>
          <Text className="text-[12px] mt-1" style={{ color: colors.textSecondary }}>per player</Text>
          <View className="w-full mt-3 px-1">
            <PriceSlider value={wizard.cost} min={1} max={maxCost} onChange={setCost} />
            <View className="flex-row justify-between mt-1">
              <Text className="text-[11px]" style={{ color: colors.textTertiary }}>$1</Text>
              <Text className="text-[11px]" style={{ color: colors.textTertiary }}>${maxCost} cap</Text>
            </View>
          </View>
        </View>
        <View className="rounded-2xl p-3.5 flex-row justify-between items-center border" style={{ backgroundColor: "rgba(214,255,63,0.1)", borderColor: "rgba(214,255,63,0.25)" }}>
          <Text className="text-[13.5px] font-body-bold" style={{ color: colors.accent }}>If full · {wizard.maxPlayers} players</Text>
          <Text className="font-display-bold text-[18px]" style={{ color: colors.accent }}>${wizard.cost * wizard.maxPlayers}</Text>
        </View>
        <Text className="text-[12px] mt-2.5" style={{ color: colors.textMuted }}>
          Capped at ${MAX_COST_PER_PLAYER_PER_HOUR}/hour · ${maxCost} max for this {formatDuration(wizard.durationHours)} booking.
        </Text>
      </View>
    );
  }
}

// "Who's coming" picker (create-game-plan.md §4.3): one search field, three outcomes, no mode
// switch — pick a matching Smashio player (invited), or "just hold a spot for '<name>'" (named
// hold), or hold it blank. Local-only until publish, when create_game_with_spots turns each of
// these into a real game_reserved_spots row.
function AddSomeoneSheet({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (spot: { label: string | null; invitedProfileId?: string | null; invitedName?: string | null }) => void;
}) {
  const [term, setTerm] = useState("");
  const { data: results, isFetching } = usePlayerSearch(term);

  return (
    <Sheet visible={visible} onClose={onClose} title="Who's coming with you?">
      <TextInput
        value={term}
        onChangeText={setTerm}
        placeholder="Search by name"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        className="rounded-xl px-3 py-3 text-[14.5px] mb-2"
        style={{ backgroundColor: colors.surface, color: colors.text }}
      />
      {term.trim().length >= 2 && (
        <Pressable onPress={() => onAdd({ label: term.trim() })} className="flex-row items-center gap-2.5 py-2.5">
          <Ionicons name="bookmark-outline" size={16} color={colors.advanced} />
          <Text className="flex-1 font-body-bold text-[14px]" style={{ color: colors.text }}>Just hold a spot for "{term.trim()}"</Text>
        </Pressable>
      )}
      {isFetching ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 10 }} />
      ) : term.trim().length >= 2 ? (
        (results ?? []).map((p) => (
          <Pressable key={p.id} onPress={() => onAdd({ label: p.name, invitedProfileId: p.id, invitedName: p.name })} className="flex-row items-center gap-3 py-2.5">
            <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: p.color }}>
              <Text style={{ color: colors.base, fontWeight: "800" }}>{p.name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <Text className="flex-1 font-body-bold text-[14.5px]" style={{ color: colors.text }}>{p.name}</Text>
            <Ionicons name="add" size={16} color={colors.accent} />
          </Pressable>
        ))
      ) : (
        <Pressable onPress={() => onAdd({ label: null })} className="flex-row items-center gap-2.5 py-2.5 mt-1">
          <Ionicons name="add-circle-outline" size={16} color={colors.textSecondary} />
          <Text className="flex-1 font-body-bold text-[14px]" style={{ color: colors.textSecondary }}>Just hold a spot, name it later</Text>
        </Pressable>
      )}
    </Sheet>
  );
}
