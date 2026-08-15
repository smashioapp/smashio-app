import { useState } from "react";
import { View, Text, TextInput, Pressable, Image, Alert, ScrollView } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useEffect } from "react";
import { colors, TIERS, TierId } from "../lib/theme";
import { Button } from "../components/Button";
import { Screen } from "../components/Screen";
import { BackButton } from "../components/BackButton";
import { useSession } from "../lib/session";
import { useProfile, useProfileSports, useUpdateProfile, useUpsertProfileSport, useUploadAvatar, useSetHomePoint } from "../lib/queries/profile";
import { useSports, useSkillTiers } from "../lib/queries/sports";
import { SPORT_SLUG } from "../lib/queries/games";
import { supabase } from "../lib/supabase";
import { newSessionToken, searchPlaces, getPlaceDetails } from "../lib/places";

export default function ProfileEdit() {
  const { session } = useSession();
  const userId = session?.user.id;
  const { data: profile } = useProfile(userId);
  const { data: profileSports, isSuccess: sportsLoaded } = useProfileSports(userId);
  const { data: sports } = useSports();
  const { data: tiers } = useSkillTiers(SPORT_SLUG);

  const [name, setName] = useState(profile?.display_name ?? "");
  const [suburb, setSuburb] = useState(profile?.home_suburb ?? "");
  const [skill, setSkill] = useState<TierId>("Intermediate");
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [suburbTouched, setSuburbTouched] = useState(false);
  const [skillTouched, setSkillTouched] = useState(false);

  // Sync from the query once it resolves instead of seeding the initial state from it — the
  // profile_sports fetch lands after first render, and without this, saving before it arrives
  // silently wrote every player back to the default "Intermediate" (profile-plan.md P0).
  useEffect(() => {
    if (sportsLoaded && !skillTouched) {
      const current = profileSports?.[0]?.skill_tiers?.label as TierId | undefined;
      if (current) setSkill(current);
    }
  }, [sportsLoaded, profileSports, skillTouched]);

  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const upsertProfileSport = useUpsertProfileSport();
  const setHomePoint = useSetHomePoint();

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo access to change your profile picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) setLocalPhotoUri(result.assets[0].uri);
  };

  const save = async () => {
    const badminton = sports?.find((s) => s.slug === SPORT_SLUG);
    const tierRow = tiers?.find((t) => t.label === skill);
    try {
      if (localPhotoUri) await uploadAvatar.mutateAsync(localPhotoUri);
      const trimmedSuburb = suburb.trim();
      await updateProfile.mutateAsync({ display_name: name.trim(), home_suburb: trimmedSuburb || null });
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
      Alert.alert("Couldn't save profile", e instanceof Error ? e.message : "Try again.");
      return;
    }
    router.back();
  };

  const saving = updateProfile.isPending || uploadAvatar.isPending || upsertProfileSport.isPending;
  const existingPhotoUrl = profile?.photo_path
    ? supabase.storage.from("avatars").getPublicUrl(profile.photo_path).data.publicUrl
    : null;
  const previewUri = localPhotoUri ?? existingPhotoUrl;
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
      <ScrollView className="flex-1 px-6 pt-4" contentContainerStyle={{ paddingBottom: 24, gap: 14 }}>
        <Pressable
          onPress={pickPhoto}
          className="self-center w-24 h-24 rounded-full items-center justify-center mb-2 overflow-hidden"
          style={{ borderWidth: 2, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.2)" }}
        >
          {previewUri ? (
            <Image source={{ uri: previewUri }} className="w-24 h-24" />
          ) : (
            <Text className="text-center text-[13px] font-body-bold" style={{ color: colors.textMuted }}>
              Add{"\n"}photo
            </Text>
          )}
        </Pressable>

        <Text className="font-body-extrabold text-[13px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
          Full name
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

        <Text className="font-body-extrabold text-[13px] uppercase tracking-wide mt-1.5" style={{ color: colors.textTertiary }}>
          Skill level
        </Text>
        {TIERS.map((t) => {
          const active = skill === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => {
                setSkillTouched(true);
                setSkill(t.id);
              }}
              className="flex-row items-center rounded-2xl px-3.5 py-3.5 border-[1.5px]"
              style={{ backgroundColor: active ? colors.surfaceAlt : colors.surface, borderColor: active ? t.color : "rgba(255,255,255,0.07)" }}
            >
              <View className="w-2.5 h-2.5 rounded-full mr-3" style={{ backgroundColor: t.color }} />
              <Text className="font-body-extrabold text-[15.5px]" style={{ color: colors.text }}>
                {t.id}
              </Text>
            </Pressable>
          );
        })}

        <View className="mt-2">
          <Button label="Save changes" loading={saving} disabled={!displayName.trim() || !sportsLoaded} onPress={save} />
        </View>
      </ScrollView>
    </Screen>
  );
}
