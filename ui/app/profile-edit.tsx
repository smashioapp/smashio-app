import { useState } from "react";
import { View, Text, TextInput, Pressable, Alert, ScrollView } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useEffect } from "react";
import { colors, TIERS, TierId, avatarColor } from "../lib/theme";
import { Button } from "../components/Button";
import { Screen } from "../components/Screen";
import { BackButton } from "../components/BackButton";
import { Avatar } from "../components/Avatar";
import { AvatarPicker } from "../components/AvatarPicker";
import { OfflineStatus, SessionExpiredStatus } from "../components/SubscreenStatus";
import type { AnimalKey } from "../lib/avatars";
import { useSession } from "../lib/session";
import { useProfile, useProfileSports, useUpdateProfile, useUpsertProfileSport, useUploadAvatar, useSetHomePoint } from "../lib/queries/profile";
import { useSports, useSkillTiers } from "../lib/queries/sports";
import { SPORT_SLUG } from "../lib/queries/games";
import { supabase } from "../lib/supabase";
import { newSessionToken, searchPlaces, getPlaceDetails } from "../lib/places";
import { useVenuesDirectory } from "../lib/queries/venues";
import { Sheet } from "../components/Sheet";
import { useOnline } from "../lib/useOnline";
import { isAuthSessionError } from "../lib/authError";

const NIGHTS: { key: string; label: string }[] = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

const ABOUT_YOU_MAX = 240;

export default function ProfileEdit() {
  const { session, isLoading: sessionLoading } = useSession();
  const online = useOnline();
  const userId = session?.user.id;
  const { data: profile, error: profileError, refetch: refetchProfile } = useProfile(userId);
  const { data: profileSports, isSuccess: sportsLoaded } = useProfileSports(userId);
  const { data: sports } = useSports();
  const { data: tiers } = useSkillTiers(SPORT_SLUG);

  const [name, setName] = useState(profile?.display_name ?? "");
  const [suburb, setSuburb] = useState(profile?.home_suburb ?? "");
  const [skill, setSkill] = useState<TierId>("Intermediate");
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const [avatarKeyChoice, setAvatarKeyChoice] = useState<AnimalKey | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [suburbTouched, setSuburbTouched] = useState(false);
  const [skillTouched, setSkillTouched] = useState(false);

  // Edit profile v3 (design-brief.md Prompt 8 item 10) — the fields a host actually reads
  // before approving someone, not just a skill tier.
  const [aboutYou, setAboutYou] = useState(profile?.about_you ?? "");
  const [aboutYouTouched, setAboutYouTouched] = useState(false);
  const [usualNights, setUsualNights] = useState<string[]>(profile?.usual_nights ?? []);
  const [nightsTouched, setNightsTouched] = useState(false);
  const [homeVenueId, setHomeVenueId] = useState<string | null | undefined>(undefined);
  const [homeVenueName, setHomeVenueName] = useState<string | null | undefined>(undefined);
  const [venuePickerOpen, setVenuePickerOpen] = useState(false);
  const [venueSearch, setVenueSearch] = useState("");
  const { data: venueResults } = useVenuesDirectory({ search: venueSearch || undefined });

  // Sync from the query once it resolves instead of seeding the initial state from it — the
  // profile_sports fetch lands after first render, and without this, saving before it arrives
  // silently wrote every player back to the default "Intermediate" (profile-plan.md P0).
  useEffect(() => {
    if (sportsLoaded && !skillTouched) {
      const current = profileSports?.[0]?.skill_tiers?.label as TierId | undefined;
      if (current) setSkill(current);
    }
  }, [sportsLoaded, profileSports, skillTouched]);

  // Same "sync once resolved, never seed the initial render" shape as skill above — profile is
  // fetched async, so seeding useState directly from it risks the same silent-overwrite bug P0
  // already fixed once for skill tier.
  useEffect(() => {
    if (profile && !aboutYouTouched) setAboutYou(profile.about_you ?? "");
  }, [profile, aboutYouTouched]);
  useEffect(() => {
    if (profile && !nightsTouched) setUsualNights(profile.usual_nights ?? []);
  }, [profile, nightsTouched]);
  useEffect(() => {
    if (!profile || homeVenueId !== undefined) return;
    setHomeVenueId(profile.home_venue_id ?? null);
    if (profile.home_venue_id) {
      supabase
        .from("venues")
        .select("name")
        .eq("id", profile.home_venue_id)
        .maybeSingle()
        .then(({ data }) => setHomeVenueName(data?.name ?? null));
    } else {
      setHomeVenueName(null);
    }
  }, [profile, homeVenueId]);

  const toggleNight = (key: string) => {
    setNightsTouched(true);
    setUsualNights((prev) => (prev.includes(key) ? prev.filter((n) => n !== key) : [...prev, key]));
  };

  const updateProfile = useUpdateProfile(userId);
  const uploadAvatar = useUploadAvatar();
  const upsertProfileSport = useUpsertProfileSport();
  const setHomePoint = useSetHomePoint();

  const sessionExpired =
    (!sessionLoading && !session) || isAuthSessionError(profileError) || isAuthSessionError(updateProfile.error) || isAuthSessionError(uploadAvatar.error);

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo access so you can change your profile picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) {
      setLocalPhotoUri(result.assets[0].uri);
      setAvatarKeyChoice(null);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow camera access so you can take a profile picture.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) {
      setLocalPhotoUri(result.assets[0].uri);
      setAvatarKeyChoice(null);
    }
  };

  const changeAvatar = () => {
    Alert.alert("Change avatar", undefined, [
      { text: "Take photo", onPress: takePhoto },
      { text: "Choose photo", onPress: pickPhoto },
      { text: "Pick a Smashimal", onPress: () => setPickerVisible(true) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const save = async () => {
    const badminton = sports?.find((s) => s.slug === SPORT_SLUG);
    const tierRow = tiers?.find((t) => t.label === skill);
    try {
      if (localPhotoUri) await uploadAvatar.mutateAsync(localPhotoUri);
      const trimmedSuburb = suburb.trim();
      await updateProfile.mutateAsync({
        display_name: name.trim(),
        home_suburb: trimmedSuburb || null,
        about_you: aboutYou.trim() || null,
        usual_nights: usualNights,
        home_venue_id: homeVenueId ?? null,
        // Picking an animal clears photo_path; a fresh photo upload (above) leaves avatar_key
        // intact underneath as the fallback (avatars-plan.md P2).
        ...(avatarKeyChoice ? { avatar_key: avatarKeyChoice, photo_path: null } : {}),
      });
      if (badminton && tierRow) await upsertProfileSport.mutateAsync({ sportId: badminton.id, skillTierId: tierRow.id });
      // Best-effort: a distance fallback for "near me" is a nice-to-have, not worth blocking
      // save over a flaky geocode (profile-plan.md P5).
      if (trimmedSuburb && suburbTouched) {
        try {
          const token = newSessionToken();
          const [first] = await searchPlaces(trimmedSuburb, token);
          if (first) {
            const details = await getPlaceDetails(first.placeId, token);
            await setHomePoint.mutateAsync({ lat: details.lat, lng: details.lng });
          }
        } catch {}
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "Give it another go.";
      Alert.alert("Couldn't save your profile", message);
      return;
    }
    router.back();
  };

  const saving = updateProfile.isPending || uploadAvatar.isPending || upsertProfileSport.isPending;
  const existingPhotoUrl = profile?.photo_path
    ? supabase.storage.from("avatars").getPublicUrl(profile.photo_path).data.publicUrl
    : null;
  const previewUri = avatarKeyChoice ? null : localPhotoUri ?? existingPhotoUrl;
  const previewAvatarKey = avatarKeyChoice ?? profile?.avatar_key;
  const displayName = nameTouched ? name : profile?.display_name ?? name;
  const displaySuburb = suburbTouched ? suburb : profile?.home_suburb ?? suburb;

  return (
    <Screen>
      <View className="flex-row items-center gap-3 px-5 pt-2 pb-1">
        <BackButton onPress={() => router.back()} />
        <Text className="font-display text-[20px]" style={{ color: colors.text }}>
          Edit profile
        </Text>
      </View>
      {!online ? (
        <OfflineStatus onRetry={() => refetchProfile()} />
      ) : sessionExpired ? (
        <SessionExpiredStatus
          onSignIn={() => {
            supabase.auth.signOut().catch(() => {});
            router.replace("/onboarding");
          }}
        />
      ) : (
      <>
      <ScrollView className="flex-1 px-6 pt-4" contentContainerStyle={{ paddingBottom: 24, gap: 14 }}>
        <Pressable onPress={changeAvatar} className="self-center mb-2" accessibilityRole="button" accessibilityLabel="Change avatar">
          <View style={{ width: 88, height: 88 }}>
            <Avatar
              id={userId}
              name={displayName || "?"}
              color={avatarColor(userId ?? "")}
              size={88}
              photoUri={previewUri}
              avatarKey={previewAvatarKey}
            />
            <View
              className="absolute rounded-full items-center justify-center"
              style={{ bottom: -2, right: -2, width: 30, height: 30, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.base }}
            >
              <Ionicons name="pencil" size={13} color={colors.base} />
            </View>
          </View>
        </Pressable>

        <Text className="font-body-extrabold text-[13px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
          Display name
        </Text>
        <TextInput
          value={displayName}
          onChangeText={(t) => {
            setNameTouched(true);
            setName(t);
          }}
          placeholderTextColor={colors.textMuted}
          className="rounded-2xl px-4 py-4 border font-body-semibold text-[16.5px]"
          style={{ backgroundColor: colors.surfaceAlt, borderColor: "rgba(255,255,255,0.1)", color: colors.text }}
        />

        <Text className="font-body-extrabold text-[13px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
          Suburb
        </Text>
        <TextInput
          value={displaySuburb}
          onChangeText={(t) => {
            setSuburbTouched(true);
            setSuburb(t);
          }}
          placeholder="e.g. Bondi Junction NSW"
          placeholderTextColor={colors.textMuted}
          className="rounded-2xl px-4 py-4 border font-body-semibold text-[16.5px]"
          style={{ backgroundColor: colors.surfaceAlt, borderColor: "rgba(255,255,255,0.1)", color: colors.text }}
        />
        <Text className="text-[11.5px] -mt-2.5" style={{ color: colors.textTertiary }}>
          Shown as text only, never a map pin.
        </Text>

        <View className="mt-1.5">
          <Text className="font-body-extrabold text-[13px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
            Starting skill level
          </Text>
          <Text className="text-[11.5px] mt-1 mb-2" style={{ color: colors.textTertiary }}>
            Your co-players' ratings will fine-tune this after your first few games.
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {TIERS.map((t) => {
              const active = skill === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => {
                    setSkillTouched(true);
                    setSkill(t.id);
                  }}
                  className="flex-row items-center gap-2 rounded-pill px-4 py-2.5 border-[1.5px]"
                  style={{ backgroundColor: active ? colors.surfaceAlt : colors.surface, borderColor: active ? t.color : "rgba(255,255,255,0.07)" }}
                >
                  <View className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                  <Text className="font-body-extrabold text-[13.5px]" style={{ color: colors.text }}>
                    {t.id}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="mt-1.5">
          <Text className="font-body-extrabold text-[13px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
            About you
          </Text>
          <Text className="text-[11.5px] mt-1 mb-2" style={{ color: colors.textTertiary }}>
            One line hosts see before approving you. Optional.
          </Text>
          <TextInput
            value={aboutYou}
            onChangeText={(t) => {
              setAboutYouTouched(true);
              setAboutYou(t.slice(0, ABOUT_YOU_MAX));
            }}
            placeholder="e.g. Casual player, keen for doubles most weeks"
            placeholderTextColor={colors.textMuted}
            multiline
            className="rounded-2xl px-4 py-4 border font-body-semibold text-[15px]"
            style={{ backgroundColor: colors.surfaceAlt, borderColor: "rgba(255,255,255,0.1)", color: colors.text, minHeight: 72, textAlignVertical: "top" }}
          />
          <Text className="text-[11px] mt-1 text-right" style={{ color: colors.textMuted }}>
            {aboutYou.length}/{ABOUT_YOU_MAX}
          </Text>
        </View>

        <View className="mt-1.5">
          <Text className="font-body-extrabold text-[13px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
            Usual nights
          </Text>
          <Text className="text-[11.5px] mt-1 mb-2" style={{ color: colors.textTertiary }}>
            When you're usually free to play. Optional.
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {NIGHTS.map((n) => {
              const active = usualNights.includes(n.key);
              return (
                <Pressable
                  key={n.key}
                  onPress={() => toggleNight(n.key)}
                  className="rounded-pill px-4 py-2.5 border-[1.5px]"
                  style={{ backgroundColor: active ? colors.accent : colors.surface, borderColor: active ? colors.accent : "rgba(255,255,255,0.07)" }}
                >
                  <Text className="font-body-extrabold text-[13px]" style={{ color: active ? colors.base : colors.text }}>
                    {n.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="mt-1.5">
          <Text className="font-body-extrabold text-[13px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
            Home venue
          </Text>
          <Text className="text-[11.5px] mt-1 mb-2" style={{ color: colors.textTertiary }}>
            Where you usually play. Optional.
          </Text>
          <Pressable
            onPress={() => setVenuePickerOpen(true)}
            className="rounded-2xl px-4 py-4 border flex-row items-center justify-between"
            style={{ backgroundColor: colors.surfaceAlt, borderColor: "rgba(255,255,255,0.1)" }}
          >
            <Text className="font-body-semibold text-[15px]" style={{ color: homeVenueName ? colors.text : colors.textMuted }} numberOfLines={1}>
              {homeVenueName || "Pick a venue"}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>
          {homeVenueId && (
            <Pressable
              onPress={() => {
                setHomeVenueId(null);
                setHomeVenueName(null);
              }}
              hitSlop={6}
              className="mt-1.5 self-start"
            >
              <Text className="text-[12px] font-body-bold" style={{ color: colors.textSecondary }}>
                Clear
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      <View className="px-6 pb-2" style={{ paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.cardBorder }}>
        <Button label="Save changes" loading={saving} disabled={!displayName.trim() || !sportsLoaded} onPress={save} />
      </View>

      <Sheet visible={venuePickerOpen} onClose={() => setVenuePickerOpen(false)} title="Pick your home venue">
        <TextInput
          value={venueSearch}
          onChangeText={setVenueSearch}
          placeholder="Search venues"
          placeholderTextColor={colors.textMuted}
          className="rounded-2xl px-4 py-3 border font-body-semibold text-[14.5px] mb-3"
          style={{ backgroundColor: colors.surfaceAlt, borderColor: "rgba(255,255,255,0.1)", color: colors.text }}
        />
        {(venueResults ?? []).slice(0, 20).map((v) => (
          <Pressable
            key={v.id}
            className="py-3"
            style={{ borderTopWidth: 1, borderTopColor: colors.cardBorder }}
            onPress={() => {
              setHomeVenueId(v.id);
              setHomeVenueName(v.name);
              setVenuePickerOpen(false);
              setVenueSearch("");
            }}
          >
            <Text className="font-body-semibold text-[14px]" style={{ color: colors.text }}>
              {v.name}
            </Text>
            <Text className="text-[12px] mt-0.5" style={{ color: colors.textTertiary }}>
              {v.suburb}
            </Text>
          </Pressable>
        ))}
        {venueSearch && (venueResults ?? []).length === 0 && (
          <Text className="text-[13px] text-center py-4" style={{ color: colors.textTertiary }}>
            No venues found for "{venueSearch}"
          </Text>
        )}
      </Sheet>

      <AvatarPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        id={userId ?? ""}
        selectedKey={previewAvatarKey}
        onSelect={(key) => {
          setAvatarKeyChoice(key);
          setLocalPhotoUri(null);
        }}
      />
      </>
      )}
    </Screen>
  );
}
