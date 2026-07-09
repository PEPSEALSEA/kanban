'use client';

import React from 'react';

const PHASES = [
  { label: 'ช่วง 1: น้ำแข็ง', formula: 'Q = mcΔT', color: '#38bdf8' },
  { label: 'ช่วง 2: ละลาย', formula: 'Q = mL_{หลอม}', color: '#0ea5e9' },
  { label: 'ช่วง 3: น้ำ', formula: 'Q = mcΔT', color: '#0284c7' },
  { label: 'ช่วง 4: ต้มเดือด', formula: 'Q = mL_{ไอ}', color: '#0369a1' },
  { label: 'ช่วง 5: ไอน้ำร้อน', formula: 'Q = mcΔT', color: '#075985' },
] as const;

// Relative heat per segment (c_ice=0.5, L_fusion=80, c_water=1, L_vapor=540, c_steam≈0.48×20°C)
const SEGMENT_Q = [2.5, 80, 100, 540, 9.6] as const;
const TEMPS = [-5, 0, 0, 100, 100, 120] as const;

function buildPoints(width: number, height: number, pad: { top: number; right: number; bottom: number; left: number }) {
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const totalQ = SEGMENT_Q.reduce((sum, q) => sum + q, 0);
  const tMin = -10;
  const tMax = 130;

  const qToX = (q: number) => pad.left + (q / totalQ) * plotW;
  const tToY = (t: number) => pad.top + ((tMax - t) / (tMax - tMin)) * plotH;

  const points: { x: number; y: number }[] = [{ x: qToX(0), y: tToY(TEMPS[0]) }];
  let q = 0;
  for (let i = 0; i < SEGMENT_Q.length; i++) {
    q += SEGMENT_Q[i];
    points.push({ x: qToX(q), y: tToY(TEMPS[i + 1]) });
  }

  const segments = SEGMENT_Q.map((_, i) => ({
    from: points[i],
    to: points[i + 1],
    phase: PHASES[i],
  }));

  return { points, segments, qToX, tToY, tMin, tMax, totalQ, plotW, plotH, pad };
}

export default function WaterHeatingCurveChart() {
  const width = 720;
  const height = 380;
  const pad = { top: 36, right: 28, bottom: 52, left: 56 };
  const { segments, qToX, tToY, tMin, tMax, pad: p } = buildPoints(width, height, pad);

  const yTicks = [-5, 0, 50, 100, 120];
  const xTickCount = 5;
  const totalQ = SEGMENT_Q.reduce((sum, q) => sum + q, 0);

  return (
    <figure className="water-heating-chart not-prose my-6 rounded-2xl border border-sky-100 bg-gradient-to-b from-sky-50/80 to-white p-4 shadow-sm">
      <figcaption className="mb-3 text-center text-sm font-bold text-slate-700">
        กราฟ Q vs T ของน้ำ (5 ช่วง)
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mx-auto w-full max-w-3xl"
        role="img"
        aria-label="กราฟความสัมพันธ์ระหว่างความร้อน Q กับอุณหภูมิ T ของน้ำ 5 ช่วง"
      >
        {/* Grid */}
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={p.left}
              y1={tToY(t)}
              x2={width - p.right}
              y2={tToY(t)}
              stroke={t === 0 || t === 100 ? '#94a3b8' : '#e2e8f0'}
              strokeWidth={t === 0 || t === 100 ? 1.5 : 1}
              strokeDasharray={t === 0 || t === 100 ? undefined : '4 4'}
            />
            <text x={p.left - 10} y={tToY(t) + 4} textAnchor="end" className="fill-slate-500 text-[11px] font-medium">
              {t}
            </text>
          </g>
        ))}

        {Array.from({ length: xTickCount + 1 }, (_, i) => {
          const q = (totalQ * i) / xTickCount;
          const x = qToX(q);
          return (
            <line
              key={i}
              x1={x}
              y1={p.top}
              x2={x}
              y2={height - p.bottom}
              stroke="#e2e8f0"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          );
        })}

        {/* Curve segments */}
        {segments.map((seg, i) => (
          <line
            key={i}
            x1={seg.from.x}
            y1={seg.from.y}
            x2={seg.to.x}
            y2={seg.to.y}
            stroke={seg.phase.color}
            strokeWidth={3}
            strokeLinecap="round"
          />
        ))}

        {/* Phase markers */}
        {segments.map((seg, i) => {
          const midX = (seg.from.x + seg.to.x) / 2;
          const midY = (seg.from.y + seg.to.y) / 2;
          const isHorizontal = Math.abs(seg.from.y - seg.to.y) < 1;
          const labelY = isHorizontal ? midY - 14 : midY - 10;
          return (
            <g key={`label-${i}`}>
              <circle cx={midX} cy={midY} r={4} fill={seg.phase.color} />
              <text
                x={midX}
                y={labelY}
                textAnchor="middle"
                className="fill-slate-600 text-[10px] font-semibold"
              >
                {seg.phase.label}
              </text>
            </g>
          );
        })}

        {/* Axes */}
        <line x1={p.left} y1={height - p.bottom} x2={width - p.right} y2={height - p.bottom} stroke="#64748b" strokeWidth={2} />
        <line x1={p.left} y1={p.top} x2={p.left} y2={height - p.bottom} stroke="#64748b" strokeWidth={2} />

        <text x={width / 2} y={height - 10} textAnchor="middle" className="fill-slate-700 text-sm font-bold">
          Q (ความร้อน)
        </text>
        <text
          x={16}
          y={height / 2}
          textAnchor="middle"
          transform={`rotate(-90 16 ${height / 2})`}
          className="fill-slate-700 text-sm font-bold"
        >
          T (°C)
        </text>

        <text x={p.left} y={p.top - 12} className="fill-slate-400 text-[10px]">
          T range: {tMin}°C – {tMax}°C (สัดส่วน Q ตาม c และ L ของน้ำ)
        </text>
      </svg>

      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {PHASES.map((phase) => (
          <span
            key={phase.label}
            className="inline-flex items-center gap-1.5 rounded-full border border-sky-100 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600"
          >
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: phase.color }} />
            {phase.label}: {phase.formula}
          </span>
        ))}
      </div>
    </figure>
  );
}
