"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast-provider";
import { getCurrencyDecimalPlaces } from "@/lib/currencies";
import { toMinor } from "@/lib/financial-engine/money";

// [Fase 5 — Investimentos] Cada submissão cria uma InvestmentValuation
// NOVA — nunca edita nem apaga uma antiga (ver comentário em
// src/lib/db/investments.ts). Registar uma avaliação errada por engano
// corrige-se registando uma nova avaliação correta, nunca editando a
// anterior — mesma filosofia de "nunca alterar um registo passado" já
// usada no resto do projeto.
export function ValuationForm({ accountId, currency }: { accountId: string; currency: string }) {
  const router = useRouter();
  const toast = useToast();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const decimalPlaces = getCurrencyDecimalPlaces(currency);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    let valueMinorBig: bigint;
    try {
      valueMinorBig = toMinor(value, currency);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Valor inválido.");
      return;
    }
    if (valueMinorBig < 0n) {
      setError("Indica um valor maior ou igual a zero.");
      return;
    }
    const valueMinor = Number(valueMinorBig);

    setLoading(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}/valuations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, valueMinor }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível registar a avaliação.");
        return;
      }
      toast.success("Avaliação registada.");
      setValue("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <label className="text-xs font-medium text-muted-foreground">
        Data
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="mt-1" />
      </label>
      <label className="text-xs font-medium text-muted-foreground">
        {`Valor de mercado (${currency})`}
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step={decimalPlaces > 0 ? 10 ** -decimalPlaces : 1}
          placeholder={decimalPlaces > 0 ? "Ex: 1500.00" : "Ex: 150000"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
          className="mt-1"
        />
      </label>
      <Button type="submit" disabled={loading}>
        {loading ? "A registar..." : "Registar avaliação"}
      </Button>
      {error ? <p className="w-full text-sm text-danger">{error}</p> : null}
    </form>
  );
}
