import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import manifest from "@/data/reports.json";

/**
 * SERVER-ONLY report discovery. The queue is no longer a hand-edited manifest: these
 * directories are scanned on every request, so dropping an mp3 into `call audios/`
 * is all it takes for a new report to appear (the page polls /api/reports).
 *
 * `data/reports.json` still exists but is demoted to scenario config plus optional
 * per-id overrides — a nicer label, a playback gain, a fixed ordering slot. A file
 * with no override entry gets sensible defaults derived from its filename.
 */

export type ReportEntry = {
  id: string;
  label: string;
  /** Client-facing URL; audio is streamed by /api/audio/[id], not from public/. */
  audio: string;
  gain?: number;
  offsetSeconds?: number;
};

type Override = { id: string; label?: string; gain?: number; offsetSeconds?: number };

const AUDIO_EXTS = new Set([".mp3", ".wav", ".m4a"]);

/**
 * The drop folder first (local, gitignored), then the committed copies as a fallback
 * so a fresh clone without `call audios/` still has the five stock reports. First
 * directory wins on id collisions.
 */
const AUDIO_DIRS = [
  join(process.cwd(), "call audios"),
  join(process.cwd(), "public", "reports"),
];

/** "Silver Star Vernon.mp3" -> "silver-star-vernon" (also the fixture/cache identity). */
function idFor(file: string): string {
  return basename(file, extname(file))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "test_fire-2.mp3" -> "Test Fire 2" */
function labelFor(file: string): string {
  return basename(file, extname(file))
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

type Scanned = { entry: ReportEntry; path: string; mtimeMs: number };

export function scanReports(): Scanned[] {
  const overrides = manifest.reports as Override[];
  const seen = new Map<string, Scanned>();

  for (const dir of AUDIO_DIRS) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!AUDIO_EXTS.has(extname(file).toLowerCase())) continue;
      const id = idFor(file);
      if (!id || seen.has(id)) continue;

      const path = join(dir, file);
      const o = overrides.find((r) => r.id === id);
      seen.set(id, {
        entry: {
          id,
          label: o?.label ?? labelFor(file),
          audio: `/api/audio/${id}`,
          ...(o?.gain !== undefined ? { gain: o.gain } : {}),
          ...(o?.offsetSeconds !== undefined ? { offsetSeconds: o.offsetSeconds } : {}),
        },
        path,
        mtimeMs: statSync(path).mtimeMs,
      });
    }
  }

  // Stable order: reports with an assigned slot first, then newcomers in arrival order.
  return [...seen.values()].sort((a, b) => {
    const ao = a.entry.offsetSeconds;
    const bo = b.entry.offsetSeconds;
    if (ao !== undefined && bo !== undefined) return ao - bo;
    if (ao !== undefined) return -1;
    if (bo !== undefined) return 1;
    return a.mtimeMs - b.mtimeMs;
  });
}

export function listReports(): ReportEntry[] {
  return scanReports().map((s) => s.entry);
}

export function findReportPath(id: string): { entry: ReportEntry; path: string } | null {
  const hit = scanReports().find((s) => s.entry.id === id);
  return hit ? { entry: hit.entry, path: hit.path } : null;
}

export const SCENARIO = manifest.scenario;
