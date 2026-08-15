"use client";

export type IncidentSeverity = "Low" | "Moderate" | "High" | "Critical";

export type Incident = {
  id: string;
  name: string;
  location: { lat: number; lng: number };
  severity: IncidentSeverity;
  /** 0-100 score from Gemini's assessment of the fire. */
  score: number;
  /** Response priority, 1 = deal with first. */
  rank: number;
  /** How many independent calls describe this fire. */
  callCount: number;
  /** One-sentence justification for the score, from the model. */
  reason: string;
  transcripts: string[];
};

const SEVERITY_BADGE: Record<IncidentSeverity, { label: string; cls: string; dot: string }> = {
  Critical: {
    label: "Critical",
    cls: "bg-red-950/80 text-red-300 ring-red-700/80",
    dot: "bg-red-500 animate-ping",
  },
  High: {
    label: "High",
    cls: "bg-orange-950/80 text-orange-300 ring-orange-700/80",
    dot: "bg-orange-500",
  },
  Moderate: {
    label: "Moderate",
    cls: "bg-amber-950/80 text-amber-300 ring-amber-700/80",
    dot: "bg-amber-400",
  },
  Low: {
    label: "Low",
    cls: "bg-emerald-950/80 text-emerald-300 ring-emerald-700/80",
    dot: "bg-emerald-400",
  },
};

type Props = {
  incidents: Incident[];
  selectedId: string | null;
  onSelectIncident: (id: string | null) => void;
};

export default function IncidentList({ incidents, selectedId, onSelectIncident }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Response Priority ({incidents.length})
        </h2>
        {selectedId && (
          <button
            onClick={() => onSelectIncident(null)}
            className="text-[11px] text-sky-400 hover:text-sky-300"
          >
            Clear selection
          </button>
        )}
      </div>

      {incidents.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-800 px-3 py-6 text-center text-[11px] text-slate-600">
          No incidents yet — run the call queue below.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {incidents.map((incident) => {
          const badge = SEVERITY_BADGE[incident.severity];
          const isSelected = incident.id === selectedId;

          return (
            <li
              key={incident.id}
              onClick={() => onSelectIncident(incident.id)}
              className={`group cursor-pointer rounded-lg border p-3 transition-all ${
                isSelected
                  ? "border-sky-500 bg-slate-900/90 shadow-md ring-1 ring-sky-500/50"
                  : "border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900/80"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-200 ring-1 ring-slate-700">
                    {incident.rank}
                  </span>
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className={`inline-flex h-full w-full rounded-full ${badge.dot}`} />
                  </span>
                  <h3 className="truncate text-sm font-medium text-slate-100 group-hover:text-white">
                    {incident.name}
                  </h3>
                </div>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide ring-1 ${badge.cls}`}
                >
                  {badge.label}
                </span>
              </div>

              <p className="mt-2 text-[11px] leading-snug text-slate-400">{incident.reason}</p>

              <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-slate-400">
                <span className="text-slate-500">
                  severity {incident.score}
                  {incident.callCount > 1 && ` · ${incident.callCount} calls`}
                </span>
                <span>
                  {incident.location.lat.toFixed(3)}°N, {Math.abs(incident.location.lng).toFixed(3)}°W
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---- Call queue --------------------------------------------------------- */

export type QueueRow = {
  id: string;
  label: string;
  state: "idle" | "analyzing" | "done" | "error";
  score: number | null;
  place: string | null;
  source: string | null;
  latencyMs: number | null;
  error: string | null;
};

export function CallQueue({
  rows,
  activeId,
  onPlay,
  disabled,
}: {
  rows: QueueRow[];
  activeId: string | null;
  onPlay: (id: string) => void;
  disabled: boolean;
}) {
  const done = rows.filter((r) => r.state === "done").length;

  return (
    <div className="flex flex-col gap-2">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Call Queue ({done}/{rows.length})
        </h2>
      </div>

      <ul className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <li
            key={r.id}
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
              r.id === activeId
                ? "border-sky-600 bg-sky-950/40"
                : "border-slate-800 bg-slate-900/50"
            }`}
          >
            <button
              onClick={() => onPlay(r.id)}
              disabled={disabled}
              aria-label={`Play ${r.id}`}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-slate-700 text-[10px] text-slate-300 transition-colors hover:border-sky-600 hover:text-sky-300 disabled:opacity-40"
            >
              ▶
            </button>

            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] text-slate-200">{r.label}</div>
              {r.error ? (
                <div className="truncate font-mono text-[10px] text-red-400" title={r.error}>
                  {r.error}
                </div>
              ) : (
                <div className="truncate font-mono text-[10px] text-slate-500">
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

            {r.score !== null && (
              <span className="shrink-0 font-mono text-[11px] font-semibold text-slate-300">
                {r.score}
              </span>
            )}
            {r.state === "analyzing" && (
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-sky-400" />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
