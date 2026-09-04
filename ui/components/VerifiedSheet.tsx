import { View, Text } from "react-native";
import { Sheet } from "./Sheet";
import { colors } from "../lib/theme";

// Game detail redesign artboard 05 — the verified stamp has to survive a sceptic tapping it.
// `games` only has verification_status, no verified-at timestamp or stored filename, so unlike
// the mockup this doesn't claim a specific check date or show a confirmation file — it says what's
// actually true. "None" reads as normal, not suspicious, per the copy tone rules.
export function VerifiedSheet({
  visible,
  onClose,
  status,
  hostName,
}: {
  visible: boolean;
  onClose: () => void;
  status: "none" | "pending" | "verified";
  hostName: string;
}) {
  const copy =
    status === "verified"
      ? {
          title: "Booking confirmed",
          body: `${hostName} uploaded a booking confirmation for this game and it's checked out.`,
        }
      : status === "pending"
        ? {
            title: "Checking the booking",
            body: `${hostName} uploaded a confirmation. We usually finish the check within the hour, no need to do anything.`,
          }
        : {
            title: "No booking on file",
            body: `${hostName} entered the venue and time themselves, that's the normal way to host, most games start this way.`,
          };

  return (
    <Sheet visible={visible} onClose={onClose} title={copy.title}>
      <Text className="text-[13.5px]" style={{ color: colors.textSecondary, lineHeight: 20 }}>
        {copy.body}
      </Text>
    </Sheet>
  );
}
