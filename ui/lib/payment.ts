import type { Game } from "./mockData";

export const PAYMENT_OPTIONS = [
  { value: "cash", label: "Cash on the day" },
  { value: "transfer", label: "Bank transfer" },
  { value: "chat", label: "I'll sort it in chat" },
] as const;

// fill-the-spot P2.4 (F7): one line for the spot card and the you're-in sheet. Information only.
// Returns null when the host didn't say, so callers just leave the line out.
export function paymentLine(game: Pick<Game, "paymentMethod" | "paymentHandle">, hostName: string): string | null {
  const host = hostName === "The host" ? "the host" : hostName;
  const handle = game.paymentHandle?.trim();
  switch (game.paymentMethod) {
    case "cash":
      return `Cash to ${host} on the day`;
    case "transfer":
      return handle ? `Bank transfer to ${handle}` : `Bank transfer to ${host}`;
    case "chat":
      return `${host} will sort it with you in chat`;
    default:
      return null;
  }
}
