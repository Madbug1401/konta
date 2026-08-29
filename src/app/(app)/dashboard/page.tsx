import { AccountCard } from "@/components/account-card";
import { AccountForm } from "@/components/account-form";
import { MoneyDisplay } from "@/components/money-display";
import { TransactionItem } from "@/components/transaction-item";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionUser } from "@/lib/auth/session";
import { listAccounts } from "@/lib/db/accounts";
import { listAllTransactionsForBalances, listTransactions } from "@/lib/db/transactions";
import { findUserById } from "@/lib/db/users";
import {
  getAccountBalance,
  getAvailableBalance,
  getCashflow,
  getExpenseTotal,
  getIncomeTotal,
  getMonthBounds,
  getNetWorth,
  getSavingsRate,
  getTodayInTimezone,
} from "@/lib/financial-engine";

// [Regra 11 do briefing — "não invente números"] Esta página não mostra
// nenhum valor calculado no frontend a partir de dados fictícios: tudo o que
// aparece aqui vem de `src/lib/financial-engine`, alimentado pelas
// Transactions e Accounts reais do utilizador autenticado (via src/lib/db).
// Sem dados, mostram-se EmptyState — nunca um número inventado a "parecer
// completo" (regra 15 do briefing).
export default async function DashboardPage() {
  const session = await getSessionUser();
  const user = await findUserById(session!.userId);
  const timezone = user?.timezone ?? "Atlantic/Cape_Verde";
  const currency = user?.defaultCurrency ?? "CVE";

  const [accounts, allTransactions, recentTransactions] = await Promise.all([
    listAccounts(session!.userId),
    listAllTransactionsForBalances(session!.userId),
    listTransactions(session!.userId, { limit: 8 }),
  ]);

  // [Correção — bug reportado em uso real, ver DECISIONS.md] Uma transação
  // datada no futuro (ex: salário a receber só no próximo mês) não pode
  // contar já para o saldo "de hoje" — senão bastava registar um recebimento
  // futuro para o dinheiro parecer disponível antes de existir. `asOfDate`
  // já existia em getAccountBalance/getNetWorth/getAvailableBalance
  // precisamente para isto; esta página é que não o estava a usar.
  const today = getTodayInTimezone(timezone);
  const monthBounds = getMonthBounds(timezone);
  const netWorth = getNetWorth(accounts, allTransactions, today);
  const availableBalance = getAvailableBalance(accounts, allTransactions, today);
  const monthlyIncome = getIncomeTotal(allTransactions, monthBounds);
  const monthlyExpense = getExpenseTotal(allTransactions, monthBounds);
  const monthlyCashflow = getCashflow(allTransactions, monthBounds);
  const savingsRate = getSavingsRate(allTransactions, monthBounds);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Resumo</h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("pt-CV", { day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Saldo disponível" amountMinor={availableBalance} currency={currency} highlight />
        <StatCard label="Património total" amountMinor={netWorth} currency={currency} />
        <StatCard label="Receitas do mês" amountMinor={monthlyIncome} currency={currency} tone="success" />
        <StatCard label="Despesas do mês" amountMinor={monthlyExpense} currency={currency} tone="danger" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fluxo de caixa do mês</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap items-baseline gap-4">
          <MoneyDisplay amountMinor={monthlyCashflow} currency={currency} showSign size="lg" />
          <span className="text-sm text-muted-foreground">
            {savingsRate === null
              ? "Sem receitas registadas este mês para calcular a taxa de poupança."
              : `Taxa de poupança do mês: ${savingsRate.toFixed(1)}%`}
          </span>
        </div>
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">As tuas contas</h2>
        {accounts.length === 0 ? (
          // [Correção — Pre-Beta Hardening, Prioridade 11] Ao contrário da
          // página Contas, o Dashboard não tinha nenhum botão de criar conta
          // — quem chegasse aqui sem contas ficava sem ação nenhuma a seguir.
          <EmptyState
            title="Ainda não tens nenhuma conta"
            description="Cria a tua primeira conta (carteira, banco, poupança...) para começares a registar movimentos."
            action={<AccountForm />}
          />
        ) : (
          <div className="flex flex-wrap gap-3 sm:gap-4">
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                name={account.name}
                type={account.type}
                balanceMinor={getAccountBalance(account, allTransactions, today)}
                currency={account.currency}
              />
            ))}
          </div>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Últimas transações</CardTitle>
        </CardHeader>
        {recentTransactions.length === 0 ? (
          <EmptyState
            title="Ainda não há transações"
            description="Assim que registares receitas, despesas ou transferências, aparecem aqui."
          />
        ) : (
          <div>
            {recentTransactions.map((t) => (
              <TransactionItem
                key={t.id}
                description={t.description}
                date={t.date}
                type={t.type}
                amountMinor={t.amountMinor}
                currency={t.currency}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({
  label,
  amountMinor,
  currency,
  tone,
  highlight,
}: {
  label: string;
  amountMinor: bigint;
  currency: string;
  tone?: "success" | "danger";
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-primary/40" : undefined}>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
      <MoneyDisplay
        amountMinor={amountMinor}
        currency={currency}
        size="lg"
        className={tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : undefined}
      />
    </Card>
  );
}
