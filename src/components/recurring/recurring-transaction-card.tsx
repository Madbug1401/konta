"use client";

import { Repeat } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
  description: string;
  amountMinor: bigint;
  currency: string;
  frequency: RecurrenceFrequency;
  interval: number;
  nextRunDate: string;
  occurrencesGenerated: number;
  occurrencesTotal: number | null;
  isActive: boolean;
}

// [Fase 4 — Recorrências] Pausar/retomar (PATCH .../[id]) é reversível a
// qualquer momento — mesmo botão faz as duas coisas, sem window.confirm
// (mesma filosofia de arquivar uma Conta na Fase 3, baixo risco).
export function RecurringTransactionCard({
  id,
  type,
  description,
  amountMinor,
  currency,
  frequency,
  interval,
  nextRunDate,
  occurrencesGenerated,
  occurrencesTotal,
  isActive,
}: RecurringTransactionCardProps) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

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

      <Button size="sm" variant="secondary" onClick={handleToggle} disabled={loading} className="self-end">
        {loading ? "..." : isActive ? "Pausar" : "Retomar"}
      </Button>
    </Card>
  );
}
