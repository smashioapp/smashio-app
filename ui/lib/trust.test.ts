import { courtBookedLabel, heroKicker, levelLine, needsLabel, shortAPlayer, turnsUpPercent } from "./trust";

describe("levelLine", () => {
  it("shows the voted level once three people have voted", () => {
    expect(levelLine("Intermediate", 7, "Beginner")).toEqual({ label: "Intermediate", text: "Intermediate (voted by 7)", earned: true });
  });

  it("falls back to the player's own pick under three votes", () => {
    expect(levelLine("Advanced", 2, "Intermediate")).toEqual({ label: "Intermediate", text: "says Intermediate", earned: false });
  });

  it("returns null with nothing to show", () => {
    expect(levelLine(null, null, null)).toBeNull();
  });
});

describe("turnsUpPercent", () => {
  it("hides a score with no track record behind it", () => {
    expect(turnsUpPercent(100, 0)).toBeNull();
    expect(turnsUpPercent(100, 2)).toBeNull();
  });

  it("hides a score the host has hidden", () => {
    expect(turnsUpPercent(null, 10)).toBeNull();
  });

  it("rounds and clamps", () => {
    expect(turnsUpPercent(97.6, 5)).toBe(98);
    expect(turnsUpPercent(120, 5)).toBe(100);
  });
});

describe("courtBookedLabel", () => {
  it("names the booking, not a vague verified", () => {
    expect(courtBookedLabel("verified")).toBe("Court booked");
    expect(courtBookedLabel("pending")).toBe("Checking booking");
  });

  it("omits the signal when there's no booking", () => {
    expect(courtBookedLabel("none")).toBeNull();
  });
});

describe("needsLabel", () => {
  it("frames the game by what it needs", () => {
    expect(needsLabel(2)).toBe("Needs 2");
    expect(needsLabel(0)).toBe("Full");
  });
});

describe("heroKicker", () => {
  const now = new Date(2026, 8, 24, 12, 0);
  it("says needs, level and tonight when all three hold", () => {
    expect(heroKicker(1, true, new Date(2026, 8, 24, 19, 0).toISOString(), now)).toBe("NEEDS 1 · YOUR LEVEL · TONIGHT");
    expect(heroKicker(2, true, new Date(2026, 8, 24, 14, 0).toISOString(), now)).toBe("NEEDS 2 · YOUR LEVEL · TODAY");
  });

  it("keeps the old line otherwise", () => {
    expect(heroKicker(1, false, new Date(2026, 8, 24, 19, 0).toISOString(), now)).toBe("BEST MATCH FOR YOU");
    expect(heroKicker(1, true, new Date(2026, 8, 25, 19, 0).toISOString(), now)).toBe("BEST MATCH FOR YOU");
  });
});

describe("shortAPlayer", () => {
  const now = Date.UTC(2026, 8, 24, 2, 0);
  const at = (h: number) => new Date(now + h * 3600_000).toISOString();
  it("keeps 1-2 open inside 12h, fewest spots then soonest", () => {
    const games = [
      { id: "a", startsAt: at(5), open: 2 },
      { id: "b", startsAt: at(6), open: 1 },
      { id: "c", startsAt: at(2), open: 1 },
      { id: "d", startsAt: at(3), open: 3 },
      { id: "e", startsAt: at(13), open: 1 },
      { id: "f", startsAt: at(4), open: 0 },
    ];
    expect(shortAPlayer(games, (g) => g.open, now).map((g) => g.id)).toEqual(["c", "b", "a"]);
  });
});
