import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";
import {
  EXTRACTION_PROMPT,
  EXTRACTION_SCHEMA,
  PROMPT_VERSION,
  type Extraction,
} from "./schema";

/**
 * Extraction resolution with a three-tier fallback, in this order:
 *
 *   1. .cache/      real model output from a previous run, keyed by audio hash
 *   2. fixtures/    committed hand-authored extractions, so the demo runs with no key
 *   3. live API     calls Gemini, then writes the result into .cache/
 *
 * DEMO_MODE=replay stops at tier 2 and never touches the network. The whole demo
 * must survive the venue wifi failing during judging, which it reliably does.
 */

export type ExtractionSource = "cache" | "fixture" | "live";
export type ResolvedExtraction = {
  extraction: Extraction;
  source: ExtractionSource;
  model: string | null;
  latencyMs: number | null;
};

const CACHE_DIR = join(process.cwd(), ".cache");
const FIXTURE_DIR = join(process.cwd(), "fixtures", "extractions");

/** Verified against the docs at build time; override with GEMINI_MODEL if it moves. */
export const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";

export function isReplayMode(): boolean {
  return process.env.DEMO_MODE === "replay";
}

function cacheKey(audioBytes: Buffer): string {
  return createHash("sha256")
    .update(audioBytes)
    .update(PROMPT_VERSION)
    .update(DEFAULT_MODEL)
    .digest("hex")
    .slice(0, 32);
}

function readCache(key: string): Extraction | null {
  const p = join(CACHE_DIR, `${key}.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")).extraction as Extraction;
  } catch {
    return null;
  }
}

function writeCache(key: string, extraction: Extraction, model: string): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(
      join(CACHE_DIR, `${key}.json`),
      JSON.stringify({ model, promptVersion: PROMPT_VERSION, createdAt: new Date().toISOString(), extraction }, null, 2),
    );
  } catch {
    // A read-only filesystem must not take the demo down.
  }
}

function readFixture(callId: string): Extraction | null {
  const p = join(FIXTURE_DIR, `${callId}.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as Extraction;
  } catch {
    return null;
  }
}

async function callGemini(
  audioBytes: Buffer,
): Promise<{ extraction: Extraction; model: string; latencyMs: number }> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("no API key");

  const ai = new GoogleGenAI({ apiKey });
  const started = Date.now();

  const res = await ai.models.generateContent({
    model: DEFAULT_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: EXTRACTION_PROMPT },
          { inlineData: { mimeType: "audio/wav", data: audioBytes.toString("base64") } },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: EXTRACTION_SCHEMA,
      temperature: 0,
    },
  });

  const text = res.text;
  if (!text) throw new Error("empty response from model");

  return {
    extraction: JSON.parse(text) as Extraction,
    model: DEFAULT_MODEL,
    latencyMs: Date.now() - started,
  };
}

export async function resolveExtraction(
  callId: string,
  audioAbsPath: string,
): Promise<ResolvedExtraction> {
  const audioBytes = readFileSync(audioAbsPath);
  const key = cacheKey(audioBytes);

  const cached = readCache(key);
  if (cached) return { extraction: cached, source: "cache", model: DEFAULT_MODEL, latencyMs: null };

  if (isReplayMode()) {
    const fixture = readFixture(callId);
    if (!fixture) throw new Error(`replay mode: no cache or fixture for ${callId}`);
    return { extraction: fixture, source: "fixture", model: null, latencyMs: null };
  }

  try {
    const live = await callGemini(audioBytes);
    writeCache(key, live.extraction, live.model);
    return { extraction: live.extraction, source: "live", model: live.model, latencyMs: live.latencyMs };
  } catch {
    // No key, no network, or a bad response: fall through to the committed fixture
    // rather than failing in front of an audience.
    const fixture = readFixture(callId);
    if (!fixture) throw new Error(`no cache, no live result and no fixture for ${callId}`);
    return { extraction: fixture, source: "fixture", model: null, latencyMs: null };
  }
}
