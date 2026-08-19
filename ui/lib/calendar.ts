import { Alert, Linking, Platform } from "react-native";
// expo-calendar's default export is the new class-based API (ExpoCalendar etc.) — its
// legacy-named functions (getCalendarsAsync, createEventAsync, ...) are throw-in-runtime shims.
// The real functional API this file is written against lives at the /legacy subpath.
import * as Calendar from "expo-calendar/legacy";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { calendarLabel, buildNotes, buildGoogleCalendarUrl, buildIcsString, type CalendarGame } from "./calendarFormat";

export type { CalendarGame } from "./calendarFormat";
export type CalendarChoice = { id: string; label: string };

const PREFERRED_CALENDAR_KEY = "calendar:preferredId";

function dedupeKey(gameId: string): string {
  return `calendar:game:${gameId}`;
}

export async function listWritableCalendars(): Promise<CalendarChoice[]> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return calendars.filter((c) => c.allowsModifications).map((c) => ({ id: c.id, label: calendarLabel(c) }));
}

async function promptForCalendar(choices: CalendarChoice[]): Promise<string | null> {
  return new Promise((resolve) => {
    Alert.alert("Add to calendar", undefined, [
      ...choices.map((c) => ({ text: c.label, onPress: () => resolve(c.id) })),
      { text: "Cancel", style: "cancel" as const, onPress: () => resolve(null) },
    ]);
  });
}

// Exactly one writable account skips the chooser. Otherwise reuse the last pick — re-prompting
// on every add would be a bigger annoyance than occasionally landing in the "wrong" calendar.
async function chooseCalendarId(choices: CalendarChoice[]): Promise<string | null> {
  if (choices.length === 0) return null;
  if (choices.length === 1) {
    await AsyncStorage.setItem(PREFERRED_CALENDAR_KEY, choices[0].id);
    return choices[0].id;
  }
  const preferred = await AsyncStorage.getItem(PREFERRED_CALENDAR_KEY);
  if (preferred && choices.some((c) => c.id === preferred)) return preferred;
  const picked = await promptForCalendar(choices);
  if (picked) await AsyncStorage.setItem(PREFERRED_CALENDAR_KEY, picked);
  return picked;
}

async function shareIcs(game: CalendarGame, hostName?: string) {
  const file = new File(Paths.cache, `smashio-${game.id}.ics`);
  if (file.exists) file.delete();
  file.create();
  file.write(buildIcsString(game, hostName));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: "text/calendar", dialogTitle: "Add to calendar" });
  }
}

// No writable device calendar (permission denied, or a bare device with none configured) —
// both deps here are already installed, so this costs nothing extra.
function offerFallback(game: CalendarGame, hostName?: string): Promise<void> {
  return new Promise((resolve) => {
    Alert.alert("Add to calendar", "No writable calendar found on this device.", [
      {
        text: "Google Calendar",
        onPress: () => {
          Linking.openURL(buildGoogleCalendarUrl(game, hostName)).catch(() =>
            Alert.alert("Couldn't open Google Calendar", "Try again later.")
          );
          resolve();
        },
      },
      {
        text: "Apple / other calendar",
        onPress: () => shareIcs(game, hostName).finally(resolve),
      },
      { text: "Cancel", style: "cancel", onPress: () => resolve() },
    ]);
  });
}

function alarms(): Calendar.Alarm[] {
  return [{ relativeOffset: -1440 }, { relativeOffset: -120 }];
}

async function createEvent(calendarId: string, game: CalendarGame, hostName?: string): Promise<string> {
  return Calendar.createEventAsync(calendarId, {
    title: `Smashio · ${game.venue}`,
    startDate: new Date(game.startsAt),
    endDate: new Date(game.endsAt),
    // Required on Android; app is Sydney-only for now so device tz is correct — switch to the
    // venue's own tz once Smashio covers more than one region.
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    location: game.venueAddress ?? game.suburb,
    notes: buildNotes(game, hostName),
    url: Platform.OS === "ios" ? `https://smashio.com.au/game/${game.id}` : undefined,
    alarms: alarms(),
  });
}

async function promptExistingEvent(game: CalendarGame, eventId: string, calendarId: string, hostName?: string) {
  const choices = await listWritableCalendars().catch(() => [] as CalendarChoice[]);
  const label = choices.find((c) => c.id === calendarId)?.label ?? "your calendar";

  Alert.alert(`On ${label}`, `${game.venue} is already on this calendar.`, [
    {
      text: "Update time",
      onPress: async () => {
        try {
          await Calendar.updateEventAsync(eventId, {
            startDate: new Date(game.startsAt),
            endDate: new Date(game.endsAt),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            alarms: alarms(),
          });
        } catch {
          Alert.alert("Couldn't update event", "Try removing and re-adding it instead.");
        }
      },
    },
    {
      text: "Remove",
      style: "destructive",
      onPress: async () => {
        try {
          await Calendar.deleteEventAsync(eventId);
        } catch {
          // Already gone on the device — fine, we're deleting our record either way.
        }
        await AsyncStorage.removeItem(dedupeKey(game.id));
      },
    },
    { text: "Cancel", style: "cancel" },
  ]);
}

// One-way export only (my-games-plan.md §7) — no two-way sync, no read-back to detect edits
// the user makes afterward. A repeat tap re-checks the dedupe record instead of creating a
// second event, since the button (unlike the old silent add) can be tapped more than once.
export async function addGameToCalendar(game: CalendarGame, hostName?: string): Promise<void> {
  const stored = await AsyncStorage.getItem(dedupeKey(game.id));
  if (stored) {
    const { eventId, calendarId } = JSON.parse(stored) as { eventId: string; calendarId: string };
    const existing = await Calendar.getEventAsync(eventId).catch(() => null);
    if (existing) return promptExistingEvent(game, eventId, calendarId, hostName);
    await AsyncStorage.removeItem(dedupeKey(game.id));
  }

  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== "granted") return offerFallback(game, hostName);

  const choices = await listWritableCalendars();
  if (choices.length === 0) return offerFallback(game, hostName);

  const calendarId = await chooseCalendarId(choices);
  if (!calendarId) return;

  const eventId = await createEvent(calendarId, game, hostName);
  await AsyncStorage.setItem(dedupeKey(game.id), JSON.stringify({ eventId, calendarId }));
  Alert.alert("Added to calendar", `${game.venue} is on your calendar.`);
}

export async function hasCalendarEvent(gameId: string): Promise<boolean> {
  const stored = await AsyncStorage.getItem(dedupeKey(gameId));
  if (!stored) return false;
  const { eventId } = JSON.parse(stored) as { eventId: string; calendarId: string };
  const existing = await Calendar.getEventAsync(eventId).catch(() => null);
  return !!existing;
}
