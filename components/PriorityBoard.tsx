"use client";

import { severityColor, type Fire } from "@/lib/fires";

export type ReportRow = {
  id: string;
  label: string;
  state: "idle" | "analyzing" | "done" | "error";
  severity: number | null;
  place: string | null;
  source: string | null;
  latencyMs: number | null;
  error: string | null;
};

function Bar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${value}%`, background: severityColor(value) }}
      />
    </div>
  );
}

/** Ranked fires — the dispatch answer to "which one do we deal with first?". */
export function FireQueue({
  fires,
  selectedId,
  onSelect,
}: {
  fires: Fire[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (fires.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-800 px-3 py-6 text-center text-[11px] text-slate-600">
        No fires located yet. Play the incoming reports.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-2">
      {fires.map((f) => {
        const flags = [
          f.lives && "lives at risk",
          f.structures && "structures",
          f.evacuation && "evacuation",
          f.outOfControl && "out of control",
        ].filter(Boolean) as string[];

        return (
          <li key={f.id}>
            <button
              onClick={() => onSelect(f.id)}
              className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                f.id === selectedId
                  ? "border-sky-700 bg-sky-950/40"
                  : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-slate-950"
                  style={{ background: severityColor(f.severity) }}
                >
                  {f.rank}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-100">
                  {f.place}
                </span>
                <span
                  className="shrink-0 font-mono text-xs font-semibold"
                  style={{ color: severityColor(f.severity) }}
                >
                  {f.severity}
                </span>
              </div>

              <div className="mt-2">
                <Bar value={f.severity} />
              </div>

              <p className="mt-2 text-[11px] leading-snug text-slate-400">{f.reason}</p>

              <div className="mt-1.5 flex flex-wrap gap-1">
                {f.callCount > 1 && (
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 ring-1 ring-slate-700">
                    {f.callCount} corroborating calls
                  </span>
                )}
                {flags.map((t) => (
                  <span
                    key={t}
                    className="rounded bg-red-950 px-1.5 py-0.5 text-[10px] text-red-300 ring-1 ring-red-900"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Incoming call feed — one row per recording, with analysis status. */
export function ReportFeed({
  rows,
  activeId,
  onPlay,
  disabled,
}: {
  rows: ReportRow[];
  activeId: string | null;
  onPlay: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <ol className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li
          key={r.id}
          className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
            r.id === activeId ? "border-sky-700 bg-sky-950/40" : "border-slate-800 bg-slate-900/50"
          }`}
        >
          <button
            onClick={() => onPlay(r.id)}
            disabled={disabled}
            aria-label={`Play ${r.id}`}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-slate-700 text-[10px] text-slate-300 hover:border-sky-600 hover:text-sky-300 disabled:opacity-40"
          >
            ▶
          </button>

          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] text-slate-200">{r.label}</div>
            {r.error ? (
              <div className="truncate font-mono text-[10px] text-red-400">{r.error}</div>
            ) : (
              <div className="font-mono text-[10px] text-slate-500">
                {r.state === "analyzing"
                  ? "Gemini analyzing…"
                  : r.state === "done"
                    ? `${r.place ?? "located"}${r.source ? ` · ${r.source}` : ""}${
                        r.latencyMs ? ` · ${(r.latencyMs / 1000).toFixed(1)}s` : ""
                      }`
                    : "queued"}
              </div>
            )}
          </div>

          {r.severity !== null && (
            <span
              className="shrink-0 font-mono text-[11px] font-semibold"
              style={{ color: severityColor(r.severity) }}
            >
              {r.severity}
            </span>
          )}
          {r.state === "analyzing" && (
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-sky-400" />
          )}
        </li>
      ))}
    </ol>
  );
}
