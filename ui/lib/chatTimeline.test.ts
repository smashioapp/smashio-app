import { buildChatTimeline } from "./chatTimeline";
import type { ChatMessage } from "./queries/messages";

function msg(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: "m1",
    gameId: "g1",
    senderId: "u1",
    kind: "text",
    body: "hi",
    createdAt: "2026-08-18T10:00:00.000Z",
    ...overrides,
  } as ChatMessage;
}

describe("buildChatTimeline", () => {
  it("inserts a day separator before the first message of each day", () => {
    const timeline = buildChatTimeline([
      msg({ id: "a", createdAt: "2026-08-17T10:00:00.000Z" }),
      msg({ id: "b", createdAt: "2026-08-18T10:00:00.000Z" }),
    ]);
    const dayEntries = timeline.filter((e) => e.type === "day");
    expect(dayEntries).toHaveLength(2);
    expect(timeline[0].type).toBe("day");
    expect(timeline[2].type).toBe("day");
  });

  it("groups consecutive messages from the same sender within the gap window", () => {
    const timeline = buildChatTimeline([
      msg({ id: "a", senderId: "u1", createdAt: "2026-08-18T10:00:00.000Z" }),
      msg({ id: "b", senderId: "u1", createdAt: "2026-08-18T10:01:00.000Z" }),
    ]);
    const messages = timeline.filter((e) => e.type === "message") as Extract<
      (typeof timeline)[number],
      { type: "message" }
    >[];
    expect(messages[0].groupStart).toBe(true);
    expect(messages[0].groupEnd).toBe(false);
    expect(messages[1].groupStart).toBe(false);
    expect(messages[1].groupEnd).toBe(true);
  });

  it("breaks the group when the gap exceeds 5 minutes even for the same sender", () => {
    const timeline = buildChatTimeline([
      msg({ id: "a", senderId: "u1", createdAt: "2026-08-18T10:00:00.000Z" }),
      msg({ id: "b", senderId: "u1", createdAt: "2026-08-18T10:06:00.000Z" }),
    ]);
    const messages = timeline.filter((e) => e.type === "message") as Extract<
      (typeof timeline)[number],
      { type: "message" }
    >[];
    expect(messages[1].groupStart).toBe(true);
  });

  it("breaks the group on sender change and resets grouping on a new day", () => {
    const timeline = buildChatTimeline([
      msg({ id: "a", senderId: "u1", createdAt: "2026-08-18T10:00:00.000Z" }),
      msg({ id: "b", senderId: "u2", createdAt: "2026-08-18T10:00:30.000Z" }),
    ]);
    const messages = timeline.filter((e) => e.type === "message") as Extract<
      (typeof timeline)[number],
      { type: "message" }
    >[];
    expect(messages[1].groupStart).toBe(true);
  });

  it("keeps system messages out of the grouping run", () => {
    const timeline = buildChatTimeline([
      msg({ id: "a", senderId: "u1", createdAt: "2026-08-18T10:00:00.000Z" }),
      msg({ id: "sys", kind: "system", createdAt: "2026-08-18T10:00:30.000Z" }),
      msg({ id: "b", senderId: "u1", createdAt: "2026-08-18T10:01:00.000Z" }),
    ]);
    const kinds = timeline.map((e) => e.type);
    expect(kinds).toEqual(["day", "message", "system", "message"]);
    const lastMessage = timeline[3] as Extract<(typeof timeline)[number], { type: "message" }>;
    expect(lastMessage.groupStart).toBe(true);
  });
});
