import { DebtCard } from "@/components/debt-card";
import { DebtForm } from "@/components/debt-form";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionUser } from "@/lib/auth/session";
import { listAccounts } from "@/lib/db/accounts";
import { listDebts } from "@/lib/db/debts";
import { listAllTransactionsForBalances } from "@/lib/db/transactions";
import { findUserById } from "@/lib/db/users";
import { getDebtRemaining, getOverdueInstallments, getTodayInTimezone } from "@/lib/financial-engine";

export default async function DebtsPage() {
  const session = await getSessionUser();
  const [user, accounts, debts, transactions] = await Promise.all([
    findUserById(session!.userId),
    listAccounts(session!.userId),
    listDebts(session!.userId),
    listAllTransactionsForBalances(session!.userId),
  ]);
  const today = getTodayInTimezone(user?.timezone ?? "Atlantic/Cape_Verde");
  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Dívidas</h1>
        {accounts.length > 0 && <DebtForm />}
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          title="Precisas de pelo menos uma conta"
          description="Cria primeiro uma conta em Contas — é de lá que sai o dinheiro quando marcares uma parcela como paga."
        />
      ) : debts.length === 0 ? (
        <EmptyState
          title="Ainda não tens dívidas registadas"
          description="Regista um empréstimo ou financiamento para acompanhares o plano de parcelas e o saldo em falta."
          action={<DebtForm />}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {debts.map((debt) => {
            const overdueIds = new Set(getOverdueInstallments(debt.installments, today).map((i) => i.id));
            return (
              <DebtCard
                key={debt.id}
                debtId={debt.id}
                creditorName={debt.creditorName}
                description={debt.description}
                currency={debt.currency}
                status={debt.status}
                remainingMinor={getDebtRemaining(debt, transactions)}
                installments={debt.installments.map((i) => ({ ...i, isOverdue: overdueIds.has(i.id) }))}
                accounts={accountOptions}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
