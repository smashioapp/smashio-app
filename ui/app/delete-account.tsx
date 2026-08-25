import { Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../lib/theme";
import { Screen } from "../components/Screen";
import { BackButton } from "../components/BackButton";
import { useSession } from "../lib/session";
import { useDeleteAccount, useHostedUpcomingCount } from "../lib/queries/account";
import { haptics } from "../lib/haptics";

const POLICY_URL = "https://smashio.com.au/delete-account.html";

// Kept in step with website/delete-account.html — Play's policy wants the in-app and web
// answers to be the same answer.
const DELETED = [
  "Your account and sign-in details",
  "Your profile: name, photo, suburb, skill level and preferences",
  "Your reliability score and games-played record",
  "Your join requests and your spot in any upcoming game",
  "Your device push token, so notifications stop",
  "Ratings other players gave you",
];

const KEPT = [
  "Chat messages you sent stay in the group, shown against a deleted user, so the rest of the conversation still makes sense.",
  "Games that already happened stay in other players' history, without your name attached.",
  "Ratings you gave other players stay, unlinked from you, so their score doesn't move.",
];

function Bullet({ text, tone }: { text: string; tone: "danger" | "muted" }) {
  return (
    <View className="flex-row gap-2.5">
      <Ionicons
        name={tone === "danger" ? "close-circle" : "information-circle-outline"}
        size={15}
        color={tone === "danger" ? colors.danger : colors.textTertiary}
        style={{ marginTop: 2 }}
      />
      <Text className="text-[14px] leading-5 flex-1" style={{ color: colors.textSecondary }}>
        {text}
      </Text>
    </View>
  );
}

export default function DeleteAccount() {
  const { session } = useSession();
  const { data: hostedUpcoming } = useHostedUpcomingCount(session?.user.id);
  const deleteAccount = useDeleteAccount();

  const hostedCount = hostedUpcoming ?? 0;

  const confirmDelete = () => {
    Alert.alert(
      "Delete your account?",
      hostedCount > 0
        ? `This can't be undone. Your ${hostedCount === 1 ? "upcoming game" : `${hostedCount} upcoming games`} will be cancelled and the players notified.`
        : "This can't be undone. Your profile and history are gone straight away.",
      [
        { text: "Keep my account", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: () =>
            deleteAccount.mutate(undefined, {
              onSuccess: () => {
                haptics.success();
                router.replace("/onboarding");
              },
              onError: (e) => {
                haptics.error();
                Alert.alert(
                  "Couldn't delete your account",
                  e instanceof Error ? e.message : "Give it another go, or email hello@smashio.com.au."
                );
              },
            }),
        },
      ]
    );
  };

  return (
    <Screen>
      <View className="flex-row items-center gap-3 px-5 pt-2 pb-1">
        <BackButton onPress={() => router.back()} />
        <Text className="font-display text-[20px]" style={{ color: colors.text }}>
          Delete account
        </Text>
      </View>

      <ScrollView className="px-6 pt-4" contentContainerStyle={{ paddingBottom: 48, gap: 16 }}>
        <View
          className="rounded-2xl p-4 border gap-1.5"
          style={{ backgroundColor: "rgba(255,103,103,0.08)", borderColor: "rgba(255,103,103,0.28)" }}
        >
          <Text className="font-body-bold text-[15.5px]" style={{ color: colors.danger }}>
            This is permanent
          </Text>
          <Text className="text-[14.5px] leading-5" style={{ color: colors.textSecondary }}>
            Deleting your account can't be undone. You'll be signed out, and signing up again
            starts from scratch, no history, no reliability score.
          </Text>
        </View>

        {hostedCount > 0 && (
          <View
            className="rounded-2xl p-4 border gap-1.5"
            style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}
          >
            <Text className="font-body-bold text-[15.5px]" style={{ color: colors.text }}>
              You're hosting {hostedCount} upcoming {hostedCount === 1 ? "game" : "games"}
            </Text>
            <Text className="text-[14.5px] leading-5" style={{ color: colors.textSecondary }}>
              {hostedCount === 1 ? "It" : "They"} will be cancelled and everyone who joined gets
              notified. If you'd rather hand the game over first, cancel the deletion and sort
              that out, a cancelled game can't be brought back.
            </Text>
          </View>
        )}

        <View
          className="rounded-2xl p-4 border gap-3"
          style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}
        >
          <Text className="font-body-bold text-[15.5px]" style={{ color: colors.text }}>
            What gets deleted
          </Text>
          <View className="gap-2">
            {DELETED.map((item) => (
              <Bullet key={item} text={item} tone="danger" />
            ))}
          </View>
        </View>

        <View
          className="rounded-2xl p-4 border gap-3"
          style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}
        >
          <Text className="font-body-bold text-[15.5px]" style={{ color: colors.text }}>
            What stays
          </Text>
          <View className="gap-2">
            {KEPT.map((item) => (
              <Bullet key={item} text={item} tone="muted" />
            ))}
          </View>
          <Text className="text-[13.5px] leading-5" style={{ color: colors.textTertiary }}>
            Want your chat messages gone too? Email hello@smashio.com.au and we'll sort it.
            Backups roll off within 30 days.
          </Text>
        </View>

        <Pressable onPress={() => Linking.openURL(POLICY_URL)} hitSlop={8}>
          <Text className="text-[14px] font-body-semibold" style={{ color: colors.accent }}>
            Read the full deletion policy ↗
          </Text>
        </Pressable>

        <Pressable
          onPress={confirmDelete}
          disabled={deleteAccount.isPending}
          className="rounded-pill py-4 px-6 items-center justify-center border-[1.5px] mt-1"
          style={{ borderColor: colors.danger, opacity: deleteAccount.isPending ? 0.5 : 1 }}
        >
          <Text className="font-body-extrabold text-[16.5px]" style={{ color: colors.danger }}>
            {deleteAccount.isPending ? "Deleting…" : "Delete my account"}
          </Text>
        </Pressable>

        <Pressable onPress={() => router.back()} disabled={deleteAccount.isPending}>
          <Text className="text-center text-[14.5px] font-body-bold" style={{ color: colors.textSecondary }}>
            Keep my account
          </Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}
