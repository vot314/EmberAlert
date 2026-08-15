/**
 * Prints how the search area collapses as calls arrive, in timeline order.
 *
 * This is the demo's core claim ("watch the search area collapse"), so it is worth
 * having the real numbers rather than a hand-wave. Also shows which calls actually
 * contribute precision versus which only add corroboration.
 *
 *   npx tsx scripts/collapse-curve.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildWedge, fuseWedges, type Wedge } from "../lib/geometry";
import type { Extraction } from "../lib/schema";

const root = process.cwd();
const manifestPath = process.argv[2] ?? "data/calls.json";
const data = JSON.parse(readFileSync(join(root, manifestPath), "utf8"));
const truth = data.scenario.groundTruth as { lat: number; lng: number };

const wedges: Wedge[] = [];
let previousArea = Infinity;

console.log("\ncollapse curve — calls arrive in timeline order\n");
console.log(
  "call      T+      area km²     Δ            error      conf     status",
);
console.log("-".repeat(84));

for (const call of data.calls) {
  const ex: Extraction = JSON.parse(
    readFileSync(join(root, `fixtures/extractions/${call.id}.json`), "utf8"),
  );
  const w = buildWedge(call.id, call.caller, ex, data.scenario.regionKey);
  if (w) wedges.push(w);

  const fix = fuseWedges(wedges, [], truth);
  const flagged = fix.inconsistentCallIds.includes(call.id);

  const t = `${Math.floor(call.offsetSeconds / 60)}:${String(call.offsetSeconds % 60).padStart(2, "0")}`;
  const area = fix.polygon ? fix.areaKm2 : NaN;

  let delta = "—";
  if (fix.polygon && Number.isFinite(previousArea)) {
    const pct = ((previousArea - area) / previousArea) * 100;
    delta = pct < 0.01 ? "no change" : `−${pct.toFixed(1)}%`;
  }

  const status = flagged
    ? "FLAGGED, excluded"
    : !fix.polygon
      ? "bearing only, no fix yet"
      : delta === "no change"
        ? "corroborates, adds no precision"
        : "narrows the fix";

  console.log(
    `${call.id}  ${t.padStart(5)}  ${(fix.polygon ? area.toFixed(2) : "—").padStart(10)}  ` +
      `${delta.padEnd(11)}  ${(fix.errorMeters !== null ? `${Math.round(fix.errorMeters)} m` : "—").padStart(8)}  ` +
      `${fix.confidence.padEnd(7)}  ${status}`,
  );

  if (fix.polygon) previousArea = area;
}

console.log("");
