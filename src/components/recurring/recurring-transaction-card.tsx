"use client";

import { Repeat } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  RecurringTransactionForm,
  type RecurringTransactionFormAccount,
  type RecurringTransactionFormCategory,
} from "@/components/recurring/recurring-transaction-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyDisplay } from "@/components/money-display";
import { useToast } from "@/components/toast-provider";
import type { RecurrenceFrequency, TransactionType } from "@/lib/financial-engine";

const TYPE_LABEL: Record<TransactionType, string> = { INCOME: "Receita", EXPENSE: "Despesa", TRANSFER: "Transferência" };
const TYPE_TONE: Record<TransactionType, "success" | "danger" | "info"> = { INCOME: "success", EXPENSE: "danger", TRANSFER: "info" };
const FREQUENCY_LABEL: Record<RecurrenceFrequency, string> = { DAILY: "dia(s)", WEEKLY: "semana(s)", MONTHLY: "mês(es)", YEARLY: "ano(s)" };

export interface RecurringTransactionCardProps {
  id: string;
  type: TransactionType;
  accountId: string;
  destinationAccountId: string | null;
  categoryId: string | null;
  description: string;
  amountMinor: bigint;
  currency: string;
  frequency: RecurrenceFrequency;
  interval: number;
  startDate: string;
  endDate: string | null;
  nextRunDate: string;
  occurrencesGenerated: number;
  occurrencesTotal: number | null;
  isActive: boolean;
  accounts: RecurringTransactionFormAccount[];
  categories: RecurringTransactionFormCategory[];
  // [Task 3] Só preenchido quando já é uma série de transferência entre
  // moedas diferentes.
  exchangeRate: string | null;
}

// [Fase 4 — Recorrências] Pausar/retomar (PATCH .../[id]) é reversível a
// qualquer momento — mesmo botão faz as duas coisas, sem window.confirm
// (mesma filosofia de arquivar uma Conta na Fase 3, baixo risco).
//
// [Task 1 — editar/eliminar] "Editar" troca o cartão pelo formulário inline
// (mesmo RecurringTransactionForm da criação, em mode="edit" — nunca um
// componente novo a duplicar a validação). "Eliminar" usa window.confirm,
// mesmo padrão já usado em todo o resto da app para eliminações
// irreversíveis (ver AccountDeleteButton) — nunca um diálogo novo inventado
// só para aqui.
export function RecurringTransactionCard({
  id,
  type,
  accountId,
  destinationAccountId,
  categoryId,
  description,
  amountMinor,
  currency,
  frequency,
  interval,
  startDate,
  endDate,
  nextRunDate,
  occurrencesGenerated,
  occurrencesTotal,
  isActive,
  accounts,
  categories,
  exchangeRate,
}: RecurringTransactionCardProps) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);

  async function handleToggle() {
    setLoading(true);
    try {
      const res = await fetch(`/api/recurring-transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Não foi possível atualizar a recorrência.");
        return;
      }
      toast.success(isActive ? "Recorrência pausada." : "Recorrência retomada.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Eliminar esta recorrência definitivamente? As transações já geradas por ela ficam — só a série deixa de existir. Esta ação não pode ser desfeita.")) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/recurring-transactions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Não foi possível eliminar a recorrência.");
        return;
      }
      toast.success("Recorrência eliminada.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (editing) {
    return (
      <RecurringTransactionForm
        accounts={accounts}
        categories={categories}
        mode="edit"
        recurringTransactionId={id}
        initialValues={{
          type,
          accountId,
          destinationAccountId,
          amountMinor: Number(amountMinor),
          categoryId,
          description,
          frequency,
          interval,
          startDate,
          endDate,
          exchangeRate,
        }}
        onSaved={() => setEditing(false)}
        onCancelEdit={() => setEditing(false)}
      />
    );
  }

  return (
    <Card className="flex flex-col gap-3" style={{ opacity: isActive ? 1 : 0.6 }}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Repeat className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <CardTitle className="text-foreground">{description}</CardTitle>
        </div>
        <Badge tone={TYPE_TONE[type]}>{TYPE_LABEL[type]}</Badge>
      </CardHeader>

      <MoneyDisplay amountMinor={amountMinor} currency={currency} size="lg" />

      <p className="text-xs text-muted-foreground">
        A cada {interval > 1 ? `${interval} ` : ""}
        {FREQUENCY_LABEL[frequency]}
        {isActive ? ` · próxima em ${nextRunDate}` : " · em pausa"}
        {occurrencesTotal !== null ? ` · ${occurrencesGenerated}/${occurrencesTotal} geradas` : ` · ${occurrencesGenerated} geradas`}
      </p>

      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)} disabled={loading}>
          Editar
        </Button>
        <Button size="sm" variant="ghost" onClick={handleDelete} disabled={loading} className="text-danger hover:bg-danger/10">
          {loading ? "..." : "Eliminar"}
        </Button>
        <Button size="sm" variant="secondary" onClick={handleToggle} disabled={loading}>
          {loading ? "..." : isActive ? "Pausar" : "Retomar"}
        </Button>
      </div>
    </Card>
  );
}
