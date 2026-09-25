import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { View, Text, Pressable, TextInput, ActivityIndicator, Linking, Alert } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../lib/theme";
import { useAlertPool, SPOT_ALERT_RADIUS_KM, SPOT_ALERTS_PER_DAY } from "../lib/alertPool";
import { useSetNotificationCategory } from "../lib/queries/notificationPrefs";
import { useSetHomePoint, useUpdateProfile } from "../lib/queries/profile";
import { useVenuesDirectory } from "../lib/queries/venues";
import { getPlaceDetails, hasPlacesKey, newSessionToken, searchPlaces, type PlacePrediction } from "../lib/places";
import { suburbHits } from "../lib/suburbs";
import { haptics } from "../lib/haptics";
import { Sheet } from "./Sheet";

// Typed suburb -> home point, no GPS needed (short-a-player-ux-plan.md §6.2). Places when the
// Maps key is set, else the suburbs our venues sit in (their centroid is close enough for a 10km
// ring). Writes home_suburb for display and the point via set_home_point (profile_private).
export function HomeSuburbSheet({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved?: () => void }) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<PlacePrediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const tokenRef = useRef(newSessionToken());
  const setHomePoint = useSetHomePoint();
  const updateProfile = useUpdateProfile();
  const trimmed = query.trim();
  const venuesQuery = useVenuesDirectory({ search: trimmed || undefined }, { enabled: visible && !hasPlacesKey && trimmed.length >= 2 });
  const fallbackHits = !hasPlacesKey && trimmed.length >= 2 ? suburbHits((venuesQuery.data ?? []).map((v) => ({ suburb: v.suburb, lat: v.lat, lng: v.lng })), [], trimmed).slice(0, 6) : [];

  useEffect(() => {
    if (!hasPlacesKey || trimmed.length < 3) {
      setPlaces([]);
      return;
    }
    const h = setTimeout(async () => {
      setSearching(true);
      try {
        setPlaces(await searchPlaces(trimmed, tokenRef.current, "(regions)"));
      } catch {
        setPlaces([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(h);
  }, [trimmed]);

  const save = async (suburb: string, lat: number, lng: number) => {
    setSaving(true);
    try {
      await setHomePoint.mutateAsync({ lat, lng });
      await updateProfile.mutateAsync({ home_suburb: suburb }).catch(() => {});
      haptics.success();
      setQuery("");
      onSaved?.();
      onClose();
    } catch (e) {
      Alert.alert("Couldn't save that", e instanceof Error ? e.message : "Give it another go.");
    } finally {
      setSaving(false);
    }
  };

  const pickPlace = async (p: PlacePrediction) => {
    setSaving(true);
    try {
      const d = await getPlaceDetails(p.placeId, tokenRef.current);
      tokenRef.current = newSessionToken();
      await save(d.suburb || p.mainText, d.lat, d.lng);
    } catch (e) {
      setSaving(false);
      Alert.alert("Couldn't find that suburb", e instanceof Error ? e.message : "Try typing it a different way.");
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Your suburb">
      <Text className="text-[13.5px]" style={{ color: colors.textSecondary }}>
        We ping you when a game within {SPOT_ALERT_RADIUS_KM} km of here is short a player at your level. Only the suburb shows on your profile.
      </Text>
      <View
        className="flex-row items-center gap-2 rounded-pill px-4 border mt-3"
        style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder, height: 44 }}
      >
        <Ionicons name="search" size={15} color={colors.textTertiary} />
        <TextInput
          testID="home-suburb-input"
          value={query}
          onChangeText={setQuery}
          placeholder="e.g. Marrickville"
          placeholderTextColor={colors.textTertiary}
          autoFocus
          className="flex-1 text-[14px]"
          style={{ color: colors.text }}
        />
        {(searching || saving || venuesQuery.isFetching) && <ActivityIndicator size="small" color={colors.accent} />}
      </View>
      <View className="mt-2">
        {places.map((p) => (
          <Pressable key={p.placeId} disabled={saving} onPress={() => pickPlace(p)} className="flex-row items-center gap-3 py-3">
            <Ionicons name="location-outline" size={15} color={colors.textTertiary} />
            <View className="flex-1">
              <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
                {p.mainText}
              </Text>
              <Text className="text-[12px]" style={{ color: colors.textSecondary }}>
                {p.secondaryText}
              </Text>
            </View>
          </Pressable>
        ))}
        {fallbackHits.map((h) => (
          <Pressable key={h.suburb} disabled={saving} onPress={() => save(h.suburb, h.lat, h.lng)} className="flex-row items-center gap-3 py-3">
            <Ionicons name="location-outline" size={15} color={colors.textTertiary} />
            <Text className="flex-1 font-body-bold text-[14px]" style={{ color: colors.text }}>
              {h.suburb}
            </Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

// "Spot alerts" (short-a-player-ux-plan.md §6.1, F20). The alert pool is the launch constraint,
// and it was invisible: set once in onboarding, no way to see it or fix it after. One card, four
// states, each with the one action that fixes it.
export function SpotAlertsCard() {
  const pool = useAlertPool();
  const setCategory = useSetNotificationCategory();
  const [suburbOpen, setSuburbOpen] = useState(false);

  if (!pool.loaded) return null;

  const on = pool.state === "on";
  const title =
    pool.state === "no_home"
      ? "Set your suburb to get pinged"
      : pool.state === "push_denied"
        ? "Notifications are off for Smashio"
        : pool.state === "off"
          ? "Spot alerts are off"
          : `Pinged when someone near ${pool.suburb ?? "you"} is short a player${pool.tierLabel ? ` at ${pool.tierLabel}` : ""}`;
  const detail =
    pool.state === "no_home"
      ? "Last-minute spots go to players nearby. Pop in your suburb, no GPS needed."
      : pool.state === "push_denied"
        ? "Turn them on in Settings so spot alerts can reach you."
        : pool.state === "off"
          ? "You won't hear about last-minute spots near you."
          : `Within ${SPOT_ALERT_RADIUS_KM} km · max ${SPOT_ALERTS_PER_DAY} a day · quiet ${pool.quiet}`;

  return (
    <View testID="spot-alerts-card" className="rounded-2xl p-4 border" style={{ backgroundColor: colors.card, borderColor: on ? "rgba(214,255,63,0.25)" : colors.cardBorder }}>
      <View className="flex-row items-center justify-between">
        <Text className="font-body-extrabold text-[12px] uppercase" style={{ color: colors.textTertiary, letterSpacing: 0.8 }}>
          Spot alerts
        </Text>
        {(pool.state === "on" || pool.state === "off") && (
          <Pressable
            testID="spot-alerts-toggle"
            accessibilityRole="switch"
            accessibilityState={{ checked: on }}
            onPress={() => {
              haptics.tap();
              setCategory.mutate({ category: "alerts", enabled: !on });
            }}
            className="w-11 h-6 rounded-pill justify-center px-0.5"
            style={{ backgroundColor: on ? colors.accent : colors.surfaceAlt }}
          >
            <View className="w-5 h-5 rounded-full" style={{ backgroundColor: colors.base, alignSelf: on ? "flex-end" : "flex-start" }} />
          </Pressable>
        )}
      </View>
      <Text className="font-body-bold text-[14.5px] mt-2" style={{ color: colors.text }}>
        {title}
      </Text>
      <Text className="text-[12.5px] mt-1" style={{ color: colors.textSecondary }}>
        {detail}
      </Text>
      {pool.state === "no_home" && (
        <Pressable onPress={() => setSuburbOpen(true)} className="self-start rounded-pill px-3.5 py-2 mt-3" style={{ backgroundColor: colors.accent }}>
          <Text className="font-body-extrabold text-[12.5px]" style={{ color: colors.base }}>
            Set your suburb
          </Text>
        </Pressable>
      )}
      {pool.state === "push_denied" && (
        <Pressable onPress={() => Linking.openSettings()} className="self-start rounded-pill px-3.5 py-2 mt-3" style={{ backgroundColor: colors.surfaceAlt }}>
          <Text className="font-body-bold text-[12.5px]" style={{ color: colors.text }}>
            Open Settings
          </Text>
        </Pressable>
      )}
      {pool.state === "on" && (
        <View className="flex-row gap-4 mt-2.5">
          <Pressable onPress={() => setSuburbOpen(true)} hitSlop={6}>
            <Text className="font-body-bold text-[12.5px]" style={{ color: colors.accent }}>
              Change suburb
            </Text>
          </Pressable>
          <Pressable onPress={() => router.push("/notification-settings")} hitSlop={6}>
            <Text className="font-body-bold text-[12.5px]" style={{ color: colors.textSecondary }}>
              Quiet hours ›
            </Text>
          </Pressable>
        </View>
      )}
      <HomeSuburbSheet visible={suburbOpen} onClose={() => setSuburbOpen(false)} />
    </View>
  );
}

// Recovery nudge (short-a-player-ux-plan.md §6.2, F19): skipping location in onboarding used to
// drop a player out of the alert pool silently and for good. One dismissible row on Discover,
// snoozed 7 days per dismissal and gone after the third.
const NUDGE_KEY = "smashio.spot_alerts_nudge";
const NUDGE_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const NUDGE_MAX_DISMISSALS = 3;

type NudgeRecord = { dismissals: number; until: number };

async function readNudge(): Promise<NudgeRecord> {
  try {
    const raw = await AsyncStorage.getItem(NUDGE_KEY);
    if (raw) return JSON.parse(raw) as NudgeRecord;
  } catch {}
  return { dismissals: 0, until: 0 };
}

export function SpotAlertsNudge() {
  const pool = useAlertPool();
  const setCategory = useSetNotificationCategory();
  const [record, setRecord] = useState<NudgeRecord | null>(null);
  const [suburbOpen, setSuburbOpen] = useState(false);

  useEffect(() => {
    readNudge().then(setRecord);
  }, []);

  if (!pool.loaded || !record) return null;
  if (pool.state !== "no_home" && pool.state !== "off") return null;
  if (record.dismissals >= NUDGE_MAX_DISMISSALS || Date.now() < record.until) return null;

  const dismiss = () => {
    haptics.tap();
    const next = { dismissals: record.dismissals + 1, until: Date.now() + NUDGE_SNOOZE_MS };
    setRecord(next);
    AsyncStorage.setItem(NUDGE_KEY, JSON.stringify(next)).catch(() => {});
  };

  const act = () => {
    haptics.tap();
    if (pool.state === "off") setCategory.mutate({ category: "alerts", enabled: true });
    else setSuburbOpen(true);
  };

  return (
    <View testID="spot-alerts-nudge" className="flex-row items-center gap-2.5 rounded-2xl pl-3.5 pr-2 py-2.5 border" style={{ backgroundColor: colors.card, borderColor: "rgba(214,255,63,0.2)" }}>
      <Ionicons name="notifications-outline" size={16} color={colors.accent} />
      <Pressable onPress={act} className="flex-1">
        <Text className="text-[13px]" style={{ color: colors.textDim }}>
          Get pinged when a spot opens near you.{" "}
          <Text className="font-body-bold" style={{ color: colors.accent }}>
            {pool.state === "off" ? "Turn spot alerts on ›" : "Set your suburb ›"}
          </Text>
        </Text>
      </Pressable>
      <Pressable onPress={dismiss} hitSlop={8} accessibilityLabel="Not now">
        <Ionicons name="close" size={16} color={colors.textTertiary} />
      </Pressable>
      <HomeSuburbSheet visible={suburbOpen} onClose={() => setSuburbOpen(false)} />
    </View>
  );
}
