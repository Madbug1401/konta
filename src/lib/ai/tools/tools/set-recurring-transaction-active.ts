// KONTA AI — tool: set_recurring_transaction_active (HIGH, Milestone 6).
// Pausar/retomar — nunca eliminar (não existe DELETE para recorrências no
// produto; ver src/app/api/recurring-transactions/). Mesmo mecanismo de
// setRecurringTransactionActive já usado pela UI (/recurring).
import { z } from "zod";
import { getRecurringTransactionById, setRecurringTransactionActive } from "@/lib/db/recurring-transactions";
import { ToolExecutionError, type AiTool } from "../types";

const SetRecurringTransactionActiveToolSchema = z
  .object({
    recurringTransactionId: z.string().min(1),
    isActive: z.boolean(),
    description: z.string().trim().max(255).optional(),
  })
  .strict();
type SetRecurringTransactionActiveParams = z.infer<typeof SetRecurringTransactionActiveToolSchema>;

async function execute(userId: string, params: SetRecurringTransactionActiveParams): Promise<{ isActive: boolean }> {
  const existing = await getRecurringTransactionById(userId, params.recurringTransactionId);
  if (!existing) throw new ToolExecutionError("Recorrência não encontrada.");

  const updated = await setRecurringTransactionActive(userId, params.recurringTransactionId, params.isActive);
  if (!updated) throw new ToolExecutionError("Recorrência não encontrada.");
  return { isActive: updated.isActive };
}

export const setRecurringTransactionActiveTool: AiTool<SetRecurringTransactionActiveParams, { isActive: boolean }> = {
  name: "set_recurring_transaction_active",
  description:
    "Pausa (isActive=false) ou retoma (isActive=true) uma série recorrente — não existe forma de eliminar uma série, só pausar. `recurringTransactionId` tem de vir de get_recurring_transactions. Escrita financeira — exige confirmação explícita.",
  paramsSchema: SetRecurringTransactionActiveToolSchema,
  riskTier: "HIGH",
  summarize: (params) => {
    const phrase = params.description ? ` "${params.description}"` : "";
    return params.isActive ? `Retomar a recorrência${phrase}.` : `Pausar a recorrência${phrase}.`;
  },
  execute,
};
