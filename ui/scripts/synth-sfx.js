// Synthesizes SMASHIO's hero-moment sound effects as short WAV files.
// No downloaded audio, no licensing question — just sine/noise envelopes written to disk.
// Run: node scripts/synth-sfx.js
const fs = require("fs");
const path = require("path");

const SAMPLE_RATE = 44100;
const OUT_DIR = path.join(__dirname, "..", "assets", "sfx");

function writeWav(filename, samples) {
  const numSamples = samples.length;
  const dataSize = numSamples * 2; // 16-bit mono
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, filename), buffer);
  console.log(`wrote ${filename} (${(dataSize / 1024).toFixed(1)}kb, ${(numSamples / SAMPLE_RATE).toFixed(2)}s)`);
}

function samplesFor(seconds) {
  return new Float32Array(Math.round(seconds * SAMPLE_RATE));
}

function expDecay(t, tau) {
  return Math.exp(-t / tau);
}

function sine(t, freq, phase = 0) {
  return Math.sin(2 * Math.PI * freq * t + phase);
}

function noise() {
  return Math.random() * 2 - 1;
}

// One-pole lowpass, used to soften white noise into a "whoosh"/wind texture.
function lowpass(arr, cutoffAlpha) {
  let prev = 0;
  for (let i = 0; i < arr.length; i++) {
    prev = prev + cutoffAlpha * (arr[i] - prev);
    arr[i] = prev;
  }
  return arr;
}

// --- pop: fast rising click, ~110ms ---
function makePop() {
  const dur = 0.11;
  const buf = samplesFor(dur);
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE;
    const freq = 380 + 900 * expDecay(t, 0.02); // quick downward chirp
    buf[i] = sine(t, freq) * expDecay(t, 0.028) * 0.9;
  }
  return buf;
}

// --- whoosh: filtered noise sweep, ~260ms ---
function makeWhoosh() {
  const dur = 0.26;
  const buf = samplesFor(dur);
  for (let i = 0; i < buf.length; i++) buf[i] = noise();
  lowpass(buf, 0.12);
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.sin((Math.PI * t) / dur); // rise then fall
    buf[i] *= env * 0.6;
  }
  return buf;
}

// --- chime: bright two-tone bell, ~650ms ---
function makeChime() {
  const dur = 0.65;
  const buf = samplesFor(dur);
  const f1 = 1046.5; // C6
  const f2 = 1318.5; // E6
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE;
    const env = expDecay(t, 0.32);
    buf[i] = (sine(t, f1) * 0.6 + sine(t, f2) * 0.4 + sine(t, f1 * 2) * 0.15) * env * 0.5;
  }
  return buf;
}

// --- thunk: low, short, percussive — a stamp landing, ~140ms ---
function makeThunk() {
  const dur = 0.14;
  const buf = samplesFor(dur);
  const clickBuf = samplesFor(0.01);
  for (let i = 0; i < clickBuf.length; i++) clickBuf[i] = noise();
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE;
    const body = sine(t, 90) * expDecay(t, 0.045);
    const click = i < clickBuf.length ? clickBuf[i] * expDecay(t, 0.004) : 0;
    buf[i] = (body * 0.85 + click * 0.5) * 0.9;
  }
  return buf;
}

// --- sparkle: three quick high blips with noise dust, ~420ms ---
function makeSparkle() {
  const dur = 0.42;
  const buf = samplesFor(dur);
  const blips = [
    { start: 0.0, freq: 1800 },
    { start: 0.07, freq: 2400 },
    { start: 0.15, freq: 3100 },
  ];
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE;
    let v = 0;
    for (const b of blips) {
      if (t >= b.start) {
        const lt = t - b.start;
        v += sine(lt, b.freq) * expDecay(lt, 0.05) * 0.35;
      }
    }
    v += noise() * expDecay(t, 0.08) * 0.05; // dust
    buf[i] = v;
  }
  return buf;
}

writeWav("pop.wav", makePop());
writeWav("whoosh.wav", makeWhoosh());
writeWav("chime.wav", makeChime());
writeWav("thunk.wav", makeThunk());
writeWav("sparkle.wav", makeSparkle());
