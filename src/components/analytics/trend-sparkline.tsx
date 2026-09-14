"use client";

// KONTA ANALYTICS — mini-gráfico de tendência (Milestone Analytics,
// expansão). Desenha a série de 6 meses que `getFinancialTrends` já calcula
// (src/lib/analytics/trends.ts) — antes só usada para decidir a direção
// (crescente/decrescente/estável), nunca desenhada. Sem eixos/legendas de
// propósito: um sparkline é só "a forma" da tendência, o número exato já
// está no badge ao lado.
import { Area, AreaChart, ResponsiveContainer } from "recharts";

export interface TrendPoint {
  label: string;
  value: number;
}

export function TrendSparkline({ data, tone }: { data: TrendPoint[]; tone: "success" | "danger" | "muted" }) {
  if (data.length < 2) return null;
  const color = tone === "success" ? "var(--color-success)" : tone === "danger" ? "var(--color-danger)" : "var(--color-muted-foreground)";

  return (
    <div style={{ width: "100%", height: 36 }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ left: 0, right: 0, top: 2, bottom: 0 }}>
          <Area type="monotone" dataKey="value" stroke={color} fill={color} fillOpacity={0.15} strokeWidth={1.5} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
