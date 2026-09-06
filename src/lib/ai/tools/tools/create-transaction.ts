// KONTA AI — tool: create_transaction (HIGH). Ver docs/konta-ai-design.html,
// secções E e L. Escrita financeira — a Permission Layer (permissions.ts)
// exige sempre confirmação explícita antes do executor chamar `execute`.
import type { z } from "zod";
import { CreateTransactionSchema } from "@/app/api/transactions/route";
import { getAccountById } from "@/lib/db/accounts";
import { getCategoryById, type CategoryRow } from "@/lib/db/categories";
import { getGoalById } from "@/lib/db/goals";
import { createTransaction } from "@/lib/db/transactions";
import { findUserById } from "@/lib/db/users";
import { getTodayInTimezone } from "@/lib/financial-engine";
import { toAiToolTransaction, type AiToolTransaction } from "../shared";
import { ToolExecutionError, type AiTool } from "../types";

// [DECISÃO] paramsSchema é literalmente o schema já usado por
// POST /api/transactions — mesmas regras (TRANSFER exige destinationAccountId,
// accountId !== destinationAccountId, amountMinor positivo e limitado a
// Number.MAX_SAFE_INTEGER, rejeita NaN/Infinity por construção do próprio
// z.number()). Nenhuma regra nova, nenhuma duplicada. `userId` nunca faz
// parte deste schema — não há campo para o modelo sequer tentar fornecê-lo.
type CreateTransactionParams = z.infer<typeof CreateTransactionSchema>;

async function execute(userId: string, params: CreateTransactionParams): Promise<AiToolTransaction> {
  // [Ownership] Exatamente a mesma sequência de verificações da rota HTTP
  // (POST /api/transactions) — nunca confiar num accountId/categoryId/goalId
  // vindo dos parâmetros sem cruzar com o utilizador autenticado. Mensagens
  // de erro idênticas às da rota (nunca revelam se o recurso pertence a
  // outro utilizador ou simplesmente não existe).
  const account = await getAccountById(userId, params.accountId);
  if (!account) throw new ToolExecutionError("Conta não encontrada.");
  if (account.isArchived) throw new ToolExecutionError("Esta conta está arquivada.");

  if (params.destinationAccountId) {
    const destination = await getAccountById(userId, params.destinationAccountId);
    if (!destination) throw new ToolExecutionError("Conta de destino não encontrada.");
    if (destination.isArchived) throw new ToolExecutionError("A conta de destino está arquivada.");
  }

  let category: CategoryRow | null = null;
  if (params.categoryId) {
    category = await getCategoryById(userId, params.categoryId);
    if (!category) throw new ToolExecutionError("Categoria não encontrada.");
  }

  if (params.goalId) {
    const goal = await getGoalById(userId, params.goalId);
    if (!goal) throw new ToolExecutionError("Meta não encontrada.");
  }

  const user = await findUserById(userId);
  const date = params.date ?? getTodayInTimezone(user?.timezone ?? "Atlantic/Cape_Verde");

  const created = await createTransaction({
    userId,
    type: params.type,
    accountId: params.accountId,
    destinationAccountId: params.destinationAccountId,
    amountMinor: BigInt(params.amountMinor),
    currency: account.currency,
    categoryId: params.type === "TRANSFER" ? null : params.categoryId,
    description: params.description,
    date,
    goalId: params.goalId,
  });

  return toAiToolTransaction(created, category ? [category] : []);
}

function describeType(type: CreateTransactionParams["type"]): string {
  if (type === "INCOME") return "uma receita";
  if (type === "EXPENSE") return "uma despesa";
  return "uma transferência";
}

export const createTransactionTool: AiTool<CreateTransactionParams, AiToolTransaction> = {
  name: "create_transaction",
  description:
    "Regista uma nova transação (receita, despesa ou transferência) numa conta do utilizador. Escrita financeira — exige confirmação explícita.",
  paramsSchema: CreateTransactionSchema,
  riskTier: "HIGH",
  // [Limitação conhecida, documentada] summarize() é síncrono e só recebe
  // `params` — não pode resolver o nome da conta/categoria (só tem ids, e
  // nenhuma tool desta V1 devolve id de conta/categoria ao modelo para
  // "re-perguntar" o nome). O resumo de confirmação real, com nomes
  // resolvidos, fica para o milestone que constrói a UI de confirmação (que
  // pode enriquecer este resumo com uma consulta extra antes de mostrar ao
  // utilizador). Aqui, a moeda também não é conhecida sem consultar a conta
  // — por isso nunca se inventa um símbolo de moeda.
  summarize: (params) =>
    `Registar ${describeType(params.type)} de ${params.amountMinor.toLocaleString("pt-CV")} (moeda da conta) — "${params.description}"${
      params.date ? `, em ${params.date}` : ", hoje"
    }.`,
  execute,
};
