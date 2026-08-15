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

/** Sampled from the reference feed: its fire-badge red and active-filter green, with
 *  two matching middle steps. */
export const SEVERITY_HUE: Record<IncidentSeverity, string> = {
  Critical: "#aa0000",
  High: "#e06c00",
  Moderate: "#b8860b",
  Low: "#2e8b57",
};

type Props = {
  incidents: Incident[];
  selectedId: string | null;
  onSelectIncident: (id: string | null) => void;
};

export default function IncidentList({ incidents, selectedId, onSelectIncident }: Props) {
  return (
    <section>
      <div className="strip flex items-baseline justify-between px-2.5 py-1.5">
        <h2 className="eyebrow">Response Priority</h2>
        {selectedId ? (
          <button
            onClick={() => onSelectIncident(null)}
            className="text-[11px] font-medium text-[color:var(--accent-navy)] hover:underline"
          >
            clear
          </button>
        ) : (
          <span className="num text-[11px] text-[color:var(--text-faint)]">
            {incidents.length}
          </span>
        )}
      </div>

      {incidents.length === 0 ? (
        <p className="border-x border-b border-[color:var(--line)] px-3 py-5 text-center text-[12px] text-[color:var(--text-faint)]">
          No incidents yet. Analyse the call queue.
        </p>
      ) : (
        <ul className="border-x border-b border-[color:var(--line)]">
          {incidents.map((incident) => {
            const hue = SEVERITY_HUE[incident.severity];
            const isSelected = incident.id === selectedId;

            return (
              <li key={incident.id}>
                <button
                  onClick={() => onSelectIncident(incident.id)}
                  className="w-full border-b border-[color:var(--line-soft)] px-2.5 py-2 text-left last:border-b-0"
                  style={{ background: isSelected ? "var(--highlight)" : "transparent" }}
                >
                  <div className="flex items-center gap-2">
                    <span className="num text-[11px] text-[color:var(--text-faint)]">
                      {String(incident.rank).padStart(2, "0")}
                    </span>
                    <span
                      className="pill px-2 py-[3px] text-[10px]"
                      style={{ background: hue }}
                    >
                      {incident.severity}
                    </span>
                    <h3
                      className="min-w-0 flex-1 truncate text-[13px]"
                      style={{ fontWeight: isSelected ? 700 : 600 }}
                    >
                      {incident.name}
                    </h3>
                    <span className="num text-[13px] font-bold" style={{ color: hue }}>
                      {incident.score}
                    </span>
                  </div>

                  <p className="mt-1 text-[11.5px] leading-snug text-[color:var(--text-dim)]">
                    {incident.reason}
                  </p>

                  <div className="num mt-1 flex items-center gap-2 text-[10.5px] text-[color:var(--text-faint)]">
                    <span>
                      {incident.callCount} {incident.callCount === 1 ? "call" : "calls"}
                    </span>
                    <span className="ml-auto">
                      {incident.location.lat.toFixed(3)}&deg;N{" "}
                      {Math.abs(incident.location.lng).toFixed(3)}&deg;W
                    </span>
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
      <div className="strip flex items-baseline justify-between px-2.5 py-1.5">
        <h2 className="eyebrow">Call Queue</h2>
        <span className="num text-[11px] text-[color:var(--text-faint)]">
          {done}/{rows.length}
        </span>
      </div>

      <ul className="border-x border-b border-[color:var(--line)]">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-center gap-2 border-b border-[color:var(--line-soft)] px-2.5 py-1.5 last:border-b-0"
            style={{ background: r.id === activeId ? "var(--highlight)" : "transparent" }}
          >
            <button
              onClick={() => onPlay(r.id)}
              aria-label={`Play ${r.id}`}
              title="Play recording"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-white transition-opacity hover:opacity-80"
              style={{ background: "var(--accent-navy)" }}
            >
              <PlayIcon />
            </button>

            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-medium">{r.label}</div>
              {r.error ? (
                <div className="num truncate text-[10px] text-[color:var(--sev-critical)]" title={r.error}>
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
              <span className="num shrink-0 text-[12px] font-bold text-[color:var(--text-dim)]">
                {r.score}
              </span>
            )}
            {r.state === "analyzing" && (
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[color:var(--accent-navy)]" />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
