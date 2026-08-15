import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";
import { GoogleGenAI } from "@google/genai";
import {
  EXTRACTION_PROMPT,
  EXTRACTION_SCHEMA,
  PROMPT_VERSION,
  type FireReport,
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
  extraction: FireReport;
  source: ExtractionSource;
  model: string | null;
  latencyMs: number | null;
  /** Why the live call failed, when we fell back to a fixture. Null on success. */
  liveError?: string | null;
};

// On Vercel the deployment filesystem is read-only except for /tmp, so writes to a
// project-relative .cache/ would silently no-op. Pointing at /tmp lets a warm lambda
// reuse a result within its lifetime, which trims cost and latency on repeat calls.
const CACHE_DIR = process.env.VERCEL ? "/tmp/smokefix-cache" : join(process.cwd(), ".cache");
const FIXTURE_DIR = join(process.cwd(), "fixtures", "extractions");

/**
 * Free-tier quota is 20 requests/day PER MODEL, so each model id has its own bucket —
 * switching models is the quickest way to recover from a 429. Override with GEMINI_MODEL.
 * The model is part of the cache key below, so changing it invalidates cached results
 * and costs one fresh request per report.
 *
 * Verified callable on this key: gemini-3.6-flash, gemini-3.5-flash-lite,
 * gemini-flash-lite-latest. NOT callable despite appearing in the models list:
 * gemini-2.5-flash and gemini-2.5-flash-lite both return 404 NOT_FOUND.
 */
export const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";

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

function readCache(key: string): FireReport | null {
  const p = join(CACHE_DIR, `${key}.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")).extraction as FireReport;
  } catch {
    return null;
  }
}

function writeCache(key: string, extraction: FireReport, model: string): void {
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

function readFixture(callId: string): FireReport | null {
  const p = join(FIXTURE_DIR, `${callId}.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as FireReport;
  } catch {
    return null;
  }
}

function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".m4a") return "audio/m4a";
  return "audio/wav";
}

/** Gemini errors arrive as a JSON envelope in the message; pull out the useful parts. */
function summariseApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const j = JSON.parse(raw);
    const status = j?.error?.status ?? j?.error?.code ?? "ERROR";
    const limit = String(j?.error?.message ?? "").match(/limit: \d+/)?.[0];
    if (status === "RESOURCE_EXHAUSTED") {
      return `quota exhausted${limit ? ` (${limit}/day for this model)` : ""} — try another GEMINI_MODEL`;
    }
    if (status === "NOT_FOUND") return `model not available on this key`;
    return `${status}`;
  } catch {
    return raw.slice(0, 140);
  }
}

async function callGemini(
  audioBytes: Buffer,
  mimeType: string,
): Promise<{ extraction: FireReport; model: string; latencyMs: number }> {
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
          { inlineData: { mimeType, data: audioBytes.toString("base64") } },
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
    extraction: JSON.parse(text) as FireReport,
    model: DEFAULT_MODEL,
    latencyMs: Date.now() - started,
  };
}

/**
 * Core resolver, working from audio bytes rather than a path. The serverless route
 * uses this directly (it fetches audio over HTTP, since public/ files are not on the
 * function filesystem); local scripts use the path wrapper below.
 */
export async function resolveExtractionFromBytes(
  callId: string,
  audioBytes: Buffer,
  mimeType: string,
): Promise<ResolvedExtraction> {
  const key = cacheKey(audioBytes);

  const cached = readCache(key);
  if (cached) return { extraction: cached, source: "cache", model: DEFAULT_MODEL, latencyMs: null };

  if (isReplayMode()) {
    const fixture = readFixture(callId);
    if (!fixture) throw new Error(`replay mode: no cache or fixture for ${callId}`);
    return { extraction: fixture, source: "fixture", model: null, latencyMs: null };
  }

  let liveError: string;
  try {
    const live = await callGemini(audioBytes, mimeType);
    writeCache(key, live.extraction, live.model);
    return {
      extraction: live.extraction,
      source: "live",
      model: live.model,
      latencyMs: live.latencyMs,
      liveError: null,
    };
  } catch (err) {
    // No key, quota exhausted, bad model id, or no network. Fall back to a committed
    // fixture if one exists rather than failing in front of an audience — but carry the
    // reason out so callers can surface it instead of silently looking healthy.
    liveError = summariseApiError(err);
  }

  const fixture = readFixture(callId);
  if (!fixture) {
    throw new Error(`extraction failed for ${callId} (${DEFAULT_MODEL}): ${liveError}`);
  }
  return { extraction: fixture, source: "fixture", model: null, latencyMs: null, liveError };
}

/** Path wrapper for local scripts (verify-geometry, compare-live). */
export async function resolveExtraction(
  callId: string,
  audioAbsPath: string,
): Promise<ResolvedExtraction> {
  const audioBytes = readFileSync(audioAbsPath);
  return resolveExtractionFromBytes(callId, audioBytes, getMimeType(audioAbsPath));
}
