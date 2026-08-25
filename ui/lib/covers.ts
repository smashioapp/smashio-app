// Game covers (docs/avatars-plan.md P3, unparked as an AI-generated pack instead of the
// originally-scoped client-drawn SVG — see chat history). No FK/enum on `games.cover_key`: an
// unrecognized key (old client, future pack addition) just falls through to no cover, same
// pattern as avatars.ts's animal fallback.

export type CoverKey = "geo-1" | "geo-2" | "geo-3" | "geo-4";

type Cover = { key: CoverKey; src: number };

// `require()` calls must be static literals for Metro to bundle them — no dynamic path
// construction here.
export const COVERS: Cover[] = [
  { key: "geo-1", src: require("../assets/covers/geo-1.png") },
  { key: "geo-2", src: require("../assets/covers/geo-2.png") },
  { key: "geo-3", src: require("../assets/covers/geo-3.png") },
  { key: "geo-4", src: require("../assets/covers/geo-4.png") },
];

const BY_KEY = new Map(COVERS.map((c) => [c.key, c]));

/** Resolves a stored (possibly unknown, or the 'auto' default) cover_key. Null means "no cover art". */
export function coverFor(key: string | null | undefined): Cover | null {
  if (!key) return null;
  return BY_KEY.get(key as CoverKey) ?? null;
}

/** Picked once at game creation (games.ts's useCreateGame) — not deterministic from game id,
 * since the id doesn't exist yet at insert time. */
export function randomCoverKey(): CoverKey {
  return COVERS[Math.floor(Math.random() * COVERS.length)].key;
}
