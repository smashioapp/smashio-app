import { dateOptions, firstBookableSlot, isSameSlot, isSlotBookable, nextRebookSlot, slotAt } from "./schedule";

describe("isSlotBookable", () => {
  const day = new Date("2026-08-18T00:00:00");
  const now = new Date("2026-08-18T09:00:00");

  it("rejects a slot inside the 15min lead buffer", () => {
    expect(isSlotBookable(day, 9, 10, now)).toBe(false);
  });

  it("accepts a slot past the buffer", () => {
    expect(isSlotBookable(day, 9, 20, now)).toBe(true);
  });

  it("rejects a slot in the past", () => {
    expect(isSlotBookable(day, 8, 0, now)).toBe(false);
  });
});

describe("dateOptions", () => {
  const now = new Date("2026-08-18T09:00:00");

  it("returns 4 days starting today, labeled Today/Tomorrow", () => {
    const opts = dateOptions(now);
    expect(opts).toHaveLength(4);
    expect(opts[0].label).toBe("Today");
    expect(opts[1].label).toBe("Tomorrow");
    expect(opts[0].date.getHours()).toBe(0);
  });
});

describe("firstBookableSlot", () => {
  it("finds the earliest chronological slot still bookable today", () => {
    const now = new Date("2026-08-18T08:00:00");
    const slot = firstBookableSlot(now);
    expect(slot).not.toBeNull();
    expect(slot!.getHours()).toBe(9);
    expect(slot!.getMinutes()).toBe(0);
    expect(slot!.getDate()).toBe(now.getDate());
  });

  it("rolls to tomorrow once today's slots are exhausted", () => {
    const now = new Date("2026-08-18T21:30:00");
    const slot = firstBookableSlot(now);
    expect(slot).not.toBeNull();
    expect(slot!.getDate()).toBe(now.getDate() + 1);
    expect(slot!.getHours()).toBe(9);
  });
});

describe("isSameSlot", () => {
  it("compares by timestamp", () => {
    const a = slotAt(new Date("2026-08-18"), 19, 0);
    const b = slotAt(new Date("2026-08-18"), 19, 0);
    const c = slotAt(new Date("2026-08-18"), 19, 30);
    expect(isSameSlot(a, b)).toBe(true);
    expect(isSameSlot(a, c)).toBe(false);
  });
});

describe("nextRebookSlot", () => {
  it("matches the same weekday+time within the 4-day window when bookable", () => {
    // now is a Tuesday; past game was a Thursday at 7pm — Thursday falls inside the 4-day window.
    const now = new Date("2026-08-18T09:00:00"); // Tue
    const past = new Date("2026-08-13T19:00:00"); // Thu
    const slot = nextRebookSlot(past, now);
    expect(slot.getDay()).toBe(4);
    expect(slot.getHours()).toBe(19);
    expect(slot.getMinutes()).toBe(0);
  });

  it("falls back to first bookable slot when the weekday match is outside the window", () => {
    const now = new Date("2026-08-18T09:00:00"); // Tue; window covers Tue-Fri
    const past = new Date("2026-08-10T19:00:00"); // Mon — not in next 4 days from Tue
    const slot = nextRebookSlot(past, now);
    const fallback = firstBookableSlot(now);
    expect(slot.getTime()).toBe(fallback!.getTime());
  });
});
