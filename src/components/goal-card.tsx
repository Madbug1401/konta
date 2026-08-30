"use client";

import { Pencil, Target } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyDisplay } from "@/components/money-display";
import { useToast } from "@/components/toast-provider";
import type { GoalStatus } from "@/lib/financial-engine";

export interface GoalCardProps {
  // [Fase 2 — editar Meta] Necessário para o link "Editar" abaixo — antes
  // este cartão nunca precisava de saber o próprio id.
  id: string;
  name: string;
  description: string | null;
  currency: string;
  status: GoalStatus;
  targetDate: string | null;
  currentAmountMinor: bigint;
  targetAmountMinor: bigint;
  progressPercent: number;
  projection: { estimatedCompletionDate: string | null; onTrack: boolean | null } | null;
}

const STATUS_LABEL: Record<GoalStatus, string> = {
  ACTIVE: "Ativa",
  ACHIEVED: "Alcançada",
  ABANDONED: "Abandonada",
};

export function GoalCard({
  id,
  name,
  description,
  currency,
  status,
  targetDate,
  currentAmountMinor,
  targetAmountMinor,
  progressPercent,
  projection,
}: GoalCardProps) {
  const router = useRouter();
  const toast = useToast();
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // A barra nunca ultrapassa 100% visualmente, mesmo que o texto ao lado
  // (progressPercent, sem limite) já mostre "132%" quando a meta foi
  // superada — a barra cheia comunica "atingida", o número exato fica no
  // texto.
  const barWidth = Math.max(0, Math.min(100, progressPercent));

  // [Fase 3 — arquivar/encerrar] Irreversível — a condição real (nunca
  // reabrir uma meta já encerrada) é aplicada no SQL de `updateGoalStatus`
  // (src/lib/db/goals.ts); esta função só decide o texto de confirmação.
  async function handleSetStatus(newStatus: "ACHIEVED" | "ABANDONED") {
    const confirmMessage =
      newStatus === "ACHIEVED"
        ? "Marcar esta meta como alcançada? Esta ação não pode ser revertida."
        : "Abandonar esta meta? Esta ação não pode ser revertida.";
    if (!window.confirm(confirmMessage)) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/goals/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Não foi possível atualizar a meta.");
        return;
      }
      toast.success(newStatus === "ACHIEVED" ? "Meta marcada como alcançada." : "Meta abandonada.");
      router.refresh();
    } finally {
      setUpdatingStatus(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <div>
            <CardTitle className="text-foreground">{name}</CardTitle>
            {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-surface-hover px-2 py-1 text-xs font-medium text-muted-foreground">
            {STATUS_LABEL[status]}
          </span>
          <Link
            href={`/goals/${id}/edit`}
            aria-label="Editar meta"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-hover hover:text-foreground"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </CardHeader>

      <div className="flex items-baseline justify-between">
        <MoneyDisplay amountMinor={currentAmountMinor} currency={currency} size="lg" />
        <span className="text-sm text-muted-foreground">
          de <MoneyDisplay amountMinor={targetAmountMinor} currency={currency} size="sm" />
        </span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-hover">
        <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${barWidth}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">{Math.round(progressPercent)}% concluído{targetDate ? ` · meta para ${targetDate}` : ""}</p>

      {projection && (
        <p className="text-xs text-muted-foreground">
          {projection.estimatedCompletionDate
            ? `No ritmo atual, atinges esta meta por volta de ${projection.estimatedCompletionDate}${
                projection.onTrack === false ? " — mais tarde do que a data alvo" : ""
              }.`
            : "Ainda sem contribuições suficientes para projetar uma data."}
        </p>
      )}

      {status === "ACTIVE" && (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => handleSetStatus("ABANDONED")} disabled={updatingStatus} className="text-muted-foreground">
            Abandonar
          </Button>
          <Button size="sm" variant="secondary" onClick={() => handleSetStatus("ACHIEVED")} disabled={updatingStatus}>
            {updatingStatus ? "A guardar..." : "Marcar como alcançada"}
          </Button>
        </div>
      )}
    </Card>
  );
}
