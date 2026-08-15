import { Type } from "@google/genai";

/**
 * Bump when the prompt or schema changes — it is mixed into the cache key so stale
 * extractions from an older prompt are never replayed.
 */
export const PROMPT_VERSION = "fire-v1";

export type FireSize = "small" | "moderate" | "large" | "unknown";
export type SpreadRate = "slow" | "moderate" | "fast" | "unknown";

/**
 * One 911 call reporting one wildfire. Gemini both locates the fire (a named place
 * plus its best-estimate coordinates) and assesses its severity. Downstream code
 * snaps known places to exact coordinates, groups calls that describe the same fire,
 * and ranks the fires — but the severity judgement itself is the model's.
 */
export type FireReport = {
  transcript: string;
  location: {
    named_place: string;
    latitude: number;
    longitude: number;
    detail: string;
  };
  fire: {
    size: FireSize;
    spread: SpreadRate;
    out_of_control: boolean;
  };
  threat: {
    structures: boolean;
    lives: boolean;
    evacuation: boolean;
  };
  /** 0–100 severity, the model's assessment from the fire facts (see the prompt). */
  severity_score: number;
  severity_reason: string;
};

export const EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    transcript: { type: Type.STRING, description: "Verbatim transcript of the call." },
    location: {
      type: Type.OBJECT,
      properties: {
        named_place: {
          type: Type.STRING,
          description:
            "The most specific real place named — town, park, mountain or road. Empty if none.",
        },
        latitude: {
          type: Type.NUMBER,
          description:
            "Best-estimate latitude of the fire in British Columbia. 0 if no place can be inferred.",
        },
        longitude: {
          type: Type.NUMBER,
          description: "Best-estimate longitude. 0 if no place can be inferred.",
        },
        detail: {
          type: Type.STRING,
          description: "Any finer location detail as spoken, e.g. 'east of the campground'. Empty if none.",
        },
      },
      required: ["named_place", "latitude", "longitude", "detail"],
      propertyOrdering: ["named_place", "latitude", "longitude", "detail"],
    },
    fire: {
      type: Type.OBJECT,
      properties: {
        size: { type: Type.STRING, enum: ["small", "moderate", "large", "unknown"] },
        spread: { type: Type.STRING, enum: ["slow", "moderate", "fast", "unknown"] },
        out_of_control: { type: Type.BOOLEAN },
      },
      required: ["size", "spread", "out_of_control"],
      propertyOrdering: ["size", "spread", "out_of_control"],
    },
    threat: {
      type: Type.OBJECT,
      properties: {
        structures: {
          type: Type.BOOLEAN,
          description: "True if buildings or homes are burning or explicitly threatened.",
        },
        lives: { type: Type.BOOLEAN, description: "True if people are at risk or injured." },
        evacuation: { type: Type.BOOLEAN, description: "True if an evacuation is mentioned." },
      },
      required: ["structures", "lives", "evacuation"],
      propertyOrdering: ["structures", "lives", "evacuation"],
    },
    severity_score: {
      type: Type.NUMBER,
      description: "0–100 severity of THIS fire, from the fire facts. See the rubric in the prompt.",
    },
    severity_reason: { type: Type.STRING, description: "One short sentence justifying the score." },
  },
  required: ["transcript", "location", "fire", "threat", "severity_score", "severity_reason"],
  propertyOrdering: [
    "transcript",
    "location",
    "fire",
    "threat",
    "severity_score",
    "severity_reason",
  ],
};

export const EXTRACTION_PROMPT = `You are a wildfire dispatch assistant processing the audio of a 911 call reporting
a wildfire somewhere in British Columbia, Canada.

Do two things.

1. LOCATE the fire. Identify the most specific real place the caller names (town,
   park, mountain, road) and give your best-estimate latitude and longitude for that
   place in British Columbia. If the caller adds finer detail ("east of the
   campground", "up north of town"), record it in 'detail' but still give the place's
   coordinates. If no place can be inferred at all, use "" and 0.

2. ASSESS SEVERITY. Score the fire 0–100 based ONLY on the danger it presents, using
   these factors, in roughly this order of weight:
     - lives at risk or injuries reported            (highest)
     - homes or buildings burning or threatened
     - fire out of control / spreading fast
     - large or growing size
     - small, contained, or minor                    (lowest)
   A "small fire down the street" with no threat scores low (~15–30). A large fire
   burning homes and spreading fast scores high (~85–100).

   Score the FIRE, never the caller. Do not raise or lower the score because the
   caller sounds calm, panicked, articulate or hard to understand. A frightened
   caller and a composed caller reporting the same fire must get the same score.

Also return a verbatim transcript and a one-sentence reason for the score.
Return JSON matching the provided schema.`;
