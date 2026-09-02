import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

// Minimal pure-Node PNG encoder: draws a solid background with a centered
// rounded square and a filled coin with a "$" cut through it, so we get
// real installable PWA icons without any image dependency.
function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
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
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePng(size, { bg, fg, maskablePadding = 0 }) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  const cx = size / 2;
  const cy = size / 2;
  const pad = maskablePadding;
  const radius = size * 0.22;
  const half = (size - pad * 2) * 0.36;

  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0; // filter type 0
    for (let x = 0; x < size; x++) {
      const idx = y * (1 + size * 4) + 1 + x * 4;
      let inRounded = true;
      if (pad === 0) {
        // rounded-rect mask for non-maskable icons
        const rx = Math.max(0, Math.abs(x - cx) - (cx - radius));
        const ry = Math.max(0, Math.abs(y - cy) - (cy - radius));
        inRounded = rx * rx + ry * ry <= radius * radius;
      }
      let r, g, b, a;
      if (!inRounded) {
        r = g = b = 0;
        a = 0;
      } else {
        // filled coin (circle) in fg, with a "$" cut through it in bg:
        // an S made of two opposing C-shaped arcs, plus a vertical
        // stroke running through both.
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const coinRadius = half * 1.05;
        const strokeW = half * 0.15;
        const ringR = half * 0.44;
        const ringInner = ringR - strokeW;

        const inCoin = dist <= coinRadius;

        const topCy = -half * 0.36;
        const tdx = dx;
        const tdy = dy - topCy;
        const tdist = Math.sqrt(tdx * tdx + tdy * tdy);
        const inTopRing = tdist >= ringInner && tdist <= ringR && !(tdx > 0 && tdy > 0);

        const botCy = half * 0.36;
        const bdx = dx;
        const bdy = dy - botCy;
        const bdist = Math.sqrt(bdx * bdx + bdy * bdy);
        const inBottomRing = bdist >= ringInner && bdist <= ringR && !(bdx < 0 && bdy < 0);

        const inVerticalStroke = Math.abs(dx) < strokeW * 0.85 && Math.abs(dy) < coinRadius * 0.82;

        const inDollarSign = inTopRing || inBottomRing || inVerticalStroke;

        if (inCoin && !inDollarSign) {
          [r, g, b] = fg;
        } else {
          [r, g, b] = bg;
        }
        a = 255;
      }
      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
      raw[idx + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const INK = [0x14, 0x18, 0x2b];
const MINT = [0xbf, 0xe3, 0xd4];

mkdirSync("public/icons", { recursive: true });

writeFileSync("public/icons/icon-192.png", makePng(192, { bg: INK, fg: MINT }));
writeFileSync("public/icons/icon-512.png", makePng(512, { bg: INK, fg: MINT }));
writeFileSync(
  "public/icons/icon-maskable-512.png",
  makePng(512, { bg: INK, fg: MINT, maskablePadding: 64 })
);

console.log("Icone generate in public/icons/");
