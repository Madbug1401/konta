import { AccountCard } from "@/components/account-card";
import { AccountForm } from "@/components/account-form";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionUser } from "@/lib/auth/session";
import { listAccounts } from "@/lib/db/accounts";
import { listAllTransactionsForBalances } from "@/lib/db/transactions";
import { findUserById } from "@/lib/db/users";
import { getAccountBalance, getTodayInTimezone } from "@/lib/financial-engine";

export default async function AccountsPage() {
  const session = await getSessionUser();
  const [user, accounts, transactions] = await Promise.all([
    findUserById(session!.userId),
    listAccounts(session!.userId),
    listAllTransactionsForBalances(session!.userId),
  ]);
  // [Correção — mesma causa do bug do dashboard] Ver DECISIONS.md: saldo
  // nunca conta transações datadas no futuro.
  const today = getTodayInTimezone(user?.timezone ?? "Atlantic/Cape_Verde");
  // [Fase 3 — arquivar/encerrar] Duas secções, nunca uma lista só: uma
  // arquivada nunca desaparece de vez (ver DELETE_POLICY.md), mas também
  // não deve competir visualmente com as contas em uso.
  const activeAccounts = accounts.filter((a) => !a.isArchived);
  const archivedAccounts = accounts.filter((a) => a.isArchived);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Contas</h1>
        <AccountForm />
      </div>

      {accounts.length === 0 ? (
        // [Correção — Pre-Beta Hardening, Prioridade 11] O botão "+ Nova
        // conta" já existe no cabeçalho acima, mas o EmptyState não repetia a
        // ação — deixando quem chega aqui sem nada a fazer dentro da própria
        // área vazia. Reutiliza o mesmo AccountForm (mesmo componente,
        // comportamento idêntico), só disponível também aqui.
        <EmptyState
          title="Ainda não tens contas"
          description="Cria a tua carteira, conta bancária, poupança ou cofre de emergência para começares."
          action={<AccountForm />}
        />
      ) : (
        <>
          {activeAccounts.length === 0 ? (
            <EmptyState
              title="Todas as tuas contas estão arquivadas"
              description="Reativa uma conta abaixo, ou cria uma nova."
              action={<AccountForm />}
            />
          ) : (
            <div className="flex flex-wrap gap-3 sm:gap-4">
              {activeAccounts.map((account) => (
                <AccountCard
                  key={account.id}
                  id={account.id}
                  name={account.name}
                  type={account.type}
                  balanceMinor={getAccountBalance(account, transactions, today)}
                  currency={account.currency}
                  color={account.color}
                  isArchived={account.isArchived}
                  showDeleteButton
                />
              ))}
            </div>
          )}

          {archivedAccounts.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-muted-foreground">Contas arquivadas</h2>
              <div className="flex flex-wrap gap-3 sm:gap-4">
                {archivedAccounts.map((account) => (
                  <AccountCard
                    key={account.id}
                    id={account.id}
                    name={account.name}
                    type={account.type}
                    balanceMinor={getAccountBalance(account, transactions, today)}
                    currency={account.currency}
                    color={account.color}
                    isArchived={account.isArchived}
                    showDeleteButton
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
