import { TransactionForm } from "@/components/transaction-form";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionUser } from "@/lib/auth/session";
import { listAccounts } from "@/lib/db/accounts";
import { listCategories } from "@/lib/db/categories";

export default async function NewTransactionPage() {
  const session = await getSessionUser();
  const [accounts, categories] = await Promise.all([listAccounts(session!.userId), listCategories(session!.userId)]);

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-xl font-bold text-foreground">Nova transação</h1>
      {accounts.length === 0 ? (
        <EmptyState
          title="Precisas de pelo menos uma conta"
          description="Cria primeiro uma conta (ex: Carteira ou Banco) na página Contas para poderes registar movimentos."
        />
      ) : (
        <TransactionForm accounts={accounts} categories={categories} mode="create" />
      )}
    </div>
  );
}
