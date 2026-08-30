"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast-provider";

export interface GoalFormAccount {
  id: string;
  name: string;
}

export function GoalForm({ accounts }: { accounts: GoalFormAccount[] }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [linkedAccountId, setLinkedAccountId] = useState(accounts[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const targetAmountMinor = Number(targetAmount);
    if (!Number.isInteger(targetAmountMinor) || targetAmountMinor <= 0) {
      setError("Indica um valor inteiro maior que zero (em CVE).");
      return;
    }
    if (!linkedAccountId) {
      setError("Escolhe a conta onde vais guardar o dinheiro desta meta.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || undefined,
          targetAmountMinor,
          targetDate: targetDate || undefined,
          linkedAccountId,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível criar a meta.");
        return;
      }
      setName("");
      setDescription("");
      setTargetAmount("");
      setTargetDate("");
      toast.success("Meta criada.");
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        + Nova meta
      </Button>
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="text-xs font-medium text-muted-foreground">
          Nome da meta
          <Input
            placeholder="Ex: Fundo de emergência"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            className="mt-1"
          />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Descrição (opcional)
          <Input placeholder="Ex: 6 meses de despesas" value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Valor alvo (CVE)
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            placeholder="Ex: 300000"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            required
            className="mt-1"
          />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Conta onde vais guardar o dinheiro
          <select
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            value={linkedAccountId}
            onChange={(e) => setLinkedAccountId(e.target.value)}
            required
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Data alvo (opcional)
          <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="mt-1" />
        </label>

        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? "A criar..." : "Criar meta"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
