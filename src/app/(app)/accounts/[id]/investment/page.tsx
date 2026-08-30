import { notFound } from "next/navigation";
import { InvestmentDetailForm } from "@/components/investment-detail-form";
import { ValuationForm } from "@/components/valuation-form";
import { Card } from "@/components/ui/card";
import { MoneyDisplay } from "@/components/money-display";
import { getSessionUser } from "@/lib/auth/session";
import { getAccountById } from "@/lib/db/accounts";
import { getInvestmentDetailByAccountId, listValuations } from "@/lib/db/investments";
import { listAllTransactionsForBalances } from "@/lib/db/transactions";
import { computeInvestmentPerformance } from "@/lib/financial-engine";

export default async function InvestmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();

  const account = await getAccountById(session!.userId, id);
  // getAccountById já filtra por userId (regra 6 do briefing). Uma conta
  // que não seja de tipo INVESTMENT também não tem esta página — "detalhe
  // de investimento" só faz sentido para este tipo de conta.
  if (!account || account.type !== "INVESTMENT") notFound();

  const [detail, valuations, transactions] = await Promise.all([
    getInvestmentDetailByAccountId(session!.userId, id),
    listValuations(session!.userId, id),
    listAllTransactionsForBalances(session!.userId),
  ]);

  const performance = computeInvestmentPerformance(id, transactions, valuations);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <h1 className="text-xl font-bold text-foreground">{account.name} — Investimento</h1>

      {!detail ? (
        <InvestmentDetailForm accountId={id} mode="create" />
      ) : (
        <>
          <Card className="flex flex-col gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Capital investido</p>
              <MoneyDisplay amountMinor={performance.capitalContributedMinor} currency={account.currency} size="lg" />
              <p className="mt-1 text-xs text-muted-foreground">Soma das transferências para esta conta — nunca inclui rentabilidade.</p>
            </div>

            {/* [Regra 15 do briefing — "não invente números"] Sem nenhuma
                avaliação registada, não existe nenhum número de rentabilidade
                para mostrar — nunca se fabrica um a partir só do capital
                investido. Com avaliação mas sem capital investido ainda,
                `returnPercent` também é null (divisão por zero evitada no
                próprio motor) — o texto distingue os dois casos. */}
            {!performance.hasValuation ? (
              <p className="text-sm text-muted-foreground">Sem avaliação registada.</p>
            ) : (
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">Valor atual (em {performance.asOfDate})</p>
                <MoneyDisplay amountMinor={performance.currentValueMinor!} currency={account.currency} size="lg" />
                <p className="text-sm text-muted-foreground">
                  Ganho/perda: <MoneyDisplay amountMinor={performance.gainLossMinor!} currency={account.currency} showSign size="sm" />
                  {performance.returnPercent !== null ? ` (${performance.returnPercent.toFixed(1)}%)` : ""}
                </p>
                {performance.returnPercent === null && (
                  <p className="text-xs text-muted-foreground">Ainda sem capital investido para calcular rentabilidade.</p>
                )}
              </div>
            )}
          </Card>

          <Card className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>
              Tipo: <span className="text-foreground">{detail.investmentType}</span>
            </p>
            {detail.expectedReturnRate !== null && <p>Retorno anual esperado: {detail.expectedReturnRate}%</p>}
            {detail.maturityDate && <p>Vencimento: {detail.maturityDate}</p>}
          </Card>

          <InvestmentDetailForm
            accountId={id}
            mode="edit"
            initialValues={{ investmentType: detail.investmentType, expectedReturnRate: detail.expectedReturnRate, maturityDate: detail.maturityDate }}
          />

          <Card className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground">Registar avaliação</h2>
            <ValuationForm accountId={id} />
          </Card>

          {valuations.length > 0 && (
            <Card>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Histórico de avaliações</h2>
              <div className="flex flex-col divide-y divide-border">
                {[...valuations].reverse().map((v) => (
                  <div key={v.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-muted-foreground">{v.date}</span>
                    <MoneyDisplay amountMinor={v.valueMinor} currency={account.currency} size="sm" />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
