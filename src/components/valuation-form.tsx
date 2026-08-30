"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast-provider";

// [Fase 5 — Investimentos] Cada submissão cria uma InvestmentValuation
// NOVA — nunca edita nem apaga uma antiga (ver comentário em
// src/lib/db/investments.ts). Registar uma avaliação errada por engano
// corrige-se registando uma nova avaliação correta, nunca editando a
// anterior — mesma filosofia de "nunca alterar um registo passado" já
// usada no resto do projeto.
export function ValuationForm({ accountId }: { accountId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const valueMinor = Number(value);
    if (!Number.isInteger(valueMinor) || valueMinor < 0) {
      setError("Indica um valor inteiro maior ou igual a zero (em CVE).");
      return;
    }

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
        Valor de mercado (CVE)
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          placeholder="Ex: 150000"
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
