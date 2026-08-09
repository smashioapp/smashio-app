import { Platform } from "react-native";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

// Hero moments only — see docs/not-boring-plan.md "Not doing". No-op on unsupported platforms
// (web preview) and honors a simple in-memory mute switch.
const supported = Platform.OS === "ios" || Platform.OS === "android";

export type SfxName = "pop" | "whoosh" | "chime" | "thunk" | "sparkle";

const SOURCES: Record<SfxName, number> = {
  pop: require("../assets/sfx/pop.wav"),
  whoosh: require("../assets/sfx/whoosh.wav"),
  chime: require("../assets/sfx/chime.wav"),
  thunk: require("../assets/sfx/thunk.wav"),
  sparkle: require("../assets/sfx/sparkle.wav"),
};

let muted = false;
let pool: Partial<Record<SfxName, AudioPlayer>> = null!;

function ensurePool() {
  if (pool || !supported) return;
  pool = {};
  setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false }).catch(() => {});
  (Object.keys(SOURCES) as SfxName[]).forEach((name) => {
    try {
      pool![name] = createAudioPlayer(SOURCES[name]);
    } catch {
      // best-effort — a failed preload just means that one sound stays silent
    }
  });
}

export const sound = {
  play(name: SfxName) {
    if (!supported || muted) return;
    ensurePool();
    const player = pool?.[name];
    if (!player) return;
    try {
      player.seekTo(0).finally(() => player.play());
    } catch {
      // ignore — playback is decoration, never worth crashing over
    }
  },

  setMuted(value: boolean) {
    muted = value;
  },

  isMuted() {
    return muted;
  },
};
