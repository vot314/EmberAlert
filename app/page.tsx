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
  offsetSeconds?: number;
  /** Playback gain; >1 amplifies a quiet recording via Web Audio. */
  gain?: number;
};

// Scenario config (map framing, region label) still comes from the static manifest;
// the report LIST does not — it is fetched from /api/reports, which scans the audio
// folders, and polled so a file dropped into `call audios/` appears by itself.
const SCENARIO = manifest.scenario;

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
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    fetchRealtimeWind(SCENARIO.initialView.lat, SCENARIO.initialView.lng).then(setWindData);
  }, []);

  // Poll the folder scan. Three seconds is imperceptible for a human dropping in a
  // file, and the request is a directory listing — no audio moves until analysis.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/reports", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { reports: ReportRecord[] };
        setReports((prev) =>
          JSON.stringify(prev) === JSON.stringify(body.reports) ? prev : body.reports,
        );
      } catch {
        // Transient dev-server hiccup; the next tick retries.
      }
    };
    load();
    const timer = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Incidents are derived from the analysed calls, recomputed from scratch each time one
  // lands — cheap, and the board can never drift out of sync with the reports behind it.
  const allIncidents: Incident[] = useMemo(() => {
    const analyzed: AnalyzedReport[] = [];
    for (const rec of reports) {
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
  }, [resolved, reports]);

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

  const queueRows: QueueRow[] = reports.map((rec) => {
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
    const rec = reports.find((r) => r.id === id);
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
    for (const rec of reports) {
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
        className="flex shrink-0 items-center justify-between border-b px-4 py-2"
        style={{ borderColor: "var(--line)" }}
      >
        <div className="flex items-baseline gap-3">
          <h1 className="text-[17px] font-extrabold tracking-tight">
            EMBER<span style={{ color: "var(--sev-critical)" }}>ALERT</span>
          </h1>
          <span className="text-[11px] font-semibold text-[color:var(--text-dim)]">
            Wildfire Call Triage
          </span>
          <span className="num text-[11px] text-[color:var(--text-faint)]">
            {SCENARIO.region}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={runAll}
            disabled={running}
            className="pill px-4 py-1.5 text-[12px] disabled:opacity-50"
            style={{ background: "var(--accent-navy)" }}
          >
            {running ? "Analysing…" : "Analyse all calls"}
          </button>
          <button
            onClick={reset}
            disabled={running}
            className="pill px-4 py-1.5 text-[12px] disabled:opacity-50"
            style={{ background: "#888888" }}
          >
            Reset
          </button>

          <span className="mx-1 h-5 w-px" style={{ background: "var(--line)" }} />

          <button
            onClick={() => setShowWind((v) => !v)}
            className="pill px-4 py-1.5 text-[12px]"
            style={{
              background: showWind ? "var(--accent)" : "#bdbdbd",
            }}
          >
            Wind fronts {showWind ? "on" : "off"}
          </button>

          <div className="flex items-center gap-1">
            {["ALL", "CRITICAL", "HIGH", "MODERATE", "LOW"].map((level) => {
              const active = severityFilter === level;
              return (
                <button
                  key={level}
                  onClick={() => setSeverityFilter(level)}
                  className="pill px-3 py-1.5 text-[11px]"
                  style={{
                    background: active ? "var(--accent)" : "transparent",
                    color: active ? "#ffffff" : "var(--text-dim)",
                  }}
                >
                  {level}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className="thin-scroll flex w-[360px] shrink-0 flex-col gap-4 overflow-y-auto border-r p-3"
          style={{ borderColor: "var(--line)" }}
        >
          <IncidentList
            incidents={incidents}
            selectedId={selectedId}
            onSelectIncident={setSelectedId}
          />

          <CallQueue rows={queueRows} activeId={activeId} onPlay={onPlay} />

          <p
            className="mt-auto border-t pt-2.5 text-[10.5px] leading-relaxed text-[color:var(--text-faint)]"
            style={{ borderColor: "var(--line-soft)" }}
          >
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

          <div
            className="pointer-events-none absolute bottom-4 left-4 z-[1000] w-[300px] border shadow-sm"
            style={{ background: "#ffffff", borderColor: "var(--line)" }}
          >
            <div className="strip px-3 py-1.5">
              <span className="eyebrow">Severity Distribution</span>
            </div>

            <div className="p-3">
              <SeverityChart counts={severityCounts} total={allIncidents.length} />

              {windData && (
                <div
                  className="num mt-3 flex items-baseline justify-between border-t pt-2 text-[10.5px]"
                  style={{ borderColor: "var(--line-soft)" }}
                >
                  <span className="text-[color:var(--text-faint)]">REGIONAL WIND</span>
                  <span className="font-bold text-[color:var(--text-dim)]">
                    {windData.directionCardinal} {windData.directionDeg}&deg; ·{" "}
                    {windData.speedKmH} km/h
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
                    {selectedIncident.location.lat.toFixed(3)}&deg;N{" "}
                    {Math.abs(selectedIncident.location.lng).toFixed(3)}&deg;W
                  </div>
                  <div className="mt-0.5 text-[12.5px] font-bold">{selectedIncident.name}</div>
                  {selectedIncident.transcripts.map((t, i) => (
                    <p
                      key={i}
                      className="mt-1 text-[10.5px] italic leading-snug text-[color:var(--text-dim)]"
                    >
                      &ldquo;{t}&rdquo;
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
