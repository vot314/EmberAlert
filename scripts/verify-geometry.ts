/**
 * Offline check that the authored scenario actually converges.
 *
 * Runs every fixture extraction through the real geometry pipeline and prints the
 * per-call bearing, the fused fix, and the error against ground truth. No network,
 * no API key. Run it after touching lib/geometry.ts, the landmarks, or the scripts.
 *
 *   npx tsx scripts/verify-geometry.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as turf from "@turf/turf";
import { buildWedge, fuseWedges, type Wedge } from "../lib/geometry";
import type { Region } from "../lib/landmarks";
import type { Extraction } from "../lib/schema";
import { resolveExtraction } from "../lib/cache";

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
const region: Region | undefined = data.scenario.regionKey;
const truth = data.scenario.groundTruth as { lat: number; lng: number };

const wedges: Wedge[] = [];
const unusable: string[] = [];

console.log(`\nScenario: ${data.scenario.name}  [${manifestPath}]`);
console.log(`Ground truth: ${truth.lat}, ${truth.lng}\n`);
console.log("per-call geometry");
console.log("-".repeat(78));

async function main() {
  for (const call of data.calls) {
    const fixturePath = join(root, `fixtures/extractions/${call.id}.json`);
    let ex: Extraction;
    if (existsSync(fixturePath)) {
      ex = JSON.parse(readFileSync(fixturePath, "utf8"));
    } else {
      const audioPath = join(root, "public", call.audio.replace(/^\//, ""));
      const resolved = await resolveExtraction(call.id, audioPath);
      ex = resolved.extraction;
    }
    const wedge = buildWedge(call.id, call.caller, ex, region);

    if (!wedge) {
      unusable.push(call.id);
      console.log(`${call.id}  UNUSABLE — no bearing could be derived`);
      continue;
    }
    wedges.push(wedge);

    // What the bearing SHOULD be if the caller were perfectly accurate.
    const trueBearing =
      (turf.bearing(
        turf.point([call.caller.lng, call.caller.lat]),
        turf.point([truth.lng, truth.lat]),
      ) + 360) % 360;
    const trueDist = turf.distance(
      turf.point([call.caller.lng, call.caller.lat]),
      turf.point([truth.lng, truth.lat]),
      { units: "kilometers" },
    );

    let delta = Math.abs(wedge.bearingDeg - trueBearing);
    if (delta > 180) delta = 360 - delta;

    const bearingOk = delta <= wedge.spreadDeg;
    const rangeOk = trueDist >= wedge.minRangeKm && trueDist <= wedge.maxRangeKm;
    const covers = bearingOk && rangeOk;

    console.log(
      `${call.id}  ${covers ? "covers " : "MISSES "} ` +
        `bearing ${wedge.bearingDeg.toFixed(1)}°±${wedge.spreadDeg.toFixed(1)} ` +
        `(true ${trueBearing.toFixed(1)}°, off ${delta.toFixed(1)}°) ` +
        `range ${wedge.minRangeKm.toFixed(1)}–${wedge.maxRangeKm.toFixed(1)}km ` +
        `(true ${trueDist.toFixed(1)}km) via ${wedge.basis}` +
        (call.expectedOutlier ? "   [authored as outlier]" : ""),
    );
  }

  const fix = fuseWedges(wedges, unusable, truth);

  console.log("\nfused fix");
  console.log("-".repeat(78));
  console.log(`consistent   : ${fix.consistentCallIds.join(", ") || "(none)"}`);
  console.log(`inconsistent : ${fix.inconsistentCallIds.join(", ") || "(none)"}`);
  console.log(`unusable     : ${fix.unusableCallIds.join(", ") || "(none)"}`);
  console.log(`area         : ${fix.areaKm2.toFixed(3)} km²`);
  console.log(`confidence   : ${fix.confidence}`);
  console.log(
    `centroid     : ${fix.centroid ? `${fix.centroid.lat.toFixed(5)}, ${fix.centroid.lng.toFixed(5)}` : "(none)"}`,
  );
  console.log(
    `error        : ${fix.errorMeters !== null ? `${Math.round(fix.errorMeters)} m from ground truth` : "n/a"}`,
  );

  // Assertions the demo depends on.
  const expectedOutliers: string[] = data.calls
    .filter((c: { expectedOutlier?: boolean }) => c.expectedOutlier)
    .map((c: { id: string }) => c.id);

  const problems: string[] = [];
  // Expectations are declared per scenario. Three reports genuinely constrain less
  // than five, so the GTA scenario legitimately lands at MEDIUM — the harness records
  // that rather than the thresholds being loosened to make every scenario look HIGH.
  const expect = data.scenario.expect ?? { confidence: "HIGH", maxErrorMeters: 1500 };
  if (fix.confidence !== expect.confidence)
    problems.push(`confidence is ${fix.confidence}, expected ${expect.confidence}`);
  if (expect.confidence !== "LOW") {
    if (fix.errorMeters === null || fix.errorMeters > expect.maxErrorMeters)
      problems.push(`error ${fix.errorMeters?.toFixed(0)} m exceeds the ${expect.maxErrorMeters} m budget`);
  }
  for (const id of expectedOutliers) {
    if (!fix.inconsistentCallIds.includes(id))
      problems.push(`${id} was authored as an outlier but was not flagged`);
  }
  for (const c of data.calls) {
    if (c.expectedOutlier) continue;
    if (!fix.consistentCallIds.includes(c.id))
      problems.push(`${c.id} should have contributed to the fix but did not`);
  }

  console.log("");
  if (problems.length) {
    console.log("FAILED");
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }
  console.log(`PASSED — converges at ${fix.confidence}, ${Math.round(fix.errorMeters ?? 0)} m error\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
