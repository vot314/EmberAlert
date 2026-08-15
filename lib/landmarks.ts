/**
 * Pre-geocoded landmark fixtures for the Okanagan Valley, BC.
 *
 * Geocoding is deliberately kept out of the demo path: a live geocoding call is
 * one more thing that can fail on stage, and these landmarks never change.
 * Coordinates are approximate centroids, good to a few hundred metres, which is
 * well inside the angular tolerance the wedges use.
 */

export type Landmark = {
  id: string;
  /** Names and aliases a caller might plausibly say out loud. */
  names: string[];
  lat: number;
  lng: number;
};

export const LANDMARKS: Landmark[] = [
  {
    id: "rose_valley_reservoir",
    names: ["rose valley reservoir", "rose valley", "rose valley lake"],
    lat: 49.885,
    lng: -119.625,
  },
  {
    id: "mount_boucherie",
    names: ["mount boucherie", "mt boucherie", "boucherie"],
    lat: 49.848,
    lng: -119.615,
  },
  {
    id: "bear_creek_park",
    names: ["bear creek", "bear creek park", "bear creek provincial park"],
    lat: 49.918,
    lng: -119.542,
  },
  {
    id: "knox_mountain",
    names: ["knox mountain", "knox mountain park", "knox"],
    lat: 49.904,
    lng: -119.489,
  },
  {
    id: "bennett_bridge",
    names: [
      "william r bennett bridge",
      "bennett bridge",
      "the bridge",
      "floating bridge",
    ],
    lat: 49.876,
    lng: -119.517,
  },
  {
    id: "shannon_lake_golf",
    names: ["shannon lake golf course", "shannon lake", "shannon lake golf"],
    lat: 49.822,
    lng: -119.632,
  },
  {
    id: "two_eagles_golf",
    names: ["two eagles golf course", "two eagles", "two eagles golf"],
    lat: 49.833,
    lng: -119.602,
  },
  {
    id: "gellatly_bay",
    names: ["gellatly bay", "gellatly", "gellatly nut farm"],
    lat: 49.832,
    lng: -119.605,
  },
  {
    id: "kelowna_waterfront",
    names: ["kelowna waterfront", "city park", "downtown kelowna", "the waterfront"],
    lat: 49.888,
    lng: -119.496,
  },
  {
    id: "kelowna_airport",
    names: ["kelowna airport", "the airport", "ylw", "airport way"],
    lat: 49.956,
    lng: -119.378,
  },
  {
    id: "peachland_beach",
    names: ["peachland", "beach avenue", "peachland pier", "antlers beach"],
    lat: 49.777,
    lng: -119.737,
  },
  {
    id: "okanagan_mountain_park",
    names: ["okanagan mountain", "okanagan mountain park", "okanagan mountain provincial park"],
    lat: 49.76,
    lng: -119.55,
  },
];

/**
 * Resolve a spoken landmark name to a fixture.
 * Matching is deliberately forgiving — callers say "the reservoir", not
 * "Rose Valley Reservoir" — but never fuzzy enough to match across landmarks.
 */
export function resolveLandmark(spoken: string): Landmark | null {
  const q = spoken.trim().toLowerCase().replace(/[^a-z\s]/g, "");
  if (!q) return null;

  for (const lm of LANDMARKS) {
    if (lm.names.some((n) => n === q)) return lm;
  }
  for (const lm of LANDMARKS) {
    if (lm.names.some((n) => q.includes(n) || n.includes(q))) return lm;
  }
  return null;
}
