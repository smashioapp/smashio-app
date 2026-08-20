// Pure string-building for the calendar feature — deliberately free of any expo-calendar/
// AsyncStorage/expo-file-system import, so calendar.test.ts can exercise it without native
// module mocks. lib/calendar.ts (the native side) imports from here, not the other way round.
import { spotsLeft, type Game } from "./mockData";

export type CalendarGame = Pick<
  Game,
  "id" | "venue" | "venueAddress" | "suburb" | "startsAt" | "endsAt" | "cost" | "joinedCount" | "maxPlayers"
>;

// Human label for a device calendar, derived from its account source — expo-calendar gives us
// no direct "is this iCloud/Google/Outlook" flag, only source.type/name (Android) or
// source.type (a SourceType enum string, iOS). Matched by substring since account display names
// ("me@gmail.com", "Work Exchange") vary per device.
export function calendarLabel(cal: { title: string; source?: { type?: string; name?: string } | null; ownerAccount?: string }): string {
  const type = String(cal.source?.type ?? "").toLowerCase();
  // ownerAccount is the actual account email; source.name is a user-set nickname that iOS
  // defaults to the generic "Gmail" for every Google account added via Settings — with two+
  // Google accounts that collides into indistinguishable "Google (Gmail)" entries, so prefer
  // the email when we have one.
  const name = cal.ownerAccount ?? cal.source?.name ?? "";
  const lowerName = name.toLowerCase();

  if (!cal.source || type === "local") return "On My Phone";
  if (type.includes("google") || lowerName.includes("gmail") || lowerName.includes("google")) {
    return name ? `Google (${name})` : "Google";
  }
  if (type === "caldav" || type === "mobileme" || lowerName.includes("icloud")) {
    return "Apple Calendar (iCloud)";
  }
  if (type.includes("exchange") || lowerName.includes("outlook") || lowerName.includes("office365")) {
    return name ? `Outlook (${name})` : "Outlook";
  }
  return name ? `${cal.title} (${name})` : cal.title;
}

export function buildNotes(game: Pick<CalendarGame, "id" | "cost" | "joinedCount" | "maxPlayers">, hostName?: string): string {
  const spots = spotsLeft(game);
  return [
    hostName ? `Hosted by ${hostName}` : null,
    `$${game.cost}/player · ${spots} ${spots === 1 ? "spot" : "spots"} left`,
    `https://smashio.com.au/game/${game.id}`,
  ]
    .filter((line): line is string => !!line)
    .join("\n");
}

function toUtcBasic(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

// This URL form has no reminder param — Google ignores one even if smuggled into `details` —
// which is why it's the fallback path, not the primary one (spec §4).
export function buildGoogleCalendarUrl(game: CalendarGame, hostName?: string): string {
  const notes = buildNotes(game, hostName);
  const params = [
    ["action", "TEMPLATE"],
    ["text", `Smashio · ${game.venue}`],
    ["dates", `${toUtcBasic(game.startsAt)}/${toUtcBasic(game.endsAt)}`],
    ["details", notes],
    ["location", game.venueAddress ?? game.suburb],
  ]
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return `https://calendar.google.com/calendar/render?${params}`;
}

function escapeIcsText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildIcsString(game: CalendarGame, hostName?: string): string {
  const notes = buildNotes(game, hostName);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Smashio//Add to Calendar//EN",
    "BEGIN:VEVENT",
    `UID:smashio-${game.id}@smashio.com.au`,
    `DTSTAMP:${toUtcBasic(new Date().toISOString())}`,
    `DTSTART:${toUtcBasic(game.startsAt)}`,
    `DTEND:${toUtcBasic(game.endsAt)}`,
    `SUMMARY:${escapeIcsText(`Smashio · ${game.venue}`)}`,
    `LOCATION:${escapeIcsText(game.venueAddress ?? game.suburb)}`,
    `DESCRIPTION:${escapeIcsText(notes)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder",
    "TRIGGER:-P1D",
    "END:VALARM",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder",
    "TRIGGER:-PT2H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
