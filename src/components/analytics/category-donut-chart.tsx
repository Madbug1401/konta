"use client";

// KONTA ANALYTICS — distribuição de categorias em donut (Milestone
// Analytics, expansão). Complementa a tabela de categorias com uma leitura
// visual imediata de "para onde vai o dinheiro" — mesma paleta de sempre
// (ACCOUNT_COLORS), clicar numa fatia abre o drill-down dessa categoria
// (mesmo destino da linha correspondente na tabela, `href` calculado no
// servidor).
import { useRouter } from "next/navigation";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ACCOUNT_COLORS } from "@/lib/account-colors";

export interface CategoryDonutSlice {
  name: string;
  value: number;
  href: string;
}

export function CategoryDonutChart({ slices, currency }: { slices: CategoryDonutSlice[]; currency: string }) {
  const router = useRouter();
  if (slices.length === 0) return null;

  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer>
        <PieChart>
          <Tooltip
            contentStyle={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "var(--color-foreground)" }}
            itemStyle={{ color: "var(--color-foreground)" }}
            formatter={(value) => [`${Number(value).toLocaleString("pt-CV")} ${currency}`, ""]}
          />
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius="55%"
            outerRadius="85%"
            paddingAngle={2}
            className="cursor-pointer"
            onClick={(entry) => {
              const href = (entry as unknown as CategoryDonutSlice)?.href;
              if (href) router.push(href);
            }}
          >
            {slices.map((slice, index) => (
              <Cell key={slice.name} fill={ACCOUNT_COLORS[index % ACCOUNT_COLORS.length].hex} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
