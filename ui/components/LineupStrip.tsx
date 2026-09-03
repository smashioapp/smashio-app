import { View, Text, Pressable, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { ZoomIn } from "react-native-reanimated";
import { colors, initial } from "../lib/theme";
import { animalFor, GHOST_KEY } from "../lib/avatars";

// Host a Game v3 — the lineup strip (create-game-plan.md §4.5, design-brief.md Prompt 6). One
// component, exactly two surfaces: the WHO row of the draft card and the game detail roster.
// Five slot states, each readable at a glance without labels — host (lime crown ring), joined
// (solid ring), named hold (initial, dashed ring), anonymous hold (blank silhouette, dashed
// ring), open (Smashimal head silhouette, dotted ring). Order is stable: host, joins in join
// order, holds, open — filling reads left to right like a progress bar, never re-sorts.
export type LineupSlot =
  | { kind: "host"; id: string; name: string; avatarKey?: string | null; photoUri?: string | null }
  | { kind: "joined"; id: string; name: string; avatarKey?: string | null; photoUri?: string | null }
  | {
      kind: "named";
      id: string;
      label: string | null;
      claimed: boolean;
      // Set once the hold has moved to INVITED (create-game-plan.md band 12a): a real Smashio
      // profile, rendered as their own dimmed bust with a pending ring, never an initial tile —
      // "they already have an avatar."
      invitedProfileId?: string | null;
      avatarKey?: string | null;
      photoUri?: string | null;
    }
  | { kind: "anon"; id: string }
  | { kind: "open"; id: string };

const SLOT_SIZE = 42;
const COLLAPSE_THRESHOLD = 8;

function SlotAvatar({ slot, size }: { slot: LineupSlot; size: number }) {
  if (slot.kind === "host" || slot.kind === "joined") {
    const animal = animalFor(slot.avatarKey, slot.id);
    const isGhost = slot.avatarKey === GHOST_KEY;
    const ringColor = slot.kind === "host" ? colors.accent : "rgba(255,255,255,0.5)";
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: slot.kind === "host" ? 2 : 1.5,
          borderColor: ringColor,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surfaceAlt,
          overflow: "hidden",
        }}
      >
        {slot.photoUri ? (
          <Image source={{ uri: slot.photoUri }} style={{ width: size, height: size }} />
        ) : animal && !isGhost ? (
          <Image source={animal.src} style={{ width: size, height: size }} />
        ) : (
          <Text style={{ color: colors.text, fontSize: size * 0.36, fontWeight: "800" }}>{initial(slot.name)}</Text>
        )}
      </View>
    );
  }
  if (slot.kind === "named") {
    // INVITED: a real profile who hasn't accepted yet — their own bust, dimmed, dashed ring.
    // Never an initial tile once there's an actual avatar to show (band 12a).
    if (slot.invitedProfileId && !slot.claimed) {
      const animal = animalFor(slot.avatarKey, slot.invitedProfileId);
      const isGhost = slot.avatarKey === GHOST_KEY;
      return (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 1.6,
            borderColor: colors.beginner,
            borderStyle: "dashed",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.surfaceAlt,
            opacity: 0.6,
            overflow: "hidden",
          }}
        >
          {slot.photoUri ? (
            <Image source={{ uri: slot.photoUri }} style={{ width: size, height: size }} />
          ) : animal && !isGhost ? (
            <Image source={animal.src} style={{ width: size, height: size }} />
          ) : (
            <Text style={{ color: colors.text, fontSize: size * 0.34, fontWeight: "800" }}>{initial(slot.label ?? "?")}</Text>
          )}
        </View>
      );
    }
    const label = slot.label ?? "?";
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1.6,
          borderColor: slot.claimed ? "rgba(255,255,255,0.5)" : colors.advanced,
          borderStyle: slot.claimed ? "solid" : "dashed",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surfaceAlt,
        }}
      >
        <Text style={{ color: colors.text, fontSize: size * 0.34, fontWeight: "800" }}>{initial(label)}</Text>
      </View>
    );
  }
  if (slot.kind === "anon") {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1.6,
          borderColor: colors.advanced,
          borderStyle: "dashed",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surfaceAlt,
        }}
      >
        <Text style={{ fontSize: size * 0.4 }}>●</Text>
      </View>
    );
  }
  // Open — design calls for a Smashimal head-silhouette mask (create-game-plan.md §9.7); that
  // art asset doesn't exist yet (avatars-plan.md ships full busts only), so this uses a plain
  // outline glyph as a placeholder. Swap for the real silhouette once it's drawn.
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1.4,
        borderColor: "rgba(255,255,255,0.28)",
        borderStyle: "dotted",
        alignItems: "center",
        justifyContent: "center",
        opacity: 0.55,
      }}
    >
      <Ionicons name="person-outline" size={size * 0.5} color={colors.textMuted} />
    </View>
  );
}

function slotCaption(slot: LineupSlot): string {
  if (slot.kind === "host") return "You";
  if (slot.kind === "joined") return slot.name.split(" ")[0];
  if (slot.kind === "named") return slot.label ?? "Held";
  if (slot.kind === "anon") return "Held";
  return "Open";
}

function Slot({ slot, size, onPress }: { slot: LineupSlot; size: number; onPress?: () => void }) {
  return (
    <Animated.View entering={ZoomIn.duration(220)} style={{ alignItems: "center", width: size + 4 }}>
      <Pressable testID={`lineup-slot-${slot.id}`} onPress={onPress} disabled={!onPress} hitSlop={4}>
        <SlotAvatar slot={slot} size={size} />
      </Pressable>
      <Text numberOfLines={1} className="text-[9.5px] font-body-bold mt-1" style={{ color: colors.textTertiary, maxWidth: size + 10 }}>
        {slotCaption(slot)}
      </Text>
    </Animated.View>
  );
}

export function LineupStrip({
  slots,
  courtsBooked,
  playersPerCourt = 4,
  size = SLOT_SIZE,
  onTapSlot,
  collapseAt = COLLAPSE_THRESHOLD,
  onExpand,
}: {
  slots: LineupSlot[];
  courtsBooked: number;
  playersPerCourt?: number;
  size?: number;
  onTapSlot?: (slot: LineupSlot, index: number) => void;
  collapseAt?: number;
  onExpand?: () => void;
}) {
  if (slots.length > collapseAt) {
    // Above 8 a full strip is a grid again, and a bad one — collapse to fill-state dots plus a
    // tap-through to the full roster.
    return (
      <Pressable onPress={onExpand} className="flex-row items-center gap-1.5 py-1">
        {slots.map((s) => (
          <View
            key={s.id}
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: s.kind === "open" ? "rgba(255,255,255,0.18)" : s.kind === "anon" || (s.kind === "named" && !s.claimed) ? colors.advanced : colors.accent,
            }}
          />
        ))}
        <Text className="font-body-bold text-[12px] ml-1" style={{ color: colors.textSecondary }}>
          {slots.length} players
        </Text>
      </Pressable>
    );
  }

  // Grouping follows courts_booked, not headcount — 8 players on 1 court is a rotation, not two
  // courts (design-brief.md §"COURTS STOPS AT 4+" / 6a item 2). Only split into groups when
  // there's more than one court actually booked.
  const groups: LineupSlot[][] = [];
  if (courtsBooked > 1) {
    const perGroup = Math.ceil(slots.length / courtsBooked);
    for (let i = 0; i < slots.length; i += perGroup) groups.push(slots.slice(i, i + perGroup));
  } else {
    groups.push(slots);
  }

  let runningIndex = 0;

  return (
    <View>
      <View className="flex-row flex-wrap items-start" style={{ gap: 14 }}>
        {groups.map((group, gi) => {
          const startIndex = runningIndex;
          runningIndex += group.length;
          return (
            <View key={gi} className="flex-row items-start" style={{ gap: 6 }}>
              {gi > 0 && <View style={{ width: 1, alignSelf: "stretch", backgroundColor: "rgba(255,255,255,0.1)", marginRight: 6 }} />}
              {group.map((slot, i) => (
                <Slot key={slot.id} slot={slot} size={size} onPress={onTapSlot ? () => onTapSlot(slot, startIndex + i) : undefined} />
              ))}
            </View>
          );
        })}
      </View>
      {courtsBooked <= 1 && slots.length > playersPerCourt && (
        <Text className="text-[11.5px] mt-2" style={{ color: colors.textMuted }}>
          All rotating on the one court booked.
        </Text>
      )}
    </View>
  );
}

// variant "row" is the draft/edit card's collapsed WHO value (create-game-plan.md band 03): reads
// "You · N held · M open" while only the host has a slot (nobody can have joined a game that
// isn't published yet), falling back to a headcount once others have actually joined.
export function lineupSummary(slots: LineupSlot[], costPerPlayer: number, variant: "row" | "strip" = "strip"): string {
  const joined = slots.filter((s) => s.kind === "host" || s.kind === "joined").length;
  const held = slots.filter((s) => s.kind === "anon" || (s.kind === "named" && !s.claimed)).length;
  const open = slots.filter((s) => s.kind === "open").length;
  const joinedLabel = variant === "row" && joined <= 1 ? "You" : `${joined} in`;
  return `${joinedLabel} · ${held} held · ${open} open · $${costPerPlayer} each`;
}
