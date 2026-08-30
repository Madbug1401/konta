"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CategoryQuickCreate, type CreatedCategory } from "@/components/category-quick-create";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast-provider";
import type { RecurrenceFrequency, TransactionType } from "@/lib/financial-engine";

export interface RecurringTransactionFormAccount {
  id: string;
  name: string;
}
export interface RecurringTransactionFormCategory {
  id: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
}

const FREQUENCY_OPTIONS: { value: RecurrenceFrequency; label: string }[] = [
  { value: "DAILY", label: "Diária" },
  { value: "WEEKLY", label: "Semanal" },
  { value: "MONTHLY", label: "Mensal" },
  { value: "YEARLY", label: "Anual" },
];

// [Fase 4 — Recorrências] Reaproveita o seletor de tipo/conta/categoria já
// usado em transaction-form.tsx (mesmo padrão visual, mesma lógica de
// "categoria só faz sentido fora de TRANSFER") — os campos extra aqui
// (frequência, intervalo, data de início, fim opcional) são só a "receita"
// que o materializador (src/lib/db/recurring-transactions.ts) usa depois
// para gerar as Transactions reais, uma a uma, na leitura.
export function RecurringTransactionForm({
  accounts,
  categories,
}: {
  accounts: RecurringTransactionFormAccount[];
  categories: RecurringTransactionFormCategory[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [type, setType] = useState<TransactionType>("EXPENSE");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categoryList, setCategoryList] = useState(categories);
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState<RecurrenceFrequency>("MONTHLY");
  const [interval, setInterval] = useState("1");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const relevantCategories = categoryList.filter((c) => c.kind === type);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const amountMinor = Number(amount);
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      setError("Indica um valor inteiro maior que zero (em CVE).");
      return;
    }
    if (type === "TRANSFER" && !destinationAccountId) {
      setError("Escolhe a conta de destino da transferência.");
      return;
    }
    if (type === "TRANSFER" && destinationAccountId === accountId) {
      setError("A conta de destino tem de ser diferente da conta de origem.");
      return;
    }
    const intervalValue = Number(interval);
    if (!Number.isInteger(intervalValue) || intervalValue < 1) {
      setError("O intervalo tem de ser pelo menos 1.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/recurring-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          accountId,
          destinationAccountId: type === "TRANSFER" ? destinationAccountId : undefined,
          amountMinor,
          categoryId: type === "TRANSFER" ? undefined : categoryId || undefined,
          description,
          frequency,
          interval: intervalValue,
          startDate,
          endDate: endDate || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível criar a recorrência.");
        return;
      }
      toast.success("Recorrência criada.");
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        + Nova recorrência
      </Button>
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          {(["EXPENSE", "INCOME", "TRANSFER"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                type === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
              }`}
            >
              {t === "EXPENSE" ? "Despesa" : t === "INCOME" ? "Receita" : "Transferência"}
            </button>
          ))}
        </div>

        <label className="text-xs font-medium text-muted-foreground">
          {type === "TRANSFER" ? "Conta de origem" : "Conta"}
          <select
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        {type === "TRANSFER" && (
          <label className="text-xs font-medium text-muted-foreground">
            Conta de destino
            <select
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              value={destinationAccountId}
              onChange={(e) => setDestinationAccountId(e.target.value)}
            >
              <option value="">Escolhe...</option>
              {accounts
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
        )}

        <label className="text-xs font-medium text-muted-foreground">
          Valor (CVE)
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Ex: 5000"
            required
            className="mt-1"
          />
        </label>

        {type !== "TRANSFER" && (
          <label className="text-xs font-medium text-muted-foreground">
            Categoria
            <select
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Sem categoria</option>
              {relevantCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <CategoryQuickCreate
              kind={type === "INCOME" ? "INCOME" : "EXPENSE"}
              onCreated={(category: CreatedCategory) => {
                setCategoryList((current) => [...current, category]);
                setCategoryId(category.id);
              }}
            />
          </label>
        )}

        <label className="text-xs font-medium text-muted-foreground">
          Descrição
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Renda" required className="mt-1" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-muted-foreground">
            Frequência
            <select
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}
            >
              {FREQUENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            A cada quantos
            <Input type="number" inputMode="numeric" min={1} step={1} value={interval} onChange={(e) => setInterval(e.target.value)} className="mt-1" />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-muted-foreground">
            Início
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className="mt-1" />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Fim (opcional)
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1" />
          </label>
        </div>

        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? "A criar..." : "Criar recorrência"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
