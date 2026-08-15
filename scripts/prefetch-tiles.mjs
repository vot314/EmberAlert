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
const outDir = join(root, "public", "tiles");
const manifest = JSON.parse(readFileSync(join(root, "data/calls.json"), "utf8"));

// Bounding box covering every caller plus generous margin around the fix.
// Wide enough to cover the fitBounds view including padding at every stage of the
// demo, not just the callers themselves — an uncovered edge shows as grey offline.
const BBOX = { north: 50.12, south: 49.55, west: -120.15, east: -119.10 };
const ZOOMS = [9, 10, 11, 12, 13];
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
for (const z of ZOOMS) {
  const x0 = lon2x(BBOX.west, z);
  const x1 = lon2x(BBOX.east, z);
  const y0 = lat2y(BBOX.north, z);
  const y1 = lat2y(BBOX.south, z);
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      jobs.push({ z, x, y });
    }
  }
}

console.log(`${jobs.length} tiles across zoom ${ZOOMS[0]}-${ZOOMS.at(-1)}`);

let done = 0;
let failed = 0;
let skipped = 0;

async function fetchTile({ z, x, y }) {
  const dir = join(outDir, String(z), String(x));
  const file = join(dir, `${y}.jpg`);
  if (existsSync(file)) {
    skipped++;
    return;
  }
  // Esri serves {z}/{y}/{x} — y before x.
  const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    done++;
  } catch {
    failed++;
  }
}

const queue = [...jobs];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) await fetchTile(queue.shift());
  }),
);

mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, "manifest.json"),
  JSON.stringify({ bbox: BBOX, zooms: ZOOMS, tiles: done + skipped, generatedAt: new Date().toISOString() }, null, 2),
);

console.log(`downloaded ${done}, already present ${skipped}, failed ${failed}`);
console.log(`scenario: ${manifest.scenario.name}`);
