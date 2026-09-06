import { View, Text } from "react-native";
import { router } from "expo-router";
import { colors } from "../../lib/theme";
import { Screen } from "../../components/Screen";
import { BackButton } from "../../components/BackButton";
import { Badge } from "../../components/Badge";
import { useSession } from "../../lib/session";

function providerLabel(provider: string | undefined): string {
  if (provider === "google") return "Google";
  if (provider === "apple") return "Apple";
  return "Email & password";
}

function Row({ title, subtitle, trailing }: { title: string; subtitle?: string; trailing?: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between py-3.5" style={{ borderBottomWidth: 1, borderBottomColor: colors.cardBorder }}>
      <View className="flex-1 pr-3">
        <Text className="font-body-semibold text-[14px]" style={{ color: colors.text }}>
          {title}
        </Text>
        {!!subtitle && (
          <Text className="text-[12px] mt-0.5" style={{ color: colors.textTertiary }}>
            {subtitle}
          </Text>
        )}
      </View>
      {trailing}
    </View>
  );
}

function SoonTag() {
  return (
    <View className="rounded-pill px-2.5 py-1" style={{ backgroundColor: colors.surfaceAlt }}>
      <Text className="font-body-extrabold text-[10px] uppercase" style={{ color: colors.textTertiary, letterSpacing: 0.4 }}>
        Soon
      </Text>
    </View>
  );
}

// Sign-in & security (design-brief.md Prompt 8 item 8) — providers, email verification with a
// real verb, and the sessions/devices/passkey surfaces we do NOT have a backend for yet, drawn
// as a clearly labelled "needs backend" tier so it doesn't read as a dead sheet the way the old
// "Sign-in method" popup did.
export default function SignInSecurity() {
  const { session } = useSession();
  const email = session?.user.email;
  const emailVerified = !!session?.user.email_confirmed_at;
  const provider = session?.user.app_metadata?.provider as string | undefined;

  return (
    <Screen>
      <View className="flex-row items-center gap-3 px-5 pt-2 pb-1">
        <BackButton onPress={() => router.back()} />
        <Text className="font-display text-[20px]" style={{ color: colors.text }}>
          Sign-in & security
        </Text>
      </View>
      <View className="px-5 pt-4">
        <Text className="font-body-extrabold text-[11px] uppercase tracking-wide mb-1" style={{ color: colors.textTertiary }}>
          How you sign in
        </Text>
        <Row title={providerLabel(provider)} subtitle="SMASHIO doesn't support switching sign-in methods yet — get in touch with support if you need a different one linked to this account." />
        <Row
          title={email ?? "Email"}
          subtitle={emailVerified ? "Verifies you to host games and recover your password" : "Not verified — you can't host games until you verify"}
          trailing={emailVerified ? <Badge state="verified" label="Verified" /> : <Badge state="pending" label="Unverified" />}
        />

        <Text className="font-body-extrabold text-[11px] uppercase tracking-wide mt-6 mb-1" style={{ color: colors.textTertiary }}>
          Coming later
        </Text>
        <Row title="Password" subtitle="Change or set a password" trailing={<SoonTag />} />
        <Row title="Passkey" subtitle="Sign in without a password" trailing={<SoonTag />} />
        <Row title="Sessions & devices" subtitle="See where you're signed in and sign out remotely" trailing={<SoonTag />} />
      </View>
    </Screen>
  );
}
