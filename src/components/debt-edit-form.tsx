"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast-provider";

export interface DebtEditFormProps {
  debtId: string;
  initialValues: { creditorName: string; description: string | null; interestRate: number | null };
}

// [Fase 2 — editar Dívida] Só campos informativos — ver o comentário junto
// a `updateDebt` em src/lib/db/debts.ts para a razão de
// `originalAmountMinor`/`startDate`/`installmentCount`/`frequency` ficarem
// de fora (já usados para gerar o plano de parcelas persistido).
export function DebtEditForm({ debtId, initialValues }: DebtEditFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [creditorName, setCreditorName] = useState(initialValues.creditorName);
  const [description, setDescription] = useState(initialValues.description ?? "");
  const [interestRate, setInterestRate] = useState(initialValues.interestRate !== null ? String(initialValues.interestRate) : "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/debts/${debtId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creditorName,
          description: description || null,
          interestRate: interestRate ? Number(interestRate) : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível guardar as alterações.");
        return;
      }
      toast.success("Dívida atualizada.");
      router.push("/debts");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="text-xs font-medium text-muted-foreground">
          Credor
          <Input value={creditorName} onChange={(e) => setCreditorName(e.target.value)} required autoFocus className="mt-1" />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Descrição (opcional)
          <Input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Taxa de juro anual, % (opcional)
          <Input
            type="number"
            step="0.001"
            min={0}
            value={interestRate}
            onChange={(e) => setInterestRate(e.target.value)}
            className="mt-1"
          />
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? "A guardar..." : "Guardar alterações"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.push("/debts")}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
