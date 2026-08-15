"use client";

export type IncidentSeverity = "Low" | "Moderate" | "High" | "Critical";

export type Incident = {
  id: string;
  name: string;
  location: { lat: number; lng: number };
  severity: IncidentSeverity;
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
          Active Fire Incidents ({incidents.length})
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
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className={`inline-flex h-full w-full rounded-full ${badge.dot}`} />
                  </span>
                  <h3 className="text-sm font-medium text-slate-100 group-hover:text-white">
                    {incident.name}
                  </h3>
                </div>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide ring-1 ${badge.cls}`}
                >
                  {badge.label}
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-slate-400">
                <span className="text-slate-500">{incident.id}</span>
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
