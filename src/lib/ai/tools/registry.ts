// ============================================================================
// KONTA AI — Tool Registry (Milestone 3).
//
// Única fonte de verdade das tools disponíveis à IA — nunca espalhar uma
// segunda lista pelo código (o AI Gateway/futuro Context Builder devem
// sempre consultar `listTools()`, nunca importar um ficheiro de tool
// diretamente). Não importa `@anthropic-ai/sdk` nem sabe o que é o Claude —
// só agrega e indexa as 7 tools de ./tools/.
// ============================================================================

import { defineTool, type AiTool } from "./types";
import { createTransactionTool } from "./tools/create-transaction";
import { deleteTransactionTool } from "./tools/delete-transaction";
import { getAccountsTool } from "./tools/get-accounts";
import { getDebtsTool } from "./tools/get-debts";
import { getGoalsTool } from "./tools/get-goals";
import { getTransactionsTool } from "./tools/get-transactions";
import { proposeTransactionsTool } from "./tools/propose-transactions";
import { updateTransactionTool } from "./tools/update-transaction";
// [Milestone 6 — cobertura completa] Ver docs/architecture/OVERVIEW.md,
// secção "Konta AI" para a matriz de capacidades. Mesma disciplina das
// tools do Milestone 3-5: schema espelha a rota HTTP equivalente,
// execute() chama sempre a mesma função de domínio já usada pela UI, nunca
// SQL novo.
import { getCategoriesTool } from "./tools/get-categories";
import { getRecurringTransactionsTool } from "./tools/get-recurring-transactions";
import { getInvestmentsTool } from "./tools/get-investments";
import { createAccountTool } from "./tools/create-account";
import { updateAccountTool } from "./tools/update-account";
import { setAccountArchivedTool } from "./tools/set-account-archived";
import { deleteAccountTool } from "./tools/delete-account";
import { createDebtTool } from "./tools/create-debt";
import { updateDebtTool } from "./tools/update-debt";
import { payDebtInstallmentTool } from "./tools/pay-debt-installment";
import { markDebtDefaultedTool } from "./tools/mark-debt-defaulted";
import { createGoalTool } from "./tools/create-goal";
import { updateGoalTool } from "./tools/update-goal";
import { updateGoalStatusTool } from "./tools/update-goal-status";
import { createRecurringTransactionTool } from "./tools/create-recurring-transaction";
import { setRecurringTransactionActiveTool } from "./tools/set-recurring-transaction-active";
import { createInvestmentDetailTool } from "./tools/create-investment-detail";
import { updateInvestmentDetailTool } from "./tools/update-investment-detail";
import { addInvestmentValuationTool } from "./tools/add-investment-valuation";

const TOOLS: AiTool<unknown, unknown>[] = [
  defineTool(getAccountsTool),
  defineTool(getTransactionsTool),
  defineTool(createTransactionTool),
  defineTool(updateTransactionTool),
  defineTool(deleteTransactionTool),
  defineTool(getDebtsTool),
  defineTool(getGoalsTool),
  // [Milestone 5b] LOW — nunca escreve, só resolve/valida extrações de
  // attachments contra dados reais do utilizador. Ver propose-transactions.ts.
  defineTool(proposeTransactionsTool),
  // [Milestone 6]
  defineTool(getCategoriesTool),
  defineTool(getRecurringTransactionsTool),
  defineTool(getInvestmentsTool),
  defineTool(createAccountTool),
  defineTool(updateAccountTool),
  defineTool(setAccountArchivedTool),
  defineTool(deleteAccountTool),
  defineTool(createDebtTool),
  defineTool(updateDebtTool),
  defineTool(payDebtInstallmentTool),
  defineTool(markDebtDefaultedTool),
  defineTool(createGoalTool),
  defineTool(updateGoalTool),
  defineTool(updateGoalStatusTool),
  defineTool(createRecurringTransactionTool),
  defineTool(setRecurringTransactionActiveTool),
  defineTool(createInvestmentDetailTool),
  defineTool(updateInvestmentDetailTool),
  defineTool(addInvestmentValuationTool),
];

const TOOLS_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

// Falha alto e cedo (no carregamento do módulo) se algum dia dois ficheiros
// de tool acabarem com o mesmo `name` — nunca silenciosamente sobrepor uma
// tool por outra.
if (TOOLS_BY_NAME.size !== TOOLS.length) {
  throw new Error("Konta AI: nomes de tool duplicados no Tool Registry.");
}

export function getTool(name: string): AiTool<unknown, unknown> | undefined {
  return TOOLS_BY_NAME.get(name);
}

export function listTools(): AiTool<unknown, unknown>[] {
  return [...TOOLS];
}
