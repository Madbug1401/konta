"use client";

// KONTA ANALYTICS — gráfico de evolução de receitas/despesas (Milestone
// Analytics). Client leaf alimentado por dados já calculados no servidor
// (CashflowAnalysis.buckets, já convertidos para Number aqui pela página —
// mesmo princípio de DashboardCategoryChart: nunca um bigint a atravessar
// para o cliente, nunca um cálculo novo aqui, só desenho.
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface CashflowChartPoint {
  label: string;
  income: number;
  expense: number;
}

export function CashflowChart({ points, currency }: { points: CashflowChartPoint[]; currency: string }) {
  if (points.length === 0) return null;

  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer>
        <BarChart data={points} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis hide />
          <Tooltip
            cursor={{ fill: "var(--color-surface-hover)" }}
            contentStyle={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "var(--color-foreground)" }}
            formatter={(value, name) => [`${Number(value).toLocaleString("pt-CV")} ${currency}`, name === "income" ? "Receitas" : "Despesas"]}
          />
          <Bar dataKey="income" fill="var(--color-success)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="expense" fill="var(--color-danger)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
