import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { colors, TIERS, TierId } from "../../lib/theme";
import { SPRING } from "../../lib/motion";
import { haptics } from "../../lib/haptics";
import { Button } from "../../components/Button";
import { Field } from "../../components/Field";
import { HoldButton } from "../../components/HoldButton";
import { Screen } from "../../components/Screen";
import { Avatar } from "../../components/Avatar";
import { AvatarPicker } from "../../components/AvatarPicker";
import { SmashimalRig, hasRig } from "../../components/SmashimalRig";
import { animalForId, type AnimalKey } from "../../lib/avatars";
import { useSession } from "../../lib/session";
import { useSports, useSkillTiers } from "../../lib/queries/sports";
import { SPORT_SLUG } from "../../lib/queries/games";
import {
  useProfile,
  useUpdateProfile,
  useUploadAvatar,
  useUploadAvatarFromUrl,
  useUpsertProfileSport,
} from "../../lib/queries/profile";
import { track } from "../../lib/analytics";

function TierCard({ tier, active, onPress }: { tier: (typeof TIERS)[number]; active: boolean; onPress: () => void }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={style}>
      <Pressable
        testID={`setup-tier-${tier.id}`}
        onPressIn={() => {
          scale.value = withSpring(0.98, SPRING.press);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, SPRING.press);
        }}
        onPress={() => {
          haptics.tick();
          onPress();
        }}
        className="flex-row items-center rounded-2xl px-3.5 py-3.5 border-[1.5px]"
        style={{
          backgroundColor: active ? colors.surfaceAlt : colors.surface,
          borderColor: active ? tier.color : "rgba(255,255,255,0.07)",
        }}
      >
        <View className="w-2.5 h-2.5 rounded-full mr-3" style={{ backgroundColor: tier.color }} />
        <View className="flex-1">
          <Text className="font-body-extrabold text-[15.5px]" style={{ color: colors.text }}>
            {tier.id}
          </Text>
          <Text className="text-[13px] mt-0.5" style={{ color: colors.textSecondary }}>
            {tier.desc}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// The whole of new-user setup, on one screen. Everything that can be derived is derived:
// the name and photo come from the auth provider, the suburb comes from the location grant
// on the next screen, and the sport is fixed. That leaves skill — the one thing only the
// player knows, and the one thing matching actually depends on.
export default function Setup() {
  const { session } = useSession();
  const { data: profile } = useProfile(session?.user.id);

  const providerName = session?.user.user_metadata?.full_name ?? session?.user.user_metadata?.name ?? "";
  const providerPhotoUrl = session?.user.user_metadata?.avatar_url ?? session?.user.user_metadata?.picture ?? null;

  const [name, setName] = useState("");
  const [seeded, setSeeded] = useState(false);
  const [skill, setSkill] = useState<TierId>("Intermediate");
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const [avatarKeyChoice, setAvatarKeyChoice] = useState<AnimalKey | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    track("onboarding_step_completed", { step: "setup" });
  }, []);

  const { data: sports } = useSports();
  const { data: tiers } = useSkillTiers(SPORT_SLUG);
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const uploadAvatarFromUrl = useUploadAvatarFromUrl();
  const upsertProfileSport = useUpsertProfileSport();

  // A saved display_name wins over the provider's — someone who set a name and bailed
  // before finishing must not see it blanked on their way back through.
  useEffect(() => {
    if (seeded || profile === undefined) return;
    setName(profile?.display_name || providerName);
    setSeeded(true);
  }, [seeded, profile, providerName]);

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("We'll need photo access to set a profile picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      haptics.tap();
      setLocalPhotoUri(result.assets[0].uri);
      setAvatarKeyChoice(null);
    }
  };

  const finish = async () => {
    setError(null);
    const sport = sports?.find((s) => s.slug === SPORT_SLUG);
    const tierRow = tiers?.find((t) => t.label === skill);
    if (!sport || !tierRow) {
      setError("Still loading, give it a second and try again.");
      return;
    }

    try {
      // Photo is best-effort: a failed upload must not strand someone outside the app
      // when the only thing that actually gates entry is a name and a skill tier.
      if (localPhotoUri) await uploadAvatar.mutateAsync(localPhotoUri).catch(() => {});
      else if (providerPhotoUrl) await uploadAvatarFromUrl.mutateAsync(providerPhotoUrl).catch(() => {});

      // Keeping the pre-seeded id-hash animal (avatarKeyChoice still null) is zero taps — this
      // is what unifies email and Google sign-ups (avatars-plan.md diagnosis 5).
      await updateProfile.mutateAsync({
        display_name: name.trim(),
        avatar_key: avatarKeyChoice ?? animalForId(session!.user.id).key,
      });
      await upsertProfileSport.mutateAsync({ sportId: sport.id, skillTierId: tierRow.id });
      router.replace("/onboarding/nearby");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that, give it another go.");
    }
  };

  const saving = updateProfile.isPending || upsertProfileSport.isPending;
  const previewUri = avatarKeyChoice ? null : localPhotoUri ?? providerPhotoUrl;
  const canFinish = !!name.trim() && !saving;

  const resolvedAnimalKey = avatarKeyChoice ?? (session ? animalForId(session.user.id).key : null);
  const showRig = !previewUri && hasRig(resolvedAnimalKey);

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("We'll need camera access to take a profile picture.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) {
      haptics.tap();
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

  return (
    <Screen>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32, gap: 16 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-1.5">
          <Text
            className="font-body-extrabold text-[12.5px] uppercase"
            style={{ color: colors.textSecondary, letterSpacing: 1.2 }}
          >
            Almost on court
          </Text>
          <Text className="font-display text-[30px]" style={{ color: colors.text }}>
            Set up your game
          </Text>
        </View>

        <Pressable onPress={changeAvatar} className="self-center items-center gap-2" testID="setup-photo">
          <View style={{ width: 112, height: 112, alignItems: "center", justifyContent: "center" }}>
            {showRig ? (
              <SmashimalRig animal={resolvedAnimalKey!} height={112} />
            ) : (
              <Avatar
                id={session?.user.id}
                name={name}
                color={colors.surfaceAlt}
                size={112}
                photoUri={previewUri}
                avatarKey={avatarKeyChoice}
              />
            )}
          </View>
          <Text className="font-body-bold text-[13px] text-center" style={{ color: colors.textTertiary }}>
            {previewUri ? "Change photo" : "This one's yours, want a different one?"}
          </Text>
        </Pressable>

        <Field
          testID="setup-name"
          label="Your name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Chloe Bennett"
          autoComplete="name"
        />

        <View className="gap-2.5 mt-1">
          <Text className="font-body-extrabold text-[13px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
            How do you play?
          </Text>
          {TIERS.map((tier) => (
            <TierCard key={tier.id} tier={tier} active={skill === tier.id} onPress={() => setSkill(tier.id)} />
          ))}
        </View>

        {error && (
          <Animated.Text
            entering={FadeIn.duration(180)}
            className="text-center text-[13.5px] font-body-semibold"
            style={{ color: colors.danger }}
          >
            {error}
          </Animated.Text>
        )}

        <View className="mt-2 gap-3">
          <HoldButton label="Hold to start playing" completeLabel="Let's go" onComplete={finish} disabled={!canFinish} testID="setup-finish" />
          {error && <Button label="Try again" variant="secondary" onPress={finish} disabled={!canFinish} />}
        </View>
      </ScrollView>

      <AvatarPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        id={session?.user.id ?? ""}
        selectedKey={avatarKeyChoice}
        onSelect={(key) => {
          setAvatarKeyChoice(key);
          setLocalPhotoUri(null);
        }}
      />
    </Screen>
  );
}
