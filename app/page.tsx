"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import manifest from "@/data/reports.json";
import IncidentList, { CallQueue, type Incident, type QueueRow } from "@/components/IncidentList";
import { fetchRealtimeWind, type WindData } from "@/lib/wind";
import type { FireReport } from "@/lib/schema";
import { analyzeReport, rankFires, severityBand, type AnalyzedReport } from "@/lib/fires";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-[#0a0e13]" />,
});

type ReportRecord = {
  id: string;
  audio: string;
  label: string;
  offsetSeconds: number;
  /** Playback gain; >1 amplifies a quiet recording via Web Audio. */
  gain?: number;
};

const SCENARIO = manifest.scenario;
const REPORTS = manifest.reports as ReportRecord[];

type Resolved = { extraction: FireReport; source: string; latencyMs: number | null };

export default function Page() {
  const [resolved, setResolved] = useState<Record<string, Resolved>>({});
  const [analyzing, setAnalyzing] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [showWind, setShowWind] = useState<boolean>(true);
  const [windData, setWindData] = useState<WindData | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    fetchRealtimeWind(SCENARIO.initialView.lat, SCENARIO.initialView.lng).then(setWindData);
  }, []);

  // Incidents are derived from the analysed calls, recomputed from scratch each time one
  // lands — cheap, and the board can never drift out of sync with the reports behind it.
  const allIncidents: Incident[] = useMemo(() => {
    const analyzed: AnalyzedReport[] = [];
    for (const rec of REPORTS) {
      const r = resolved[rec.id];
      if (!r) continue;
      analyzed.push(analyzeReport(rec.id, rec.label, r.extraction));
    }
    const { fires } = rankFires(analyzed);

    return fires.map((f) => ({
      id: f.id,
      name: f.place,
      location: { lat: f.coords.lat, lng: f.coords.lng },
      severity: severityBand(f.severity),
      score: f.severity,
      rank: f.rank,
      callCount: f.callCount,
      reason: f.reason,
      transcripts: f.reports.map((r) => r.report.transcript),
    }));
  }, [resolved]);

  const incidents = useMemo(() => {
    if (severityFilter === "ALL") return allIncidents;
    return allIncidents.filter((i) => i.severity.toUpperCase() === severityFilter);
  }, [allIncidents, severityFilter]);

  const selectedIncident = useMemo(
    () => allIncidents.find((i) => i.id === selectedId) ?? null,
    [allIncidents, selectedId],
  );

  const severityCounts = useMemo(() => {
    const counts = { Critical: 0, High: 0, Moderate: 0, Low: 0 };
    for (const inc of allIncidents) counts[inc.severity]++;
    return counts;
  }, [allIncidents]);

  const queueRows: QueueRow[] = REPORTS.map((rec) => {
    const r = resolved[rec.id];
    return {
      id: rec.id,
      label: rec.label,
      state: analyzing[rec.id] ? "analyzing" : errors[rec.id] ? "error" : r ? "done" : "idle",
      score: r ? r.extraction.severity_score : null,
      place: r ? r.extraction.location.named_place : null,
      source: r?.source ?? null,
      latencyMs: r?.latencyMs ?? null,
      error: errors[rec.id] || null,
    };
  });

  /**
   * Play a recording. Audio is only ever started from here, and this is only ever
   * called from the play button — analysis never plays anything on its own.
   *
   * Some recordings are quieter than the rest, so they carry a `gain` in the manifest.
   * An HTMLAudioElement's `volume` is capped at 1.0 and cannot amplify, so anything
   * above 1x has to go through a Web Audio gain node. Routing the element through the
   * graph replaces its direct output, hence connecting on to the destination.
   */
  function playAudio(id: string) {
    const rec = REPORTS.find((r) => r.id === id);
    if (!rec) return;

    audioRef.current?.pause();
    const audio = new Audio(rec.audio);
    audioRef.current = audio;
    setActiveId(id);
    audio.onended = () => setActiveId((cur) => (cur === id ? null : cur));

    const gain = rec.gain ?? 1;
    if (gain !== 1) {
      try {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (Ctor) {
          const ctx = (audioCtxRef.current ??= new Ctor());
          // Browsers start the context suspended until a user gesture; this call
          // happens inside the click handler, so resuming here is allowed.
          if (ctx.state === "suspended") void ctx.resume();
          const source = ctx.createMediaElementSource(audio);
          const gainNode = ctx.createGain();
          gainNode.gain.value = gain;
          source.connect(gainNode).connect(ctx.destination);
        }
      } catch {
        // Web Audio unavailable or blocked: fall through to plain playback at 1x
        // rather than losing the audio entirely.
      }
    }

    void audio.play().catch(() => setActiveId((cur) => (cur === id ? null : cur)));
  }

  /** Analyse one recording. Deliberately silent — no playback happens here. */
  async function analyzeOne(id: string) {
    setErrors((e) => ({ ...e, [id]: "" }));
    setAnalyzing((a) => ({ ...a, [id]: true }));
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId: id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setResolved((prev) => ({ ...prev, [id]: body as Resolved }));
    } catch (err) {
      setErrors((e) => ({ ...e, [id]: (err as Error).message }));
    } finally {
      setAnalyzing((a) => {
        const next = { ...a };
        delete next[id];
        return next;
      });
    }
  }

  /** Play button: hear the call, and analyse it if that has not happened yet. */
  function onPlay(id: string) {
    playAudio(id);
    if (!resolved[id] && !analyzing[id]) void analyzeOne(id);
  }

  async function runAll() {
    setRunning(true);
    setResolved({});
    setErrors({});
    setSelectedId(null);
    for (const rec of REPORTS) {
      await analyzeOne(rec.id);
    }
    setRunning(false);
  }

  function reset() {
    audioRef.current?.pause();
    setActiveId(null);
    setResolved({});
    setErrors({});
    setAnalyzing({});
    setSelectedId(null);
    setSeverityFilter("ALL");
  }

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
                Wildfire Call Triage &amp; Prioritization
              </span>
            </h1>
            <p className="text-[11px] text-slate-500">{SCENARIO.region}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={runAll}
            disabled={running}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sky-500 disabled:opacity-40"
          >
            {running ? "analyzing…" : "Analyze all calls"}
          </button>
          <button
            onClick={reset}
            disabled={running}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-slate-600 disabled:opacity-40"
          >
            Reset
          </button>

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
            <span
              className={`font-mono text-[11px] font-bold ${showWind ? "text-sky-400" : "text-slate-500"}`}
            >
              {showWind ? "ON" : "OFF"}
            </span>
          </button>

          {/* Severity Filter Controls */}
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/80 p-1 text-xs">
            <span className="px-2 py-0.5 text-[11px] font-medium text-slate-400">Filter:</span>
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
        <aside className="flex w-[380px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-slate-800 p-4">
          <IncidentList
            incidents={incidents}
            selectedId={selectedId}
            onSelectIncident={setSelectedId}
          />

          <CallQueue
            rows={queueRows}
            activeId={activeId}
            onPlay={onPlay}
            disabled={false}
          />

          <p className="mt-auto border-t border-slate-800 pt-3 text-[11px] leading-relaxed text-slate-500">
            Severity scores the fire, never the caller. A frightened caller and a composed
            caller reporting the same fire get the same score — the ranking reflects danger,
            not how someone sounds under stress.
          </p>
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
          <div className="pointer-events-none absolute bottom-4 left-4 z-[1000] w-[320px] rounded-lg border border-slate-700/80 bg-slate-950/90 p-4 shadow-xl backdrop-blur">
            <div className="mb-2.5 flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Incident Summary
              </span>
              <span className="font-mono text-xs font-bold text-sky-400">
                {allIncidents.length} Total
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-2 font-mono text-xs">
              <div className="flex justify-between rounded border border-slate-800 bg-slate-900/60 p-2">
                <dt className="text-slate-400">Critical</dt>
                <dd className="font-semibold text-red-400">{severityCounts.Critical}</dd>
              </div>
              <div className="flex justify-between rounded border border-slate-800 bg-slate-900/60 p-2">
                <dt className="text-slate-400">High</dt>
                <dd className="font-semibold text-orange-400">{severityCounts.High}</dd>
              </div>
              <div className="flex justify-between rounded border border-slate-800 bg-slate-900/60 p-2">
                <dt className="text-slate-400">Moderate</dt>
                <dd className="font-semibold text-amber-400">{severityCounts.Moderate}</dd>
              </div>
              <div className="flex justify-between rounded border border-slate-800 bg-slate-900/60 p-2">
                <dt className="text-slate-400">Low</dt>
                <dd className="font-semibold text-emerald-400">{severityCounts.Low}</dd>
              </div>
            </dl>

            {/* Real-time Wind Meter */}
            {windData && (
              <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-2.5 font-mono text-xs">
                <span className="text-slate-400">Live Regional Wind:</span>
                <span className="font-semibold text-sky-300">
                  {windData.directionCardinal} ({windData.directionDeg}°) @ {windData.speedKmH} km/h
                </span>
              </div>
            )}

            {selectedIncident && (
              <div className="mt-2.5 border-t border-slate-800 pt-2.5">
                <div className="text-[11px] font-semibold text-slate-300">
                  Priority #{selectedIncident.rank} · {selectedIncident.name}
                </div>
                <div className="mt-1 font-mono text-[11px] text-slate-400">
                  {selectedIncident.location.lat.toFixed(4)},{" "}
                  {selectedIncident.location.lng.toFixed(4)} · severity {selectedIncident.score}
                </div>
                {selectedIncident.transcripts.map((t, i) => (
                  <p key={i} className="mt-1 text-[10px] italic leading-snug text-slate-500">
                    &ldquo;{t}&rdquo;
                  </p>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
