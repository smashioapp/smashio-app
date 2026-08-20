import { create } from "zustand";
import { TierId } from "./theme";
import { DEFAULT_DURATION_HOURS, MAX_DURATION_HOURS, MIN_DURATION_HOURS, firstBookableSlot, isSlotBookable } from "./schedule";

// Player-count and per-player-price bounds. Min join threshold is 2 (was 4); max players caps
// at 16 (host picks any value up to that, not just +/-2 steps). Per-player price is host-set
// directly — not booking cost / players — capped at $20/hour so it scales with duration.
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 16;
export const MIN_COURTS_BOOKED = 1;
export const MAX_COURTS_BOOKED = 10;
export const MAX_COST_PER_PLAYER_PER_HOUR = 20;

export type WizardDraft = {
  venueId: string | null;
  startsAt: Date;
  skill: TierId;
  maxPlayers: number;
  courtsBooked: number;
  durationHours: number;
  cost: number;
  // Spots taken off max_players for people joining outside the app — not named, just a count.
  reservedSpots: number;
};

// 7pm today is the slot most hosts want, but it's already gone if the wizard is opened in the
// evening — fall back to the next bookable slot so the draft never starts out in the past.
function defaultStartsAt(): Date {
  const d = new Date();
  d.setHours(19, 0, 0, 0);
  if (isSlotBookable(d, 19, 0)) return d;
  return firstBookableSlot() ?? d;
}

const initialWizard: WizardDraft = {
  venueId: null,
  startsAt: defaultStartsAt(),
  skill: "Intermediate",
  maxPlayers: 8,
  courtsBooked: 1,
  durationHours: DEFAULT_DURATION_HOURS,
  cost: 8,
  reservedSpots: 0,
};

// Rebook (my-games-plan.md §M4): carries both the draft fields and the venue *display* fields,
// since the wizard's venue step shows a locally-held {name, suburb, address} it only otherwise
// sets from a live places search — the draft's venueId alone renders no venue text on step 0.
export type RebookSeed = {
  venueId: string;
  venueName: string;
  venueSuburb: string;
  venueAddress: string;
  skill: TierId;
  maxPlayers: number;
  courtsBooked: number;
  durationHours: number;
  cost: number;
  startsAt: Date;
};

// Discover map's "no games here yet — host one" pin (map-plan.md §5.10): seeds only the venue,
// unlike RebookSeed which also carries the exact slot/skill/players/cost of a past game.
export type HostHereSeed = {
  venueId: string;
  venueName: string;
  venueSuburb: string;
  venueAddress: string;
};

export type WhenFilter = "tonight" | "tomorrow" | "week" | "all";
export type SortOption = "soonest" | "closest" | "cheapest" | "most_spots";

// 15km default (discover-map-ux-plan.md §4.5, D6) — 50km from a Sydney suburb spans most of
// Greater Sydney, so the radius ring never fits the opening viewport. 50 stays selectable.
export const DISCOVER_RADIUS_OPTIONS_KM = [5, 10, 15, 25, 50];
export const DEFAULT_DISCOVER_RADIUS_KM = 15;
export const PRICE_CAP_OPTIONS_CENTS = [1000, 2000, 3000];

type AppState = {
  discoverView: "list" | "map";
  setDiscoverView: (v: "list" | "map") => void;
  whenFilter: WhenFilter;
  setWhenFilter: (v: WhenFilter) => void;
  levelFilters: string[];
  toggleLevelFilter: (slug: string) => void;
  setLevelFilters: (v: string[]) => void;
  discoverRadiusKm: number;
  setDiscoverRadiusKm: (v: number) => void;
  hasSpotsOnly: boolean;
  setHasSpotsOnly: (v: boolean) => void;
  verifiedOnly: boolean;
  setVerifiedOnly: (v: boolean) => void;
  maxCostPerPlayerCents: number | null;
  setMaxCostPerPlayerCents: (v: number | null) => void;
  sortBy: SortOption;
  setSortBy: (v: SortOption) => void;
  clearDiscoverFilters: () => void;

  wizard: WizardDraft;
  resetWizard: () => void;
  selectVenue: (id: string) => void;
  setStartsAt: (d: Date) => void;
  selectWizardTier: (id: TierId) => void;
  incPlayers: () => void;
  decPlayers: () => void;
  incCourts: () => void;
  decCourts: () => void;
  incHours: () => void;
  decHours: () => void;
  incCost: () => void;
  decCost: () => void;
  incReservedSpots: () => void;
  decReservedSpots: () => void;
  setMaxPlayers: (n: number) => void;
  setCourtsBooked: (n: number) => void;
  setDurationHours: (n: number) => void;
  setCost: (n: number) => void;
  setReservedSpots: (n: number) => void;

  rebookSeed: RebookSeed | null;
  setRebookSeed: (seed: RebookSeed) => void;
  clearRebookSeed: () => void;

  hostHereSeed: HostHereSeed | null;
  setHostHereSeed: (seed: HostHereSeed) => void;
  clearHostHereSeed: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  discoverView: "list",
  setDiscoverView: (v) => set({ discoverView: v }),
  whenFilter: "week",
  setWhenFilter: (v) => set({ whenFilter: v }),
  levelFilters: [],
  toggleLevelFilter: (slug) =>
    set((s) => ({ levelFilters: s.levelFilters.includes(slug) ? s.levelFilters.filter((x) => x !== slug) : [...s.levelFilters, slug] })),
  setLevelFilters: (v) => set({ levelFilters: v }),
  discoverRadiusKm: DEFAULT_DISCOVER_RADIUS_KM,
  setDiscoverRadiusKm: (v) => set({ discoverRadiusKm: v }),
  hasSpotsOnly: false,
  setHasSpotsOnly: (v) => set({ hasSpotsOnly: v }),
  verifiedOnly: false,
  setVerifiedOnly: (v) => set({ verifiedOnly: v }),
  maxCostPerPlayerCents: null,
  setMaxCostPerPlayerCents: (v) => set({ maxCostPerPlayerCents: v }),
  sortBy: "soonest",
  setSortBy: (v) => set({ sortBy: v }),
  clearDiscoverFilters: () =>
    set({
      whenFilter: "all",
      levelFilters: [],
      discoverRadiusKm: DEFAULT_DISCOVER_RADIUS_KM,
      hasSpotsOnly: false,
      verifiedOnly: false,
      maxCostPerPlayerCents: null,
      sortBy: "soonest",
    }),

  wizard: initialWizard,
  resetWizard: () => set({ wizard: { ...initialWizard, startsAt: defaultStartsAt() } }),
  selectVenue: (id) => set((s) => ({ wizard: { ...s.wizard, venueId: id } })),
  setStartsAt: (d) => set((s) => ({ wizard: { ...s.wizard, startsAt: d } })),
  selectWizardTier: (id) => set((s) => ({ wizard: { ...s.wizard, skill: id } })),
  incPlayers: () =>
    set((s) => {
      const maxPlayers = Math.min(MAX_PLAYERS, s.wizard.maxPlayers + 1);
      return { wizard: { ...s.wizard, maxPlayers, reservedSpots: Math.min(s.wizard.reservedSpots, maxPlayers) } };
    }),
  decPlayers: () =>
    set((s) => {
      const maxPlayers = Math.max(MIN_PLAYERS, s.wizard.maxPlayers - 1);
      return { wizard: { ...s.wizard, maxPlayers, reservedSpots: Math.min(s.wizard.reservedSpots, maxPlayers) } };
    }),
  incCourts: () => set((s) => ({ wizard: { ...s.wizard, courtsBooked: Math.min(MAX_COURTS_BOOKED, s.wizard.courtsBooked + 1) } })),
  decCourts: () => set((s) => ({ wizard: { ...s.wizard, courtsBooked: Math.max(MIN_COURTS_BOOKED, s.wizard.courtsBooked - 1) } })),
  incHours: () =>
    set((s) => {
      const durationHours = Math.min(MAX_DURATION_HOURS, s.wizard.durationHours + 1);
      const cap = durationHours * MAX_COST_PER_PLAYER_PER_HOUR;
      return { wizard: { ...s.wizard, durationHours, cost: Math.min(s.wizard.cost, cap) } };
    }),
  decHours: () =>
    set((s) => {
      const durationHours = Math.max(MIN_DURATION_HOURS, s.wizard.durationHours - 1);
      const cap = durationHours * MAX_COST_PER_PLAYER_PER_HOUR;
      return { wizard: { ...s.wizard, durationHours, cost: Math.min(s.wizard.cost, cap) } };
    }),
  incCost: () =>
    set((s) => ({ wizard: { ...s.wizard, cost: Math.min(s.wizard.durationHours * MAX_COST_PER_PLAYER_PER_HOUR, s.wizard.cost + 1) } })),
  decCost: () => set((s) => ({ wizard: { ...s.wizard, cost: Math.max(1, s.wizard.cost - 1) } })),
  incReservedSpots: () => set((s) => ({ wizard: { ...s.wizard, reservedSpots: Math.min(s.wizard.maxPlayers, s.wizard.reservedSpots + 1) } })),
  decReservedSpots: () => set((s) => ({ wizard: { ...s.wizard, reservedSpots: Math.max(0, s.wizard.reservedSpots - 1) } })),
  setMaxPlayers: (n) => set((s) => ({ wizard: { ...s.wizard, maxPlayers: n, reservedSpots: Math.min(s.wizard.reservedSpots, n) } })),
  setCourtsBooked: (n) => set((s) => ({ wizard: { ...s.wizard, courtsBooked: n } })),
  setDurationHours: (n) => set((s) => ({ wizard: { ...s.wizard, durationHours: n } })),
  setCost: (n) => set((s) => ({ wizard: { ...s.wizard, cost: n } })),
  setReservedSpots: (n) => set((s) => ({ wizard: { ...s.wizard, reservedSpots: Math.max(0, Math.min(s.wizard.maxPlayers, n)) } })),

  rebookSeed: null,
  setRebookSeed: (seed) => set({ rebookSeed: seed }),
  clearRebookSeed: () => set({ rebookSeed: null }),

  hostHereSeed: null,
  setHostHereSeed: (seed) => set({ hostHereSeed: seed }),
  clearHostHereSeed: () => set({ hostHereSeed: null }),
}));
