import { create } from "zustand";
import { CHAT_SEED, ChatMessage } from "./mockData";
import { TierId } from "./theme";

export type WizardDraft = {
  venueId: string | null;
  date: string;
  time: string;
  skill: TierId;
  maxPlayers: number;
  cost: number;
  uploaded: boolean;
};

const initialWizard: WizardDraft = {
  venueId: null,
  date: "Sat 8 Aug",
  time: "7:00 PM",
  skill: "Intermediate",
  maxPlayers: 8,
  cost: 64,
  uploaded: false,
};

type AppState = {
  discoverView: "list" | "map";
  setDiscoverView: (v: "list" | "map") => void;
  activeFilter: string;
  setActiveFilter: (v: string) => void;
  showEmptyState: boolean;
  toggleEmptyState: () => void;

  myGamesTab: "joined" | "hosting" | "past";
  setMyGamesTab: (v: "joined" | "hosting" | "past") => void;

  wizard: WizardDraft;
  resetWizard: () => void;
  selectVenue: (id: string) => void;
  selectDate: (d: string) => void;
  selectTime: (t: string) => void;
  selectWizardTier: (id: TierId) => void;
  incPlayers: () => void;
  decPlayers: () => void;
  incCost: () => void;
  decCost: () => void;
  uploadConfirmation: () => void;

  chatMessages: Record<string, ChatMessage[]>;
  sendMessage: (gameId: string, text: string) => void;

  ratings: Record<string, number>;
  rate: (playerId: string, n: number) => void;
};

export const useAppStore = create<AppState>((set) => ({
  discoverView: "list",
  setDiscoverView: (v) => set({ discoverView: v }),
  activeFilter: "All levels",
  setActiveFilter: (v) => set({ activeFilter: v }),
  showEmptyState: false,
  toggleEmptyState: () => set((s) => ({ showEmptyState: !s.showEmptyState })),

  myGamesTab: "joined",
  setMyGamesTab: (v) => set({ myGamesTab: v }),

  wizard: initialWizard,
  resetWizard: () => set({ wizard: initialWizard }),
  selectVenue: (id) => set((s) => ({ wizard: { ...s.wizard, venueId: id } })),
  selectDate: (d) => set((s) => ({ wizard: { ...s.wizard, date: d } })),
  selectTime: (t) => set((s) => ({ wizard: { ...s.wizard, time: t } })),
  selectWizardTier: (id) => set((s) => ({ wizard: { ...s.wizard, skill: id } })),
  incPlayers: () => set((s) => ({ wizard: { ...s.wizard, maxPlayers: Math.min(20, s.wizard.maxPlayers + 2) } })),
  decPlayers: () => set((s) => ({ wizard: { ...s.wizard, maxPlayers: Math.max(4, s.wizard.maxPlayers - 2) } })),
  incCost: () => set((s) => ({ wizard: { ...s.wizard, cost: s.wizard.cost + 4 } })),
  decCost: () => set((s) => ({ wizard: { ...s.wizard, cost: Math.max(8, s.wizard.cost - 4) } })),
  uploadConfirmation: () => set((s) => ({ wizard: { ...s.wizard, uploaded: true } })),

  chatMessages: JSON.parse(JSON.stringify(CHAT_SEED)),
  sendMessage: (gameId, text) =>
    set((s) => ({
      chatMessages: {
        ...s.chatMessages,
        [gameId]: [...(s.chatMessages[gameId] ?? []), { from: "You", me: true, text, time: "Now" }],
      },
    })),

  ratings: {},
  rate: (playerId, n) => set((s) => ({ ratings: { ...s.ratings, [playerId]: n } })),
}));
