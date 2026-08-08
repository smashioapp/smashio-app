import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, Alert, Image, TextInput, ActivityIndicator, Platform, ViewStyle } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useAppStore } from "../lib/store";
import { colors, gradients, TIERS } from "../lib/theme";
import { formatDate, formatTimeRange } from "../lib/format";
import { useUpsertPlaceVenue } from "../lib/queries/venues";
import { useSkillTiers, useSports } from "../lib/queries/sports";
import { useCreateGame, useUploadConfirmation } from "../lib/queries/games";
import { newSessionToken, searchPlaces, getPlaceDetails, type PlacePrediction } from "../lib/places";
import { Chip } from "../components/Chip";

const STEP_COUNT = 6;
const NEXT_LABELS = ["Continue", "Continue", "Continue", "Continue", "Publish match", "Let's go!"];
const SPORT_SLUG = "badminton";
const GAME_DURATION_MS = 2 * 60 * 60 * 1000;

// This modal doesn't go through Screen (it manages its own top padding
// instead of safe-area edges), so it needs the same web phone-frame
// constraint applied directly — otherwise it spans the full browser width.
const webShellStyle =
  Platform.OS === "web" ? ({ maxWidth: 430, width: "100%", marginHorizontal: "auto", height: "100%" } as ViewStyle) : undefined;

const TIME_OPTIONS = [
  { label: "6:00 PM", h: 18, m: 0 },
  { label: "7:00 PM", h: 19, m: 0 },
  { label: "7:30 PM", h: 19, m: 30 },
  { label: "8:00 PM", h: 20, m: 0 },
  { label: "9:00 AM", h: 9, m: 0 },
  { label: "10:00 AM", h: 10, m: 0 },
];

function dateOptions(): { label: string; date: Date }[] {
  return Array.from({ length: 4 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : formatDate(d.toISOString());
    return { label, date: d };
  });
}

export default function Wizard() {
  const [step, setStep] = useState(0);
  const { wizard, resetWizard, selectVenue, setStartsAt, selectWizardTier, incPlayers, decPlayers, incCost, decCost } =
    useAppStore();

  const { data: sports = [] } = useSports();
  const { data: tiers = [] } = useSkillTiers(SPORT_SLUG);
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
    resetWizard();
    setConfirmationUri(null);
    setCreatedGameId(null);
    setVerified(false);
    setVenueQuery("");
    setVenueResults([]);
    setSelectedVenue(null);
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
  const nextDisabled = step === 0 && !wizard.venueId;
  const endsAt = new Date(wizard.startsAt.getTime() + GAME_DURATION_MS);

  const goBack = () => {
    if (step === 0) router.back();
    else setStep(step - 1);
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
      Alert.alert("Not ready yet", "Still loading match settings — try again in a moment.");
      return;
    }
    setPublishing(true);
    try {
      const id = await createGame.mutateAsync({
        venueId: wizard.venueId,
        sportId: sport.id,
        skillTierId: tier.id,
        startsAt: wizard.startsAt,
        maxPlayers: wizard.maxPlayers,
        costTotalCents: Math.round(wizard.cost * 100),
      });
      setCreatedGameId(id);
      if (confirmationUri) {
        await uploadConfirmation.mutateAsync({ gameId: id, localUri: confirmationUri });
        setVerified(true);
      }
      setStep(step + 1);
    } catch (e) {
      Alert.alert("Couldn't publish match", e instanceof Error ? e.message : "Try again.");
    } finally {
      setPublishing(false);
    }
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
    <View style={Platform.OS === "web" ? { flex: 1, backgroundColor: "#08080A", alignItems: "center" } : { flex: 1 }}>
    <View className="flex-1 pt-14" style={{ backgroundColor: "#08080A", ...webShellStyle }}>
      <View className="flex-row items-center gap-3 px-5 pb-1">
        <Pressable onPress={goBack} className="w-[34px] h-[34px] rounded-full items-center justify-center" style={{ backgroundColor: "#17171A" }}>
          <Ionicons name="chevron-back" size={16} color={colors.text} />
        </Pressable>
        <Text className="font-display text-[19px]" style={{ color: colors.text }}>
          Host a Match
        </Text>
      </View>

      <View className="flex-row gap-1.5 px-5 py-4">
        {Array.from({ length: STEP_COUNT }, (_, i) => (
          <View key={i} className="flex-1 h-1 rounded-full" style={{ backgroundColor: i <= step ? colors.accent : "rgba(255,255,255,0.1)" }} />
        ))}
      </View>

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
                className="flex-1 py-3.5 text-[14px]"
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
                    <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
                      {p.mainText}
                    </Text>
                    <Text className="text-[11.5px] mt-0.5" style={{ color: colors.textSecondary }}>
                      {p.secondaryText}
                    </Text>
                  </View>
                </Pressable>
              ))}

            {!selectedVenue && !venueSearching && venueQuery.trim().length >= 3 && venueResults.length === 0 && (
              <Text className="text-[12.5px] mt-2" style={{ color: colors.textMuted }}>
                No venues found. Try a different search.
              </Text>
            )}

            {selectedVenue && (
              <View className="rounded-2xl px-3.5 py-3.5 border-[1.5px]" style={{ backgroundColor: "#1D2416", borderColor: colors.accent }}>
                <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
                  {selectedVenue.name}
                </Text>
                <Text className="text-[11.5px] mt-0.5" style={{ color: colors.textSecondary }}>
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
                    onPress={() => {
                      const next = new Date(date);
                      next.setHours(wizard.startsAt.getHours(), wizard.startsAt.getMinutes());
                      setStartsAt(next);
                    }}
                  />
                );
              })}
            </View>
            <Label>Time slot</Label>
            <View className="flex-row flex-wrap gap-2">
              {TIME_OPTIONS.map(({ label, h, m }) => {
                const active = wizard.startsAt.getHours() === h && wizard.startsAt.getMinutes() === m;
                return (
                  <Chip
                    key={label}
                    label={label}
                    active={active}
                    onPress={() => {
                      const next = new Date(wizard.startsAt);
                      next.setHours(h, m);
                      setStartsAt(next);
                    }}
                  />
                );
              })}
            </View>
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
                  <Text className="font-body-extrabold text-[14px]" style={{ color: colors.text }}>
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
            <StepHeading title="Split the cost" subtitle="Court fees, shared evenly — no awkward math." />
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
              <Text className="text-[13px] font-body-bold" style={{ color: colors.accent }}>
                Even split · {wizard.maxPlayers} players
              </Text>
              <Text className="font-display-bold text-[19px]" style={{ color: colors.accent }}>
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
              <Text className="font-body-bold text-[13px]" style={{ color: confirmationUri ? colors.intermediate : colors.textMuted }}>
                {confirmationUri ? "✓ Selected — uploads when you publish" : "Tap to upload confirmation (photo)"}
              </Text>
            </Pressable>
          </View>
        )}

        {step === 5 && (
          <View className="items-center gap-3.5 pt-3.5">
            <View className="w-[72px] h-[72px] rounded-full items-center justify-center" style={{ backgroundColor: "rgba(214,255,63,0.15)" }}>
              <Ionicons name="checkmark" size={30} color={colors.accent} />
            </View>
            <Text className="font-display text-[23px]" style={{ color: colors.text }}>
              You're hosting!
            </Text>
            <Text className="text-[12.5px] text-center max-w-[230px]" style={{ color: colors.textSecondary }}>
              Your match at {venue?.name ?? "your venue"} is live. Players will start joining any moment.
            </Text>
            <View className="w-full rounded-2xl p-4 border mt-1.5" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
              <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
                {venue?.name ?? "your venue"}
              </Text>
              <Text className="text-[12px] mt-1" style={{ color: colors.textSecondary }}>
                {formatDate(wizard.startsAt.toISOString())} · {formatTimeRange(wizard.startsAt.toISOString(), endsAt.toISOString())}
              </Text>
              <View
                className="rounded-pill self-start px-2.5 py-1.5 mt-2.5"
                style={{ backgroundColor: verified ? "rgba(76,217,100,0.15)" : "rgba(255,182,72,0.15)" }}
              >
                <Text
                  className="font-body-extrabold text-[9.5px] uppercase"
                  style={{ color: verified ? colors.intermediate : colors.advanced }}
                >
                  {verified ? "Verified" : "Awaiting booking upload"}
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      <View className="px-5 pb-8 pt-3.5">
        {nextDisabled ? (
          <View className="rounded-pill py-4 items-center" style={{ backgroundColor: colors.surfaceAlt }}>
            <Text className="font-body-extrabold text-[15px]" style={{ color: colors.textMuted }}>
              {NEXT_LABELS[step]}
            </Text>
          </View>
        ) : (
          <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} className="rounded-pill">
            <Pressable onPress={goNext} disabled={publishing} className="py-4 items-center" style={{ opacity: publishing ? 0.6 : 1 }}>
              <Text className="font-body-extrabold text-[15px]" style={{ color: colors.base }}>
                {publishing ? "Publishing…" : NEXT_LABELS[step]}
              </Text>
            </Pressable>
          </LinearGradient>
        )}
      </View>
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
      <Text className="font-display text-[22px] mb-1" style={{ color: colors.text }}>
        {title}
      </Text>
      <Text className="text-[12.5px]" style={{ color: "#8A8A92" }}>
        {subtitle}
      </Text>
    </View>
  );
}

function Label({ children, style }: { children: string; style?: object }) {
  return (
    <Text className="font-body-extrabold text-[11px] uppercase mb-2.5" style={{ color: colors.textTertiary, ...(style ?? {}) }}>
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
