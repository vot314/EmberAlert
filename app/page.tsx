"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import manifest from "@/data/reports.json";
import IncidentList, { CallQueue, type Incident, type QueueRow } from "@/components/IncidentList";
import SeverityChart from "@/components/SeverityChart";
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
    <main className="flex h-screen flex-col" style={{ background: "var(--bg)" }}>
      <header
        className="flex shrink-0 items-center justify-between border-b px-5 py-2.5"
        style={{ borderColor: "var(--line)" }}
      >
        <div className="flex items-baseline gap-3">
          <h1 className="text-[15px] font-semibold tracking-tight text-[color:var(--text)]">
            Ember<span className="text-[color:var(--text-dim)]">Alert</span>
          </h1>
          <span className="eyebrow">Wildfire Call Triage</span>
          <span className="num text-[10px] text-[color:var(--text-faint)]">
            {SCENARIO.region}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={runAll}
            disabled={running}
            className="border px-3 py-1.5 text-[11px] font-medium tracking-wide transition-colors disabled:opacity-40"
            style={{
              borderColor: running ? "var(--line)" : "#3d4550",
              background: "var(--panel-raised)",
              color: "var(--text)",
            }}
          >
            {running ? "Analysing…" : "Analyse all calls"}
          </button>
          <button
            onClick={reset}
            disabled={running}
            className="border px-3 py-1.5 text-[11px] tracking-wide text-[color:var(--text-dim)] transition-colors hover:text-[color:var(--text)] disabled:opacity-40"
            style={{ borderColor: "var(--line)" }}
          >
            Reset
          </button>

          <span className="mx-1 h-4 w-px" style={{ background: "var(--line)" }} />

          <button
            onClick={() => setShowWind((v) => !v)}
            className="border px-3 py-1.5 text-[11px] tracking-wide transition-colors"
            style={{
              borderColor: showWind ? "#3d4550" : "var(--line)",
              color: showWind ? "var(--text)" : "var(--text-faint)",
              background: showWind ? "var(--panel-raised)" : "transparent",
            }}
          >
            Wind fronts <span className="num ml-1">{showWind ? "on" : "off"}</span>
          </button>

          <div
            className="flex items-center border"
            style={{ borderColor: "var(--line)" }}
          >
            {["ALL", "CRITICAL", "HIGH", "MODERATE", "LOW"].map((level) => (
              <button
                key={level}
                onClick={() => setSeverityFilter(level)}
                className="px-2.5 py-1.5 text-[10px] font-medium tracking-wider transition-colors"
                style={{
                  background:
                    severityFilter === level ? "var(--panel-raised)" : "transparent",
                  color:
                    severityFilter === level ? "var(--text)" : "var(--text-faint)",
                }}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className="thin-scroll flex w-[360px] shrink-0 flex-col gap-6 overflow-y-auto border-r p-4"
          style={{ borderColor: "var(--line)" }}
        >
          <IncidentList
            incidents={incidents}
            selectedId={selectedId}
            onSelectIncident={setSelectedId}
          />

          <CallQueue rows={queueRows} activeId={activeId} onPlay={onPlay} />

          <p className="mt-auto border-t pt-3 text-[10px] leading-relaxed text-[color:var(--text-faint)]"
             style={{ borderColor: "var(--line-soft)" }}>
            Severity scores the fire, never the caller. A frightened caller and a composed
            caller reporting the same fire get the same score.
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

          {/* Distribution panel */}
          <div
            className="pointer-events-none absolute bottom-4 left-4 z-[1000] w-[300px] border p-4"
            style={{ background: "rgb(11 12 14 / 0.94)", borderColor: "var(--line)" }}
          >
            <div className="mb-3 flex items-baseline justify-between">
              <span className="eyebrow">Severity Distribution</span>
            </div>

            <SeverityChart counts={severityCounts} total={allIncidents.length} />

            {windData && (
              <div
                className="num mt-3 flex items-baseline justify-between border-t pt-2.5 text-[10px]"
                style={{ borderColor: "var(--line-soft)" }}
              >
                <span className="text-[color:var(--text-faint)]">REGIONAL WIND</span>
                <span className="text-[color:var(--text-dim)]">
                  {windData.directionCardinal} {windData.directionDeg}° · {windData.speedKmH} km/h
                </span>
              </div>
            )}

            {selectedIncident && (
              <div
                className="mt-2.5 border-t pt-2.5"
                style={{ borderColor: "var(--line-soft)" }}
              >
                <div className="num text-[10px] text-[color:var(--text-faint)]">
                  PRIORITY {String(selectedIncident.rank).padStart(2, "0")} ·{" "}
                  {selectedIncident.location.lat.toFixed(3)}N{" "}
                  {Math.abs(selectedIncident.location.lng).toFixed(3)}W
                </div>
                <div className="mt-0.5 text-[12px] font-medium text-[color:var(--text)]">
                  {selectedIncident.name}
                </div>
                {selectedIncident.transcripts.map((t, i) => (
                  <p
                    key={i}
                    className="mt-1 text-[10px] italic leading-snug text-[color:var(--text-faint)]"
                  >
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
