import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../../../lib/theme";
import { formatDate, formatTimeShort } from "../../../lib/format";
import { useSession } from "../../../lib/session";
import { useClaimReservedSpot, useDeclineReservedSpot, usePreviewReservedSpotInvite } from "../../../lib/queries/reservedSpots";
import { savePendingPath } from "../../../lib/pendingGame";
import { haptics } from "../../../lib/haptics";
import { Button } from "../../../components/Button";
import { BackButton } from "../../../components/BackButton";

// The claim screen (create-game-plan.md band 12) — "this screen didn't exist before this pass,
// the token was redeemed silently inside game/[id].tsx and a recipient only ever saw anything
// when the claim failed." One accept action, a polite decline, and the game's own hero, reached
// before login when there's no session yet at all.
export default function ClaimSpot() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session, isLoading: sessionLoading } = useSession();
  const previewQuery = usePreviewReservedSpotInvite(token ?? null);
  const preview = previewQuery.data;
  const claimSpot = useClaimReservedSpot();
  const declineSpot = useDeclineReservedSpot();

  const [claimError, setClaimError] = useState<"already_in" | "other" | null>(null);
  const [declined, setDeclined] = useState(false);
  const [confirmingDecline, setConfirmingDecline] = useState(false);

  // A signed-out visitor who accepts gets sent to sign-up — the token has to travel with them
  // through the whole detour so it resumes on THIS screen, never Discover or a bare game page
  // (create-game-plan.md band 12 defect #5, closed properly in pendingGame.ts).
  useEffect(() => {
    if (!sessionLoading && !session && token) savePendingPath(`/game/claim/${token}`);
  }, [sessionLoading, session, token]);

  const goToLogin = () => {
    haptics.tap();
    router.push("/onboarding");
  };

  const accept = () => {
    if (!token) return;
    haptics.tap();
    setClaimError(null);
    claimSpot.mutate(token, {
      onSuccess: (gameId) => {
        haptics.success();
        router.replace(`/game/${gameId}`);
      },
      onError: (err) => {
        haptics.error();
        const msg = err instanceof Error ? err.message : "";
        setClaimError(/already have a spot|already on this game/i.test(msg) ? "already_in" : "other");
      },
    });
  };

  const decline = () => {
    if (!token) return;
    haptics.tap();
    declineSpot.mutate(token, {
      onSuccess: () => setDeclined(true),
      onError: () => setDeclined(true),
    });
  };

  if (sessionLoading || previewQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.base }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  // No row back means the token is used, cancelled, or never existed — the RPC can't tell them
  // apart (no link_opened_at / expires_at yet, create-game-plan.md defect #1/#2), so this
  // collapses "already used" and "lost" into one state rather than drawing a second one the
  // backend can't actually distinguish.
  if (!preview) {
    return (
      <ClaimShell>
        <Text className="font-display text-[19px] text-center" style={{ color: colors.text }}>Someone's already taken this one</Text>
        <Text className="text-[13.5px] text-center mt-2 max-w-[320px]" style={{ color: colors.textSecondary }}>
          This spot's gone, but there's plenty else out there. Have a look on Discover.
        </Text>
        <View className="w-full mt-6">
          <Button label="Browse other games" onPress={() => router.replace("/(tabs)/discover")} />
        </View>
      </ClaimShell>
    );
  }

  if (preview.gameStatus !== "published") {
    return (
      <ClaimShell preview={preview}>
        <Text className="font-display text-[19px] text-center" style={{ color: colors.text }}>This game's off</Text>
        <Text className="text-[13.5px] text-center mt-2 max-w-[320px]" style={{ color: colors.textSecondary }}>
          {preview.hostName} cancelled this one. Nothing to claim here, but there's plenty else on Discover.
        </Text>
        <View className="w-full mt-6">
          <Button label="Browse other games" onPress={() => router.replace("/(tabs)/discover")} />
        </View>
      </ClaimShell>
    );
  }

  if (declined) {
    return (
      <ClaimShell preview={preview}>
        <Text className="font-display text-[19px] text-center" style={{ color: colors.text }}>No worries, we've let them know</Text>
        <Text className="text-[13.5px] text-center mt-2 max-w-[320px]" style={{ color: colors.textSecondary }}>
          {preview.hostName} can hold it for someone else now.
        </Text>
        <View className="w-full mt-6">
          <Button label="Back to Discover" onPress={() => router.replace("/(tabs)/discover")} />
        </View>
      </ClaimShell>
    );
  }

  if (claimError === "already_in") {
    return (
      <ClaimShell preview={preview}>
        <Text className="font-display text-[19px] text-center" style={{ color: colors.text }}>You're already in this game</Text>
        <Text className="text-[13.5px] text-center mt-2 max-w-[320px]" style={{ color: colors.textSecondary }}>
          No need to claim it twice, you're already on the roster.
        </Text>
        <View className="w-full mt-6">
          <Button label="See the game" onPress={() => router.replace(`/game/${preview.gameId}`)} />
        </View>
      </ClaimShell>
    );
  }

  const venueLine = `${formatDate(preview.startsAt)} · ${formatTimeShort(preview.startsAt)}`;

  if (!session) {
    return (
      <ClaimShell preview={preview}>
        <Text className="font-display text-[19px] text-center" style={{ color: colors.text }}>{preview.hostName} has held you a spot</Text>
        <Text className="text-[13.5px] text-center mt-2 max-w-[320px]" style={{ color: colors.textSecondary }}>
          Make a quick account and it's yours, we'll bring you straight back here.
        </Text>
        <View className="w-full mt-6">

          <Button label="Sign up to claim it" onPress={goToLogin} />

        </View>
        <Pressable onPress={goToLogin} className="items-center py-3.5 mt-1">
          <Text className="font-body-bold text-[13.5px]" style={{ color: colors.textSecondary }}>Already on Smashio? Log in</Text>
        </Pressable>
      </ClaimShell>
    );
  }

  if (claimError === "other") {
    return (
      <ClaimShell preview={preview}>
        <Text className="font-display text-[19px] text-center" style={{ color: colors.text }}>Couldn't take that spot</Text>
        <Text className="text-[13.5px] text-center mt-2 max-w-[320px]" style={{ color: colors.textSecondary }}>
          Give it another go, or have a look at what else is on.
        </Text>
        <View className="w-full mt-6">

          <Button label="Try again" onPress={accept} loading={claimSpot.isPending} />

        </View>
      </ClaimShell>
    );
  }

  return (
    <ClaimShell preview={preview}>
      <Text className="font-display text-[21px] text-center" style={{ color: colors.text }}>
        {preview.hostName}'s saved you a spot
      </Text>
      <Text className="text-[13.5px] text-center mt-2 max-w-[320px]" style={{ color: colors.textSecondary }}>
        {preview.hostName.split(" ")[0]} is hosting {venueLine} and saved you a spot. It's yours if you want it.
      </Text>
      <View className="w-full mt-6">

        <Button label="Accept the spot" onPress={accept} loading={claimSpot.isPending} />

      </View>
      {confirmingDecline ? (
        <View className="items-center mt-4">
          <Text className="text-[13px] text-center" style={{ color: colors.textSecondary }}>Let {preview.hostName.split(" ")[0]} know you can't make it?</Text>
          <View className="flex-row gap-3 mt-2.5">
            <Pressable onPress={() => setConfirmingDecline(false)} className="py-2 px-4">
              <Text className="font-body-bold text-[13px]" style={{ color: colors.text }}>Never mind</Text>
            </Pressable>
            <Pressable onPress={decline} disabled={declineSpot.isPending} className="py-2 px-4">
              <Text className="font-body-bold text-[13px]" style={{ color: colors.danger }}>{declineSpot.isPending ? "Letting them know…" : "Yes, decline"}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable onPress={() => setConfirmingDecline(true)} className="items-center py-3.5 mt-1">
          <Text className="font-body-bold text-[14px]" style={{ color: colors.textSecondary }}>Can't make it, let {preview.hostName.split(" ")[0]} know</Text>
        </Pressable>
      )}
    </ClaimShell>
  );
}

function ClaimShell({
  preview,
  children,
}: {
  preview?: { venueName: string; venueSuburb: string | null; startsAt: string; costPerPlayerCents: number };
  children: React.ReactNode;
}) {
  return (
    <View className="flex-1" style={{ backgroundColor: colors.base }}>
      <View style={{ height: preview ? 200 : 80 }}>
        <LinearGradient colors={["#1F1F24", "#141416"]} style={{ flex: 1, justifyContent: "flex-end" }}>
          <View className="absolute top-14 left-4">
            <BackButton dark onPress={() => router.replace("/(tabs)/discover")} />
          </View>
          {preview && (
            <View className="px-5 pb-3.5">
              <Text className="font-display text-[18px]" style={{ color: colors.text }}>{preview.venueName}</Text>
              <Text className="text-[12px] font-body-bold mt-0.5" style={{ color: colors.textDim }}>
                {formatDate(preview.startsAt)} · {formatTimeShort(preview.startsAt)} · ${preview.costPerPlayerCents / 100}/player
              </Text>
            </View>
          )}
        </LinearGradient>
      </View>
      <View className="flex-1 items-center px-6 pt-6">{children}</View>
    </View>
  );
}
