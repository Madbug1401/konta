"use client";

// ============================================================================
// KONTA AI — renderização de visualizações declarativas (Milestone Analytics).
//
// [Segurança — secção 31/32 do pedido] A Konta AI nunca gera HTML/SVG/JS —
// só pode propor uma destas formas (`AiVisualization`, ver
// src/lib/analytics/visualization.ts), sempre revalidada por
// `parseAiVisualization` ANTES de chegar aqui (ver assistant-provider.tsx).
// Este componente é o ÚNICO que decide como desenhar cada tipo — nunca
// interpreta um campo desconhecido, nunca usa `dangerouslySetInnerHTML`;
// todo o texto (títulos, rótulos, valores) passa só por JSX normal, que o
// React escapa por omissão.
// ============================================================================

import { Bar, BarChart, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart, Pie, PieChart } from "recharts";
import { ACCOUNT_COLORS } from "@/lib/account-colors";
import type { AiVisualization } from "@/lib/analytics/visualization";
import { cn } from "@/lib/utils";

const CHART_HEIGHT = 180;

function ChartTooltip({ unit }: { unit?: string }) {
  return (
    <Tooltip
      cursor={{ fill: "var(--color-surface-hover)" }}
      contentStyle={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
      labelStyle={{ color: "var(--color-foreground)" }}
      itemStyle={{ color: "var(--color-foreground)" }}
      formatter={(value) => [`${Number(value).toLocaleString("pt-CV")}${unit ? ` ${unit}` : ""}`, ""]}
    />
  );
}

function DirectionBadge({ changePercent, direction }: { changePercent?: number | null; direction?: "up" | "down" | "flat" }) {
  if (changePercent === null || changePercent === undefined) return null;
  const tone = direction === "up" ? "text-success" : direction === "down" ? "text-danger" : "text-muted-foreground";
  const arrow = direction === "up" ? "↑" : direction === "down" ? "↓" : "→";
  return (
    <span className={cn("text-xs font-medium", tone)}>
      {arrow} {Math.abs(changePercent).toFixed(1)}%
    </span>
  );
}

export function AiVisualizationView({ visualization }: { visualization: AiVisualization }) {
  if (visualization.type === "metric") {
    return (
      <div className="rounded-lg border border-border bg-surface p-3">
        <p className="mb-1 text-xs font-medium text-muted-foreground">{visualization.title}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold text-foreground">{visualization.value}</span>
          <DirectionBadge changePercent={visualization.changePercent} direction={visualization.direction} />
        </div>
      </div>
    );
  }

  if (visualization.type === "comparison") {
    return (
      <div className="rounded-lg border border-border bg-surface p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">{visualization.title}</p>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{visualization.current.label}</p>
            <p className="text-base font-semibold text-foreground">{visualization.current.value}</p>
          </div>
          {visualization.previous && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{visualization.previous.label}</p>
              <p className="text-sm text-muted-foreground">{visualization.previous.value}</p>
            </div>
          )}
        </div>
        {visualization.changePercent !== null && visualization.changePercent !== undefined && (
          <div className="mt-1">
            <DirectionBadge changePercent={visualization.changePercent} direction={visualization.changePercent >= 0 ? "up" : "down"} />
          </div>
        )}
      </div>
    );
  }

  if (visualization.type === "table") {
    return (
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-max text-left text-xs">
          <thead className="bg-black/5">
            <tr>
              {visualization.columns.map((col, i) => (
                <th key={i} className="whitespace-nowrap px-2 py-1 font-medium text-muted-foreground">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visualization.rows.map((row, ri) => (
              <tr key={ri} className="border-t border-border">
                {row.map((cell, ci) => (
                  <td key={ci} className="whitespace-nowrap px-2 py-1 text-foreground">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // line / bar / area / donut — mesma paleta e estilo de DashboardCategoryChart.
  const data = visualization.data;
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{visualization.title}</p>
      <div style={{ width: "100%", height: CHART_HEIGHT }}>
        <ResponsiveContainer>
          {visualization.type === "line" ? (
            <LineChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <ChartTooltip unit={visualization.unit} />
              <Line type="monotone" dataKey="value" stroke={ACCOUNT_COLORS[0].hex} strokeWidth={2} dot={false} />
            </LineChart>
          ) : visualization.type === "area" ? (
            <AreaChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <ChartTooltip unit={visualization.unit} />
              <Area type="monotone" dataKey="value" stroke={ACCOUNT_COLORS[0].hex} fill={ACCOUNT_COLORS[0].hex} fillOpacity={0.25} />
            </AreaChart>
          ) : visualization.type === "donut" ? (
            <PieChart>
              <ChartTooltip unit={visualization.unit} />
              <Pie data={data} dataKey="value" nameKey="label" innerRadius="55%" outerRadius="80%">
                {data.map((_, index) => (
                  <Cell key={index} fill={ACCOUNT_COLORS[index % ACCOUNT_COLORS.length].hex} />
                ))}
              </Pie>
            </PieChart>
          ) : (
            <BarChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <ChartTooltip unit={visualization.unit} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.map((_, index) => (
                  <Cell key={index} fill={ACCOUNT_COLORS[index % ACCOUNT_COLORS.length].hex} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
