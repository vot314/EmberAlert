"use client";

import type { IncidentSeverity } from "./IncidentList";

/** Band order runs most severe first, so the ring reads clockwise from worst to least. */
const BANDS: { key: IncidentSeverity; color: string }[] = [
  { key: "Critical", color: "#ef4444" },
  { key: "High", color: "#f97316" },
  { key: "Moderate", color: "#f59e0b" },
  { key: "Low", color: "#10b981" },
];

const SIZE = 104;
const STROKE = 15;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Distribution of incidents by severity, as a donut.
 *
 * Segments are drawn with stroke-dasharray on concentric circles rather than arc paths:
 * an arc path has to special-case the 100%-in-one-band situation (start and end points
 * coincide and the arc collapses), whereas a dashed circle handles it as a matter of
 * course.
 */
export default function SeverityChart({
  counts,
  total,
}: {
  counts: Record<IncidentSeverity, number>;
  total: number;
}) {
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="shrink-0 -rotate-90"
        role="img"
        aria-label="Incident distribution by severity"
      >
        {/* Track, also the empty state when nothing has been analysed yet. */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="#1c2127"
          strokeWidth={STROKE}
        />

        {total > 0 &&
          BANDS.map(({ key, color }) => {
            const value = counts[key];
            if (!value) return null;
            const length = (value / total) * CIRCUMFERENCE;
            const dash = `${length} ${CIRCUMFERENCE - length}`;
            const thisOffset = offset;
            offset += length;

            return (
              <circle
                key={key}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={color}
                strokeWidth={STROKE}
                strokeDasharray={dash}
                strokeDashoffset={-thisOffset}
              />
            );
          })}

        {/* Counter-rotated so the label sits upright inside the rotated ring. */}
        <g className="rotate-90" style={{ transformOrigin: "center" }}>
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-neutral-100 font-mono"
            style={{ fontSize: 21, fontWeight: 500 }}
          >
            {total}
          </text>
        </g>
      </svg>

      <dl className="flex min-w-0 flex-1 flex-col gap-1">
        {BANDS.map(({ key, color }) => (
          <div key={key} className="flex items-baseline gap-2">
            <span
              className="h-2 w-2 shrink-0"
              style={{ background: counts[key] ? color : "#2a3038" }}
            />
            <dt
              className="flex-1 text-[11px] tracking-wide"
              style={{ color: counts[key] ? "#c9ced6" : "#5c646e" }}
            >
              {key}
            </dt>
            <dd
              className="font-mono text-[12px] tabular-nums"
              style={{ color: counts[key] ? color : "#5c646e" }}
            >
              {counts[key]}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
