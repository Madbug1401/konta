import { Target } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyDisplay } from "@/components/money-display";
import type { GoalStatus } from "@/lib/financial-engine";

export interface GoalCardProps {
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
  // A barra nunca ultrapassa 100% visualmente, mesmo que o texto ao lado
  // (progressPercent, sem limite) já mostre "132%" quando a meta foi
  // superada — a barra cheia comunica "atingida", o número exato fica no
  // texto.
  const barWidth = Math.max(0, Math.min(100, progressPercent));

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
        <span className="rounded-full bg-surface-hover px-2 py-1 text-xs font-medium text-muted-foreground">
          {STATUS_LABEL[status]}
        </span>
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
    </Card>
  );
}
