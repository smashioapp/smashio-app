import { create } from "zustand";
import { TierId } from "./theme";
import { firstBookableSlot, isSlotBookable } from "./schedule";

export type WizardDraft = {
  venueId: string | null;
  startsAt: Date;
  skill: TierId;
  maxPlayers: number;
  cost: number;
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
  cost: 64,
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
  cost: number;
  startsAt: Date;
};

export type WhenFilter = "tonight" | "tomorrow" | "week" | "all";
export type SortOption = "soonest" | "closest" | "cheapest" | "most_spots";

export const DISCOVER_RADIUS_OPTIONS_KM = [5, 10, 25, 50];
export const DEFAULT_DISCOVER_RADIUS_KM = 50;
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

  myGamesTab: "upcoming" | "past";
  setMyGamesTab: (v: "upcoming" | "past") => void;

  wizard: WizardDraft;
  resetWizard: () => void;
  selectVenue: (id: string) => void;
  setStartsAt: (d: Date) => void;
  selectWizardTier: (id: TierId) => void;
  incPlayers: () => void;
  decPlayers: () => void;
  incCost: () => void;
  decCost: () => void;
  setMaxPlayers: (n: number) => void;
  setCost: (n: number) => void;

  rebookSeed: RebookSeed | null;
  setRebookSeed: (seed: RebookSeed) => void;
  clearRebookSeed: () => void;
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

  myGamesTab: "upcoming",
  setMyGamesTab: (v) => set({ myGamesTab: v }),

  wizard: initialWizard,
  resetWizard: () => set({ wizard: { ...initialWizard, startsAt: defaultStartsAt() } }),
  selectVenue: (id) => set((s) => ({ wizard: { ...s.wizard, venueId: id } })),
  setStartsAt: (d) => set((s) => ({ wizard: { ...s.wizard, startsAt: d } })),
  selectWizardTier: (id) => set((s) => ({ wizard: { ...s.wizard, skill: id } })),
  incPlayers: () => set((s) => ({ wizard: { ...s.wizard, maxPlayers: Math.min(20, s.wizard.maxPlayers + 2) } })),
  decPlayers: () => set((s) => ({ wizard: { ...s.wizard, maxPlayers: Math.max(4, s.wizard.maxPlayers - 2) } })),
  incCost: () => set((s) => ({ wizard: { ...s.wizard, cost: s.wizard.cost + 4 } })),
  decCost: () => set((s) => ({ wizard: { ...s.wizard, cost: Math.max(8, s.wizard.cost - 4) } })),
  setMaxPlayers: (n) => set((s) => ({ wizard: { ...s.wizard, maxPlayers: n } })),
  setCost: (n) => set((s) => ({ wizard: { ...s.wizard, cost: n } })),

  rebookSeed: null,
  setRebookSeed: (seed) => set({ rebookSeed: seed }),
  clearRebookSeed: () => set({ rebookSeed: null }),
}));
