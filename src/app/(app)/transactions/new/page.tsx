import { AccountForm } from "@/components/account-form";
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
        // [Correção — Pre-Beta Hardening, Prioridade 11] Antes só dizia para
        // ir criar uma conta na página Contas (sem link nem ação) — um beco
        // sem saída. AccountForm cria a conta aqui mesmo; ao terminar,
        // router.refresh() faz esta página (Server Component) voltar a
        // carregar accounts, que já mostra o formulário de transação.
        <EmptyState
          title="Precisas de pelo menos uma conta"
          description="Cria primeiro uma conta (ex: Carteira ou Banco) para poderes registar movimentos."
          action={<AccountForm />}
        />
      ) : (
        <TransactionForm accounts={accounts} categories={categories} mode="create" />
      )}
    </div>
  );
}
