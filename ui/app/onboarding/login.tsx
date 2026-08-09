import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { router } from "expo-router";
import { colors } from "../../lib/theme";
import { Button } from "../../components/Button";
import { Screen } from "../../components/Screen";
import { continueWithApple, continueWithEmail, continueWithGoogle } from "../../lib/auth";

function SocialButton({
  label,
  onPress,
  loading,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      className="rounded-pill py-3.5 items-center border"
      style={{ backgroundColor: colors.surfaceAlt, borderColor: "rgba(255,255,255,0.1)", opacity: loading ? 0.6 : 1 }}
    >
      <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
        {loading ? "Opening…" : label}
      </Text>
    </Pressable>
  );
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  const handleContinue = async () => {
    setError(null);
    setLoading(true);
    try {
      await continueWithEmail(email.trim(), password);
      router.push("/onboarding/profile-photo");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await continueWithGoogle();
      router.push("/onboarding/profile-photo");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleApple = async () => {
    setError(null);
    setAppleLoading(true);
    try {
      await continueWithApple();
      router.push("/onboarding/profile-photo");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setAppleLoading(false);
    }
  };

  return (
    <Screen>
      <View className="flex-1 px-6 pt-10 gap-4">
        <Text className="font-display text-[26px]" style={{ color: colors.text }}>
          Sign in to SMASHIO
        </Text>
        <Text className="text-[13px] -mt-2 mb-1" style={{ color: colors.textSecondary }}>
          Australia's badminton-only match-up app.
        </Text>

        <Text className="font-body-extrabold text-[11px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
          Email
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          className="rounded-2xl px-4 py-4 border font-body-semibold text-[15px]"
          style={{ backgroundColor: colors.surfaceAlt, borderColor: "rgba(255,255,255,0.1)", color: colors.text }}
        />

        <Text className="font-body-extrabold text-[11px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
          Password
        </Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="At least 6 characters"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoComplete="password"
          secureTextEntry
          className="rounded-2xl px-4 py-4 border font-body-semibold text-[15px]"
          style={{ backgroundColor: colors.surfaceAlt, borderColor: "rgba(255,255,255,0.1)", color: colors.text }}
        />

        {error && (
          <Text className="text-[12px] font-body-semibold" style={{ color: colors.danger }}>
            {error}
          </Text>
        )}

        <View className="mt-1">
          <Button
            label="Continue"
            loading={loading}
            disabled={!email.trim() || password.length < 6}
            onPress={handleContinue}
          />
        </View>

        <View className="flex-row items-center gap-2.5 my-2">
          <View className="flex-1 h-px" style={{ backgroundColor: "rgba(255,255,255,0.1)" }} />
          <Text className="text-[11px] font-body-bold" style={{ color: colors.textMuted }}>
            OR
          </Text>
          <View className="flex-1 h-px" style={{ backgroundColor: "rgba(255,255,255,0.1)" }} />
        </View>

        <SocialButton label="Continue with Google" onPress={handleGoogle} loading={googleLoading} />
        <SocialButton label="Continue with Apple" onPress={handleApple} loading={appleLoading} />
      </View>
    </Screen>
  );
}
