import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import type { Database } from "../db.types";

type Row = Database["public"]["Tables"]["notification_prefs"]["Row"];
type Insert = Database["public"]["Tables"]["notification_prefs"]["Insert"];
type BooleanColumn = "join_requests" | "roster_changes" | "chat" | "reminders" | "game_changes" | "alerts" | "nudges";

// §6.3: seven categories, all defaulting true, plus the quiet-hours window. Mirrors the plan's
// category names 1:1 so a toggle here lines up with the p_pref_key strings the recipient SQL
// functions check (supabase/migrations/20260820000300_notifications_p1.sql).
export type NotificationCategory =
  | "join_requests"
  | "roster_changes"
  | "chat"
  | "reminders"
  | "game_changes"
  | "alerts"
  | "nudges";

export type NotificationPrefs = {
  joinRequests: boolean;
  rosterChanges: boolean;
  chat: boolean;
  reminders: boolean;
  gameChanges: boolean;
  alerts: boolean;
  nudges: boolean;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
};

const DEFAULTS: NotificationPrefs = {
  joinRequests: true,
  rosterChanges: true,
  chat: true,
  reminders: true,
  gameChanges: true,
  alerts: true,
  nudges: true,
  quietHoursEnabled: false,
  quietStart: "22:00",
  quietEnd: "07:00",
};

function fromRow(row: Row | null): NotificationPrefs {
  if (!row) return DEFAULTS;
  return {
    joinRequests: row.join_requests,
    rosterChanges: row.roster_changes,
    chat: row.chat,
    reminders: row.reminders,
    gameChanges: row.game_changes,
    alerts: row.alerts,
    nudges: row.nudges,
    quietHoursEnabled: row.quiet_hours_enabled,
    quietStart: row.quiet_start.slice(0, 5),
    quietEnd: row.quiet_end.slice(0, 5),
  };
}

// No row until the user changes a setting (the migration's notification_pref_enabled() coalesces
// a missing row to "on"), so a fresh install reads as every category enabled without a write.
export function useNotificationPrefs() {
  return useQuery({
    queryKey: ["notification_prefs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("notification_prefs").select("*").maybeSingle();
      if (error) throw error;
      return fromRow(data);
    },
  });
}

const COLUMN: Record<NotificationCategory, BooleanColumn> = {
  join_requests: "join_requests",
  roster_changes: "roster_changes",
  chat: "chat",
  reminders: "reminders",
  game_changes: "game_changes",
  alerts: "alerts",
  nudges: "nudges",
};

export function useSetNotificationCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { category: NotificationCategory; enabled: boolean }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      const patch: Insert = { profile_id: user.id };
      patch[COLUMN[input.category]] = input.enabled;
      const { error } = await supabase.from("notification_prefs").upsert(patch, { onConflict: "profile_id" });
      if (error) throw error;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ["notification_prefs"] });
      const previous = queryClient.getQueryData<NotificationPrefs>(["notification_prefs"]);
      queryClient.setQueryData<NotificationPrefs>(["notification_prefs"], (prev) => ({
        ...(prev ?? DEFAULTS),
        [toFieldName(input.category)]: input.enabled,
      }));
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(["notification_prefs"], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notification_prefs"] }),
  });
}

export function useSetQuietHours() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { enabled: boolean; start?: string; end?: string }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      const patch: Insert = { profile_id: user.id, quiet_hours_enabled: input.enabled };
      if (input.start) patch.quiet_start = input.start;
      if (input.end) patch.quiet_end = input.end;
      const { error } = await supabase.from("notification_prefs").upsert(patch, { onConflict: "profile_id" });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notification_prefs"] }),
  });
}

function toFieldName(category: NotificationCategory): keyof NotificationPrefs {
  const map: Record<NotificationCategory, keyof NotificationPrefs> = {
    join_requests: "joinRequests",
    roster_changes: "rosterChanges",
    chat: "chat",
    reminders: "reminders",
    game_changes: "gameChanges",
    alerts: "alerts",
    nudges: "nudges",
  };
  return map[category];
}
