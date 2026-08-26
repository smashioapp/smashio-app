#!/usr/bin/env node
// One-off C0 rig split for quokka (docs/smashimals-plan.md §5.4/C0). Prompt C (ask the generator
// to emit pre-split layers) failed as predicted — each layer came back recentred, not aligned to
// the source coordinates. No Figma available either, so this does the split with real pixel data:
// the "wide arms" reference pose (arms held slightly off the body) has a genuine background gap
// between arm and torso almost everywhere, EXCEPT a short "bridge" at the shoulder where they're
// still anatomically joined. Sever that one bridge with a short line, then flood-fill from a seed
// inside each arm to recover its exact silhouette — everywhere else, the cut follows real art
// edges, not a guessed polygon. Head/body get a plain horizontal split (no natural seam exists
// there either way, so a straight cut is what the plan's own T2 spec expects).
//
// Coordinates below were hand-measured off quokka-full-body-wide-arms.png (1254x1254) via
// gridded crops — see conversation. Not reusable for other characters/poses without re-measuring.

import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const SRC = "../data/smashimals/quokka/quokka-full-body-wide-arms.png";
const OUT_DIR = "../data/smashimals/quokka-rig/";

const MATTE_LOW = 16;
const MATTE_HIGH = 60;
const FACE_COLOR = [171, 135, 108];
const EYES = [
  { cx: 524, cy: 362, r: 60 },
  { cx: 720, cy: 362, r: 60 },
];
const HEAD_BOTTOM = 650;
const BODY_TOP = 580;
// Shoulder bridge severing lines (x1,y1)-(x2,y2), a few px thick, drawn straight through the one
// spot where each arm is still pixel-connected to the torso.
const BRIDGES = [
  { x1: 388, y1: 646, x2: 452, y2: 714 }, // left arm
  { x1: 866, y1: 646, x2: 802, y2: 714 }, // right arm
];
const ARM_SEEDS = [
  { x: 380, y: 830 }, // left paw
  { x: 874, y: 830 }, // right paw
];

function matteKey(data, width, height) {
  const npx = width * height;
  const flag = new Uint8Array(npx);
  const queue = new Int32Array(npx);
  let qHead = 0, qTail = 0;
  const luma = (i) => Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
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
  for (let x = 0; x < width; x++) for (const y of [0, height - 1]) {
    const i = y * width + x;
    if (flag[i] === 0 && luma(i) < MATTE_LOW) { flag[i] = 1; queue[qTail++] = i; }
  }
  for (let y = 0; y < height; y++) for (const x of [0, width - 1]) {
    const i = y * width + x;
    if (flag[i] === 0 && luma(i) < MATTE_LOW) { flag[i] = 1; queue[qTail++] = i; }
  }
  while (qHead < qTail) {
    const i = queue[qHead++];
    for (const n of neighborsOf(i)) if (flag[n] === 0 && luma(n) < MATTE_LOW) { flag[n] = 1; queue[qTail++] = n; }
  }
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
      const f = Math.max(alphaFrac, 0.05);
      data[p] = Math.min(255, Math.round(data[p] / f));
      data[p + 1] = Math.min(255, Math.round(data[p + 1] / f));
      data[p + 2] = Math.min(255, Math.round(data[p + 2] / f));
      data[p + 3] = Math.round(alphaFrac * 255);
    }
  }
}

function floodComponent(alpha, width, height, seedX, seedY) {
  const npx = width * height;
  const visited = new Uint8Array(npx);
  const queue = new Int32Array(npx);
  let qHead = 0, qTail = 0;
  const seedI = seedY * width + seedX;
  if (alpha[seedI] === 0) throw new Error(`Seed (${seedX},${seedY}) landed on a transparent pixel`);
  visited[seedI] = 1;
  queue[qTail++] = seedI;
  while (qHead < qTail) {
    const i = queue[qHead++];
    const x = i % width, y = (i / width) | 0;
    const neighbors = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1];
    for (const n of neighbors) {
      if (n >= 0 && visited[n] === 0 && alpha[n] > 0) { visited[n] = 1; queue[qTail++] = n; }
    }
  }
  return visited;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  matteKey(data, width, height);

  // Sever the shoulder bridges on a scratch copy of the alpha channel, then flood-fill each arm.
  const severed = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i++) severed[i] = data[i * 4 + 3];
  for (const b of BRIDGES) {
    const steps = 200;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = Math.round(b.x1 + (b.x2 - b.x1) * t);
      const cy = Math.round(b.y1 + (b.y2 - b.y1) * t);
      for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) {
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && x < width && y >= 0 && y < height) severed[y * width + x] = 0;
      }
    }
  }

  const armMasks = ARM_SEEDS.map((seed) => floodComponent(severed, width, height, seed.x, seed.y));

  const makeLayer = (predicate) => {
    const out = Buffer.from(data);
    for (let i = 0; i < width * height; i++) {
      if (!predicate(i)) out[i * 4 + 3] = 0;
    }
    return out;
  };

  const inArm = (i) => armMasks[0][i] || armMasks[1][i];

  // The severing cut is a hard straight line with no natural silhouette to match, so it reads as
  // a visible fracture where the arm sits on top of the body (worst mid-rotation, per user
  // report). The body layer already keeps the same-coloured sliver right at that cut (it isn't
  // excluded from BODY_TOP, just from the arm mask), so blending in a blurred alpha there matches
  // colour underneath instead of exposing a hard edge. This must be confined to a band around the
  // cut line only — blurring the arm's alpha everywhere also softens its REAL silhouette (paw,
  // wristband) against true transparent background, and since that background's RGB is black
  // (zeroed by the matte key), a global blur dragged in a dark/grey halo along the whole arm.
  const distToSegment = (px, py, x1, y1, x2, y2) => {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx, cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
  };

  const featherNearCut = async (buf, bridge, innerR, outerR) => {
    const img = sharp(buf, { raw: { width, height, channels: 4 } });
    const blurredAlpha = await img.clone().extractChannel(3).blur(1.5).raw().toBuffer();
    const out = Buffer.from(buf);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const d = distToSegment(x, y, bridge.x1, bridge.y1, bridge.x2, bridge.y2);
        if (d >= outerR) continue;
        const i = y * width + x;
        const blend = d <= innerR ? 1 : 1 - (d - innerR) / (outerR - innerR);
        const orig = out[i * 4 + 3];
        out[i * 4 + 3] = Math.round(orig * (1 - blend) + blurredAlpha[i] * blend);
      }
    }
    return out;
  };

  const armL = await featherNearCut(makeLayer((i) => armMasks[0][i]), BRIDGES[0], 2, 7);
  const armR = await featherNearCut(makeLayer((i) => armMasks[1][i]), BRIDGES[1], 2, 7);
  const body = makeLayer((i) => {
    const y = (i / width) | 0;
    return y >= BODY_TOP && !inArm(i);
  });
  const head = makeLayer((i) => {
    const y = (i / width) | 0;
    return y < HEAD_BOTTOM && !inArm(i);
  });

  // Eyes-shut: patch the open-eye circles with sampled face colour, draw two downward arcs.
  const eyesShutSvg = Buffer.from(
    `<svg width="${width}" height="${height}">
      ${EYES.map((e) => `<circle cx="${e.cx}" cy="${e.cy}" r="${e.r + 2}" fill="rgb(${FACE_COLOR.join(",")})"/>`).join("")}
      ${EYES.map((e) => `<path d="M ${e.cx - 34} ${e.cy - 4} Q ${e.cx} ${e.cy + 22} ${e.cx + 34} ${e.cy - 4}" stroke="#2a1f1a" stroke-width="9" fill="none" stroke-linecap="round"/>`).join("")}
    </svg>`
  );
  const eyesShut = await sharp(head, { raw: { width, height, channels: 4 } })
    .composite([{ input: eyesShutSvg, top: 0, left: 0 }])
    .png()
    .toBuffer();

  const layers = {
    "head.png": head,
    "body.png": body,
    "arm-l.png": armL,
    "arm-r.png": armR,
  };
  const allLayers = { ...layers, "eyes-shut.png": await sharp(eyesShut).ensureAlpha().raw().toBuffer() };

  // No per-layer trim — every layer must keep the same canvas so they share one coordinate space
  // (docs/smashimals-plan.md §4) and can be stacked with left:0 top:0 width:100%. But a SHARED
  // crop (same rect applied to all 5) is safe — it only trims the dead space every layer has in
  // common, and cuts the untrimmed-canvas cost from ~2MB to ~100KB.
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (const buf of Object.values(allLayers)) {
    for (let i = 0; i < width * height; i++) {
      if (buf[i * 4 + 3] > 0) {
        const x = i % width, y = (i / width) | 0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const pad = 6;
  const cropLeft = Math.max(0, minX - pad);
  const cropTop = Math.max(0, minY - pad);
  const cropWidth = Math.min(width, maxX + pad) - cropLeft + 1;
  const cropHeight = Math.min(height, maxY + pad) - cropTop + 1;

  for (const [name, buf] of Object.entries(allLayers)) {
    await sharp(buf, { raw: { width, height, channels: 4 } })
      .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
      .png({ palette: true, colors: 96, compressionLevel: 9, effort: 10 })
      .toFile(`${OUT_DIR}${name}`);
  }
  console.log("Done ->", OUT_DIR, `shared crop ${cropWidth}x${cropHeight} @ (${cropLeft},${cropTop})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
