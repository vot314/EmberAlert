/**
 * Downloads the basemap tiles covering the scenario area into public/tiles/.
 *
 * The demo has to run with the network off, and a satellite basemap is a network
 * dependency. Prefetching the handful of zoom levels the demo actually uses makes
 * the map work offline; MapView layers these local tiles over the live Esri layer,
 * so anything not prefetched (a judge zooming out, panning away) still resolves
 * online, and everything prefetched works whether or not there is a network.
 *
 *   node scripts/prefetch-tiles.mjs
 */
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LAYERS = [
  {
    name: "imagery",
    dir: join(root, "public", "tiles"),
    ext: "jpg",
    url: (z, x, y) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  },
  {
    // Labels-only overlay: place names, no filled polygons. Carto uses standard
    // XYZ ordering, unlike the Esri imagery above which is {z}/{y}/{x}.
    name: "labels",
    dir: join(root, "public", "tiles-labels"),
    ext: "png",
    url: (z, x, y) => `https://basemaps.cartocdn.com/rastertiles/dark_only_labels/${z}/${x}/${y}.png`,
  },
];
const outDir = LAYERS[0].dir;
const manifest = JSON.parse(readFileSync(join(root, "data/calls.json"), "utf8"));

/**
 * Two tiers, because tile count grows fourfold per zoom level.
 *
 * Low zooms cover a wide slice of the southern interior for a few dozen tiles, so
 * the map still has imagery and place names if anyone pans or zooms out during the
 * demo — an uncovered edge renders as the label layer floating over bare background,
 * which looks broken. High zooms cover only the scenario area, where the detail is
 * actually needed.
 */
const TIERS = [
  { zooms: [7, 8, 9, 10], bbox: { north: 51.2, south: 48.8, west: -121.6, east: -117.8 } },
  { zooms: [11, 12, 13], bbox: { north: 50.12, south: 49.55, west: -120.15, east: -119.1 } },
];
const CONCURRENCY = 8;

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) =>
  Math.floor(
    ((1 -
      Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) /
      2) *
      2 ** z,
  );

const jobs = [];
for (const tier of TIERS) {
  for (const z of tier.zooms) {
    const x0 = lon2x(tier.bbox.west, z);
    const x1 = lon2x(tier.bbox.east, z);
    const y0 = lat2y(tier.bbox.north, z);
    const y1 = lat2y(tier.bbox.south, z);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) jobs.push({ z, x, y });
    }
  }
}

console.log(`${jobs.length} tiles per layer across ${TIERS.length} zoom tiers`);

let done = 0;
let failed = 0;
let skipped = 0;

async function fetchTile(layer, { z, x, y }) {
  const dir = join(layer.dir, String(z), String(x));
  const file = join(dir, `${y}.${layer.ext}`);
  if (existsSync(file)) {
    skipped++;
    return;
  }
  try {
    // Esri serves {z}/{y}/{x} — y before x.
    const res = await fetch(layer.url(z, x, y));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    done++;
  } catch {
    failed++;
  }
}

for (const layer of LAYERS) {
  const queue = [...jobs];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) await fetchTile(layer, queue.shift());
    }),
  );
  console.log(`  ${layer.name}: done`);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, "manifest.json"),
  JSON.stringify({ tiers: TIERS, tiles: done + skipped, generatedAt: new Date().toISOString() }, null, 2),
);

console.log(`downloaded ${done}, already present ${skipped}, failed ${failed}`);
console.log(`scenario: ${manifest.scenario.name}`);
