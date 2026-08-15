import type { FireReport } from "./schema";

/**
 * Turns per-call fire reports into ranked fires. No triangulation, no bearings — each
 * call already carries the fire's location and the model's severity score. This module
 * only:
 *   1. snaps known BC place names to exact coordinates (the model's coords are a
 *      fallback for places not in the gazetteer),
 *   2. groups calls that describe the same fire (proximity), and
 *   3. ranks the fires by severity, with a boost for corroborating calls.
 */

export type Coords = { lat: number; lng: number };

/**
 * Severity colour ramp. Lives here rather than in MapView because the sidebar needs it
 * too — importing it from MapView created a static import chain into Leaflet, which
 * touches `window` at module scope and broke prerendering even though MapView itself
 * is loaded with ssr:false.
 */
export function severityColor(severity: number): string {
  if (severity >= 80) return "#ef4444";
  if (severity >= 50) return "#f59e0b";
  return "#38bdf8";
}

export type SeverityBand = "Critical" | "High" | "Moderate" | "Low";

/**
 * Map the model's 0-100 score onto the four bands the incident UI, the severity
 * filter, and the summary counters are built around. Thresholds are chosen so the
 * bands stay meaningful rather than collapsing everything into one bucket.
 */
export function severityBand(score: number): SeverityBand {
  if (score >= 80) return "Critical";
  if (score >= 55) return "High";
  if (score >= 30) return "Moderate";
  return "Low";
}

/** Known BC places, so the marker sits on the real town rather than the model's guess. */
const GAZETTEER: { names: string[]; lat: number; lng: number; label: string }[] = [
  { names: ["vancouver"], lat: 49.2827, lng: -123.1207, label: "Vancouver" },
  { names: ["kamloops"], lat: 50.6745, lng: -120.3273, label: "Kamloops" },
  { names: ["whistler", "whistler mountain", "whistler blackcomb"], lat: 50.1163, lng: -122.9574, label: "Whistler" },
  {
    names: ["silver star", "silver star provincial park", "silverstar", "silver star mountain"],
    lat: 50.3583,
    lng: -119.0653,
    label: "Silver Star Prov. Park",
  },
  { names: ["vernon"], lat: 50.267, lng: -119.272, label: "Vernon" },
  { names: ["kelowna"], lat: 49.888, lng: -119.496, label: "Kelowna" },
  { names: ["victoria"], lat: 48.4284, lng: -123.3656, label: "Victoria" },
  { names: ["prince george"], lat: 53.9171, lng: -122.7497, label: "Prince George" },
  { names: ["nanaimo"], lat: 49.1659, lng: -123.9401, label: "Nanaimo" },
  { names: ["penticton"], lat: 49.4991, lng: -119.5937, label: "Penticton" },
];

function snap(namedPlace: string): { lat: number; lng: number; label: string } | null {
  const q = namedPlace.trim().toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ");
  if (!q) return null;
  for (const g of GAZETTEER) if (g.names.some((n) => q.includes(n))) return g;
  return null;
}

/** Kilometres between two points (haversine). */
function distanceKm(a: Coords, b: Coords): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type AnalyzedReport = {
  id: string;
  label: string;
  report: FireReport;
  coords: Coords | null;
  /** Display place name — the gazetteer label when snapped, else the model's. */
  place: string;
};

export type Fire = {
  id: string;
  place: string;
  coords: Coords;
  reports: AnalyzedReport[];
  callCount: number;
  severity: number;
  rank: number;
  size: FireReport["fire"]["size"];
  spread: FireReport["fire"]["spread"];
  outOfControl: boolean;
  structures: boolean;
  lives: boolean;
  evacuation: boolean;
  reason: string;
};

/** Resolve one report to a display place + coordinates. */
export function analyzeReport(id: string, label: string, report: FireReport): AnalyzedReport {
  const snapped = snap(report.location.named_place);
  let coords: Coords | null = null;
  let place = report.location.named_place || label;

  if (snapped) {
    coords = { lat: snapped.lat, lng: snapped.lng };
    place = snapped.label;
  } else if (report.location.latitude !== 0 || report.location.longitude !== 0) {
    coords = { lat: report.location.latitude, lng: report.location.longitude };
  }
  return { id, label, report, coords, place };
}

/** Two reports describe the same fire if they snap to the same place or sit within ~25 km. */
const SAME_FIRE_KM = 25;

/**
 * Group located reports into fires and rank them. Severity is the strongest member
 * score plus a corroboration boost: independent calls about the same fire raise
 * confidence and, with it, priority — mirroring how a dispatcher treats a fire that
 * lights up the board over one with a single report.
 */
export function rankFires(reports: AnalyzedReport[]): { fires: Fire[]; unlocatable: AnalyzedReport[] } {
  const located = reports.filter((r) => r.coords);
  const unlocatable = reports.filter((r) => !r.coords);

  const groups: AnalyzedReport[][] = [];
  for (const r of located) {
    const g = groups.find((grp) =>
      grp.some(
        (m) =>
          m.place === r.place || (m.coords && r.coords && distanceKm(m.coords, r.coords) <= SAME_FIRE_KM),
      ),
    );
    if (g) g.push(r);
    else groups.push([r]);
  }

  const fires: Fire[] = groups.map((grp) => {
    const top = [...grp].sort((a, b) => b.report.severity_score - a.report.severity_score)[0];
    const maxSeverity = top.report.severity_score;
    const corroboration = Math.min(15, (grp.length - 1) * 8);
    const severity = Math.min(100, Math.round(maxSeverity + corroboration));

    return {
      id: grp.map((r) => r.id).join("+"),
      place: top.place,
      coords: top.coords!,
      reports: grp,
      callCount: grp.length,
      severity,
      rank: 0,
      size: top.report.fire.size,
      spread: top.report.fire.spread,
      outOfControl: grp.some((r) => r.report.fire.out_of_control),
      structures: grp.some((r) => r.report.threat.structures),
      lives: grp.some((r) => r.report.threat.lives),
      evacuation: grp.some((r) => r.report.threat.evacuation),
      reason: top.report.severity_reason,
    };
  });

  fires.sort((a, b) => b.severity - a.severity || b.callCount - a.callCount);
  fires.forEach((f, i) => (f.rank = i + 1));

  return { fires, unlocatable };
}
