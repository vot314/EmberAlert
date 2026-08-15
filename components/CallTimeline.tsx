"use client";

import type { Extraction } from "@/lib/schema";
import type { ExtractionSource } from "@/lib/cache";

export type CallState =
  | "idle"
  | "playing"
  | "extracting"
  | "consistent"
  | "inconsistent"
  | "unusable"
  | "error";

export type CallRow = {
  id: string;
  callerLabel: string;
  offsetSeconds: number;
  state: CallState;
  extraction: Extraction | null;
  source: ExtractionSource | null;
  latencyMs: number | null;
  bearingLabel: string | null;
  error: string | null;
};

const CHIP: Record<CallState, { label: string; cls: string }> = {
  idle: { label: "pending", cls: "bg-slate-800 text-slate-400 ring-slate-700" },
  playing: { label: "playing", cls: "bg-sky-950 text-sky-300 ring-sky-800 animate-pulse" },
  extracting: { label: "extracting", cls: "bg-sky-950 text-sky-300 ring-sky-800 animate-pulse" },
  consistent: { label: "consistent", cls: "bg-amber-950 text-amber-300 ring-amber-800" },
  inconsistent: { label: "inconsistent", cls: "bg-red-950 text-red-300 ring-red-800" },
  unusable: { label: "no bearing", cls: "bg-slate-800 text-slate-500 ring-slate-700" },
  error: { label: "error", cls: "bg-red-950 text-red-300 ring-red-800" },
};

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function CallTimeline({
  rows,
  activeId,
  onPlay,
  disabled,
}: {
  rows: CallRow[];
  activeId: string | null;
  onPlay: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <ol className="flex flex-col gap-2">
      {rows.map((row) => {
        const chip = CHIP[row.state];
        const active = row.id === activeId;
        return (
          <li
            key={row.id}
            className={`rounded-lg border px-3 py-2.5 transition-colors ${
              active ? "border-sky-700 bg-sky-950/40" : "border-slate-800 bg-slate-900/60"
            }`}
          >
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPlay(row.id)}
                disabled={disabled}
                aria-label={`Play ${row.id}`}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-slate-700 text-slate-300 hover:border-sky-600 hover:text-sky-300 disabled:opacity-40"
              >
                ▶
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-200">
                  {row.callerLabel}
                </div>
                <div className="font-mono text-[11px] text-slate-500">
                  {row.id} · T+{mmss(row.offsetSeconds)}
                </div>
              </div>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ring-1 ${chip.cls}`}>
                {chip.label}
              </span>
            </div>

            {row.extraction && (
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-t border-slate-800 pt-2 font-mono text-[11px]">
                <dt className="text-slate-500">bearing</dt>
                <dd className="text-slate-300">{row.bearingLabel ?? "—"}</dd>
                <dt className="text-slate-500">distance</dt>
                <dd className="text-slate-300">
                  {row.extraction.distance_hint.value > 0
                    ? `${row.extraction.distance_hint.value} ${row.extraction.distance_hint.unit} (${row.extraction.distance_hint.vagueness})`
                    : "not stated"}
                </dd>
                <dt className="text-slate-500">smoke</dt>
                <dd className="text-slate-300">
                  {[row.extraction.smoke.color, row.extraction.smoke.volume]
                    .filter(Boolean)
                    .join(" ") || "—"}
                </dd>
                {row.extraction.landmarks.length > 0 && (
                  <>
                    <dt className="text-slate-500">landmark</dt>
                    <dd className="text-slate-300">
                      {row.extraction.landmarks
                        .map((l) => `${l.relation.replace("_", " ")} ${l.name}`)
                        .join("; ")}
                    </dd>
                  </>
                )}
                <dt className="text-slate-500" title="How geometrically precise the description was — not how urgent or articulate the caller sounded.">
                  specificity
                </dt>
                <dd className="text-slate-300">
                  {row.extraction.description_specificity.toFixed(2)}
                </dd>
                <dt className="text-slate-500">source</dt>
                <dd className="text-slate-400">
                  {row.source}
                  {row.latencyMs !== null ? ` · ${row.latencyMs} ms` : ""}
                </dd>
              </dl>
            )}

            {row.error && (
              <p className="mt-2 border-t border-red-900 pt-2 font-mono text-[11px] text-red-400">
                {row.error}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
