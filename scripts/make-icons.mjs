// Makes every icon the app needs from one square logo: assets/logo.png (your artwork, ideally 1024x1024)
// or, until that exists, the placeholder assets/logo.svg. Run with make-icons.bat (or node scripts/make-icons.mjs).
//
// The logo should have a solid background colour reaching every edge, with the picture inside the middle
// ~60%: Android crops launcher icons to circles/squircles, and the background colour (read from the
// logo's corners) fills the space around the edges.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const res = path.join(root, "android/app/src/main/res");
const pngLogo = path.join(root, "assets/logo.png");
const source = fs.existsSync(pngLogo) ? pngLogo : path.join(root, "assets/logo.svg");

// A square crop of the logo at a high resolution, so every size below scales down from the same image.
const base = await sharp(source, { density: 300 }).resize(1024, 1024, { fit: "cover" }).png().toBuffer();

const background = await edgeColour(base);
const hex = "#" + background.map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase();

// The average colour of a strip round the logo's edge (AI artwork's background is rarely perfectly flat).
async function edgeColour(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const sum = [0, 0, 0];
  let n = 0;
  const band = 24;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (x >= band && x < info.width - band && y >= band && y < info.height - band) continue;
      const i = (y * info.width + x) * 3;
      sum[0] += data[i]; sum[1] += data[i + 1]; sum[2] += data[i + 2];
      n++;
    }
  }
  return sum.map((s) => Math.round(s / n));
}

// The logo with its edges faded out, for placing on the flat background colour without a visible square.
async function feathered(size) {
  const inset = Math.round(size * 0.1);
  const blur = Math.round(size * 0.06);
  const soft = Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="f" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${blur}"/></filter></defs>
    <rect x="${inset}" y="${inset}" width="${size - 2 * inset}" height="${size - 2 * inset}" rx="${inset * 2}" fill="#fff" filter="url(#f)"/>
  </svg>`);
  return sharp(base).resize(size, size).ensureAlpha().composite([{ input: soft, blend: "dest-in" }]).png().toBuffer();
}

const mask = (size, radius) => Buffer.from(
  `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/></svg>`);

async function rounded(size, radius) {
  return sharp(base).resize(size, size).composite([{ input: mask(size, radius), blend: "dest-in" }]).png().toBuffer();
}

async function write(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp(buf).png().toFile(file);
}

// Launcher icons. Legacy (Android 7): a rounded square and a circle. Android 8+ (adaptive): the logo
// on a 108dp layer, drawn at 96dp so the launcher's crop never reaches its edge, over the corner colour.
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [name, scale] of Object.entries(DENSITIES)) {
  const icon = Math.round(48 * scale);
  await write(`${res}/mipmap-${name}/ic_launcher.png`, await rounded(icon, icon * 0.18));
  await write(`${res}/mipmap-${name}/ic_launcher_round.png`, await rounded(icon, icon / 2));
  const layer = Math.round(108 * scale);
  const inner = Math.round(96 * scale);
  const logo = await sharp(base).resize(inner, inner).png().toBuffer();
  const pad = Math.round((layer - inner) / 2);
  await write(`${res}/mipmap-${name}/ic_launcher_foreground.png`,
    await sharp({ create: { width: layer, height: layer, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: logo, left: pad, top: pad }]).png().toBuffer());
}
fs.writeFileSync(`${res}/values/ic_launcher_background.xml`,
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${hex}</color>\n</resources>\n`);

// Splash screens: the logo in the middle of the background colour.
async function splash(width, height) {
  const size = Math.round(Math.min(width, height) * 0.36);
  const logo = await feathered(size);
  return sharp({ create: { width, height, channels: 3, background: { r: background[0], g: background[1], b: background[2] } } })
    .composite([{ input: logo, gravity: "center" }]).png().toBuffer();
}
const SPLASH = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
for (const [name, [w, h]] of Object.entries(SPLASH)) {
  await write(`${res}/drawable-port-${name}/splash.png`, await splash(w, h));
  await write(`${res}/drawable-land-${name}/splash.png`, await splash(h, w));
}
await write(`${res}/drawable/splash.png`, await splash(480, 320));

// In the app (header, browser tab) and for the Play Store listing (512x512, square: Play rounds it itself).
await write(path.join(root, "public/logo.png"), await rounded(256, 256 * 0.18));
await write(path.join(root, "store/icon-512.png"), await sharp(base).resize(512, 512).png().toBuffer());
await write(path.join(root, "site/icon.png"), await rounded(192, 192 * 0.18));

// Play's feature graphic (1024x500): the logo and the name on the background colour. Text is light on a
// dark background, dark on a light one.
const light = (background[0] * 299 + background[1] * 587 + background[2] * 114) / 1000 > 150;
const ink = light ? "#1F2421" : "#FFFFFF";
const feature = Buffer.from(`<svg width="1024" height="500" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="500" fill="${hex}"/>
  <text x="430" y="235" font-family="Segoe UI, Arial, sans-serif" font-size="96" font-weight="700" fill="${ink}">Meal Map</text>
  <text x="434" y="300" font-family="Segoe UI, Arial, sans-serif" font-size="34" fill="${ink}" fill-opacity="0.85">Plan, shop and cook your week</text>
</svg>`);
await write(path.join(root, "store/feature-graphic.png"),
  await sharp(feature).composite([{ input: await feathered(380), left: 50, top: 60 }]).png().toBuffer());

console.log(`Icons made from ${path.relative(root, source)} (background ${hex}).`);
