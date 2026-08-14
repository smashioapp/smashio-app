import { Alert, Platform } from "react-native";
import * as Calendar from "expo-calendar";
import type { Game } from "./mockData";

async function getWritableCalendarId(): Promise<string | null> {
  if (Platform.OS === "ios") {
    const defaultCalendar = await Calendar.getDefaultCalendarAsync();
    return defaultCalendar.id;
  }
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = calendars.find((c) => c.accessLevel === Calendar.CalendarAccessLevel.OWNER) ?? calendars[0];
  return writable?.id ?? null;
}

// One-way export only (my-games-plan.md §7) — no two-way sync, no read-back to detect edits
// the user makes afterward. Silent no-op on decline; the button is a convenience, not a promise.
export async function addGameToCalendar(
  game: Pick<Game, "venue" | "venueAddress" | "suburb" | "startsAt" | "endsAt">,
  opts: { silent?: boolean } = {}
): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== "granted") {
    if (!opts.silent) Alert.alert("Calendar access needed", "Enable calendar access in Settings to add this game.");
    return false;
  }
  const calendarId = await getWritableCalendarId();
  if (!calendarId) {
    if (!opts.silent) Alert.alert("No calendar found", "Couldn't find a calendar to add this game to.");
    return false;
  }
  await Calendar.createEventAsync(calendarId, {
    title: `Smashio · ${game.venue}`,
    startDate: new Date(game.startsAt),
    endDate: new Date(game.endsAt),
    location: game.venueAddress ?? game.suburb,
  });
  if (!opts.silent) Alert.alert("Added to calendar", `${game.venue} is on your calendar.`);
  return true;
}
