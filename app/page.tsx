"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import scenarioData from "@/data/calls.json";
import IncidentList, { type Incident } from "@/components/IncidentList";
import { fetchRealtimeWind, type WindData } from "@/lib/wind";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-[#0a0e13]" />,
});

const SCENARIO = scenarioData.scenario;
const RAW_INCIDENTS = (scenarioData.incidents || []) as Incident[];

export default function Page() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [showWind, setShowWind] = useState<boolean>(true);
  const [windData, setWindData] = useState<WindData | null>(null);

  useEffect(() => {
    fetchRealtimeWind(SCENARIO.initialView.lat, SCENARIO.initialView.lng).then(setWindData);
  }, []);

  const incidents = useMemo(() => {
    if (severityFilter === "ALL") return RAW_INCIDENTS;
    return RAW_INCIDENTS.filter((i) => i.severity.toUpperCase() === severityFilter);
  }, [severityFilter]);

  const selectedIncident = useMemo(() => {
    return RAW_INCIDENTS.find((i) => i.id === selectedId) ?? null;
  }, [selectedId]);

  const severityCounts = useMemo(() => {
    const counts = { Critical: 0, High: 0, Moderate: 0, Low: 0 };
    for (const inc of RAW_INCIDENTS) {
      if (counts[inc.severity] !== undefined) {
        counts[inc.severity]++;
      }
    }
    return counts;
  }, []);

  return (
    <main className="flex h-screen flex-col bg-[#0a0e13] text-slate-200">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-800 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-600/20 text-orange-500 ring-1 ring-orange-500/40">
            🔥
          </div>
          <div>
            <h1 className="text-base font-bold tracking-wide text-slate-100">
              EmberAlert
              <span className="ml-2.5 text-xs font-normal text-slate-400">
                Wildfire Incident Monitoring
              </span>
            </h1>
            <p className="text-[11px] text-slate-500">{SCENARIO.region}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Technical Wind Vector Toggle */}
          <button
            onClick={() => setShowWind((v) => !v)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
              showWind
                ? "border-sky-500 bg-sky-950/60 text-sky-200 ring-1 ring-sky-500/50 shadow-sm"
                : "border-slate-800 bg-slate-900/80 text-slate-400 hover:border-slate-700 hover:text-slate-200"
            }`}
          >
            <span className="text-sm">💨</span>
            <span>Wind Fronts:</span>
            <span className={`font-mono text-[11px] font-bold ${showWind ? "text-sky-400" : "text-slate-500"}`}>
              {showWind ? "ON" : "OFF"}
            </span>
          </button>

          {/* Severity Filter Controls */}
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/80 p-1 text-xs">
            <span className="px-2 py-0.5 text-[11px] text-slate-400 font-medium">Filter:</span>
            {["ALL", "CRITICAL", "HIGH", "MODERATE", "LOW"].map((level) => (
              <button
                key={level}
                onClick={() => setSeverityFilter(level)}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition-all ${
                  severityFilter === level
                    ? "bg-sky-600 text-white shadow-sm"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[380px] shrink-0 flex-col overflow-y-auto border-r border-slate-800 p-4">
          <IncidentList
            incidents={incidents}
            selectedId={selectedId}
            onSelectIncident={setSelectedId}
          />
        </aside>

        <section className="relative min-h-0 flex-1">
          <MapView
            center={SCENARIO.initialView}
            zoom={SCENARIO.initialView.zoom}
            incidents={incidents}
            selectedId={selectedId}
            showWind={showWind}
            windData={windData}
            onSelectIncident={setSelectedId}
          />

          {/* Dashboard Stats Overlay */}
          <div className="pointer-events-none absolute bottom-4 left-4 z-[1000] w-[320px] rounded-lg border border-slate-700/80 bg-slate-950/90 p-4 backdrop-blur shadow-xl">
            <div className="mb-2.5 flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Incident Summary
              </span>
              <span className="font-mono text-xs font-bold text-sky-400">
                {RAW_INCIDENTS.length} Total
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-2 font-mono text-xs">
              <div className="flex justify-between rounded bg-slate-900/60 p-2 border border-slate-800">
                <dt className="text-slate-400">Critical</dt>
                <dd className="font-semibold text-red-400">{severityCounts.Critical}</dd>
              </div>
              <div className="flex justify-between rounded bg-slate-900/60 p-2 border border-slate-800">
                <dt className="text-slate-400">High</dt>
                <dd className="font-semibold text-orange-400">{severityCounts.High}</dd>
              </div>
              <div className="flex justify-between rounded bg-slate-900/60 p-2 border border-slate-800">
                <dt className="text-slate-400">Moderate</dt>
                <dd className="font-semibold text-amber-400">{severityCounts.Moderate}</dd>
              </div>
              <div className="flex justify-between rounded bg-slate-900/60 p-2 border border-slate-800">
                <dt className="text-slate-400">Low</dt>
                <dd className="font-semibold text-emerald-400">{severityCounts.Low}</dd>
              </div>
            </dl>

            {/* Real-time Wind Meter */}
            {windData && (
              <div className="mt-3 border-t border-slate-800 pt-2.5 flex items-center justify-between font-mono text-xs">
                <span className="text-slate-400">Live Regional Wind:</span>
                <span className="text-sky-300 font-semibold">
                  {windData.directionCardinal} ({windData.directionDeg}°) @ {windData.speedKmH} km/h
                </span>
              </div>
            )}

            {selectedIncident && (
              <div className="mt-2.5 border-t border-slate-800 pt-2.5">
                <div className="text-[11px] font-semibold text-slate-300">Selected Incident:</div>
                <div className="mt-1 font-mono text-xs text-sky-300">{selectedIncident.name}</div>
                <div className="font-mono text-[11px] text-slate-400">
                  {selectedIncident.location.lat.toFixed(4)}, {selectedIncident.location.lng.toFixed(4)}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
