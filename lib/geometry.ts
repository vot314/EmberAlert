import * as turf from "@turf/turf";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import { resolveLandmark, type Region } from "./landmarks";
import type { Extraction } from "./schema";

/**
 * ALL geometry lives here. The model extracts language; this file does the maths.
 * Nothing in this module calls an LLM, and no LLM ever produces a coordinate.
 */

export type CallerPosition = { lat: number; lng: number };

export type Wedge = {
  callId: string;
  polygon: Feature<Polygon | MultiPolygon>;
  bearingDeg: number;
  spreadDeg: number;
  minRangeKm: number;
  maxRangeKm: number;
  /** How the bearing was derived — shown in the UI so the operator can audit it. */
  basis: "landmark" | "compass";
  basisDetail: string;
};

export type WedgeStatus = "consistent" | "inconsistent" | "unusable";

export type Fix = {
  polygon: Feature<Polygon | MultiPolygon> | null;
  centroid: { lat: number; lng: number } | null;
  areaKm2: number;
  consistentCallIds: string[];
  inconsistentCallIds: string[];
  unusableCallIds: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  /** Distance from the fix centroid to the scenario's known ground truth, in metres. */
  errorMeters: number | null;
};

const COMPASS_DEGREES: Record<string, number> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
  E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
  W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

/** Areas below this are treated as an empty intersection. */
const EMPTY_AREA_KM2 = 1e-3;

/** A landmark closer than this to the caller cannot define a bearing. */
const MIN_LANDMARK_KM = 0.5;

function toKm(value: number, unit: Extraction["distance_hint"]["unit"]): number {
  if (unit === "m") return value / 1000;
  if (unit === "miles") return value * 1.609344;
  return value;
}

function areaKm2(f: Feature<Polygon | MultiPolygon> | null): number {
  return f ? turf.area(f) / 1e6 : 0;
}

/**
 * Angular half-width of the wedge. Vaguer descriptions open the wedge out; the
 * specificity score narrows it. Clamped so no single call can dominate or vanish.
 */
function spreadFor(ex: Extraction): number {
  // Angular uncertainty and distance uncertainty are DIFFERENT physical quantities.
  // An earlier version derived this from distance_hint.vagueness, which meant a
  // caller hedging about range ("I'd call it seven kilometres") also widened their
  // bearing — and live extraction grading that call "rough" instead of "precise"
  // inflated the whole fix by 65%. Direction confidence now comes only from whether
  // a direction was actually stated and how specific the description was.
  const hasDirection = ex.direction.compass !== "none" || ex.landmarks.length > 0;
  const base = hasDirection ? 22.5 : 45; // 22.5° is the width of a 16-point sector
  const spec = Math.min(1, Math.max(0, ex.description_specificity));

  // Floor of 12° because a spoken compass point cannot resolve better than ±11.25°.
  return Math.min(50, Math.max(12, base * (1.55 - 0.75 * spec)));
}

/**
 * Radial extent of the wedge. When the caller gives no distance we fall back to a
 * visibility range keyed to how big the smoke is — a wall of smoke is visible far
 * further than a wisp, so a distance-less report from 15 km away still reaches.
 */
function rangeFor(ex: Extraction): { minKm: number; maxKm: number } {
  const d = toKm(ex.distance_hint.value, ex.distance_hint.unit);
  if (d > 0 && ex.distance_hint.unit !== "none") {
    // A confident figure from a trained observer is worth tightening on; a hedged
    // "eight k maybe" is not. Specificity moderates it, so a verbal hedge from an
    // otherwise precise caller does not throw the range wide open.
    const base = ex.distance_hint.vagueness === "precise" ? 0.25 : 0.4;
    const spec = Math.min(1, Math.max(0, ex.description_specificity));
    const tol = Math.min(0.5, Math.max(0.15, base * (1.3 - 0.55 * spec)));
    return { minKm: Math.max(0.3, d * (1 - tol)), maxKm: d * (1 + tol) };
  }
  switch (ex.smoke.volume) {
    case "wall": return { minKm: 2, maxKm: 30 };
    case "column": return { minKm: 2, maxKm: 22 };
    case "wisp": return { minKm: 1, maxKm: 10 };
    default: return { minKm: 2, maxKm: 20 };
  }
}

/**
 * Build the search wedge for a single call: an annular sector centred on the
 * caller, opening along the derived bearing.
 *
 * Bearings are passed to turf.sector as `bearing - spread` and `bearing + spread`
 * WITHOUT normalising into [0, 360). turf.bearing returns -180..180, and
 * normalising creates cases where the start bearing exceeds the end bearing and
 * the sector is drawn the long way around the compass.
 */
export function buildWedge(
  callId: string,
  caller: CallerPosition,
  ex: Extraction,
  region?: Region,
): Wedge | null {
  const center = turf.point([caller.lng, caller.lat]);

  let bearing: number | null = null;
  let basis: Wedge["basis"] = "compass";
  let basisDetail = "";
  let { minKm, maxKm } = rangeFor(ex);

  // 1. A named, resolvable landmark gives the tightest bearing.
  for (const l of ex.landmarks) {
    const lm = resolveLandmark(l.name, region);
    if (!lm) continue;

    const lmPoint = turf.point([lm.lng, lm.lat]);

    // A landmark the caller is standing at cannot define a direction — the bearing
    // between two near-identical points is numerical noise. Callers naming their own
    // location ("I'm out by the airport") are common, so this must fall through to
    // the compass rather than emitting a garbage bearing.
    if (turf.distance(center, lmPoint, { units: "kilometers" }) < MIN_LANDMARK_KM) continue;

    bearing = turf.bearing(center, lmPoint);
    basis = "landmark";
    basisDetail = `${l.relation.replace("_", " ")} ${l.name}`;

    // "behind" / "past" mean the smoke is further out along the same sight line.
    if (l.relation === "behind" || l.relation === "past") {
      const dLm = turf.distance(center, lmPoint, { units: "kilometers" });
      minKm = Math.max(minKm, dLm * 1.05);
      maxKm = Math.max(maxKm, minKm + 8);
    }
    break;
  }

  // 2. Otherwise fall back to a stated compass direction.
  if (bearing === null && ex.direction.compass !== "none") {
    bearing = COMPASS_DEGREES[ex.direction.compass];
    basis = "compass";
    basisDetail = ex.direction.compass;
  }

  // 3. Neither: the call cannot constrain a bearing at all.
  if (bearing === null) return null;

  const spread = spreadFor(ex);
  const outer = turf.sector(center, maxKm, bearing - spread, bearing + spread, {
    units: "kilometers",
    steps: 64,
  });

  let polygon = outer as Feature<Polygon | MultiPolygon>;
  if (minKm > 0.05) {
    const inner = turf.sector(center, minKm, bearing - spread - 1, bearing + spread + 1, {
      units: "kilometers",
      steps: 64,
    });
    // turf v7: difference() takes a FeatureCollection, not two positional args.
    const cut = turf.difference(turf.featureCollection([outer, inner]));
    if (cut) polygon = cut as Feature<Polygon | MultiPolygon>;
  }

  return {
    callId,
    polygon,
    bearingDeg: (bearing + 360) % 360,
    spreadDeg: spread,
    minRangeKm: minKm,
    maxRangeKm: maxKm,
    basis,
    basisDetail,
  };
}

/** turf v7: intersect() takes a FeatureCollection, not two positional args. */
function intersect2(
  a: Feature<Polygon | MultiPolygon>,
  b: Feature<Polygon | MultiPolygon>,
): Feature<Polygon | MultiPolygon> | null {
  try {
    const out = turf.intersect(turf.featureCollection([a, b]));
    if (!out) return null;
    const f = out as Feature<Polygon | MultiPolygon>;
    return areaKm2(f) < EMPTY_AREA_KM2 ? null : f;
  } catch {
    return null;
  }
}

/**
 * Fuse wedges into a single fix, tolerating outliers.
 *
 * A naive left fold returns null the moment ONE wedge misses, which lets a single
 * mistaken caller destroy an otherwise good fix. Instead we score each wedge by how
 * many others it agrees with, fold from most-supported to least, and flag rather
 * than abort when a wedge cannot be reconciled.
 */
export function fuseWedges(
  wedges: Wedge[],
  unusableCallIds: string[] = [],
  groundTruth?: { lat: number; lng: number } | null,
): Fix {
  const empty: Fix = {
    polygon: null,
    centroid: null,
    areaKm2: 0,
    consistentCallIds: [],
    inconsistentCallIds: [],
    unusableCallIds,
    confidence: "NONE",
    errorMeters: null,
  };
  if (wedges.length === 0) return empty;

  // Pairwise agreement: how many other wedges does each one overlap?
  const support = new Map<string, number>();
  for (const w of wedges) {
    let n = 0;
    for (const other of wedges) {
      if (other.callId === w.callId) continue;
      if (intersect2(w.polygon, other.polygon)) n++;
    }
    support.set(w.callId, n);
  }

  const ordered = [...wedges].sort(
    (a, b) => (support.get(b.callId) ?? 0) - (support.get(a.callId) ?? 0),
  );

  let acc: Feature<Polygon | MultiPolygon> | null = ordered[0].polygon;
  const consistent: string[] = [ordered[0].callId];
  const inconsistent: string[] = [];

  for (const w of ordered.slice(1)) {
    const next: Feature<Polygon | MultiPolygon> | null = acc
      ? intersect2(acc, w.polygon)
      : null;
    if (next) {
      acc = next;
      consistent.push(w.callId);
    } else {
      inconsistent.push(w.callId);
    }
  }

  // A lone wedge is a bearing, not a fix.
  if (consistent.length < 2) {
    return {
      ...empty,
      inconsistentCallIds: inconsistent,
      consistentCallIds: consistent,
      confidence: "LOW",
    };
  }

  const area = areaKm2(acc);
  const c = turf.centerOfMass(acc!);
  const [lng, lat] = c.geometry.coordinates as [number, number];

  /**
   * Confidence bands are set by what is physically achievable, not by what would
   * look good. A spoken 16-point compass bearing is quantised to 22.5° sectors, so
   * no verbal report can constrain a direction better than about ±11°. At a typical
   * 7 km reporting range that alone puts a ~3 km floor on the cross-range width of
   * any fix, and therefore a few km² floor on the search area. Bands below ~2 km²
   * are unreachable from voice reports and promising them would be dishonest.
   *
   * The anchor instead is operational: a spotter aircraft can visually sweep on the
   * order of 10 km² in a single orbit, so under 10 km² means "launch and you will
   * see it", 10-40 km² means "launch and search", and beyond that means "wait for
   * more reports".
   */
  const confidence: Fix["confidence"] =
    area <= 10 && consistent.length >= 3 ? "HIGH"
    : area <= 40 && consistent.length >= 2 ? "MEDIUM"
    : "LOW";

  const errorMeters = groundTruth
    ? turf.distance(
        turf.point([lng, lat]),
        turf.point([groundTruth.lng, groundTruth.lat]),
        { units: "kilometers" },
      ) * 1000
    : null;

  return {
    polygon: acc,
    centroid: { lat, lng },
    areaKm2: area,
    consistentCallIds: consistent,
    inconsistentCallIds: inconsistent,
    unusableCallIds,
    confidence,
    errorMeters,
  };
}
