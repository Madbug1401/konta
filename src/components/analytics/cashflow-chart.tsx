"use client";

// KONTA ANALYTICS — gráfico de evolução de receitas/despesas (Milestone
// Analytics). Client leaf alimentado por dados já calculados no servidor
// (CashflowAnalysis.buckets, já convertidos para Number aqui pela página —
// mesmo princípio de DashboardCategoryChart: nunca um cálculo novo aqui,
// só desenho.
//
// [Secção 7 do pedido — drill-down "clicar num período"] Cada ponto já traz
// o `href` completo (calculado no servidor, onde `resolvePeriod`/
// `href()` vivem — uma função não pode atravessar a fronteira servidor→
// cliente) para o período exato desse bucket; clicar numa barra navega para
// lá via router, mesmo mecanismo de qualquer outro link da página.
import { useRouter } from "next/navigation";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface CashflowChartPoint {
  label: string;
  income: number;
  expense: number;
  href: string;
}

export function CashflowChart({ points, currency }: { points: CashflowChartPoint[]; currency: string }) {
  const router = useRouter();
  if (points.length === 0) return null;

  function handleBarClick(point: unknown) {
    const href = (point as CashflowChartPoint | undefined)?.href;
    if (href) router.push(href);
  }

  return (
    <div>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={points} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis hide />
            <Tooltip
              cursor={{ fill: "var(--color-surface-hover)" }}
              contentStyle={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "var(--color-foreground)" }}
              itemStyle={{ color: "var(--color-foreground)" }}
              formatter={(value, name) => [`${Number(value).toLocaleString("pt-CV")} ${currency}`, name === "income" ? "Receitas" : "Despesas"]}
            />
            <Bar dataKey="income" fill="var(--color-success)" radius={[3, 3, 0, 0]} className="cursor-pointer" onClick={handleBarClick} />
            <Bar dataKey="expense" fill="var(--color-danger)" radius={[3, 3, 0, 0]} className="cursor-pointer" onClick={handleBarClick} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-center text-[11px] text-muted-foreground">Clica numa barra para veres esse período em detalhe.</p>
    </div>
  );
}
