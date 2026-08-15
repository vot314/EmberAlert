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

export const SEVERITY_HUE: Record<IncidentSeverity, string> = {
  Critical: "#ef4444",
  High: "#f97316",
  Moderate: "#f59e0b",
  Low: "#10b981",
};

type Props = {
  incidents: Incident[];
  selectedId: string | null;
  onSelectIncident: (id: string | null) => void;
};

export default function IncidentList({ incidents, selectedId, onSelectIncident }: Props) {
  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between">
        <h2 className="eyebrow">Response Priority</h2>
        {selectedId ? (
          <button
            onClick={() => onSelectIncident(null)}
            className="text-[10px] tracking-wide text-[color:var(--text-faint)] transition-colors hover:text-[color:var(--text-dim)]"
          >
            clear
          </button>
        ) : (
          <span className="num text-[10px] text-[color:var(--text-faint)]">
            {incidents.length}
          </span>
        )}
      </div>

      {incidents.length === 0 ? (
        <p className="border border-dashed border-[color:var(--line)] px-3 py-5 text-center text-[11px] text-[color:var(--text-faint)]">
          No incidents yet. Analyse the call queue.
        </p>
      ) : (
        <ul className="border-t border-[color:var(--line-soft)]">
          {incidents.map((incident) => {
            const hue = SEVERITY_HUE[incident.severity];
            const isSelected = incident.id === selectedId;

            return (
              <li key={incident.id}>
                <button
                  onClick={() => onSelectIncident(incident.id)}
                  className="w-full border-b border-[color:var(--line-soft)] px-0 py-2.5 text-left transition-colors"
                  style={{ background: isSelected ? "var(--panel-raised)" : "transparent" }}
                >
                  <div className="flex items-stretch gap-2.5">
                    {/* Severity rendered as a rule, not a pill — reads as an instrument
                        scale rather than a badge. */}
                    <span
                      className="w-[3px] shrink-0"
                      style={{ background: hue, opacity: isSelected ? 1 : 0.7 }}
                    />

                    <div className="min-w-0 flex-1 pr-1">
                      <div className="flex items-baseline gap-2">
                        <span className="num text-[10px] text-[color:var(--text-faint)]">
                          {String(incident.rank).padStart(2, "0")}
                        </span>
                        <h3
                          className="min-w-0 flex-1 truncate text-[13px] font-medium"
                          style={{ color: isSelected ? "#fff" : "var(--text)" }}
                        >
                          {incident.name}
                        </h3>
                        <span className="num text-[12px]" style={{ color: hue }}>
                          {incident.score}
                        </span>
                      </div>

                      <p className="mt-1 text-[11px] leading-snug text-[color:var(--text-dim)]">
                        {incident.reason}
                      </p>

                      <div className="num mt-1.5 flex items-center gap-2 text-[10px] text-[color:var(--text-faint)]">
                        <span style={{ color: hue }}>{incident.severity.toLowerCase()}</span>
                        <span>·</span>
                        <span>
                          {incident.callCount} {incident.callCount === 1 ? "call" : "calls"}
                        </span>
                        <span className="ml-auto">
                          {incident.location.lat.toFixed(2)}N{" "}
                          {Math.abs(incident.location.lng).toFixed(2)}W
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
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

function PlayIcon() {
  return (
    <svg width="8" height="9" viewBox="0 0 8 9" aria-hidden="true">
      <path d="M0 0.5 L8 4.5 L0 8.5 Z" fill="currentColor" />
    </svg>
  );
}

export function CallQueue({
  rows,
  activeId,
  onPlay,
}: {
  rows: QueueRow[];
  activeId: string | null;
  onPlay: (id: string) => void;
}) {
  const done = rows.filter((r) => r.state === "done").length;

  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between">
        <h2 className="eyebrow">Call Queue</h2>
        <span className="num text-[10px] text-[color:var(--text-faint)]">
          {done}/{rows.length}
        </span>
      </div>

      <ul className="border-t border-[color:var(--line-soft)]">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-center gap-2.5 border-b border-[color:var(--line-soft)] py-2"
            style={{ background: r.id === activeId ? "var(--panel-raised)" : "transparent" }}
          >
            <button
              onClick={() => onPlay(r.id)}
              aria-label={`Play ${r.id}`}
              title="Play recording"
              className="grid h-6 w-6 shrink-0 place-items-center border border-[color:var(--line)] text-[color:var(--text-dim)] transition-colors hover:border-[color:var(--text-faint)] hover:text-[color:var(--text)]"
            >
              <PlayIcon />
            </button>

            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] text-[color:var(--text)]">{r.label}</div>
              {r.error ? (
                <div className="num truncate text-[10px] text-red-400" title={r.error}>
                  {r.error}
                </div>
              ) : (
                <div className="num truncate text-[10px] text-[color:var(--text-faint)]">
                  {r.state === "analyzing"
                    ? "analysing"
                    : r.state === "done"
                      ? `${r.place ?? "located"}${r.source ? ` · ${r.source}` : ""}${
                          r.latencyMs ? ` · ${(r.latencyMs / 1000).toFixed(1)}s` : ""
                        }`
                      : "queued"}
                </div>
              )}
            </div>

            {r.score !== null && (
              <span className="num shrink-0 text-[11px] text-[color:var(--text-dim)]">
                {r.score}
              </span>
            )}
            {r.state === "analyzing" && (
              <span className="h-1 w-1 shrink-0 animate-pulse rounded-full bg-[color:var(--text-dim)]" />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
