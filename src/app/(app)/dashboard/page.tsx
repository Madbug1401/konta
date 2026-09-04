import { AccountCard } from "@/components/account-card";
import { AccountForm } from "@/components/account-form";
import { DashboardCategoryChart } from "@/components/dashboard-category-chart";
import { FirstStepsCard } from "@/components/first-steps-card";
import { MoneyDisplay } from "@/components/money-display";
import { TransactionItem } from "@/components/transaction-item";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionUser } from "@/lib/auth/session";
import { listAccounts } from "@/lib/db/accounts";
import { listCategories } from "@/lib/db/categories";
import { listAllTransactionsForBalances, listTransactions } from "@/lib/db/transactions";
import { findUserById } from "@/lib/db/users";
import {
  getAccountBalance,
  getAvailableBalance,
  getCashflow,
  getCategoryBreakdown,
  getExpenseTotal,
  getIncomeTotal,
  getMonthBounds,
  getNetWorth,
  getSavingsRate,
  getTodayInTimezone,
} from "@/lib/financial-engine";

// [Fase 6 — gráfico] A paleta ACCOUNT_COLORS tem exatamente 8 cores — nunca
// esticada/repetida além disso. Top 7 categorias + "Outras" (a 8ª cor) é o
// máximo que cabe sem repetir cor entre barras diferentes.
const TOP_CATEGORIES = 7;

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

  const [accounts, categories, allTransactions, recentTransactions] = await Promise.all([
    listAccounts(session!.userId),
    listCategories(session!.userId),
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

  // [Sugestão do utilizador — pedido de amigos fora de Cabo Verde] Até aqui
  // esta página assumia sempre uma única moeda (a "defaultCurrency" do
  // utilizador) e somava os saldos de TODAS as contas como se fossem a
  // mesma unidade — inofensivo enquanto só existia CVE, mas passaria a estar
  // errado assim que alguém tivesse, por exemplo, uma conta em CVE e outra
  // em EUR (o Património total mostraria um número sem significado nenhum,
  // a somar escudos com euros). Em vez de converter câmbio (o motor não faz
  // isso em lado nenhum, por decisão consciente — ver /help), cada moeda em
  // uso pelas contas não arquivadas ganha o seu próprio bloco de estatísticas,
  // nunca misturado com as outras. Sem nenhuma conta ainda, mostra-se um
  // único bloco vazio na moeda de omissão do utilizador — o mesmo
  // comportamento que esta página sempre teve.
  const currenciesInUse = Array.from(new Set(accounts.filter((a) => !a.isArchived).map((a) => a.currency))).sort();
  const currencies = currenciesInUse.length > 0 ? currenciesInUse : [user?.defaultCurrency ?? "CVE"];

  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  function buildCategoryChartItems(currency: string) {
    // [Fase 6 — gráfico] `getCategoryBreakdown` devolve bigint (MinorAmount)
    // — só se converte para Number aqui, no último passo antes de desenhar
    // (nunca antes, mesma regra já seguida por MoneyDisplay). Nomes de
    // categoria vêm de `categories` (já carregadas nesta página); sem
    // categoria (categoryId null, ex: algumas transações antigas) mostra-se
    // "Sem categoria" — nunca omitido em silêncio.
    const expenseBreakdown = [...getCategoryBreakdown(allTransactions, "EXPENSE", monthBounds, currency)].sort((a, b) =>
      b.totalMinor > a.totalMinor ? 1 : b.totalMinor < a.totalMinor ? -1 : 0,
    );
    const topCategoryItems = expenseBreakdown.slice(0, TOP_CATEGORIES).map((item) => ({
      name: item.categoryId ? (categoryNameById.get(item.categoryId) ?? "Categoria") : "Sem categoria",
      amount: Number(item.totalMinor),
    }));
    const otherCategoriesTotal = expenseBreakdown.slice(TOP_CATEGORIES).reduce((total, item) => total + item.totalMinor, 0n);
    return otherCategoriesTotal > 0n ? [...topCategoryItems, { name: "Outras", amount: Number(otherCategoriesTotal) }] : topCategoryItems;
  }

  const summaries = currencies.map((currency) => ({
    currency,
    netWorth: getNetWorth(accounts, allTransactions, today, currency),
    availableBalance: getAvailableBalance(accounts, allTransactions, today, currency),
    monthlyIncome: getIncomeTotal(allTransactions, monthBounds, currency),
    monthlyExpense: getExpenseTotal(allTransactions, monthBounds, currency),
    monthlyCashflow: getCashflow(allTransactions, monthBounds, currency),
    savingsRate: getSavingsRate(allTransactions, monthBounds, currency),
    categoryChartItems: buildCategoryChartItems(currency),
  }));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Resumo</h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("pt-CV", { day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      <FirstStepsCard hasAccounts={accounts.length > 0} hasTransactions={allTransactions.length > 0} />

      {summaries.map((s) => (
        <CurrencySummary key={s.currency} {...s} showHeading={summaries.length > 1} />
      ))}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">As tuas contas</h2>
        {/* [Fase 3 — arquivar/encerrar] O saldo total acima (netWorth/
            availableBalance) continua a somar TODAS as contas — o dinheiro
            de uma conta arquivada não desapareceu. Esta grelha é só um
            atalho visual, por isso esconde as arquivadas (a página Contas
            tem a secção dedicada para as ver e reativar). */}
        {accounts.filter((a) => !a.isArchived).length === 0 ? (
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
            {accounts.filter((a) => !a.isArchived).map((account) => (
              <AccountCard
                key={account.id}
                id={account.id}
                name={account.name}
                type={account.type}
                balanceMinor={getAccountBalance(account, allTransactions, today)}
                currency={account.currency}
                color={account.color}
                showArchiveButton={false}
                showEditButton={false}
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

// [Sugestão do utilizador — pedido de amigos fora de Cabo Verde] Um bloco de
// estatísticas por moeda em uso. Quando só há uma moeda (o caso de hoje para
// a esmagadora maioria dos utilizadores), `showHeading` vem false e este
// componente renderiza exatamente o mesmo layout que a página sempre teve —
// sem nenhum título novo a aparecer do nada. Só a partir de duas moedas em
// uso é que cada bloco ganha um pequeno cabeçalho a identificar de que moeda
// se trata, para nunca ficar ambíguo qual total pertence a qual moeda.
function CurrencySummary({
  currency,
  netWorth,
  availableBalance,
  monthlyIncome,
  monthlyExpense,
  monthlyCashflow,
  savingsRate,
  categoryChartItems,
  showHeading,
}: {
  currency: string;
  netWorth: bigint;
  availableBalance: bigint;
  monthlyIncome: bigint;
  monthlyExpense: bigint;
  monthlyCashflow: bigint;
  savingsRate: number | null;
  categoryChartItems: { name: string; amount: number }[];
  showHeading: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {showHeading ? <h2 className="text-sm font-semibold text-muted-foreground">Em {currency}</h2> : null}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Saldo disponível" amountMinor={availableBalance} currency={currency} highlight />
        <StatCard label="Património total" amountMinor={netWorth} currency={currency} />
        <StatCard label="Receitas do mês" amountMinor={monthlyIncome} currency={currency} tone="success" />
        <StatCard label="Despesas do mês" amountMinor={monthlyExpense} currency={currency} tone="danger" />
      </div>
      <Card>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Fluxo de caixa do mês</p>
        <MoneyDisplay
          amountMinor={monthlyCashflow}
          currency={currency}
          size="lg"
          className={monthlyCashflow >= 0n ? "text-success" : "text-danger"}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {savingsRate === null ? "Sem receitas registadas este mês." : `Taxa de poupança: ${savingsRate.toFixed(1)}%`}
        </p>
      </Card>
      {categoryChartItems.length > 0 && (
        <Card>
          <p className="mb-3 text-xs font-medium text-muted-foreground">Despesas por categoria este mês</p>
          <DashboardCategoryChart items={categoryChartItems} currency={currency} />
        </Card>
      )}
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
