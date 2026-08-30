"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ACCOUNT_COLORS } from "@/lib/account-colors";

export interface CategorySpendItem {
  name: string;
  // [Regra 11 do briefing — "não invente números"] Já convertido para
  // apresentação (Number) pela página que monta este array — o mesmo
  // princípio de MoneyDisplay ("nunca antes do último passo de
  // apresentação"), nunca usado aqui para nenhum cálculo novo.
  amount: number;
}

// [Fase 6 — gráfico] Barras horizontais em vez de pizza/donut: comparar
// magnitudes de até 8 categorias por comprimento lê-se melhor do que por
// ângulo, e os nomes das categorias cabem no eixo. `getCategoryBreakdown`
// (financial-engine/cashflow.ts) já faz todo o cálculo — este componente só
// desenha. Cores vêm sempre de ACCOUNT_COLORS (mesma paleta já usada nas
// contas, uma fonte só) — nunca esticadas/repetidas além das 8 disponíveis
// (a página que monta `items` já corta ao top 7 + "Outras").
export function DashboardCategoryChart({ items, currency }: { items: CategorySpendItem[]; currency: string }) {
  if (items.length === 0) return null;

  return (
    <div style={{ width: "100%", height: Math.max(180, items.length * 40) }}>
      <ResponsiveContainer>
        <BarChart data={items} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--color-surface-hover)" }}
            contentStyle={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "var(--color-foreground)" }}
            formatter={(value) => [`${Number(value).toLocaleString("pt-CV")} ${currency}`, "Despesa"]}
          />
          <Bar dataKey="amount" radius={[0, 6, 6, 0]}>
            {items.map((item, index) => (
              <Cell key={item.name} fill={ACCOUNT_COLORS[index % ACCOUNT_COLORS.length].hex} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
