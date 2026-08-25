// ============================================================================
// Investimentos.
//
// [DECISÃO 11 / secção 17 do briefing] Corrige diretamente o bug da auditoria
// em que "crescimento de investimento" era apenas a variação do total
// depositado, apresentada como se fosse rentabilidade real. Aqui:
//
//   capitalContributedMinor = soma das TRANSFER de entrada nesta conta
//   (nunca inclui a taxa de juro — é só dinheiro que o utilizador meteu lá)
//
//   currentValueMinor = última InvestmentValuation registada manualmente
//   (ou null se nunca foi registada nenhuma avaliação)
//
//   gainLossMinor / returnPercent só existem quando currentValueMinor existe.
//   Sem avaliação registada, a função devolve hasValuation:false e a UI deve
//   mostrar "sem avaliação registada" em vez de um número fabricado.
// ============================================================================

import { sum } from "./money";
import type { InvestmentValuationRecord, MinorAmount, TransactionRecord } from "./types";

export interface InvestmentPerformance {
  capitalContributedMinor: MinorAmount;
  hasValuation: boolean;
  currentValueMinor: MinorAmount | null;
  gainLossMinor: MinorAmount | null;
  returnPercent: number | null;
  asOfDate: string | null;
}

export function computeInvestmentPerformance(
  investmentAccountId: string,
  transactions: TransactionRecord[],
  valuations: InvestmentValuationRecord[],
): InvestmentPerformance {
  const capitalContributedMinor = sum(
    transactions
      .filter(
        (t) =>
          t.type === "TRANSFER" &&
          t.destinationAccountId === investmentAccountId &&
          t.status === "COMPLETED",
      )
      .map((t) => t.amountMinor),
  );

  if (valuations.length === 0) {
    return {
      capitalContributedMinor,
      hasValuation: false,
      currentValueMinor: null,
      gainLossMinor: null,
      returnPercent: null,
      asOfDate: null,
    };
  }

  const latest = [...valuations].sort((a, b) => b.date.localeCompare(a.date))[0];
  const gainLossMinor = latest.valueMinor - capitalContributedMinor;
  const returnPercent =
    capitalContributedMinor === 0n ? null : (Number(gainLossMinor) / Number(capitalContributedMinor)) * 100;

  return {
    capitalContributedMinor,
    hasValuation: true,
    currentValueMinor: latest.valueMinor,
    gainLossMinor,
    returnPercent,
    asOfDate: latest.date,
  };
}
