// ============================================================================
// Recorrências.
//
// [DECISÃO 7] Corrige o bug da auditoria em que "remover todas as
// ocorrências" identificava a série por título (+ valor, no caso de dívidas),
// o que podia apagar/confundir séries diferentes com o mesmo título. Aqui a
// série tem identidade própria (RecurringTransactionRecord.id) e cada
// Transaction gerada carrega `recurringTransactionId`. As funções abaixo só
// trabalham com esse id — nunca comparam texto livre.
// ============================================================================

import { addRecurrenceInterval, type ISODate } from "./datetime";
import type { RecurringTransactionRecord, TransactionRecord } from "./types";

/** Todas as ocorrências geradas de uma série — identificação por id, nunca por título/valor. */
export function getOccurrencesOfSeries(
  transactions: TransactionRecord[],
  recurringTransactionId: string,
): TransactionRecord[] {
  return transactions.filter((t) => t.recurringTransactionId === recurringTransactionId);
}

/** Calcula a data da próxima ocorrência a gerar, respeitando fim por data ou por nº de ocorrências. */
export function computeNextRunDate(series: RecurringTransactionRecord): ISODate | null {
  if (!series.isActive) return null;
  if (series.occurrencesTotal !== null && series.occurrencesGenerated >= series.occurrencesTotal) {
    return null; // série concluída
  }
  if (series.endDate && series.nextRunDate > series.endDate) {
    return null;
  }
  return series.nextRunDate;
}

/** Avança o cursor da série depois de gerar uma ocorrência (usado pelo job/serviço que materializa Transactions). */
export function advanceSeries(series: RecurringTransactionRecord): RecurringTransactionRecord {
  return {
    ...series,
    nextRunDate: addRecurrenceInterval(series.nextRunDate, series.frequency, series.interval),
    occurrencesGenerated: series.occurrencesGenerated + 1,
  };
}
