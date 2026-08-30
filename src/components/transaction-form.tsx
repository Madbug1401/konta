"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { TransactionType } from "@/lib/financial-engine";

export interface TransactionFormAccount {
  id: string;
  name: string;
}
export interface TransactionFormCategory {
  id: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
}
export interface TransactionFormGoal {
  id: string;
  name: string;
}

export interface TransactionFormProps {
  accounts: TransactionFormAccount[];
  categories: TransactionFormCategory[];
  // [Correção — implementação da interface de Metas] Opcional e só
  // relevante na criação (ver comentário junto ao <select> abaixo) — omitir
  // esta prop (ex: no modo "edit") simplesmente não mostra o campo.
  goals?: TransactionFormGoal[];
  mode: "create" | "edit";
  transactionId?: string;
  initialValues?: {
    type: TransactionType;
    accountId: string;
    destinationAccountId?: string | null;
    amountMinor: number;
    categoryId?: string | null;
    description: string;
    date: string;
  };
}

// [Regra 14 do briefing — "Adicionar transação" é especialmente importante em
// mobile] Este formulário é o mesmo em todos os tamanhos de ecrã: campos
// grandes (min-h-11, ver globals.css), um único botão de ação primária no
// fundo, sem passos extra. É usado tal e qual em /transactions/new e em
// /transactions/[id]/edit — a mesma lógica de validação/submissão serve as
// duas telas, evitando duas implementações a divergir.
export function TransactionForm({ accounts, categories, goals = [], mode, transactionId, initialValues }: TransactionFormProps) {
  const router = useRouter();
  const [type, setType] = useState<TransactionType>(initialValues?.type ?? "EXPENSE");
  const [accountId, setAccountId] = useState(initialValues?.accountId ?? accounts[0]?.id ?? "");
  const [destinationAccountId, setDestinationAccountId] = useState(initialValues?.destinationAccountId ?? "");
  const [amount, setAmount] = useState(initialValues ? String(initialValues.amountMinor) : "");
  const [categoryId, setCategoryId] = useState(initialValues?.categoryId ?? "");
  const [goalId, setGoalId] = useState("");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [date, setDate] = useState(initialValues?.date ?? new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const relevantCategories = categories.filter((c) => c.kind === type);

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

    setLoading(true);
    try {
      const payload =
        mode === "create"
          ? {
              type,
              accountId,
              destinationAccountId: type === "TRANSFER" ? destinationAccountId : undefined,
              amountMinor,
              categoryId: type === "TRANSFER" ? undefined : categoryId || undefined,
              description,
              date,
              goalId: goalId || undefined,
            }
          : { amountMinor, categoryId: categoryId || undefined, description, date };

      const res = await fetch(mode === "create" ? "/api/transactions" : `/api/transactions/${transactionId}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível guardar a transação.");
        return;
      }
      router.push("/transactions");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mx-auto max-w-lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {mode === "create" && (
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
        )}

        <label className="text-xs font-medium text-muted-foreground">
          {type === "TRANSFER" ? "Conta de origem" : "Conta"}
          <select
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            disabled={mode === "edit"}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        {type === "TRANSFER" && mode === "create" && (
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
          </label>
        )}

        {mode === "create" && goals.length > 0 && (
          // [Correção — implementação da interface de Metas] Só um rótulo
          // opcional para análise de ritmo de contribuição
          // (calculateGoalProjection) — o progresso real da meta vem sempre
          // do saldo da conta ligada, nunca deste campo. Por isso só
          // aparece na criação (editar isto depois não teria efeito no
          // progresso, seria confuso oferecer a opção em "editar").
          <label className="text-xs font-medium text-muted-foreground">
            Meta associada (opcional)
            <select
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
            >
              <option value="">Nenhuma</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="text-xs font-medium text-muted-foreground">
          Descrição
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Supermercado" required />
        </label>

        <label className="text-xs font-medium text-muted-foreground">
          Data
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <Button type="submit" disabled={loading} size="lg">
          {loading ? "A guardar..." : mode === "create" ? "Adicionar transação" : "Guardar alterações"}
        </Button>
      </form>
    </Card>
  );
}
