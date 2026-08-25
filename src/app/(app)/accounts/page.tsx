import { AccountCard } from "@/components/account-card";
import { AccountForm } from "@/components/account-form";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionUser } from "@/lib/auth/session";
import { listAccounts } from "@/lib/db/accounts";
import { listAllTransactionsForBalances } from "@/lib/db/transactions";
import { getAccountBalance } from "@/lib/financial-engine";

export default async function AccountsPage() {
  const session = await getSessionUser();
  const [accounts, transactions] = await Promise.all([
    listAccounts(session!.userId),
    listAllTransactionsForBalances(session!.userId),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Contas</h1>
        <AccountForm />
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          title="Ainda não tens contas"
          description="Cria a tua carteira, conta bancária, poupança ou cofre de emergência para começares."
        />
      ) : (
        <div className="flex flex-wrap gap-3 sm:gap-4">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              name={account.name}
              type={account.type}
              balanceMinor={getAccountBalance(account, transactions)}
              currency={account.currency}
            />
          ))}
        </div>
      )}
    </div>
  );
}
