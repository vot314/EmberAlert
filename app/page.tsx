"use client";

import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import manifest from "@/data/reports.json";
import type { FireReport } from "@/lib/schema";
import { analyzeReport, rankFires, type AnalyzedReport } from "@/lib/fires";
import { FireQueue, ReportFeed, type ReportRow } from "@/components/PriorityBoard";

// Leaflet touches `window` at import time, so it must never be server-rendered.
// `ssr: false` is only allowed inside a client component, hence "use client" above.
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-[#0a0e13]" />,
});

type ReportRecord = { id: string; audio: string; label: string; offsetSeconds: number };

const SCENARIO = manifest.scenario;
const ACTIVE = manifest.reports as ReportRecord[];
const HELD = manifest.heldReports as ReportRecord[];

type Resolved = { extraction: FireReport; source: string; latencyMs: number | null };

export default function Page() {
  const [resolved, setResolved] = useState<Record<string, Resolved>>({});
  const [analyzing, setAnalyzing] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  // Silver Star is held back so it can be uploaded mid-demo and re-rank the board.
  const [uploaded, setUploaded] = useState<string[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const visible = useMemo(
    () => [...ACTIVE, ...HELD.filter((h) => uploaded.includes(h.id))],
    [uploaded],
  );

  // Ranking is recomputed from scratch whenever a report lands: cheap, and the board
  // can never drift out of sync with the reports behind it.
  const { fires, unlocatable } = useMemo(() => {
    const analyzed: AnalyzedReport[] = [];
    for (const rec of visible) {
      const r = resolved[rec.id];
      if (!r) continue;
      analyzed.push(analyzeReport(rec.id, rec.label, r.extraction));
    }
    return rankFires(analyzed);
  }, [resolved, visible]);

  const rows: ReportRow[] = visible.map((rec) => {
    const r = resolved[rec.id];
    return {
      id: rec.id,
      label: rec.label,
      state: analyzing[rec.id] ? "analyzing" : errors[rec.id] ? "error" : r ? "done" : "idle",
      severity: r ? r.extraction.severity_score : null,
      place: r ? r.extraction.location.named_place : null,
      source: r?.source ?? null,
      latencyMs: r?.latencyMs ?? null,
      error: errors[rec.id] || null,
    };
  });

  const selectedFire = fires.find((f) => f.id === selectedId) ?? null;

  async function playReport(id: string) {
    const rec = [...ACTIVE, ...HELD].find((r) => r.id === id);
    if (!rec) return;

    setActiveId(id);
    setErrors((e) => ({ ...e, [id]: "" }));
    setAnalyzing((a) => ({ ...a, [id]: true }));

    audioRef.current?.pause();
    const audio = new Audio(rec.audio);
    audioRef.current = audio;

    // Every path that could leave the sequence hanging must settle this: a rejected
    // play() (autoplay policy) fires neither onended nor onerror, and a stalled element
    // fires neither either. The timeout is the backstop.
    const finished = new Promise<void>((resolve) => {
      let done = false;
      const settle = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(settle, 20_000);
      audio.onended = settle;
      audio.onerror = settle;
      audio.play().catch(settle);
    });

    const analysis = fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId: id }),
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        return body as Resolved;
      })
      .then((body) => setResolved((prev) => ({ ...prev, [id]: body })))
      .catch((err: Error) => setErrors((e) => ({ ...e, [id]: err.message })));

    await Promise.all([finished, analysis]);
    setAnalyzing((a) => {
      const next = { ...a };
      delete next[id];
      return next;
    });
  }

  async function runAll() {
    setRunning(true);
    setResolved({});
    setErrors({});
    setUploaded([]);
    setSelectedId(null);
    for (const rec of ACTIVE) {
      await playReport(rec.id);
      await new Promise((r) => setTimeout(r, 500));
    }
    setActiveId(null);
    setRunning(false);
  }

  async function uploadHeld(id: string) {
    setUploaded((u) => (u.includes(id) ? u : [...u, id]));
    setRunning(true);
    await playReport(id);
    setActiveId(null);
    setRunning(false);
  }

  function reset() {
    audioRef.current?.pause();
    setResolved({});
    setErrors({});
    setAnalyzing({});
    setUploaded([]);
    setActiveId(null);
    setSelectedId(null);
  }

  return (
    <main className="flex h-screen flex-col bg-[#0a0e13] text-slate-200">
      <header className="flex shrink-0 items-center gap-4 border-b border-slate-800 px-5 py-3">
        <div>
          <h1 className="text-sm font-semibold tracking-wide text-slate-100">
            EmberAlert
            <span className="ml-2 font-normal text-slate-500">
              wildfire call triage &amp; prioritization
            </span>
          </h1>
          <p className="text-[11px] text-slate-500">{SCENARIO.regionLabel}</p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {HELD.map((h) => (
            <button
              key={h.id}
              onClick={() => uploadHeld(h.id)}
              disabled={running || uploaded.includes(h.id)}
              className="rounded border border-amber-800 bg-amber-950/40 px-3 py-1.5 text-xs text-amber-300 hover:border-amber-600 disabled:opacity-40"
            >
              {uploaded.includes(h.id) ? `${h.label} added` : `+ Upload ${h.label}`}
            </button>
          ))}
          <button
            onClick={runAll}
            disabled={running}
            className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40"
          >
            {running ? "analyzing…" : "Run all reports"}
          </button>
          <button
            onClick={reset}
            disabled={running}
            className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-600 disabled:opacity-40"
          >
            Reset
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[380px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-800 p-4">
          <section>
            <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Response priority
            </h2>
            <FireQueue fires={fires} selectedId={selectedId} onSelect={setSelectedId} />
          </section>

          <section>
            <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Incoming reports
            </h2>
            <ReportFeed rows={rows} activeId={activeId} onPlay={playReport} disabled={running} />
            {unlocatable.length > 0 && (
              <p className="mt-2 text-[11px] text-slate-500">
                {unlocatable.length} report(s) could not be located from the audio.
              </p>
            )}
          </section>

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
            fires={fires.map((f) => ({
              id: f.id,
              rank: f.rank,
              place: f.place,
              lat: f.coords.lat,
              lng: f.coords.lng,
              severity: f.severity,
              callCount: f.callCount,
            }))}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />

          {selectedFire && (
            // Leaflet panes sit at z-index 400-800, so overlay UI must be lifted above them.
            <div className="pointer-events-none absolute bottom-4 left-4 z-[1000] w-[360px] rounded-lg border border-slate-700 bg-slate-950/90 p-3 backdrop-blur">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-sm font-semibold text-slate-100">{selectedFire.place}</span>
                <span className="text-[10px] uppercase tracking-widest text-slate-500">
                  priority #{selectedFire.rank}
                </span>
              </div>
              <p className="mb-2 text-[11px] text-slate-400">{selectedFire.reason}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px]">
                <dt className="text-slate-500">severity</dt>
                <dd className="text-slate-200">{selectedFire.severity} / 100</dd>
                <dt className="text-slate-500">size</dt>
                <dd className="text-slate-200">{selectedFire.size}</dd>
                <dt className="text-slate-500">spread</dt>
                <dd className="text-slate-200">{selectedFire.spread}</dd>
                <dt className="text-slate-500">position</dt>
                <dd className="text-slate-200">
                  {selectedFire.coords.lat.toFixed(4)}, {selectedFire.coords.lng.toFixed(4)}
                </dd>
                <dt className="text-slate-500">reports</dt>
                <dd className="text-slate-200">{selectedFire.callCount}</dd>
              </dl>
              <div className="mt-2 space-y-1 border-t border-slate-800 pt-2">
                {selectedFire.reports.map((r) => (
                  <p key={r.id} className="text-[10px] italic leading-snug text-slate-500">
                    &ldquo;{r.report.transcript}&rdquo;
                  </p>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
