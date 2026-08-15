/**
 * Pre-geocoded landmark fixtures for the Okanagan Valley, BC.
 *
 * Geocoding is deliberately kept out of the demo path: a live geocoding call is
 * one more thing that can fail on stage, and these landmarks never change.
 * Coordinates are approximate centroids, good to a few hundred metres, which is
 * well inside the angular tolerance the wedges use.
 */

export type Region = "okanagan" | "gta";

export type Landmark = {
  id: string;
  /** Names and aliases a caller might plausibly say out loud. */
  names: string[];
  lat: number;
  lng: number;
  region: Region;
  /** Shown as a label on the map. Keep short — it competes with caller labels. */
  label: string;
  /**
   * Drawn on the map for orientation but excluded from bearing resolution.
   *
   * Lakes and town names are how callers say where THEY are ("I'm in West Kelowna"),
   * not where the smoke is. Letting them resolve would hijack the bearing — live
   * extraction really does return things like {relation:"past", name:"lake"} — so
   * these stay as labels only.
   */
  labelOnly?: boolean;
};

export const LANDMARKS: Landmark[] = [
  {
    id: "rose_valley_reservoir",
    names: ["rose valley reservoir", "rose valley", "rose valley lake", "the reservoir", "reservoir"],
    lat: 49.885,
    lng: -119.625,
    region: "okanagan",
    label: "Rose Valley Reservoir",
  },
  {
    id: "mount_boucherie",
    names: ["mount boucherie", "mt boucherie", "boucherie"],
    lat: 49.848,
    lng: -119.615,
    region: "okanagan",
    label: "Mt Boucherie",
  },
  {
    id: "bear_creek_park",
    names: ["bear creek", "bear creek park", "bear creek provincial park"],
    lat: 49.918,
    lng: -119.542,
    region: "okanagan",
    label: "Bear Creek Park",
  },
  {
    id: "knox_mountain",
    names: ["knox mountain", "knox mountain park", "knox"],
    lat: 49.904,
    lng: -119.489,
    region: "okanagan",
    label: "Knox Mountain",
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
    region: "okanagan",
    label: "Bennett Br",
  },
  {
    id: "shannon_lake_golf",
    names: ["shannon lake golf course", "shannon lake", "shannon lake golf"],
    lat: 49.822,
    lng: -119.632,
    region: "okanagan",
    label: "Shannon Lake Golf Course",
  },
  {
    id: "two_eagles_golf",
    names: ["two eagles golf course", "two eagles", "two eagles golf"],
    lat: 49.833,
    lng: -119.602,
    region: "okanagan",
    label: "Two Eagles Golf Course",
  },
  {
    id: "gellatly_bay",
    names: ["gellatly bay", "gellatly", "gellatly nut farm"],
    lat: 49.832,
    lng: -119.605,
    region: "okanagan",
    label: "Gellatly Bay",
  },
  {
    id: "kelowna_waterfront",
    names: ["kelowna waterfront", "city park", "downtown kelowna", "the waterfront"],
    lat: 49.888,
    lng: -119.496,
    region: "okanagan",
    label: "Kelowna Waterfront",
  },
  {
    id: "kelowna_airport",
    names: ["kelowna airport", "the airport", "airport", "ylw", "airport way"],
    lat: 49.956,
    lng: -119.378,
    region: "okanagan",
    label: "Kelowna Airport",
  },
  {
    id: "peachland_beach",
    names: ["peachland", "beach avenue", "peachland pier", "antlers beach"],
    lat: 49.777,
    lng: -119.737,
    region: "okanagan",
    label: "Peachland Beach",
  },
  {
    id: "okanagan_mountain_park",
    names: ["okanagan mountain", "okanagan mountain park", "okanagan mountain provincial park"],
    lat: 49.76,
    lng: -119.55,
    region: "okanagan",
    label: "Okanagan Mountain Park",
  },
  {
    id: "okanagan_lake",
    names: ["okanagan lake"],
    lat: 49.842, lng: -119.545,
    region: "okanagan", label: "Okanagan Lake", labelOnly: true,
  },
  {
    id: "west_kelowna",
    names: ["west kelowna", "westbank"],
    lat: 49.8625, lng: -119.5833,
    region: "okanagan", label: "West Kelowna", labelOnly: true,
  },
  {
    id: "kelowna_city",
    names: ["kelowna"],
    lat: 49.888, lng: -119.463,
    region: "okanagan", label: "Kelowna", labelOnly: true,
  },
  {
    id: "peachland_town",
    names: ["peachland town"],
    lat: 49.7745, lng: -119.7265,
    region: "okanagan", label: "Peachland", labelOnly: true,
  },
  {
    id: "lake_country",
    names: ["lake country", "winfield"],
    lat: 50.05, lng: -119.41,
    region: "okanagan", label: "Lake Country", labelOnly: true,
  },
  {
    id: "summerland",
    names: ["summerland"],
    lat: 49.6006, lng: -119.6774,
    region: "okanagan", label: "Summerland", labelOnly: true,
  },
  {
    id: "glenmore",
    names: ["glenmore", "glenmore highlands"],
    lat: 49.91, lng: -119.45,
    region: "okanagan", label: "Glenmore",
  },
  {
    id: "mission_creek_park",
    names: ["mission creek", "mission creek park", "mission creek regional park"],
    lat: 49.87, lng: -119.42,
    region: "okanagan", label: "Mission Creek Park",
  },
  {
    id: "ubc_okanagan",
    names: ["ubc okanagan", "ubco", "the university"],
    lat: 49.94, lng: -119.396,
    region: "okanagan", label: "UBC Okanagan",
  },
  {
    id: "kelowna_general",
    names: ["kelowna general", "kelowna general hospital", "the hospital"],
    lat: 49.882, lng: -119.5,
    region: "okanagan", label: "Kelowna General",
  },
  {
    id: "traders_cove",
    names: ["traders cove", "traders cove park"],
    lat: 49.95, lng: -119.53,
    region: "okanagan", label: "Traders Cove",
  },
  {
    id: "wilsons_landing",
    names: ["wilsons landing", "wilson's landing"],
    lat: 49.98, lng: -119.55,
    region: "okanagan", label: "Wilson's Landing",
  },
  {
    id: "fintry_park",
    names: ["fintry", "fintry provincial park"],
    lat: 50.1, lng: -119.5,
    region: "okanagan", label: "Fintry Prov. Park",
  },
  {
    id: "myra_bellevue",
    names: ["myra bellevue", "myra canyon", "myra bellevue provincial park"],
    lat: 49.78, lng: -119.3,
    region: "okanagan", label: "Myra-Bellevue Park",
  },
  {
    id: "trepanier_creek",
    names: ["trepanier", "trepanier creek"],
    lat: 49.79, lng: -119.75,
    region: "okanagan", label: "Trepanier Creek",
  },
  {
    id: "rouge_park",
    names: ["rouge park", "rouge national urban park", "the rouge", "rouge valley"],
    lat: 43.82,
    lng: -79.15,
    region: "gta",
    label: "Rouge Nat'l Urban Park",
  },
  {
    id: "toronto_zoo",
    names: ["toronto zoo", "the zoo", "metro zoo"],
    lat: 43.8177,
    lng: -79.1859,
    region: "gta",
    label: "Toronto Zoo",
  },
  {
    id: "pickering_nuclear",
    names: ["pickering nuclear", "the nuclear plant", "pickering generating station", "the plant"],
    lat: 43.812,
    lng: -79.065,
    region: "gta",
    label: "Pickering Nuclear",
  },
  {
    id: "frenchmans_bay",
    names: ["frenchmans bay", "frenchman's bay", "the marina", "pickering marina"],
    lat: 43.813,
    lng: -79.079,
    region: "gta",
    label: "Frenchman's Bay",
  },
  {
    id: "rouge_beach",
    names: ["rouge beach", "the mouth of the rouge", "rouge hill"],
    lat: 43.795,
    lng: -79.115,
    region: "gta",
    label: "Rouge Beach",
  },
  {
    id: "petticoat_creek",
    names: ["petticoat creek", "petticoat creek conservation area"],
    lat: 43.808,
    lng: -79.118,
    region: "gta",
    label: "Petticoat Creek",
  },
  {
    id: "guild_park",
    names: ["guild park", "the guild", "guildwood", "guildwood parkway"],
    lat: 43.748,
    lng: -79.196,
    region: "gta",
    label: "Guild Park",
  },
  {
    id: "scarborough_bluffs",
    names: ["scarborough bluffs", "the bluffs", "bluffers park"],
    lat: 43.71,
    lng: -79.23,
    region: "gta",
    label: "Scarborough Bluffs",
  },
  {
    id: "milne_park",
    names: ["milne park", "milne dam", "milne dam conservation park"],
    lat: 43.865,
    lng: -79.283,
    region: "gta",
    label: "Milne Dam Park",
  },
  {
    id: "markham_civic_centre",
    names: ["markham civic centre", "markham city hall", "downtown markham"],
    lat: 43.856,
    lng: -79.337,
    region: "gta",
    label: "Markham Civic Centre",
  },
  {
    id: "bob_hunter_park",
    names: ["bob hunter park", "bob hunter memorial park"],
    lat: 43.856,
    lng: -79.21,
    region: "gta",
    label: "Bob Hunter Park",
  },
];

/**
 * Resolve a spoken landmark name to a fixture.
 * Matching is deliberately forgiving — callers say "the reservoir", not
 * "Rose Valley Reservoir" — but never fuzzy enough to match across landmarks.
 */
/**
 * Generic geographic words that must never resolve on their own. Live extraction
 * really does return landmarks like {relation:"past", name:"lake"}, and a loose
 * substring match happily paired that with "Shannon Lake Golf Course" — silently
 * replacing a correct compass bearing with a wrong landmark bearing.
 */
const GENERIC_WORDS = new Set([
  "lake", "park", "creek", "mountain", "mount", "hill", "bay", "river", "road",
  "valley", "beach", "point", "island", "the", "a", "of", "north", "south",
  "east", "west", "side", "area", "town", "city", "street", "avenue", "highway",
]);

/** A query is usable only if it carries at least one non-generic word. */
function isDistinctive(q: string): boolean {
  return q.split(/\s+/).filter(Boolean).some((w) => !GENERIC_WORDS.has(w));
}

/**
 * Resolve a spoken landmark name to a fixture.
 * Matching is deliberately forgiving — callers say "the reservoir", not
 * "Rose Valley Reservoir" — but never so fuzzy that a generic word matches a
 * specific place, and never across regions.
 */
export function resolveLandmark(spoken: string, region?: Region): Landmark | null {
  const q = spoken.trim().toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ");
  if (!q || !isDistinctive(q)) return null;

  // Scoping by region matters: "the airport" means different things in Kelowna and
  // Toronto, and an unscoped match would put a wedge on the wrong continent.
  // labelOnly places are orientation anchors and never produce a bearing.
  const pool = (region ? LANDMARKS.filter((l) => l.region === region) : LANDMARKS)
    .filter((l) => !l.labelOnly);

  for (const lm of pool) {
    if (lm.names.some((n) => n === q)) return lm;
  }
  // Only the "caller said at least the whole alias" direction is safe in general;
  // the reverse is allowed only for multi-word queries, which cannot be generic.
  for (const lm of pool) {
    if (lm.names.some((n) => q.includes(n))) return lm;
  }
  if (q.includes(" ")) {
    for (const lm of pool) {
      if (lm.names.some((n) => n.includes(q))) return lm;
    }
  }
  return null;
}

export function landmarksIn(region: Region): Landmark[] {
  return LANDMARKS.filter((l) => l.region === region);
}
