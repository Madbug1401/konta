-- [Task 3 — transferências multi-moeda] Três colunas novas em Transaction e
-- RecurringTransaction, todas nullable e sem default — zero impacto em
-- linhas existentes (ficam NULL, lidas pelo código como "same-currency",
-- que é exatamente o que já são). Sem downtime, sem lock prolongado.
ALTER TABLE "Transaction"
  ADD COLUMN "destinationCurrency" TEXT,
  ADD COLUMN "destinationAmountMinor" BIGINT,
  ADD COLUMN "exchangeRate" DECIMAL(24,12);

ALTER TABLE "RecurringTransaction"
  ADD COLUMN "destinationCurrency" TEXT,
  ADD COLUMN "destinationAmountMinor" BIGINT,
  ADD COLUMN "exchangeRate" DECIMAL(24,12);
