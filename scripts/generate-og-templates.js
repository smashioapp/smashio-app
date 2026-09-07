// notifications-v2-plan.md §6.2 V2.0: "pre-render a small set of template PNGs — sport × tier,
// roughly eight files". Badminton is the only sport that ships, so four tier variants cover it.
// website/ deliberately has no package.json/build step (§6.2's decision), so this generates the
// PNGs with nothing but Node's built-in zlib — no sharp/jimp/canvas dependency to add. Run once,
// commit the output; not part of any build step.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const WIDTH = 1200;
const HEIGHT = 630;

// Same four tiers as index.html's "Four honest skill tiers" card and api/game/[id].js's
// TIER_COLORS.
const TIERS = {
  beginner: [0x6f, 0xcb, 0xff],
  intermediate: [0x35, 0xd6, 0xa6],
  advanced: [0xff, 0xb6, 0x48],
  pro: [0xc0, 0x8c, 0xff],
};

const BG = [0x0a, 0x0a, 0x0b];

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

// A soft radial bloom of the tier colour in the top-right, echoing the brand's own hero gradient
// (see api/game/[id].js's bloomVolt/bloomCool radial gradients), plus a thin accent rule along
// the bottom edge so the card reads as "designed" rather than a flat swatch.
function buildRGB(tier) {
  const [tr, tg, tb] = TIERS[tier];
  const cx = WIDTH * 0.78;
  const cy = HEIGHT * 0.18;
  const maxDist = Math.hypot(WIDTH, HEIGHT) * 0.55;
  const buf = Buffer.alloc(WIDTH * HEIGHT * 3);

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const dist = Math.hypot(x - cx, y - cy);
      const bloom = Math.max(0, 1 - dist / maxDist);
      const t = Math.pow(bloom, 1.6) * 0.32;
      const idx = (y * WIDTH + x) * 3;
      let r = lerp(BG[0], tr, t);
      let g = lerp(BG[1], tg, t);
      let b = lerp(BG[2], tb, t);
      // Bottom accent rule, ~10px, full tier colour.
      if (y > HEIGHT - 10) {
        r = tr;
        g = tg;
        b = tb;
      }
      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
    }
  }
  return buf;
}

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(rgbBuf, width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Raw scanlines, each prefixed with filter type 0 (none).
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0;
    rgbBuf.copy(raw, rowStart + 1, y * width * 3, (y + 1) * width * 3);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, "..", "website", "assets", "og");
fs.mkdirSync(outDir, { recursive: true });

for (const tier of Object.keys(TIERS)) {
  const png = encodePNG(buildRGB(tier), WIDTH, HEIGHT);
  const outPath = path.join(outDir, `og-badminton-${tier}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`${outPath} (${(png.length / 1024).toFixed(1)} KB)`);
}
