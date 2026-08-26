#!/usr/bin/env node
// Alpha-keys + quantizes the T1 cast illustrations in data/smashimals/<character>/*.png into
// ui/assets/smashimals/<character>/<pose>.png (docs/smashimals-plan.md §5.3/B0). Each source file
// is already a single full illustration on a pure #0A0A0B background — no grid slicing needed,
// unlike props/process.mjs.

import { mkdir, readdir } from "node:fs/promises";
import sharp from "sharp";

const SRC_ROOT = new URL("../../../data/smashimals/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const OUT_ROOT = new URL("../../assets/smashimals/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

// A hard 0/255 alpha cutoff leaves a ring of near-black antialiasing-blend pixels around every
// curve, which blows out the palette and roughly doubled output size on first pass. Un-matting
// (treat luma as an alpha ramp, then divide the blended colour back out by it) removes that
// black bleed instead of just hiding it behind a jagged alpha edge.
// Source background is #0A0A0B (luma ~10), not pure black — LOW must clear that or the
// border flood-fill seed never fires and nothing gets keyed at all.
const MATTE_LOW = 16;
const MATTE_HIGH = 60;

// data/smashimals/<character>/<source-file>.png -> ui/assets/smashimals/<character>/<pose>.png
const CHARACTERS = {
  quokka: {
    "quokka-full-body.png": "base",
    "quokka-banner.png": "banner",
    "quokka-maps.png": "map",
    "quokka-shelf.png": "shelf",
  },
  kookaburra: {
    "kookaburra-full-body.png": "base",
    "kookaburra-shade.png": "shade",
    "kookaburra-asleep.png": "asleep",
    "kookaburra-laughing.png": "laughing",
  },
  wombat: {
    "wombat-full-body.png": "base",
    "wombat-racquet.png": "racquet",
    "wombat-hips.png": "hips",
  },
  galah: {
    "galah-full-body.png": "base",
    "galah-net.png": "net",
    "galah-confused.png": "confused",
  },
};

async function processOne(srcPath, outPath) {
  const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const npx = width * height;

  // Flood-fill from the border so only the background region (and its antialiasing halo) gets
  // keyed out — a black eye/nose/mouth in the middle of the character is never touched, since it's
  // never connected to the border. 0=unvisited, 1=background, 2=halo-of-background (soft edge).
  const flag = new Uint8Array(npx);
  const queue = new Int32Array(npx);
  let qHead = 0, qTail = 0;
  const luma = (i) => Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);

  for (let x = 0; x < width; x++) {
    for (const y of [0, height - 1]) {
      const i = y * width + x;
      if (flag[i] === 0 && luma(i) < MATTE_LOW) { flag[i] = 1; queue[qTail++] = i; }
    }
  }
  for (let y = 0; y < height; y++) {
    for (const x of [0, width - 1]) {
      const i = y * width + x;
      if (flag[i] === 0 && luma(i) < MATTE_LOW) { flag[i] = 1; queue[qTail++] = i; }
    }
  }
  const neighborsOf = (i) => {
    const x = i % width, y = (i / width) | 0;
    const xs = [x > 0 ? x - 1 : -1, x, x < width - 1 ? x + 1 : -1];
    const ys = [y > 0 ? y - 1 : -1, y, y < height - 1 ? y + 1 : -1];
    const out = [];
    for (const nx of xs) for (const ny of ys) {
      if (nx < 0 || ny < 0 || (nx === x && ny === y)) continue;
      out.push(ny * width + nx);
    }
    return out;
  };

  while (qHead < qTail) {
    const i = queue[qHead++];
    for (const n of neighborsOf(i)) {
      if (flag[n] === 0 && luma(n) < MATTE_LOW) { flag[n] = 1; queue[qTail++] = n; }
    }
  }
  // Halo pass: pixels touching the flood region, within the antialiasing range, get un-matted
  // rather than hard-cut — this is what removes the dark fringe without eating interior blacks.
  for (let i = 0; i < npx; i++) {
    if (flag[i] === 1) continue;
    if (luma(i) < MATTE_HIGH && neighborsOf(i).some((n) => flag[n] === 1)) flag[i] = 2;
  }

  for (let i = 0; i < npx; i++) {
    const p = i * 4;
    if (flag[i] === 1) {
      data[p] = data[p + 1] = data[p + 2] = data[p + 3] = 0;
    } else if (flag[i] === 2) {
      const l = luma(i);
      const alphaFrac = Math.min(1, Math.max(0, (l - MATTE_LOW) / (MATTE_HIGH - MATTE_LOW)));
      data[p] = Math.min(255, Math.round(data[p] / Math.max(alphaFrac, 0.05)));
      data[p + 1] = Math.min(255, Math.round(data[p + 1] / Math.max(alphaFrac, 0.05)));
      data[p + 2] = Math.min(255, Math.round(data[p + 2] / Math.max(alphaFrac, 0.05)));
      data[p + 3] = Math.round(alphaFrac * 255);
    }
  }
  const keyed = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png();
  const trimmed = await keyed
    .trim({ threshold: 10 })
    .resize({ width: 560, withoutEnlargement: true })
    .png({ palette: true, colors: 96, compressionLevel: 9, effort: 10 })
    .toBuffer();
  await sharp(trimmed).toFile(outPath);
  return trimmed.length;
}

async function main() {
  const rows = [];
  for (const [character, poses] of Object.entries(CHARACTERS)) {
    const outDir = `${OUT_ROOT}${character}/`;
    await mkdir(outDir, { recursive: true });
    const files = await readdir(`${SRC_ROOT}${character}/`);
    for (const [srcFile, poseName] of Object.entries(poses)) {
      if (!files.includes(srcFile)) {
        console.error(`Missing ${SRC_ROOT}${character}/${srcFile}`);
        process.exit(1);
      }
      const bytes = await processOne(`${SRC_ROOT}${character}/${srcFile}`, `${outDir}${poseName}.png`);
      rows.push({ name: `${character}/${poseName}`, bytes });
    }
  }

  for (const r of rows) {
    console.log(`${r.name.padEnd(24)} ${(r.bytes / 1024).toFixed(1).padStart(8)} KB`);
  }
  const total = rows.reduce((s, r) => s + r.bytes, 0);
  console.log("-".repeat(36));
  console.log(`TOTAL${" ".repeat(19)} ${(total / 1024).toFixed(1).padStart(8)} KB`);
}

main();
