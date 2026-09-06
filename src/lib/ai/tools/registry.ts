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
import { updateTransactionTool } from "./tools/update-transaction";

const TOOLS: AiTool<unknown, unknown>[] = [
  defineTool(getAccountsTool),
  defineTool(getTransactionsTool),
  defineTool(createTransactionTool),
  defineTool(updateTransactionTool),
  defineTool(deleteTransactionTool),
  defineTool(getDebtsTool),
  defineTool(getGoalsTool),
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
