import { create } from "zustand";
import { TIERS, TierId } from "./theme";
import { DEFAULT_DURATION_HOURS, DURATION_STEP_HOURS, MAX_DURATION_HOURS, MIN_DURATION_HOURS, firstBookableSlot, isSlotBookable } from "./schedule";

// Player-count and per-player-price bounds. Min join threshold is 2 (was 4); max players caps
// at 16 (host picks any value up to that, not just +/-2 steps). Per-player price is host-set
// directly — not booking cost / players — capped at $20/hour so it scales with duration.
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 16;
export const MIN_COURTS_BOOKED = 1;
export const MAX_COURTS_BOOKED = 10;
export const MAX_COST_PER_PLAYER_PER_HOUR = 20;

// A spot the host has named, invited, or just held blank — the lineup strip's "who's coming"
// list (create-game-plan.md §4.3). Sent to create_game_with_spots on publish; games_reserved_spots
// rows are what these become server-side. Not persisted until publish, so ids are local-only.
export type NamedSpotDraft = {
  localId: string;
  label: string | null;
  invitedProfileId: string | null;
  invitedName: string | null;
};

export type WizardDraft = {
  venueId: string | null;
  startsAt: Date;
  skill: TierId;
  // Skill *range*, not a point (create-game-plan.md §5) — skillMax === skill means a single tier,
  // same as today. TIERS order (theme.ts) defines the range between them.
  skillMax: TierId;
  maxPlayers: number;
  courtsBooked: number;
  // Free-text court number/label host gives players ("Court 3", "3-4"). Optional.
  courtLabel: string;
  durationHours: number;
  cost: number;
  // Anonymous held spots — the remainder of total held that isn't in namedSpots below.
  reservedSpots: number;
  namedSpots: NamedSpotDraft[];
  format: string;
  visibility: "public" | "link_only";
  autoApprove: boolean;
  shuttles: string;
  notes: string;
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
  skillMax: "Intermediate",
  maxPlayers: 8,
  courtsBooked: 1,
  courtLabel: "",
  durationHours: DEFAULT_DURATION_HOURS,
  cost: 8,
  reservedSpots: 0,
  namedSpots: [],
  format: "social",
  visibility: "public",
  autoApprove: true,
  shuttles: "",
  notes: "",
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

// Host a Game v3 edit mode (create-game-plan.md band 08): a read state you enter and leave, with
// four full-screen row editors writing into one draft here rather than each other's local state,
// since Expo Router tears down and remounts a screen on push/pop. `original` is the snapshot the
// read screen diffs against for dirty markers, "was" values and the loud/quiet save-bar copy.
export type EditGameFields = {
  startsAt: Date;
  durationHours: number;
  courtsBooked: number;
  courtLabel: string;
  skill: TierId;
  skillMax: TierId;
  maxPlayers: number;
  cost: number;
  format: string;
  visibility: "public" | "link_only";
  autoApprove: boolean;
  shuttles: string;
  notes: string;
};
export type EditGameDraft = {
  gameId: string;
  original: EditGameFields;
  current: EditGameFields;
};

export type WhenFilter = "tonight" | "tomorrow" | "week" | "all";
export type SortOption = "soonest" | "closest" | "cheapest" | "most_spots";

// 15km default (discover-map-ux-plan.md §4.5, D6) — 50km from a Sydney suburb spans most of
// Greater Sydney, so the radius ring never fits the opening viewport. 50 stays selectable.
export const DISCOVER_RADIUS_OPTIONS_KM = [5, 10, 15, 25, 50];
export const DEFAULT_DISCOVER_RADIUS_KM = 15;
export const PRICE_CAP_OPTIONS_CENTS = [1000, 2000, 3000];

// v3 Feed design (claude.ai/design 23bc2cae…, "SMASHIO v3 - Feed.html", screen 2's Filters sheet).
export type FeedMode = "nearby" | "following";
export type FeedKind = "games" | "looking_for_players" | "question" | "achievement";
export const FEED_RADIUS_OPTIONS_KM = [2, 5, 10, 15, 25];
export const DEFAULT_FEED_RADIUS_KM = 15;

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
  amenityFilters: string[];
  toggleAmenityFilter: (slug: string) => void;
  setAmenityFilters: (v: string[]) => void;
  sortBy: SortOption;
  setSortBy: (v: SortOption) => void;
  clearDiscoverFilters: () => void;

  feedMode: FeedMode;
  setFeedMode: (v: FeedMode) => void;
  feedKindFilters: FeedKind[];
  toggleFeedKindFilter: (k: FeedKind) => void;
  setFeedKindFilters: (v: FeedKind[]) => void;
  feedRadiusKm: number;
  setFeedRadiusKm: (v: number) => void;
  clearFeedFilters: () => void;

  wizard: WizardDraft;
  resetWizard: () => void;
  selectVenue: (id: string) => void;
  setStartsAt: (d: Date) => void;
  selectWizardTier: (id: TierId) => void;
  setSkillMax: (id: TierId) => void;
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
  setCourtLabel: (v: string) => void;
  setDurationHours: (n: number) => void;
  setCost: (n: number) => void;
  setReservedSpots: (n: number) => void;
  addNamedSpot: (spot: { label: string | null; invitedProfileId?: string | null; invitedName?: string | null }) => void;
  removeNamedSpot: (localId: string) => void;
  setFormat: (v: string) => void;
  setVisibility: (v: "public" | "link_only") => void;
  setAutoApprove: (v: boolean) => void;
  setShuttles: (v: string) => void;
  setNotes: (v: string) => void;

  rebookSeed: RebookSeed | null;
  setRebookSeed: (seed: RebookSeed) => void;
  clearRebookSeed: () => void;

  hostHereSeed: HostHereSeed | null;
  setHostHereSeed: (seed: HostHereSeed) => void;
  clearHostHereSeed: () => void;

  // social-plan.md §14 metric: post→game conversion. Set alongside rebookSeed by the feed's
  // "Turn this into a game", read once by useCreateGame's onSuccess (games.ts), then cleared —
  // rebookSeed itself is consumed on wizard mount, too early to still be there at publish time.
  wizardFromPost: boolean;
  setWizardFromPost: (v: boolean) => void;
  clearWizardFromPost: () => void;

  editDraft: EditGameDraft | null;
  initEditDraft: (gameId: string, fields: EditGameFields) => void;
  patchEditDraft: (patch: Partial<EditGameFields>) => void;
  discardEditDraft: () => void;
  clearEditDraft: () => void;
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
  amenityFilters: [],
  toggleAmenityFilter: (slug) =>
    set((s) => ({ amenityFilters: s.amenityFilters.includes(slug) ? s.amenityFilters.filter((x) => x !== slug) : [...s.amenityFilters, slug] })),
  setAmenityFilters: (v) => set({ amenityFilters: v }),
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
      amenityFilters: [],
      sortBy: "soonest",
    }),

  feedMode: "nearby",
  setFeedMode: (v) => set({ feedMode: v }),
  feedKindFilters: [],
  toggleFeedKindFilter: (k) =>
    set((s) => ({ feedKindFilters: s.feedKindFilters.includes(k) ? s.feedKindFilters.filter((x) => x !== k) : [...s.feedKindFilters, k] })),
  setFeedKindFilters: (v) => set({ feedKindFilters: v }),
  feedRadiusKm: DEFAULT_FEED_RADIUS_KM,
  setFeedRadiusKm: (v) => set({ feedRadiusKm: v }),
  clearFeedFilters: () => set({ feedMode: "nearby", feedKindFilters: [], feedRadiusKm: DEFAULT_FEED_RADIUS_KM }),

  wizard: initialWizard,
  resetWizard: () => set({ wizard: { ...initialWizard, startsAt: defaultStartsAt() } }),
  selectVenue: (id) => set((s) => ({ wizard: { ...s.wizard, venueId: id } })),
  setStartsAt: (d) => set((s) => ({ wizard: { ...s.wizard, startsAt: d } })),
  selectWizardTier: (id) =>
    set((s) => {
      // Keep the range non-inverted: picking a floor above the current ceiling drags the
      // ceiling up with it (and vice versa via setSkillMax below).
      const minOrd = TIERS.findIndex((t) => t.id === id);
      const maxOrd = TIERS.findIndex((t) => t.id === s.wizard.skillMax);
      return { wizard: { ...s.wizard, skill: id, skillMax: maxOrd < minOrd ? id : s.wizard.skillMax } };
    }),
  setSkillMax: (id) =>
    set((s) => {
      const minOrd = TIERS.findIndex((t) => t.id === s.wizard.skill);
      const maxOrd = TIERS.findIndex((t) => t.id === id);
      return { wizard: { ...s.wizard, skillMax: id, skill: maxOrd < minOrd ? id : s.wizard.skill } };
    }),
  incPlayers: () =>
    set((s) => {
      const maxPlayers = Math.min(MAX_PLAYERS, s.wizard.maxPlayers + 1);
      const cap = Math.max(0, maxPlayers - 1 - s.wizard.namedSpots.length);
      return { wizard: { ...s.wizard, maxPlayers, reservedSpots: Math.min(s.wizard.reservedSpots, cap) } };
    }),
  decPlayers: () =>
    set((s) => {
      const floor = Math.max(MIN_PLAYERS, 1 + s.wizard.namedSpots.length);
      const maxPlayers = Math.max(floor, s.wizard.maxPlayers - 1);
      const cap = Math.max(0, maxPlayers - 1 - s.wizard.namedSpots.length);
      return { wizard: { ...s.wizard, maxPlayers, reservedSpots: Math.min(s.wizard.reservedSpots, cap) } };
    }),
  incCourts: () => set((s) => ({ wizard: { ...s.wizard, courtsBooked: Math.min(MAX_COURTS_BOOKED, s.wizard.courtsBooked + 1) } })),
  decCourts: () => set((s) => ({ wizard: { ...s.wizard, courtsBooked: Math.max(MIN_COURTS_BOOKED, s.wizard.courtsBooked - 1) } })),
  incHours: () =>
    set((s) => {
      const durationHours = Math.min(MAX_DURATION_HOURS, Math.round((s.wizard.durationHours + DURATION_STEP_HOURS) * 100) / 100);
      const cap = durationHours * MAX_COST_PER_PLAYER_PER_HOUR;
      return { wizard: { ...s.wizard, durationHours, cost: Math.min(s.wizard.cost, cap) } };
    }),
  decHours: () =>
    set((s) => {
      const durationHours = Math.max(MIN_DURATION_HOURS, Math.round((s.wizard.durationHours - DURATION_STEP_HOURS) * 100) / 100);
      const cap = durationHours * MAX_COST_PER_PLAYER_PER_HOUR;
      return { wizard: { ...s.wizard, durationHours, cost: Math.min(s.wizard.cost, cap) } };
    }),
  incCost: () =>
    set((s) => ({ wizard: { ...s.wizard, cost: Math.min(s.wizard.durationHours * MAX_COST_PER_PLAYER_PER_HOUR, s.wizard.cost + 1) } })),
  decCost: () => set((s) => ({ wizard: { ...s.wizard, cost: Math.max(1, s.wizard.cost - 1) } })),
  // Ceiling is maxPlayers - 1: the host occupies one slot themselves and can't reserve it
  // (post-game-plan.md D1, mirrored by games_reserved_spots_check).
  incReservedSpots: () =>
    set((s) => ({
      wizard: { ...s.wizard, reservedSpots: Math.min(s.wizard.maxPlayers - 1 - s.wizard.namedSpots.length, s.wizard.reservedSpots + 1) },
    })),
  decReservedSpots: () => set((s) => ({ wizard: { ...s.wizard, reservedSpots: Math.max(0, s.wizard.reservedSpots - 1) } })),
  setMaxPlayers: (n) =>
    set((s) => ({
      wizard: { ...s.wizard, maxPlayers: n, reservedSpots: Math.max(0, Math.min(s.wizard.reservedSpots, n - 1 - s.wizard.namedSpots.length)) },
    })),
  setCourtsBooked: (n) => set((s) => ({ wizard: { ...s.wizard, courtsBooked: n } })),
  setCourtLabel: (v) => set((s) => ({ wizard: { ...s.wizard, courtLabel: v } })),
  setDurationHours: (n) => set((s) => ({ wizard: { ...s.wizard, durationHours: n } })),
  setCost: (n) => set((s) => ({ wizard: { ...s.wizard, cost: n } })),
  setReservedSpots: (n) => set((s) => ({ wizard: { ...s.wizard, reservedSpots: Math.max(0, Math.min(s.wizard.maxPlayers, n)) } })),
  // Named spots eat into the open pool first; if the game's already full (no open slot left),
  // bump maxPlayers by one instead of silently failing (create-game-plan.md §5's "Bumped to 6
  // so Raj fits" rule — never silent).
  addNamedSpot: (spot) =>
    set((s) => {
      const openBefore = Math.max(0, s.wizard.maxPlayers - 1 - s.wizard.namedSpots.length - s.wizard.reservedSpots);
      const maxPlayers = openBefore > 0 ? s.wizard.maxPlayers : Math.min(MAX_PLAYERS, s.wizard.maxPlayers + 1);
      return {
        wizard: {
          ...s.wizard,
          maxPlayers,
          namedSpots: [
            ...s.wizard.namedSpots,
            {
              localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              label: spot.label,
              invitedProfileId: spot.invitedProfileId ?? null,
              invitedName: spot.invitedName ?? null,
            },
          ],
        },
      };
    }),
  removeNamedSpot: (localId) =>
    set((s) => ({ wizard: { ...s.wizard, namedSpots: s.wizard.namedSpots.filter((sp) => sp.localId !== localId) } })),
  setFormat: (v) => set((s) => ({ wizard: { ...s.wizard, format: v } })),
  setVisibility: (v) => set((s) => ({ wizard: { ...s.wizard, visibility: v } })),
  setAutoApprove: (v) => set((s) => ({ wizard: { ...s.wizard, autoApprove: v } })),
  setShuttles: (v) => set((s) => ({ wizard: { ...s.wizard, shuttles: v } })),
  setNotes: (v) => set((s) => ({ wizard: { ...s.wizard, notes: v } })),

  rebookSeed: null,
  setRebookSeed: (seed) => set({ rebookSeed: seed }),
  clearRebookSeed: () => set({ rebookSeed: null }),

  hostHereSeed: null,
  setHostHereSeed: (seed) => set({ hostHereSeed: seed }),
  clearHostHereSeed: () => set({ hostHereSeed: null }),

  wizardFromPost: false,
  setWizardFromPost: (v) => set({ wizardFromPost: v }),
  clearWizardFromPost: () => set({ wizardFromPost: false }),

  editDraft: null,
  // No-op when a draft for this gameId already exists — a row editor pushed on top must not
  // stomp in-progress edits with a fresh snapshot on remount.
  initEditDraft: (gameId, fields) =>
    set((s) => (s.editDraft?.gameId === gameId ? s : { editDraft: { gameId, original: fields, current: fields } })),
  patchEditDraft: (patch) => set((s) => (s.editDraft ? { editDraft: { ...s.editDraft, current: { ...s.editDraft.current, ...patch } } } : s)),
  discardEditDraft: () => set((s) => (s.editDraft ? { editDraft: { ...s.editDraft, current: s.editDraft.original } } : s)),
  clearEditDraft: () => set({ editDraft: null }),
}));
