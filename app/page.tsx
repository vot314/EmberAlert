"use client";

import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { buildWedge, fuseWedges, type Wedge } from "@/lib/geometry";
import type { Extraction } from "@/lib/schema";
import type { ExtractionSource } from "@/lib/cache";
import CallTimeline, { type CallRow, type CallState } from "@/components/CallTimeline";
import scenarioData from "@/data/calls.json";

// MapLibre touches `window` at import time, so it must never be server-rendered.
// `ssr: false` is only permitted inside a client component, which is why this
// page carries "use client".
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-[#0a0e13]" />,
});

type Call = {
  id: string;
  audio: string;
  callerLabel: string;
  caller: { lat: number; lng: number };
  offsetSeconds: number;
  script: string;
};

const SCENARIO = scenarioData.scenario;
const CALLS = scenarioData.calls as Call[];
const GROUND_TRUTH = SCENARIO.groundTruth;

type Resolved = { extraction: Extraction; source: ExtractionSource; latencyMs: number | null };

export default function Page() {
  const [resolved, setResolved] = useState<Record<string, Resolved>>({});
  const [phase, setPhase] = useState<Record<string, "playing" | "extracting">>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [revealTruth, setRevealTruth] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // All geometry is recomputed from scratch whenever an extraction lands. It is
  // cheap, and it means the fix can never drift out of sync with the calls.
  const { wedges, fix, wedgeById } = useMemo(() => {
    const ws: Wedge[] = [];
    const unusable: string[] = [];
    for (const call of CALLS) {
      const r = resolved[call.id];
      if (!r) continue;
      const w = buildWedge(call.id, call.caller, r.extraction);
      if (w) ws.push(w);
      else unusable.push(call.id);
    }
    const f = fuseWedges(ws, unusable, GROUND_TRUTH);
    return { wedges: ws, fix: f, wedgeById: new Map(ws.map((w) => [w.callId, w])) };
  }, [resolved]);

  const rows: CallRow[] = CALLS.map((call) => {
    const r = resolved[call.id];
    const w = wedgeById.get(call.id);

    let state: CallState = "idle";
    if (phase[call.id]) state = phase[call.id];
    else if (errors[call.id]) state = "error";
    else if (r) {
      state = fix.inconsistentCallIds.includes(call.id)
        ? "inconsistent"
        : fix.unusableCallIds.includes(call.id)
          ? "unusable"
          : "consistent";
    }

    return {
      id: call.id,
      callerLabel: call.callerLabel,
      offsetSeconds: call.offsetSeconds,
      state,
      extraction: r?.extraction ?? null,
      source: r?.source ?? null,
      latencyMs: r?.latencyMs ?? null,
      bearingLabel: w
        ? `${w.bearingDeg.toFixed(0)}° ±${w.spreadDeg.toFixed(0)}° via ${w.basis}${w.basis === "landmark" ? ` (${w.basisDetail})` : ""}`
        : null,
      error: errors[call.id] ?? null,
    };
  });

  const processed = CALLS.filter((c) => resolved[c.id]);
  const scenarioClock = processed.length
    ? Math.max(...processed.map((c) => c.offsetSeconds))
    : 0;
  const anyLive = Object.values(resolved).some((r) => r.source === "live" || r.source === "cache");
  const allFixture = processed.length > 0 && !anyLive;

  async function playCall(id: string) {
    const call = CALLS.find((c) => c.id === id);
    if (!call) return;

    setActiveId(id);
    setErrors((e) => ({ ...e, [id]: "" }));
    setPhase((p) => ({ ...p, [id]: "playing" }));

    audioRef.current?.pause();
    const audio = new Audio(call.audio);
    audioRef.current = audio;

    // Every path that could leave the sequence hanging must resolve this: a
    // rejected play() (autoplay policy) fires neither onended nor onerror, and a
    // stalled element fires neither either. The timeout is the backstop — the
    // run-demo sequence must never wedge in front of an audience.
    const finished = new Promise<void>((resolve) => {
      let done = false;
      const settle = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(settle, 30_000);
      audio.onended = settle;
      audio.onerror = settle;
      audio.play().catch(settle);
    });

    const extraction = fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId: id }),
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        return body as Resolved;
      })
      .then((body) => {
        setResolved((prev) => ({ ...prev, [id]: body }));
      })
      .catch((err: Error) => {
        setErrors((e) => ({ ...e, [id]: err.message }));
      });

    setPhase((p) => ({ ...p, [id]: "extracting" }));
    await Promise.all([finished, extraction]);
    setPhase((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
  }

  async function runDemo() {
    setRunning(true);
    setResolved({});
    setErrors({});
    setRevealTruth(false);
    for (const call of CALLS) {
      await playCall(call.id);
      await new Promise((r) => setTimeout(r, 700));
    }
    setActiveId(null);
    setRunning(false);
  }

  function reset() {
    audioRef.current?.pause();
    setResolved({});
    setErrors({});
    setPhase({});
    setActiveId(null);
    setRevealTruth(false);
  }

  const confidenceColor =
    fix.confidence === "HIGH" ? "text-emerald-400"
    : fix.confidence === "MEDIUM" ? "text-amber-400"
    : "text-slate-400";

  return (
    <main className="flex h-screen flex-col bg-[#0a0e13] text-slate-200">
      <header className="flex shrink-0 items-center gap-4 border-b border-slate-800 px-5 py-3">
        <div>
          <h1 className="text-sm font-semibold tracking-wide text-slate-100">
            SmokeFix
            <span className="ml-2 font-normal text-slate-500">
              wildfire smoke-call triangulation
            </span>
          </h1>
          <p className="text-[11px] text-slate-500">{SCENARIO.region}</p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {allFixture && (
            <span className="rounded bg-slate-800 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400 ring-1 ring-slate-700">
              fixtures · no live model
            </span>
          )}
          <button
            onClick={runDemo}
            disabled={running}
            className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40"
          >
            {running ? "running…" : "Run demo"}
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
        <aside className="flex w-[380px] shrink-0 flex-col overflow-y-auto border-r border-slate-800 p-4">
          <CallTimeline rows={rows} activeId={activeId} onPlay={playCall} disabled={running} />

          <p className="mt-4 border-t border-slate-800 pt-3 text-[11px] leading-relaxed text-slate-500">
            Specificity scores how precisely a caller described the location. It is never
            a measure of how urgent or articulate they sounded — this system resolves
            location only and does not rank whose emergency matters more.
          </p>
        </aside>

        <section className="relative min-h-0 flex-1">
          <MapView
            center={SCENARIO.initialView}
            zoom={SCENARIO.initialView.zoom}
            callers={CALLS.filter((c) => resolved[c.id] || phase[c.id]).map((c) => {
              const row = rows.find((r) => r.id === c.id)!;
              const state =
                row.state === "consistent" || row.state === "inconsistent" || row.state === "unusable"
                  ? row.state
                  : row.state === "playing" || row.state === "extracting"
                    ? "playing"
                    : "idle";
              return { id: c.id, label: c.callerLabel, lat: c.caller.lat, lng: c.caller.lng, state };
            })}
            wedges={wedges.map((w) => ({
              callId: w.callId,
              polygon: w.polygon,
              status: fix.inconsistentCallIds.includes(w.callId)
                ? ("inconsistent" as const)
                : ("consistent" as const),
            }))}
            fix={fix.polygon}
            fixCentroid={fix.centroid}
            groundTruth={GROUND_TRUTH}
            revealTruth={revealTruth}
          />

          {/* Leaflet's panes and controls sit at z-index 400-800, so overlay UI has
              to be lifted above them explicitly. */}
          <div className="pointer-events-none absolute bottom-4 left-4 z-[1000] w-[330px] rounded-lg border border-slate-700 bg-slate-950/85 p-3 backdrop-blur">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[10px] uppercase tracking-widest text-slate-500">
                current fix
              </span>
              <span className={`font-mono text-xs font-semibold ${confidenceColor}`}>
                {fix.confidence}
              </span>
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-xs">
              <dt className="text-slate-500">search area</dt>
              <dd className="text-slate-200">
                {fix.polygon ? `${fix.areaKm2.toFixed(2)} km²` : "—"}
              </dd>
              <dt className="text-slate-500">position</dt>
              <dd className="text-slate-200">
                {fix.centroid
                  ? `${fix.centroid.lat.toFixed(4)}, ${fix.centroid.lng.toFixed(4)}`
                  : "—"}
              </dd>
              <dt className="text-slate-500">reports used</dt>
              <dd className="text-slate-200">
                {fix.consistentCallIds.length} consistent
                {fix.inconsistentCallIds.length > 0 && (
                  <span className="text-red-400"> · {fix.inconsistentCallIds.length} flagged</span>
                )}
              </dd>
              <dt className="text-slate-500">scenario clock</dt>
              <dd className="text-slate-200">
                T+{Math.floor(scenarioClock / 60)}:
                {String(scenarioClock % 60).padStart(2, "0")}
              </dd>
              {revealTruth && (
                <>
                  <dt className="text-slate-500">error</dt>
                  <dd className="text-emerald-300">
                    {fix.errorMeters !== null ? `${Math.round(fix.errorMeters)} m from ignition` : "—"}
                  </dd>
                </>
              )}
            </dl>

            <button
              onClick={() => setRevealTruth((v) => !v)}
              disabled={!fix.polygon}
              className="pointer-events-auto mt-2.5 w-full rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-slate-600 disabled:opacity-40"
            >
              {revealTruth ? "Hide actual ignition point" : "Reveal actual ignition point"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
