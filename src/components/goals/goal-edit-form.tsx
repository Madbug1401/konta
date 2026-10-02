"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast-provider";
import { getCurrencyDecimalPlaces } from "@/lib/currencies";
import { fromMinor, toMinor } from "@/lib/financial-engine/money";

export interface GoalEditFormProps {
  goalId: string;
  initialValues: { name: string; description: string | null; targetAmountMinor: number; targetDate: string | null; currency: string };
}

// [Fase 2 — editar Meta] `linkedAccountId` não aparece aqui de propósito —
// ver o comentário junto a `updateGoal` em src/lib/db/goals.ts. `currency`
// também não é editável (mesma regra de Account.currency) — só chega aqui
// para converter o valor para a representação decimal correta.
export function GoalEditForm({ goalId, initialValues }: GoalEditFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(initialValues.name);
  const [description, setDescription] = useState(initialValues.description ?? "");
  const [targetAmount, setTargetAmount] = useState(() => fromMinor(BigInt(initialValues.targetAmountMinor), initialValues.currency));
  const [targetDate, setTargetDate] = useState(initialValues.targetDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const decimalPlaces = getCurrencyDecimalPlaces(initialValues.currency);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    let targetAmountMinorBig: bigint;
    try {
      targetAmountMinorBig = toMinor(targetAmount, initialValues.currency);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Valor inválido.");
      return;
    }
    if (targetAmountMinorBig <= 0n) {
      setError("Indica um valor maior que zero.");
      return;
    }
    const targetAmountMinor = Number(targetAmountMinorBig);

    setLoading(true);
    try {
      const res = await fetch(`/api/goals/${goalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          targetAmountMinor,
          targetDate: targetDate || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível guardar as alterações.");
        return;
      }
      toast.success("Meta atualizada.");
      router.push("/goals");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="text-xs font-medium text-muted-foreground">
          Nome da meta
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus className="mt-1" />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Descrição (opcional)
          <Input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          {`Valor alvo (${initialValues.currency})`}
          <Input
            type="number"
            inputMode="decimal"
            min={decimalPlaces > 0 ? 0.01 : 1}
            step={decimalPlaces > 0 ? 10 ** -decimalPlaces : 1}
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            required
            className="mt-1"
          />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Data alvo (opcional)
          <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="mt-1" />
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? "A guardar..." : "Guardar alterações"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.push("/goals")}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
