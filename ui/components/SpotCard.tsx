import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../lib/theme";
import { formatDistance, type DistanceUnits } from "../lib/format";
import { formatDuration, friendlyWhen } from "../lib/schedule";
import { paymentLine } from "../lib/payment";
import { needsLabel } from "../lib/trust";
import type { Game } from "../lib/mockData";
import { Avatar } from "./Avatar";
import { TrustRow } from "./TrustRow";
import type { LevelLine } from "../lib/trust";

// fill-the-spot P2.2 (F5): the first thing a non-member sees. One card, five answers in the order a
// player weighs them: when, where, how much, who, is it real. Everything else on the page
// (venue map, good-to-know, cost maths) sits below it.

function Row({ icon, label, children }: { icon: keyof typeof Ionicons.glyphMap; label: string; children: React.ReactNode }) {
  return (
    <View className="flex-row items-start gap-3 py-2.5">
      <View className="w-8 h-8 rounded-xl items-center justify-center" style={{ backgroundColor: colors.surface }}>
        <Ionicons name={icon} size={15} color={colors.textDim} />
      </View>
      <View className="flex-1">
        <Text className="font-body-extrabold text-[10.5px] uppercase" style={{ color: colors.textTertiary, letterSpacing: 0.5 }}>{label}</Text>
        {children}
      </View>
    </View>
  );
}

export function SpotCard({
  game,
  hostName,
  hostPhotoUri,
  hostAvatarKey,
  hostId,
  hostedCount,
  hostTurnsUp,
  hostLevel,
  inCount,
  open,
  distanceM,
  units,
  onCourtPress,
  onLevelPress,
  onHostPress,
}: {
  game: Game;
  hostName: string;
  hostPhotoUri?: string | null;
  hostAvatarKey?: string | null;
  hostId: string;
  hostedCount?: number | null;
  hostTurnsUp: number | null;
  hostLevel: LevelLine | null;
  inCount: number;
  open: number;
  distanceM: number | null;
  units: DistanceUnits;
  onCourtPress: () => void;
  onLevelPress: () => void;
  onHostPress: () => void;
}) {
  const startsAt = new Date(game.startsAt);
  const when = friendlyWhen(startsAt);
  const whenLabel = `${when.charAt(0).toUpperCase()}${when.slice(1)}, ${formatDuration(game.durationHours)}`;
  const msOut = startsAt.getTime() - Date.now();
  const mins = Math.round(msOut / 60000);
  const countdown = msOut > 0 && msOut < 6 * 60 * 60 * 1000 ? (mins < 60 ? `Starts in ${mins} min` : `Starts in ${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ""}`) : null;
  const pay = paymentLine(game, hostName);
  const booked = game.verificationStatus === "verified";
  const hostBits = [hostTurnsUp != null ? `Turns up ${hostTurnsUp}%` : null, hostedCount ? `${hostedCount} hosted` : null].filter(Boolean);

  return (
    <View className="rounded-3xl px-4 py-2 border" style={{ backgroundColor: colors.card, borderColor: "rgba(214,255,63,0.22)" }}>
      <Row icon="time-outline" label="When">
        <Text className="font-body-bold text-[16px] mt-0.5" style={{ color: colors.text }}>{whenLabel}</Text>
        {countdown && <Text className="text-[12.5px] mt-0.5" style={{ color: colors.advanced }}>{countdown}</Text>}
      </Row>
      <Row icon="location-outline" label="Where">
        <Text className="font-body-bold text-[15px] mt-0.5" style={{ color: colors.text }}>{game.venue}</Text>
        <Text className="text-[12.5px] mt-0.5" style={{ color: colors.textSecondary }}>
          {[game.suburb, distanceM != null ? `${formatDistance(distanceM, units)} away` : null].filter(Boolean).join(" · ")}
        </Text>
        {booked && (
          <Pressable onPress={onCourtPress} className="flex-row items-center gap-1 mt-1">
            <Ionicons name="checkmark-circle" size={13} color={colors.intermediate} />
            <Text className="font-body-bold text-[12px]" style={{ color: colors.intermediate }}>Court booked</Text>
          </Pressable>
        )}
      </Row>
      <Row icon="cash-outline" label="How much">
        <Text className="font-body-bold text-[16px] mt-0.5" style={{ color: colors.text }}>{game.cost > 0 ? `$${game.cost} each` : "Free"}</Text>
        {pay && game.cost > 0 && <Text className="text-[12.5px] mt-0.5" style={{ color: colors.textSecondary }}>{pay}</Text>}
      </Row>
      <Row icon="people-outline" label="Who">
        <Pressable onPress={onHostPress} className="flex-row items-center gap-2.5 mt-1">
          <Avatar id={hostId} name={hostName} color={colors.surfaceAlt} photoUri={hostPhotoUri} avatarKey={hostAvatarKey} size={30} />
          <View className="flex-1">
            <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>{hostName} · Host</Text>
            {hostBits.length > 0 && <Text className="text-[12px] mt-0.5" style={{ color: colors.textSecondary }}>{hostBits.join(" · ")}</Text>}
          </View>
        </Pressable>
        <Text className="text-[12.5px] mt-1.5" style={{ color: colors.textSecondary }}>
          {inCount} of {game.maxPlayers} in · {needsLabel(open)}
        </Text>
      </Row>
      {(hostLevel?.earned || booked || hostTurnsUp != null) && (
        <View className="pb-2 pt-1">
          <TrustRow
            variant="full"
            courtStatus={game.verificationStatus}
            hostLevel={hostLevel}
            hostTurnsUp={hostTurnsUp}
            onCourtPress={onCourtPress}
            onLevelPress={onLevelPress}
            onHostPress={onHostPress}
          />
        </View>
      )}
    </View>
  );
}
