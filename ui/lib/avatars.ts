// Smashimals — 28 Australian-native avatars (docs/avatars-plan.md). No FK/enum on
// `profiles.avatar_key`: an unrecognized key just falls through to the id-hash animal below, so
// adding/renaming a key here never needs a migration and never crashes an old client.

export type AnimalKey =
  | "koala"
  | "kangaroo"
  | "wombat"
  | "quokka"
  | "echidna"
  | "platypus"
  | "sugar-glider"
  | "bilby"
  | "numbat"
  | "tasmanian-devil"
  | "dingo"
  | "brushtail-possum"
  | "quoll"
  | "bandicoot"
  | "flying-fox"
  | "cockatoo"
  | "lorikeet"
  | "magpie"
  | "little-penguin"
  | "black-swan"
  | "budgerigar"
  | "goanna"
  | "kookaburra"
  | "galah"
  | "emu"
  | "cassowary"
  | "pelican"
  | "tawny-frogmouth";

type Animal = { key: AnimalKey; label: string; src: number };

// `require()` calls must be static literals for Metro to bundle them — no dynamic path
// construction here.
export const ANIMALS: Animal[] = [
  { key: "koala", label: "Koala", src: require("../assets/avatars/koala.png") },
  { key: "kangaroo", label: "Kangaroo", src: require("../assets/avatars/kangaroo.png") },
  { key: "wombat", label: "Wombat", src: require("../assets/avatars/wombat.png") },
  { key: "quokka", label: "Quokka", src: require("../assets/avatars/quokka.png") },
  { key: "echidna", label: "Echidna", src: require("../assets/avatars/echidna.png") },
  { key: "platypus", label: "Platypus", src: require("../assets/avatars/platypus.png") },
  { key: "sugar-glider", label: "Sugar glider", src: require("../assets/avatars/sugar-glider.png") },
  { key: "bilby", label: "Bilby", src: require("../assets/avatars/bilby.png") },
  { key: "numbat", label: "Numbat", src: require("../assets/avatars/numbat.png") },
  { key: "tasmanian-devil", label: "Tasmanian devil", src: require("../assets/avatars/tasmanian-devil.png") },
  { key: "dingo", label: "Dingo", src: require("../assets/avatars/dingo.png") },
  { key: "brushtail-possum", label: "Brushtail possum", src: require("../assets/avatars/brushtail-possum.png") },
  { key: "quoll", label: "Quoll", src: require("../assets/avatars/quoll.png") },
  { key: "bandicoot", label: "Bandicoot", src: require("../assets/avatars/bandicoot.png") },
  { key: "flying-fox", label: "Flying fox", src: require("../assets/avatars/flying-fox.png") },
  { key: "cockatoo", label: "Cockatoo", src: require("../assets/avatars/cockatoo.png") },
  { key: "lorikeet", label: "Lorikeet", src: require("../assets/avatars/lorikeet.png") },
  { key: "magpie", label: "Magpie", src: require("../assets/avatars/magpie.png") },
  { key: "little-penguin", label: "Little penguin", src: require("../assets/avatars/little-penguin.png") },
  { key: "black-swan", label: "Black swan", src: require("../assets/avatars/black-swan.png") },
  { key: "budgerigar", label: "Budgerigar", src: require("../assets/avatars/budgerigar.png") },
  { key: "goanna", label: "Goanna", src: require("../assets/avatars/goanna.png") },
  { key: "kookaburra", label: "Kookaburra", src: require("../assets/avatars/kookaburra.png") },
  { key: "galah", label: "Galah", src: require("../assets/avatars/galah.png") },
  { key: "emu", label: "Emu", src: require("../assets/avatars/emu.png") },
  { key: "cassowary", label: "Cassowary", src: require("../assets/avatars/cassowary.png") },
  { key: "pelican", label: "Pelican", src: require("../assets/avatars/pelican.png") },
  { key: "tawny-frogmouth", label: "Tawny frogmouth", src: require("../assets/avatars/tawny-frogmouth.png") },
];

const BY_KEY = new Map(ANIMALS.map((a) => [a.key, a]));

// Reserved key: delete_account sets profiles.avatar_key = 'ghost' so a scrubbed profile never
// renders a cheerful animal (avatars-plan.md decision 7). Not in ANIMALS/the picker.
export const GHOST_KEY = "ghost";

// Same hash shape as theme.ts's avatarColor(), so the same id always lands on the same animal.
function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

/** Deterministic animal for a profile id — used when no avatar_key is set yet. */
export function animalForId(id: string): Animal {
  return ANIMALS[hashId(id) % ANIMALS.length];
}

/** Resolves a stored (possibly unknown/future) avatar_key against the id-hash fallback. */
export function animalFor(key: string | null | undefined, id: string): Animal {
  if (key) {
    const found = BY_KEY.get(key as AnimalKey);
    if (found) return found;
  }
  return animalForId(id);
}
