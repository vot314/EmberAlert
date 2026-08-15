import { Type } from "@google/genai";

/**
 * Bump this whenever the extraction prompt or schema changes. It is mixed into
 * the cache key so stale extractions from an older prompt are never replayed.
 */
export const PROMPT_VERSION = "v1";

export const COMPASS_POINTS = [
  "N", "NNE", "NE", "ENE",
  "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW",
  "W", "WNW", "NW", "NNW",
  "none",
] as const;

export type CompassPoint = (typeof COMPASS_POINTS)[number];
export type LandmarkRelation =
  | "behind" | "near" | "past" | "left_of" | "right_of" | "unknown";
export type Vagueness = "precise" | "rough" | "none";
export type SmokeVolume = "wisp" | "column" | "wall" | "unknown";

export type Extraction = {
  landmarks: { name: string; relation: LandmarkRelation }[];
  direction: { compass: CompassPoint; relative: string };
  distance_hint: {
    /** 0 means the caller gave no distance at all. */
    value: number;
    unit: "km" | "m" | "miles" | "none";
    vagueness: Vagueness;
  };
  smoke: { color: string; volume: SmokeVolume; drift_direction: string };
  /**
   * How PRECISE the caller's description was — never how urgent, distressed or
   * articulate they sounded. See EXTRACTION_PROMPT for the full rationale.
   */
  description_specificity: number;
  secondhand: boolean;
  notes: string;
};

/**
 * Every field is required and non-nullable. Absence is encoded as a sentinel
 * ("none", 0, "") rather than null, because nullable fields in structured output
 * are the most common source of schema-validation failures.
 */
export const EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    landmarks: {
      type: Type.ARRAY,
      description:
        "Named places the caller mentions as a reference for where the smoke is. Empty if none.",
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "The place name exactly as spoken." },
          relation: {
            type: Type.STRING,
            enum: ["behind", "near", "past", "left_of", "right_of", "unknown"],
            description: "Where the smoke is relative to that landmark, from the caller's viewpoint.",
          },
        },
        required: ["name", "relation"],
        propertyOrdering: ["name", "relation"],
      },
    },
    direction: {
      type: Type.OBJECT,
      properties: {
        compass: {
          type: Type.STRING,
          enum: [...COMPASS_POINTS],
          description: "Compass direction from the caller toward the smoke. 'none' if not stated.",
        },
        relative: {
          type: Type.STRING,
          description: "Any non-compass directional phrasing, verbatim. Empty string if none.",
        },
      },
      required: ["compass", "relative"],
      propertyOrdering: ["compass", "relative"],
    },
    distance_hint: {
      type: Type.OBJECT,
      properties: {
        value: { type: Type.NUMBER, description: "Numeric distance stated by the caller. 0 if none." },
        unit: { type: Type.STRING, enum: ["km", "m", "miles", "none"] },
        vagueness: {
          type: Type.STRING,
          enum: ["precise", "rough", "none"],
          description:
            "'precise' for a confident specific figure, 'rough' for a hedged estimate, 'none' if no distance was given.",
        },
      },
      required: ["value", "unit", "vagueness"],
      propertyOrdering: ["value", "unit", "vagueness"],
    },
    smoke: {
      type: Type.OBJECT,
      properties: {
        color: { type: Type.STRING, description: "Colour as described. Empty string if not described." },
        volume: { type: Type.STRING, enum: ["wisp", "column", "wall", "unknown"] },
        drift_direction: {
          type: Type.STRING,
          description: "Direction the smoke is drifting, if stated. Empty string if not.",
        },
      },
      required: ["color", "volume", "drift_direction"],
      propertyOrdering: ["color", "volume", "drift_direction"],
    },
    description_specificity: {
      type: Type.NUMBER,
      description:
        "0 to 1. How geometrically precise the description is. NOT a measure of urgency, distress or eloquence.",
    },
    secondhand: {
      type: Type.BOOLEAN,
      description: "True if the caller is relaying what somebody else saw.",
    },
    notes: { type: Type.STRING, description: "One short sentence of free-text context." },
  },
  required: [
    "landmarks",
    "direction",
    "distance_hint",
    "smoke",
    "description_specificity",
    "secondhand",
    "notes",
  ],
  propertyOrdering: [
    "landmarks",
    "direction",
    "distance_hint",
    "smoke",
    "description_specificity",
    "secondhand",
    "notes",
  ],
};

export const EXTRACTION_PROMPT = `You are processing the audio of a 911 call reporting wildfire smoke.

Extract ONLY what the caller actually said. Do not infer, do not guess coordinates,
and do not estimate any location yourself — downstream code performs all geometry.
If the caller did not state something, use the sentinel value ("none", 0, or "").

Compass directions: map spoken phrasing to the nearest 16-point compass value.
"west, maybe west-northwest" -> WNW. "up the lake to the north" -> N. If the caller
gives no compass sense at all, use "none".

Landmarks: capture the place name as spoken. The relation describes where the smoke
is relative to that landmark from the caller's viewpoint — "behind the reservoir" and
"past the reservoir" both mean the smoke is further away than the landmark, along
roughly the same line of sight.

description_specificity is a 0-to-1 measure of how GEOMETRICALLY USEFUL the
description is: does it pin down a direction and a distance? A calm caller who says
"smoke somewhere over there" scores LOW. A panicked, crying caller who says
"west-southwest, about seven kilometres, behind the ridge" scores HIGH.

This field must NEVER reflect how urgent, distressed, articulate or fluent the caller
sounded. Scoring emergency calls on how well somebody speaks under stress would
systematically penalise elderly callers, panicked callers, and callers speaking a
second language. This system resolves LOCATION ONLY. It does not rank urgency and
must not be used to decide whose emergency matters more.

Return JSON matching the provided schema.`;
