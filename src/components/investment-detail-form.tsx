"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast-provider";

export interface InvestmentDetailFormProps {
  accountId: string;
  mode: "create" | "edit";
  initialValues?: { investmentType: string; expectedReturnRate: number | null; maturityDate: string | null };
}

// [Fase 5 — Investimentos] Passo à parte da criação da própria conta de
// propósito (ver plano) — nem toda conta precisa de `investmentType`, só as
// de tipo INVESTMENT, e só depois de já existirem.
export function InvestmentDetailForm({ accountId, mode, initialValues }: InvestmentDetailFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [investmentType, setInvestmentType] = useState(initialValues?.investmentType ?? "");
  const [expectedReturnRate, setExpectedReturnRate] = useState(
    initialValues?.expectedReturnRate !== null && initialValues?.expectedReturnRate !== undefined ? String(initialValues.expectedReturnRate) : "",
  );
  const [maturityDate, setMaturityDate] = useState(initialValues?.maturityDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}/investment-detail`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investmentType,
          expectedReturnRate: expectedReturnRate ? Number(expectedReturnRate) : null,
          maturityDate: maturityDate || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível guardar o investimento.");
        return;
      }
      toast.success(mode === "create" ? "Detalhe de investimento criado." : "Detalhe de investimento atualizado.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="text-xs font-medium text-muted-foreground">
          Tipo de investimento
          <Input
            placeholder="Ex: Ações, Títulos, Fundo"
            value={investmentType}
            onChange={(e) => setInvestmentType(e.target.value)}
            required
            autoFocus
            className="mt-1"
          />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Retorno anual esperado, % (opcional, informativo)
          <Input
            type="number"
            step="0.001"
            min={0}
            placeholder="Ex: 6.5"
            value={expectedReturnRate}
            onChange={(e) => setExpectedReturnRate(e.target.value)}
            className="mt-1"
          />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Data de vencimento (opcional)
          <Input type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} className="mt-1" />
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" disabled={loading}>
          {loading ? "A guardar..." : mode === "create" ? "Criar detalhe de investimento" : "Guardar alterações"}
        </Button>
      </form>
    </Card>
  );
}
