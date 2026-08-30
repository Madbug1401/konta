"use client";

import { Landmark } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyDisplay } from "@/components/money-display";
import type { DebtStatus, InstallmentStatus } from "@/lib/financial-engine";

export interface DebtCardInstallment {
  id: string;
  sequence: number;
  dueDate: string;
  amountMinor: bigint;
  status: InstallmentStatus;
  isOverdue: boolean;
}

export interface DebtCardProps {
  debtId: string;
  creditorName: string;
  description: string | null;
  currency: string;
  status: DebtStatus;
  remainingMinor: bigint;
  installments: DebtCardInstallment[];
  accounts: { id: string; name: string }[];
}

const STATUS_LABEL: Record<DebtStatus, string> = {
  ACTIVE: "Ativa",
  PAID_OFF: "Paga",
  DEFAULTED: "Em incumprimento",
};

export function DebtCard({ debtId, creditorName, description, currency, status, remainingMinor, installments, accounts }: DebtCardProps) {
  return (
    <Card className="flex flex-col gap-3">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <div>
            <CardTitle className="text-foreground">{creditorName}</CardTitle>
            {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        <span className="rounded-full bg-surface-hover px-2 py-1 text-xs font-medium text-muted-foreground">
          {STATUS_LABEL[status]}
        </span>
      </CardHeader>

      <div>
        <p className="text-xs text-muted-foreground">Saldo em falta</p>
        <MoneyDisplay amountMinor={remainingMinor} currency={currency} size="lg" />
      </div>

      {installments.length > 0 && (
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {installments.map((installment) => (
            <InstallmentRow
              key={installment.id}
              debtId={debtId}
              installment={installment}
              currency={currency}
              accounts={accounts}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function InstallmentRow({
  debtId,
  installment,
  currency,
  accounts,
}: {
  debtId: string;
  installment: DebtCardInstallment;
  currency: string;
  accounts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [payingOpen, setPayingOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay() {
    if (!accountId) {
      setError("Escolhe a conta de onde sai o dinheiro.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/debts/${debtId}/installments/${installment.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível registar o pagamento.");
        return;
      }
      setPayingOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">#{installment.sequence}</span>
          <span className="text-foreground">{installment.dueDate}</span>
          {installment.status === "PENDING" && installment.isOverdue && (
            <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">Atrasada</span>
          )}
          {installment.status === "PAID" && (
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">Paga</span>
          )}
        </div>
        <MoneyDisplay amountMinor={installment.amountMinor} currency={currency} size="sm" />
      </div>

      {installment.status === "PENDING" && (
        <>
          {payingOpen ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={handlePay} disabled={loading}>
                {loading ? "A pagar..." : "Confirmar"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPayingOpen(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setPayingOpen(true)} disabled={accounts.length === 0}>
              Marcar como paga
            </Button>
          )}
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </>
      )}
    </div>
  );
}
