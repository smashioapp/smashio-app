import { useState } from "react";
import { View, Text, TextInput, Pressable, Image, Alert } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { colors } from "../../lib/theme";
import { Button } from "../../components/Button";
import { Screen } from "../../components/Screen";
import { StepProgress } from "../../components/StepProgress";
import { useSession } from "../../lib/session";
import { useUpdateProfile, useUploadAvatar, useUploadAvatarFromUrl } from "../../lib/queries/profile";

export default function ProfilePhoto() {
  const { session } = useSession();
  const googleName = session?.user.user_metadata?.full_name ?? session?.user.user_metadata?.name ?? "";
  const googlePhotoUrl = session?.user.user_metadata?.avatar_url ?? session?.user.user_metadata?.picture ?? null;
  const [name, setName] = useState(googleName);
  const [suburb, setSuburb] = useState("");
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);

  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const uploadAvatarFromUrl = useUploadAvatarFromUrl();

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo access to set a profile picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) setLocalPhotoUri(result.assets[0].uri);
  };

  const next = async () => {
    if (localPhotoUri) {
      try {
        await uploadAvatar.mutateAsync(localPhotoUri);
      } catch (e) {
        Alert.alert("Photo upload failed", e instanceof Error ? e.message : "Try again.");
        return;
      }
    } else if (googlePhotoUrl) {
      try {
        await uploadAvatarFromUrl.mutateAsync(googlePhotoUrl);
      } catch (e) {
        Alert.alert("Photo upload failed", e instanceof Error ? e.message : "Try again.");
        return;
      }
    }
    try {
      await updateProfile.mutateAsync({ display_name: name.trim(), home_suburb: suburb.trim() || null });
    } catch (e) {
      Alert.alert("Couldn't save profile", e instanceof Error ? e.message : "Try again.");
      return;
    }
    router.push("/onboarding/profile-skill");
  };

  const saving = updateProfile.isPending || uploadAvatar.isPending || uploadAvatarFromUrl.isPending;
  const previewUri = localPhotoUri ?? googlePhotoUrl;

  return (
    <Screen>
      <View className="flex-1">
        <StepProgress step={0} count={2} />
        <View className="flex-1 px-6 pt-2 gap-3.5">
        <Text className="font-display text-[24px]" style={{ color: colors.text }}>
          Set up your profile
        </Text>

        <Pressable
          onPress={pickPhoto}
          className="self-center w-24 h-24 rounded-full items-center justify-center mb-2 overflow-hidden"
          style={{ borderWidth: 2, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.2)" }}
        >
          {previewUri ? (
            <Image source={{ uri: previewUri }} className="w-24 h-24" />
          ) : (
            <Text className="text-center text-[11px] font-body-bold" style={{ color: colors.textMuted }}>
              Add{"\n"}photo
            </Text>
          )}
        </Pressable>

        <Text className="font-body-extrabold text-[11px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
          Full name
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Chloe Bennett"
          placeholderTextColor={colors.textMuted}
          className="rounded-2xl px-4 py-4 border font-body-semibold text-[15px]"
          style={{ backgroundColor: colors.surfaceAlt, borderColor: "rgba(255,255,255,0.1)", color: colors.text }}
        />

        <Text className="font-body-extrabold text-[11px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
          Suburb
        </Text>
        <TextInput
          value={suburb}
          onChangeText={setSuburb}
          placeholder="e.g. Bondi Junction NSW"
          placeholderTextColor={colors.textMuted}
          className="rounded-2xl px-4 py-4 border font-body-semibold text-[15px]"
          style={{ backgroundColor: colors.surfaceAlt, borderColor: "rgba(255,255,255,0.1)", color: colors.text }}
        />

        <View className="flex-1" />
        <View className="pb-6">
          <Button label="Next" loading={saving} disabled={!name.trim()} onPress={next} />
        </View>
        </View>
      </View>
    </Screen>
  );
}
