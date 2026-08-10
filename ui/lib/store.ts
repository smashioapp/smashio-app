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

type AppState = {
  discoverView: "list" | "map";
  setDiscoverView: (v: "list" | "map") => void;
  activeFilter: string;
  setActiveFilter: (v: string) => void;

  myGamesTab: "joined" | "hosting" | "past";
  setMyGamesTab: (v: "joined" | "hosting" | "past") => void;

  wizard: WizardDraft;
  resetWizard: () => void;
  selectVenue: (id: string) => void;
  setStartsAt: (d: Date) => void;
  selectWizardTier: (id: TierId) => void;
  incPlayers: () => void;
  decPlayers: () => void;
  incCost: () => void;
  decCost: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  discoverView: "list",
  setDiscoverView: (v) => set({ discoverView: v }),
  activeFilter: "All levels",
  setActiveFilter: (v) => set({ activeFilter: v }),

  myGamesTab: "joined",
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
}));
