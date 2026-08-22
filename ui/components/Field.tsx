import { Text, TextInput, View, type TextInputProps } from "react-native";
import { colors } from "../lib/theme";

// The label + input pair was copy-pasted verbatim across login, onboarding and profile-edit —
// six call sites carrying the same className and inline style. One component so the auth
// surfaces and the settings surfaces can't drift apart.
export function Field({
  label,
  hint,
  ...input
}: TextInputProps & {
  label: string;
  hint?: string;
}) {
  return (
    <View className="gap-2">
      <Text className="font-body-extrabold text-[13px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
        {label}
      </Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        {...input}
        className="rounded-2xl px-4 py-4 border font-body-semibold text-[16.5px]"
        style={{ backgroundColor: colors.surfaceAlt, borderColor: "rgba(255,255,255,0.1)", color: colors.text }}
      />
      {hint ? (
        <Text className="text-[12.5px] font-body-semibold" style={{ color: colors.textMuted }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
