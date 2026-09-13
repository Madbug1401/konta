"use client";

// KONTA ANALYTICS — painel "E se...?" (Milestone Analytics, secção 17 do
// pedido). Chama POST /api/analytics/simulate — a MESMA função
// (runFinancialSimulation) que a tool run_financial_simulation da Konta AI
// usa; nunca uma segunda fórmula. Puramente analítico: nunca altera dados
// reais, e o resultado separa sempre REAL de SIMULADO, nunca um número só.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface SimulationResult {
  real: { income: string; expenses: string; cashflow: string; savingsRatePercent: number | null };
  simulated: { income: string; expenses: string; cashflow: string; savingsRatePercent: number | null };
  assumptions: string[];
}

export function SimulationPanel({ categoryNames, periodPreset }: { categoryNames: string[]; periodPreset: string }) {
  const [categoryName, setCategoryName] = useState(categoryNames[0] ?? "");
  const [percent, setPercent] = useState(10);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runSimulation() {
    if (!categoryName) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analytics/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: periodPreset, input: { type: "reduce_category", categoryName, percent } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Não foi possível simular.");
        return;
      }
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  if (categoryNames.length === 0) {
    return null;
  }

  return (
    <Card>
      <p className="mb-3 text-sm font-semibold text-foreground">E se…?</p>
      <p className="mb-3 text-xs text-muted-foreground">
        Simulação — nunca altera os teus dados reais. Reduz uma categoria de despesa e vê o impacto estimado no cash flow.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="sim-category" className="text-xs text-muted-foreground">
            Categoria
          </label>
          <select
            id="sim-category"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm"
          >
            {categoryNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="sim-percent" className="text-xs text-muted-foreground">
            Reduzir em (%)
          </label>
          <input
            id="sim-percent"
            type="number"
            min={1}
            max={100}
            value={percent}
            onChange={(e) => setPercent(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
            className="h-9 w-20 rounded-lg border border-border bg-surface px-2 text-sm"
          />
        </div>
        <Button type="button" size="sm" onClick={() => void runSimulation()} disabled={loading}>
          {loading ? "A simular..." : "Simular"}
        </Button>
      </div>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      {result && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SimResultBlock label="Despesas (real)" value={result.real.expenses} />
          <SimResultBlock label="Despesas (simulado)" value={result.simulated.expenses} highlight />
          <SimResultBlock label="Cash flow (real)" value={result.real.cashflow} />
          <SimResultBlock label="Cash flow (simulado)" value={result.simulated.cashflow} highlight />
        </div>
      )}
      {result && (
        <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          {result.assumptions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SimResultBlock({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-border p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={highlight ? "text-sm font-semibold text-primary" : "text-sm font-medium text-foreground"}>{value}</p>
    </div>
  );
}
