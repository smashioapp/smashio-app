import { computeWeekStreak, dayLabel, formatCountdown, formatDistance, formatTimeShort, monthLabel, relativeDayPhrase, startsWhenText } from "./format";

describe("formatDistance", () => {
  it("shows metres under 1km", () => {
    expect(formatDistance(850)).toBe("850 m");
  });

  it("shows km with one decimal at/over 1km", () => {
    expect(formatDistance(1500)).toBe("1.5 km");
  });

  it("defaults to km when units is omitted", () => {
    expect(formatDistance(1500)).toBe("1.5 km");
  });

  it("shows miles with one decimal when units is mi", () => {
    expect(formatDistance(1609.344, "mi")).toBe("1.0 mi");
  });

  it("never steps miles down to a smaller unit under 1000m", () => {
    expect(formatDistance(500, "mi")).toBe("0.3 mi");
  });
});

describe("formatTimeShort", () => {
  it("drops :00 on the hour", () => {
    expect(formatTimeShort("2026-08-18T19:00:00")).toBe("7pm");
  });

  it("keeps minutes when not on the hour", () => {
    expect(formatTimeShort("2026-08-18T19:30:00")).toBe("7:30pm");
  });

  it("handles midnight/noon boundaries", () => {
    expect(formatTimeShort("2026-08-18T00:00:00")).toBe("12am");
    expect(formatTimeShort("2026-08-18T12:00:00")).toBe("12pm");
  });
});

describe("dayLabel", () => {
  const now = new Date("2026-08-18T09:00:00");

  it("labels today", () => {
    expect(dayLabel("2026-08-18T20:00:00", now)).toBe("Tonight");
  });

  it("honors custom today label", () => {
    expect(dayLabel("2026-08-18T20:00:00", now, { todayLabel: "Today" })).toBe("Today");
  });

  it("labels tomorrow", () => {
    expect(dayLabel("2026-08-19T20:00:00", now)).toBe("Tomorrow");
  });

  it("falls back to weekday/date further out", () => {
    expect(dayLabel("2026-08-25T20:00:00", now)).toContain("Aug");
  });
});

describe("monthLabel", () => {
  const now = new Date("2026-08-18T09:00:00");

  it("labels current month as This month", () => {
    expect(monthLabel("2026-08-01T00:00:00", now)).toBe("This month");
  });

  it("labels other months by name", () => {
    expect(monthLabel("2026-06-01T00:00:00", now)).toBe("June 2026");
  });
});

describe("formatCountdown", () => {
  const now = new Date("2026-08-18T09:00:00");

  it("returns null once started (diff <= 0)", () => {
    expect(formatCountdown("2026-08-18T09:00:00", now)).toBeNull();
    expect(formatCountdown("2026-08-18T08:00:00", now)).toBeNull();
  });

  it("returns null beyond a 24h window", () => {
    expect(formatCountdown("2026-08-19T09:01:00", now)).toBeNull();
  });

  it("formats minutes-only within the hour", () => {
    expect(formatCountdown("2026-08-18T09:45:00", now)).toBe("Starts in 45m");
  });

  it("formats hours and minutes", () => {
    expect(formatCountdown("2026-08-18T12:30:00", now)).toBe("Starts in 3h 30m");
  });
});

describe("computeWeekStreak", () => {
  // Monday 2026-08-17 is "this week" relative to now.
  const now = new Date("2026-08-19T09:00:00");

  it("returns 0 for no games", () => {
    expect(computeWeekStreak([], now)).toBe(0);
  });

  it("returns 0 when last game is older than last week", () => {
    expect(computeWeekStreak(["2026-07-01T10:00:00"], now)).toBe(0);
  });

  it("counts consecutive weeks including this week", () => {
    const dates = ["2026-08-18T10:00:00", "2026-08-11T10:00:00", "2026-08-04T10:00:00"];
    expect(computeWeekStreak(dates, now)).toBe(3);
  });

  it("breaks streak on a gap week", () => {
    const dates = ["2026-08-18T10:00:00", "2026-07-28T10:00:00"];
    expect(computeWeekStreak(dates, now)).toBe(1);
  });

  it("counts from last week when nothing played yet this week", () => {
    expect(computeWeekStreak(["2026-08-11T10:00:00"], now)).toBe(1);
  });
});

describe("startsWhenText", () => {
  it("says tonight with a countdown for a same-day evening game", () => {
    expect(startsWhenText("2026-09-25T22:57:00", new Date("2026-09-25T19:20:00"))).toBe("Tonight, 10:57pm · in 3h 37m");
  });

  it("says today for a same-day daytime game", () => {
    expect(startsWhenText("2026-09-25T14:00:00", new Date("2026-09-25T09:00:00"))).toBe("Today, 2pm · in 5h");
  });

  it("goes by calendar day across midnight, not by 24h blocks", () => {
    expect(startsWhenText("2026-09-26T00:30:00", new Date("2026-09-25T23:30:00"))).toBe("Tomorrow, 12:30am");
  });

  it("says tomorrow for a next-morning game", () => {
    expect(startsWhenText("2026-09-26T05:57:00", new Date("2026-09-25T19:00:00"))).toBe("Tomorrow, 5:57am");
  });

  it("counts days and names the date further out", () => {
    const text = startsWhenText("2026-09-28T20:00:00", new Date("2026-09-25T10:00:00"));
    expect(text.startsWith("In 3 days · ")).toBe(true);
    expect(text.endsWith(", 8pm")).toBe(true);
    expect(text).toMatch(/28/);
  });
});

describe("relativeDayPhrase", () => {
  it("covers tonight, tomorrow and later", () => {
    const now = new Date("2026-09-25T10:00:00");
    expect(relativeDayPhrase("2026-09-25T19:00:00", now)).toBe("tonight");
    expect(relativeDayPhrase("2026-09-25T12:00:00", now)).toBe("today");
    expect(relativeDayPhrase("2026-09-26T19:00:00", now)).toBe("tomorrow");
    expect(relativeDayPhrase("2026-09-29T19:00:00", now)).toBe("in 4 days");
  });
});
