// KONTA AI — tool: get_transactions (LOW). Ver docs/konta-ai-design.html, secção L.
import { z } from "zod";
import { listCategories } from "@/lib/db/categories";
import { listTransactions } from "@/lib/db/transactions";
import { toAiToolTransaction, type AiToolTransaction } from "../shared";
import type { AiTool } from "../types";

// Só os filtros que já existem em ListTransactionsFilter (src/lib/db/
// transactions.ts) e que fazem sentido para o modelo pedir por nome — nunca
// accountId/categoryId aqui: nenhum DTO devolvido por uma tool desta V1
// alguma vez expõe o id de uma conta ou categoria, por isso o modelo nunca
// teria um valor legítimo para passar (ver Security Findings no relatório
// do milestone). `limit` é sempre limitado — nunca "carregar tudo".
const GetTransactionsParamsSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (usa AAAA-MM-DD).").optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (usa AAAA-MM-DD).").optional(),
    type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]).optional(),
    search: z.string().trim().min(1).max(255).optional(),
    limit: z.number().int().positive().max(50).optional(),
  })
  .strict();
type GetTransactionsParams = z.infer<typeof GetTransactionsParamsSchema>;

const DEFAULT_LIMIT = 20;

async function execute(userId: string, params: GetTransactionsParams): Promise<AiToolTransaction[]> {
  const [transactions, categories] = await Promise.all([
    listTransactions(userId, {
      from: params.from,
      to: params.to,
      type: params.type,
      search: params.search,
      limit: params.limit ?? DEFAULT_LIMIT,
    }),
    listCategories(userId),
  ]);
  return transactions.map((t) => toAiToolTransaction(t, categories));
}

export const getTransactionsTool: AiTool<GetTransactionsParams, AiToolTransaction[]> = {
  name: "get_transactions",
  description: "Consulta as transações do utilizador, com filtros opcionais de período, tipo e texto. Lista sempre limitada.",
  paramsSchema: GetTransactionsParamsSchema,
  riskTier: "LOW",
  summarize: (params) => {
    const parts: string[] = [];
    if (params.from || params.to) parts.push(`entre ${params.from ?? "o início"} e ${params.to ?? "hoje"}`);
    if (params.type) parts.push(`do tipo ${params.type}`);
    if (params.search) parts.push(`contendo "${params.search}"`);
    return `Consultar transações${parts.length > 0 ? " " + parts.join(", ") : ""}.`;
  },
  execute,
};
