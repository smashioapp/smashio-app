#!/usr/bin/env node
// Quantizes ui/assets/avatars/*.png to an indexed (PNG-8) palette. Dev-only — sharp is a
// devDependency, never shipped (avatars-plan.md §3.2/decision 4). Run after adding or
// regenerating any Smashimal PNG; not part of the app build.
//
// Slicing sheets into per-animal cells and keying out the baked circle background (§3, the
// flood-fill-from-the-disc-edge step) is still a manual/one-off process — the 28 files here are
// already individually cropped, alpha-keyed cells. This script only does the quantization pass.

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const DIR = new URL("../../assets/avatars/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const BUDGET_BYTES = 900 * 1024;

async function main() {
  const files = (await readdir(DIR)).filter((f) => f.endsWith(".png"));
  if (files.length === 0) {
    console.error(`No PNGs found in ${DIR}`);
    process.exit(1);
  }

  const rows = [];
  for (const file of files) {
    const path = join(DIR, file);
    const before = (await stat(path)).size;
    // 512px source is generation-acceptance resolution (§3), not shipped resolution — nothing
    // in the app renders an avatar above ~112px, so 256px is 2x-retina-sharp there and roughly
    // quarters the pixel count quantization has to work with.
    const buf = await sharp(path)
      .resize(256, 256)
      .png({ palette: true, colors: 128, compressionLevel: 9, effort: 10 })
      .toBuffer();
    await sharp(buf).toFile(path);
    const after = (await stat(path)).size;
    rows.push({ file, before, after });
  }

  rows.sort((a, b) => b.after - a.after);
  const totalBefore = rows.reduce((s, r) => s + r.before, 0);
  const totalAfter = rows.reduce((s, r) => s + r.after, 0);

  for (const r of rows) {
    console.log(`${r.file.padEnd(28)} ${(r.before / 1024).toFixed(1).padStart(8)} KB -> ${(r.after / 1024).toFixed(1).padStart(8)} KB`);
  }
  console.log("-".repeat(60));
  console.log(`TOTAL${" ".repeat(24)} ${(totalBefore / 1024).toFixed(1).padStart(8)} KB -> ${(totalAfter / 1024).toFixed(1).padStart(8)} KB`);

  if (totalAfter > BUDGET_BYTES) {
    console.error(`\nOver budget: ${(totalAfter / 1024).toFixed(1)} KB > ${(BUDGET_BYTES / 1024).toFixed(0)} KB`);
    process.exit(1);
  }
}

main();
