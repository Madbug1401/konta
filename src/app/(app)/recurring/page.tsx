import { RecurringTransactionCard } from "@/components/recurring-transaction-card";
import { RecurringTransactionForm } from "@/components/recurring-transaction-form";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionUser } from "@/lib/auth/session";
import { listAccounts } from "@/lib/db/accounts";
import { listCategories } from "@/lib/db/categories";
import { listRecurringTransactions } from "@/lib/db/recurring-transactions";

export default async function RecurringTransactionsPage() {
  const session = await getSessionUser();
  const [allAccounts, categories, series] = await Promise.all([
    listAccounts(session!.userId),
    listCategories(session!.userId),
    listRecurringTransactions(session!.userId),
  ]);
  // [Fase 3 — arquivar/encerrar] Mesma regra já aplicada em Transações/
  // Dívidas/Metas: uma conta arquivada não aparece como opção para uma
  // recorrência nova.
  const accounts = allAccounts.filter((a) => !a.isArchived);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Recorrências</h1>
        {accounts.length > 0 && <RecurringTransactionForm accounts={accounts} categories={categories} />}
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          title="Precisas de pelo menos uma conta"
          description="Cria primeiro uma conta em Contas — é de lá que sai (ou entra) o dinheiro de cada ocorrência gerada."
        />
      ) : series.length === 0 ? (
        <EmptyState
          title="Ainda não tens recorrências"
          description="Cria uma renda, subscrição ou salário recorrente para deixar de o registar à mão todos os meses."
          action={<RecurringTransactionForm accounts={accounts} categories={categories} />}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {series.map((s) => (
            <RecurringTransactionCard
              key={s.id}
              id={s.id}
              type={s.type}
              description={s.description}
              amountMinor={s.amountMinor}
              currency={s.currency}
              frequency={s.frequency}
              interval={s.interval}
              nextRunDate={s.nextRunDate}
              occurrencesGenerated={s.occurrencesGenerated}
              occurrencesTotal={s.occurrencesTotal}
              isActive={s.isActive}
            />
          ))}
        </div>
      )}
    </div>
  );
}
