import { AccountForm } from "@/components/account-form";
import { TransactionForm } from "@/components/transaction-form";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionUser } from "@/lib/auth/session";
import { listAccounts } from "@/lib/db/accounts";
import { listCategories } from "@/lib/db/categories";
import { listGoals } from "@/lib/db/goals";

export default async function NewTransactionPage() {
  const session = await getSessionUser();
  const [allAccounts, categories, goals] = await Promise.all([
    listAccounts(session!.userId),
    listCategories(session!.userId),
    listGoals(session!.userId),
  ]);
  // [Fase 3 — arquivar/encerrar] Uma conta arquivada nunca é oferecida como
  // origem/destino de um movimento novo — a rota já rejeita isto a sério
  // (ver src/app/api/transactions/route.ts), aqui é só não a mostrar.
  const accounts = allAccounts.filter((a) => !a.isArchived);

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
        <TransactionForm accounts={accounts} categories={categories} goals={goals} mode="create" />
      )}
    </div>
  );
}
