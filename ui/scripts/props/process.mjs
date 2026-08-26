#!/usr/bin/env node
// Slices data/smashimals/props/props-raw.png (3x2 grid, 512px cells, pure #000000 bg) into six
// alpha-keyed prop PNGs in ui/assets/props/, then quantizes each (see avatars/process.mjs for the
// same two-step shape: key+crop, then palette-quantize).

import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const SRC = new URL("../../../data/smashimals/props/props-raw.png", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const OUT_DIR = new URL("../../assets/props/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const CELL = 512;
const NAMES = ["banner", "trophy", "racquet", "shuttlecock", "medal", "speech-bubble"];
const BLACK_THRESHOLD = 24; // channel value below this is treated as background, not art

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const rows = [];
  for (let i = 0; i < NAMES.length; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const name = NAMES[i];
    const outPath = `${OUT_DIR}${name}.png`;

    const cell = await sharp(SRC)
      .extract({ left: col * CELL, top: row * CELL, width: CELL, height: CELL })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = cell;
    for (let p = 0; p < data.length; p += 4) {
      if (data[p] < BLACK_THRESHOLD && data[p + 1] < BLACK_THRESHOLD && data[p + 2] < BLACK_THRESHOLD) {
        data[p + 3] = 0;
      }
    }

    const keyed = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png();
    const trimmed = await keyed.trim({ threshold: 10 }).png({ palette: true, colors: 128, compressionLevel: 9, effort: 10 }).toBuffer();
    await sharp(trimmed).toFile(outPath);

    rows.push({ name, bytes: trimmed.length });
  }

  for (const r of rows) {
    console.log(`${r.name.padEnd(16)} ${(r.bytes / 1024).toFixed(1).padStart(8)} KB`);
  }
  const total = rows.reduce((s, r) => s + r.bytes, 0);
  console.log("-".repeat(30));
  console.log(`TOTAL${" ".repeat(11)} ${(total / 1024).toFixed(1).padStart(8)} KB`);
}

main();
