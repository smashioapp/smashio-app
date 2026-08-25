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
import type { AnimalKey } from "../lib/avatars";
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
  const [avatarKeyChoice, setAvatarKeyChoice] = useState<AnimalKey | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
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
      </ScrollView>

      <View className="px-6 pb-2" style={{ paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.cardBorder }}>
        <Button label="Save changes" loading={saving} disabled={!displayName.trim() || !sportsLoaded} onPress={save} />
      </View>

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
    </Screen>
  );
}
