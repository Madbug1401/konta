import Link from "next/link";
import { TransactionRowActions } from "@/components/transaction-row-actions";
import { MoneyDisplay } from "@/components/money-display";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionUser } from "@/lib/auth/session";
import { listAccounts } from "@/lib/db/accounts";
import { listCategories } from "@/lib/db/categories";
import { listTransactions } from "@/lib/db/transactions";
import type { TransactionType } from "@/lib/financial-engine";
import { DEFAULT_LIMIT } from "@/lib/pagination";

const TYPE_LABEL: Record<TransactionType, string> = { INCOME: "Receita", EXPENSE: "Despesa", TRANSFER: "Transferência" };
const TYPE_TONE: Record<TransactionType, "success" | "danger" | "info"> = { INCOME: "success", EXPENSE: "danger", TRANSFER: "info" };

// [Secção 12 do briefing] Página completa de histórico — corrige diretamente
// a lacuna da auditoria em que só os 10 próximos eventos eram visíveis.
// Suporta pesquisa por texto e filtro por conta, categoria, tipo e período,
// tudo via query string (?search=...&accountId=...) para funcionar mesmo sem
// JavaScript e ser diretamente partilhável/marcável como favorito.
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const session = await getSessionUser();

  // [Correção — pacote UX pós-auditoria] `limit: 100` fixo escondia
  // silenciosamente qualquer transação além da centésima, sem nenhum sinal na
  // UI de que havia mais. Em vez de `COUNT(*)` (mais uma query, só para saber
  // um número que não é usado em lado nenhum), pede-se sempre uma linha a
  // mais do que o necessário: se vier, sabemos que há próxima página, e
  // cortamos essa linha extra antes de mostrar.
  const page = Math.max(1, Math.trunc(Number(params.page)) || 1);
  const offset = (page - 1) * DEFAULT_LIMIT;

  const [accounts, categories, fetchedTransactions] = await Promise.all([
    listAccounts(session!.userId),
    listCategories(session!.userId),
    listTransactions(session!.userId, {
      accountId: params.accountId || undefined,
      categoryId: params.categoryId || undefined,
      type: (params.type as TransactionType) || undefined,
      from: params.from || undefined,
      to: params.to || undefined,
      search: params.search || undefined,
      limit: DEFAULT_LIMIT + 1,
      offset,
    }),
  ]);

  const hasNextPage = fetchedTransactions.length > DEFAULT_LIMIT;
  const transactions = hasNextPage ? fetchedTransactions.slice(0, DEFAULT_LIMIT) : fetchedTransactions;
  const hasPrevPage = page > 1;

  // Reconstrói a query string atual trocando só `page` — usado pelos links
  // Anterior/Seguinte, sem precisar de nenhum JavaScript novo no cliente.
  function pageHref(targetPage: number) {
    const qs = new URLSearchParams();
    if (params.search) qs.set("search", params.search);
    if (params.type) qs.set("type", params.type);
    if (params.accountId) qs.set("accountId", params.accountId);
    if (params.categoryId) qs.set("categoryId", params.categoryId);
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    if (targetPage > 1) qs.set("page", String(targetPage));
    const query = qs.toString();
    return query ? `/transactions?${query}` : "/transactions";
  }

  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Transações</h1>
      </div>

      <Card>
        {/* [Correção — Pre-Beta Hardening, Prioridade 11] Cada campo tinha só
            placeholder, sem nenhum label associado (falha de acessibilidade —
            um leitor de ecrã não anunciava o que cada campo representa). Os
            labels são `sr-only` de propósito: mantêm o layout compacto atual
            exatamente igual (não é um redesign), só acrescentam o nome
            acessível que já devia existir. */}
        <form className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" method="get">
          <label htmlFor="filter-search" className="sr-only">
            Pesquisar transações
          </label>
          <input
            id="filter-search"
            name="search"
            defaultValue={params.search ?? ""}
            placeholder="Pesquisar..."
            className="col-span-2 rounded-lg border border-border bg-surface px-3 text-sm sm:col-span-1 lg:col-span-2"
          />
          <label htmlFor="filter-type" className="sr-only">
            Tipo de transação
          </label>
          <select
            id="filter-type"
            name="type"
            defaultValue={params.type ?? ""}
            className="rounded-lg border border-border bg-surface px-2 text-sm"
          >
            <option value="">Todos os tipos</option>
            <option value="INCOME">Receita</option>
            <option value="EXPENSE">Despesa</option>
            <option value="TRANSFER">Transferência</option>
          </select>
          <label htmlFor="filter-account" className="sr-only">
            Conta
          </label>
          <select
            id="filter-account"
            name="accountId"
            defaultValue={params.accountId ?? ""}
            className="rounded-lg border border-border bg-surface px-2 text-sm"
          >
            <option value="">Todas as contas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <label htmlFor="filter-category" className="sr-only">
            Categoria
          </label>
          <select
            id="filter-category"
            name="categoryId"
            defaultValue={params.categoryId ?? ""}
            className="rounded-lg border border-border bg-surface px-2 text-sm"
          >
            <option value="">Todas as categorias</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label htmlFor="filter-from" className="sr-only">
            Data inicial
          </label>
          <input
            id="filter-from"
            type="date"
            name="from"
            defaultValue={params.from ?? ""}
            className="rounded-lg border border-border bg-surface px-2 text-sm"
          />
          <label htmlFor="filter-to" className="sr-only">
            Data final
          </label>
          <input
            id="filter-to"
            type="date"
            name="to"
            defaultValue={params.to ?? ""}
            className="rounded-lg border border-border bg-surface px-2 text-sm"
          />
          <button type="submit" className="col-span-2 rounded-lg bg-surface-hover text-sm font-medium sm:col-span-1 lg:col-span-6">
            Filtrar
          </button>
        </form>
      </Card>

      <Card>
        {transactions.length === 0 ? (
          <EmptyState title="Nenhuma transação encontrada" description="Experimenta ajustar os filtros ou regista a tua primeira transação." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Data</th>
                  <th className="py-2 font-medium">Descrição</th>
                  <th className="py-2 font-medium">Conta</th>
                  <th className="py-2 font-medium">Tipo</th>
                  <th className="py-2 text-right font-medium">Valor</th>
                  <th className="py-2 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap py-2 text-muted-foreground">{t.date}</td>
                    <td className="py-2">
                      <span className="font-medium text-foreground">{t.description}</span>
                      {t.categoryId ? (
                        <span className="ml-2">
                          <Badge tone="neutral">{categoryName.get(t.categoryId) ?? "Categoria"}</Badge>
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 text-muted-foreground">{accountName.get(t.accountId) ?? "—"}</td>
                    <td className="py-2">
                      <Badge tone={TYPE_TONE[t.type]}>{TYPE_LABEL[t.type]}</Badge>
                    </td>
                    <td className="py-2 text-right">
                      <MoneyDisplay
                        amountMinor={t.type === "EXPENSE" ? -t.amountMinor : t.amountMinor}
                        currency={t.currency}
                        showSign
                        size="sm"
                      />
                    </td>
                    <td className="py-2 text-right">
                      <TransactionRowActions id={t.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(hasPrevPage || hasNextPage) && (
        <div className="flex items-center justify-between">
          {hasPrevPage ? (
            <Link href={pageHref(page - 1)} className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-hover">
              ← Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-muted-foreground">Página {page}</span>
          {hasNextPage ? (
            <Link href={pageHref(page + 1)} className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-hover">
              Seguinte →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
