import { useEffect, useState } from "react";
import { View, Text, TextInput, Alert } from "react-native";
import { router } from "expo-router";
import { colors } from "../../lib/theme";
import { Screen } from "../../components/Screen";
import { BackButton } from "../../components/BackButton";
import { Button } from "../../components/Button";
import { usePhone, useSetPhone } from "../../lib/queries/settings";

// profile_private.phone (20260822000000) — deliberately not on `profiles`, which grants select
// on every column to every authenticated user. Never surfaced by player_card; game-day contact
// only, never shown to another player.
export default function PhoneSettings() {
  const { data: existing, isLoading } = usePhone();
  const setPhone = useSetPhone();
  const [phone, setPhoneValue] = useState("");

  useEffect(() => {
    if (existing !== undefined && existing !== null) setPhoneValue(existing);
  }, [existing]);

  const save = async () => {
    try {
      await setPhone.mutateAsync(phone.trim() || null);
      router.back();
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : "Try again.");
    }
  };

  return (
    <Screen>
      <View className="flex-row items-center gap-3 px-5 pt-2 pb-1">
        <BackButton onPress={() => router.back()} />
        <Text className="font-display text-[20px]" style={{ color: colors.text }}>
          Phone number
        </Text>
      </View>
      <View className="px-5 pt-6 gap-3">
        <Text className="text-[12.5px]" style={{ color: colors.textTertiary }}>
          Used only for game-day contact — never shown on your public profile.
        </Text>
        <TextInput
          value={phone}
          onChangeText={setPhoneValue}
          placeholder="e.g. 0412 345 678"
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
          editable={!isLoading}
          className="rounded-2xl px-4 py-3.5 text-[14px] font-body-semibold border"
          style={{ backgroundColor: colors.card, borderColor: colors.cardBorder, color: colors.text }}
        />
        <Button label="Save" onPress={save} loading={setPhone.isPending} />
      </View>
    </Screen>
  );
}
