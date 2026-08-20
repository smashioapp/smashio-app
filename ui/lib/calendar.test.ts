import { buildGoogleCalendarUrl, buildIcsString, buildNotes, calendarLabel, type CalendarGame } from "./calendarFormat";

const game: CalendarGame = {
  id: "game-1",
  venue: "Sydney Badminton Centre",
  venueAddress: "1 Court St, Sydney",
  suburb: "Sydney",
  startsAt: "2026-08-20T09:00:00.000Z",
  endsAt: "2026-08-20T11:00:00.000Z",
  cost: 12,
  joinedCount: 3,
  maxPlayers: 8,
  reservedSpots: 0,
};

describe("calendarLabel", () => {
  it("labels iCloud calendars", () => {
    expect(calendarLabel({ title: "Home", source: { type: "caldav", name: "iCloud" } })).toBe("Apple Calendar (iCloud)");
  });

  it("labels Google calendars with the account email", () => {
    expect(calendarLabel({ title: "Home", source: { type: "com.google", name: "me@gmail.com" } })).toBe("Google (me@gmail.com)");
  });

  it("labels Outlook/Exchange calendars", () => {
    expect(calendarLabel({ title: "Home", source: { type: "com.exchange", name: "me@work.com" } })).toBe("Outlook (me@work.com)");
  });

  it("labels local/device-only calendars", () => {
    expect(calendarLabel({ title: "Home", source: { type: "local", name: "" } })).toBe("On My Phone");
  });

  it("prefers ownerAccount over the source nickname so multiple Google accounts don't collide", () => {
    expect(
      calendarLabel({ title: "Home", source: { type: "caldav", name: "Gmail" }, ownerAccount: "first@gmail.com" })
    ).toBe("Google (first@gmail.com)");
    expect(
      calendarLabel({ title: "Home", source: { type: "caldav", name: "Gmail" }, ownerAccount: "second@gmail.com" })
    ).toBe("Google (second@gmail.com)");
  });
});

describe("buildNotes", () => {
  it("includes host name, cost/player, spots left, and the universal link", () => {
    const notes = buildNotes(game, "Alex");
    expect(notes).toContain("Hosted by Alex");
    expect(notes).toContain("$12/player");
    expect(notes).toContain("5 spots left");
    expect(notes).toContain("https://smashio.com.au/game/game-1");
  });

  it("omits the host line when no host name is given", () => {
    expect(buildNotes(game)).not.toContain("Hosted by");
  });
});

describe("buildGoogleCalendarUrl", () => {
  it("uses UTC basic-format timestamps and carries no alarm param", () => {
    const url = buildGoogleCalendarUrl(game);
    expect(url).toContain("dates=20260820T090000Z%2F20260820T110000Z");
    expect(url).not.toMatch(/reminder|alarm/i);
  });
});

describe("buildIcsString", () => {
  it("has both VALARM blocks at -1 day and -2 hours", () => {
    const ics = buildIcsString(game);
    expect(ics).toContain("TRIGGER:-P1D");
    expect(ics).toContain("TRIGGER:-PT2H");
    expect((ics.match(/BEGIN:VALARM/g) ?? []).length).toBe(2);
  });

  it("formats DTSTART/DTEND as UTC basic-format timestamps", () => {
    const ics = buildIcsString(game);
    expect(ics).toContain("DTSTART:20260820T090000Z");
    expect(ics).toContain("DTEND:20260820T110000Z");
  });

  it("escapes commas, semicolons, and newlines in text fields", () => {
    const ics = buildIcsString({ ...game, venue: "Court A; Court B, Sydney" }, "Alex, the host");
    expect(ics).toContain("SUMMARY:Smashio · Court A\\; Court B\\, Sydney");
    expect(ics).toContain("Alex\\, the host");
  });
});
