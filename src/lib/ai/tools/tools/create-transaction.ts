// KONTA AI — tool: create_transaction (HIGH). Ver docs/konta-ai-design.html,
// secções E e L. Escrita financeira — a Permission Layer (permissions.ts)
// exige sempre confirmação explícita antes do executor chamar `execute`.
import { z } from "zod";
import { getAccountById } from "@/lib/db/accounts";
import { getGoalById } from "@/lib/db/goals";
import { createTransaction } from "@/lib/db/transactions";
import { findUserById } from "@/lib/db/users";
import { getTodayInTimezone } from "@/lib/financial-engine";
import { resolveCategoryByName, toAiToolTransaction, type AiToolTransaction } from "../shared";
import { ToolExecutionError, type AiTool } from "../types";

// [DECISÃO — corrigido 07/09/2026] Este NÃO é mais o `CreateTransactionSchema`
// de src/app/api/transactions/route.ts reaproveitado tal e qual — tem de
// existir em separado porque o campo `categoryId` (um id interno da base de
// dados) foi substituído por `category` (o NOME em texto livre da
// categoria). Nenhuma tool desta V1 alguma vez expõe um categoryId real ao
// modelo (ver get-transactions.ts) — pedir-lhe um categoryId era pedir-lhe
// algo que nunca podia ter legitimamente, e a transação ficava sempre sem
// categoria (ver comentário completo em ../shared.ts::resolveCategoryByName).
// `CreateTransactionSchema` não pôde ser reutilizado com `.omit()`/`.extend()`
// porque é um `ZodEffects` (tem `.refine()` encadeados) — Zod não permite
// remover/adicionar campos depois disso. Por isso este schema replica a
// mesma forma base e os mesmos três `.refine()`, campo a campo — qualquer
// mudança às regras de POST /api/transactions tem de ser replicada aqui
// também (nenhuma regra NOVA foi introduzida, só o campo de categoria mudou).
const CreateTransactionToolSchema = z
  .object({
    type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
    accountId: z.string().min(1),
    destinationAccountId: z.string().min(1).optional(),
    amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    // [Correção] Nome em texto livre, nunca um id. Ignorado para TRANSFER
    // (transferências não têm categoria — mesma regra de
    // POST /api/transactions), resolvido para uma categoria real (existente
    // ou nova) em `execute` via `resolveCategoryByName`.
    category: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().min(1).max(255),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    goalId: z.string().min(1).optional(),
    // [Milestone 5b — Extração multimodal] Puramente cosmético: o NOME da
    // conta, só para aparecer no texto de confirmação (summarize() abaixo).
    // NUNCA usado para resolver/escolher a conta real — isso continua a ser
    // sempre `accountId`, obrigatório, sempre verificado por ownership em
    // `execute()`. Se o modelo mentir aqui (nome errado, de outra conta,
    // etc.), o pior caso é o texto de confirmação mostrar um nome incorreto
    // — nunca afeta em que conta a transação é criada. Preenchido por
    // `propose_transactions` (que já resolveu o nome real da conta) quando o
    // Claude decide registar uma transação extraída de um attachment.
    accountName: z.string().trim().max(255).optional(),
  })
  .strict()
  .refine((data) => (data.type === "TRANSFER" ? !!data.destinationAccountId : true), {
    message: "Uma transferência precisa de uma conta de destino.",
    path: ["destinationAccountId"],
  })
  .refine((data) => (data.type !== "TRANSFER" ? !data.destinationAccountId : true), {
    message: "Só uma transferência pode ter conta de destino.",
    path: ["destinationAccountId"],
  })
  .refine((data) => data.accountId !== data.destinationAccountId, {
    message: "A conta de destino tem de ser diferente da conta de origem.",
    path: ["destinationAccountId"],
  });
type CreateTransactionParams = z.infer<typeof CreateTransactionToolSchema>;

async function execute(userId: string, params: CreateTransactionParams): Promise<AiToolTransaction> {
  // [Ownership] Mesma sequência de verificações da rota HTTP
  // (POST /api/transactions) — nunca confiar num accountId/goalId vindo dos
  // parâmetros sem cruzar com o utilizador autenticado. Mensagens de erro
  // idênticas às da rota (nunca revelam se o recurso pertence a outro
  // utilizador ou simplesmente não existe).
  const account = await getAccountById(userId, params.accountId);
  if (!account) throw new ToolExecutionError("Conta não encontrada.");
  if (account.isArchived) throw new ToolExecutionError("Esta conta está arquivada.");

  if (params.destinationAccountId) {
    const destination = await getAccountById(userId, params.destinationAccountId);
    if (!destination) throw new ToolExecutionError("Conta de destino não encontrada.");
    if (destination.isArchived) throw new ToolExecutionError("A conta de destino está arquivada.");
  }

  if (params.goalId) {
    const goal = await getGoalById(userId, params.goalId);
    if (!goal) throw new ToolExecutionError("Meta não encontrada.");
  }

  // [Correção] Resolve o nome de categoria (se dado, e só para INCOME/EXPENSE
  // — uma TRANSFER nunca tem categoria, mesma regra de POST /api/transactions)
  // para uma categoria real do utilizador, reutilizando uma já existente com
  // esse nome ou criando uma nova — nunca um id inventado, nunca mais
  // permissão do que `CategoryQuickCreate` já dá a um humano.
  const category =
    params.category && params.type !== "TRANSFER" ? await resolveCategoryByName(userId, params.category, params.type) : null;

  const user = await findUserById(userId);
  const date = params.date ?? getTodayInTimezone(user?.timezone ?? "Atlantic/Cape_Verde");

  const created = await createTransaction({
    userId,
    type: params.type,
    accountId: params.accountId,
    destinationAccountId: params.destinationAccountId,
    amountMinor: BigInt(params.amountMinor),
    currency: account.currency,
    categoryId: category?.id ?? null,
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
    'Regista uma nova transação (receita, despesa ou transferência) numa conta do utilizador. Usa `category` (o NOME da categoria, ex: "Alimentação", "Transporte", nunca um id) sempre que a descrição do utilizador corresponder claramente a um tipo de despesa/receita — se já existir uma categoria com esse nome é reutilizada, senão é criada uma nova automaticamente. Nunca uses `category` numa transferência (não têm categoria). Quando `accountId` vier de uma proposta já resolvida por `propose_transactions`, passa também `accountName` (o nome dessa conta) para o texto de confirmação mostrar claramente em que conta vai ficar. Escrita financeira — exige confirmação explícita.',
  paramsSchema: CreateTransactionToolSchema,
  riskTier: "HIGH",
  // [Limitação conhecida, documentada] summarize() é síncrono e só recebe
  // `params` — não pode resolver o nome da conta sozinho (só tem o id). Por
  // isso o texto só mostra a conta quando quem chamou já sabia o nome e o
  // passou em `accountName` (ver comentário no schema) — nunca inventado
  // aqui. A moeda também não é conhecida sem consultar a conta — por isso
  // nunca se inventa um símbolo de moeda.
  // [Segurança — cartão de confirmação] Este texto é renderizado como texto
  // LITERAL no cartão de confirmação (ver chat-panel.tsx) — nunca passa por
  // um parser de Markdown. Por isso nunca uses `**`/`##`/`[]()` aqui: não
  // teriam efeito nenhum (apareceriam como asteriscos/cardinais literais) e,
  // mais importante, `params.description` é texto livre (pode vir de um
  // attachment ou de uma transcrição de voz) — misturar sintaxe Markdown
  // "de confiança" com texto livre no mesmo template é o que permitia
  // description quebrar para fora das aspas e injetar estrutura no cartão.
  summarize: (params) => {
    const categoryPhrase = params.category && params.type !== "TRANSFER" ? ` na categoria "${params.category}"` : "";
    const accountPhrase = params.accountName ? ` em "${params.accountName}"` : "";
    return `Registar ${describeType(params.type)} de ${params.amountMinor.toLocaleString("pt-CV")} (moeda da conta)${categoryPhrase}${accountPhrase} — "${params.description}"${
      params.date ? `, em ${params.date}` : ", hoje"
    }.`;
  },
  execute,
};
