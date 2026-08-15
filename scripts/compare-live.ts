/**
 * Runs every call through the LIVE Gemini pipeline and diffs the result against the
 * hand-authored fixture, then reports what the live extractions do to the fix.
 *
 * This is the only way to know whether the model actually understands the calls, as
 * opposed to whether the geometry works on extractions a human wrote. Results are
 * written into .cache/ as a side effect, which is exactly what you want before a demo.
 *
 *   npx tsx scripts/compare-live.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildWedge, fuseWedges, type Wedge } from "../lib/geometry";
import type { Extraction } from "../lib/schema";

// Standalone scripts don't get Next's .env.local loading.
const envPath = join(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const root = process.cwd();
const manifestPath = process.argv[2] ?? "data/calls.json";
const data = JSON.parse(readFileSync(join(root, manifestPath), "utf8"));
const truth = data.scenario.groundTruth as { lat: number; lng: number };

async function main() {
const { resolveExtraction, DEFAULT_MODEL } = await import("../lib/cache");

console.log(`\nmodel: ${DEFAULT_MODEL}`);
console.log(`key present: ${process.env.GEMINI_API_KEY ? "yes" : "NO"}\n`);

const wedges: Wedge[] = [];
const unusable: string[] = [];
let liveCount = 0;

for (const call of data.calls) {
  const fixture: Extraction = JSON.parse(
    readFileSync(join(root, `fixtures/extractions/${call.id}.json`), "utf8"),
  );

  const audioPath = join(root, "public", call.audio.replace(/^\//, ""));
  let live: Extraction;
  let source: string;
  let latency: number | null;

  try {
    const r = await resolveExtraction(call.id, audioPath);
    live = r.extraction;
    source = r.source;
    latency = r.latencyMs;
    if (r.source === "live") liveCount++;
  } catch (err) {
    console.log(`${call.id}  FAILED: ${err instanceof Error ? err.message : err}\n`);
    continue;
  }

  console.log(`${call.id}  ${call.callerLabel}`);
  console.log(`  source=${source}${latency !== null ? ` latency=${latency}ms` : ""}`);

  const cmp = (label: string, a: unknown, b: unknown) => {
    const same = JSON.stringify(a) === JSON.stringify(b);
    console.log(
      `  ${same ? "  =" : " !="} ${label.padEnd(12)} fixture=${JSON.stringify(a)}  live=${JSON.stringify(b)}`,
    );
  };

  cmp("compass", fixture.direction.compass, live.direction.compass);
  cmp("distance",
    [fixture.distance_hint.value, fixture.distance_hint.unit, fixture.distance_hint.vagueness],
    [live.distance_hint.value, live.distance_hint.unit, live.distance_hint.vagueness]);
  cmp("landmarks",
    fixture.landmarks.map((l) => `${l.relation}:${l.name}`),
    live.landmarks.map((l) => `${l.relation}:${l.name}`));
  cmp("volume", fixture.smoke.volume, live.smoke.volume);
  console.log(
    `     specificity  fixture=${fixture.description_specificity}  live=${live.description_specificity}`,
  );
  if (live.notes) console.log(`     notes: ${live.notes}`);
  console.log("");

  const w = buildWedge(call.id, call.caller, live, data.scenario.regionKey);
  if (w) wedges.push(w);
  else unusable.push(call.id);
}

const fix = fuseWedges(wedges, unusable, truth);

console.log("=".repeat(78));
console.log(`live extractions used: ${liveCount}/${data.calls.length}`);
console.log("\nfix from LIVE extractions");
console.log(`  area        : ${fix.areaKm2.toFixed(2)} km²`);
console.log(`  consistent  : ${fix.consistentCallIds.join(", ") || "(none)"}`);
console.log(`  flagged     : ${fix.inconsistentCallIds.join(", ") || "(none)"}`);
console.log(`  unusable    : ${fix.unusableCallIds.join(", ") || "(none)"}`);
console.log(`  confidence  : ${fix.confidence}`);
console.log(
  `  error       : ${fix.errorMeters !== null ? `${Math.round(fix.errorMeters)} m` : "n/a"}`,
);
console.log("\nbaseline from authored fixtures: 8.97 km², 123 m, HIGH, call-05 flagged\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
