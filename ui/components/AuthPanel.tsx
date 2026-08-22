import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import * as AppleAuthentication from "expo-apple-authentication";
import { router } from "expo-router";
import { colors } from "../lib/theme";
import { SPRING } from "../lib/motion";
import { haptics } from "../lib/haptics";
import { Button } from "./Button";
import { Field } from "./Field";
import { continueWithApple, continueWithEmail, continueWithGoogle } from "../lib/auth";

type Provider = "apple" | "google" | "email";

function GoogleMark() {
  return (
    <Svg width={19} height={19} viewBox="0 0 48 48">
      <Path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <Path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <Path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <Path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </Svg>
  );
}

// A dark pill with a lime-tinted hairline, so it sits under Apple's white button as one
// stack rather than two borrowed brands. The G mark itself is unmodified, per Google's
// branding rules — the customisation is all in the surface around it.
function ProviderRow({
  label,
  icon,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  icon?: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={style}>
      <Pressable
        testID={testID}
        disabled={disabled}
        onPressIn={() => {
          if (disabled) return;
          haptics.tick();
          scale.value = withSpring(0.97, SPRING.press);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, SPRING.press);
        }}
        onPress={onPress}
        className="rounded-pill px-6 flex-row items-center justify-center gap-2.5 border"
        style={{
          height: 54,
          backgroundColor: colors.surfaceAlt,
          borderColor: "rgba(214,255,63,0.18)",
          opacity: disabled ? 0.55 : 1,
        }}
      >
        {icon}
        <Text className="font-body-extrabold text-[16px]" style={{ color: colors.text }}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// The landing screen's whole bottom half: provider stack, with the email form folded away
// behind a disclosure so a social sign-in is one tap and the brand never leaves the screen.
export function AuthPanel() {
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Provider | null>(null);

  const run = async (provider: Provider, fn: () => Promise<void>) => {
    setError(null);
    setBusy(provider);
    try {
      await fn();
      haptics.burst();
      // Hand off to the index gate — it decides Discover vs. profile setup from the
      // profile row. Never route straight at onboarding: returning users have one already.
      router.replace("/");
    } catch (e) {
      haptics.error();
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const anyBusy = busy !== null;

  return (
    <Animated.View layout={LinearTransition.springify().damping(18)} className="w-full gap-3">
      {/* Apple's button is HIG-locked — style, wording and proportions are not ours to
          reinterpret, so the only customisation taken is the pill radius. It is the one
          element on this screen allowed to outweigh the lime. */}
      {Platform.OS === "ios" && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={100}
          style={{ width: "100%", height: 54, opacity: anyBusy ? 0.55 : 1 }}
          onPress={() => {
            if (anyBusy) return;
            haptics.tick();
            run("apple", continueWithApple);
          }}
        />
      )}

      <ProviderRow
        label="Continue with Google"
        icon={<GoogleMark />}
        disabled={anyBusy}
        onPress={() => run("google", continueWithGoogle)}
        testID="auth-google"
      />

      {emailOpen ? (
        <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)} className="gap-3 mt-1">
          <Field
            testID="login-email"
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
          <Field
            testID="login-password"
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            autoCapitalize="none"
            autoComplete="password"
            secureTextEntry
          />
          <Button
            testID="login-continue"
            label="Continue"
            loading={busy === "email"}
            disabled={!email.trim() || password.length < 6 || anyBusy}
            onPress={() => run("email", () => continueWithEmail(email.trim(), password))}
          />
        </Animated.View>
      ) : (
        <Pressable
          testID="auth-email-disclosure"
          hitSlop={10}
          disabled={anyBusy}
          onPress={() => {
            haptics.tap();
            setEmailOpen(true);
          }}
          className="py-2"
        >
          <Text className="text-center font-body-bold text-[14.5px]" style={{ color: colors.textTertiary }}>
            Continue with email
          </Text>
        </Pressable>
      )}

      {error && (
        <Animated.Text
          entering={FadeIn.duration(180)}
          className="text-center text-[13.5px] font-body-semibold"
          style={{ color: colors.danger }}
        >
          {error}
        </Animated.Text>
      )}
    </Animated.View>
  );
}
