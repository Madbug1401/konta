import { MoneyDisplay } from "@/components/money-display";
import { Badge } from "@/components/ui/badge";
import type { TransactionType } from "@/lib/financial-engine";

const TYPE_LABEL: Record<TransactionType, string> = {
  INCOME: "Receita",
  EXPENSE: "Despesa",
  TRANSFER: "Transferência",
};

const TYPE_TONE: Record<TransactionType, "success" | "danger" | "info"> = {
  INCOME: "success",
  EXPENSE: "danger",
  TRANSFER: "info",
};

export interface TransactionItemProps {
  description: string;
  date: string;
  type: TransactionType;
  amountMinor: bigint;
  currency: string;
  categoryName?: string | null;
}

// [Regra 11 do briefing / bug de XSS da auditoria] `description` chega
// diretamente do utilizador e é renderizada aqui como children do JSX — o
// React escapa automaticamente qualquer HTML/script nesse texto (não há
// nenhum dangerouslySetInnerHTML nesta aplicação). É a substituição direta do
// `tr.innerHTML = ...${e.title}...` do protótipo antigo, que era vulnerável.
export function TransactionItem({ description, date, type, amountMinor, currency, categoryName }: TransactionItemProps) {
  const signedAmount = type === "EXPENSE" ? -amountMinor : type === "TRANSFER" ? amountMinor : amountMinor;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{description}</p>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{date}</span>
          <Badge tone={TYPE_TONE[type]}>{TYPE_LABEL[type]}</Badge>
          {categoryName ? <Badge tone="neutral">{categoryName}</Badge> : null}
        </div>
      </div>
      <MoneyDisplay amountMinor={signedAmount} currency={currency} showSign size="md" />
    </div>
  );
}
