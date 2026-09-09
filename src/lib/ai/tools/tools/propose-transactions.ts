// ============================================================================
// KONTA AI — tool: propose_transactions (LOW). Milestone 5b — Multimodal
// Understanding & Financial Actions.
//
// Ver docs/architecture/OVERVIEW.md, secção "Konta AI Multimodal — M5b".
//
// [Camada nova — Extraction → Proposal, nunca Write] Esta tool é o único
// sítio onde o Konta "entende" o que o Claude extraiu de um recibo/extrato
// (imagem ou PDF, já resolvido pelo pipeline do Milestone 5a) — mas NUNCA
// escreve nada na base de dados. `riskTier: "LOW"` é deliberado: não é uma
// permissão mais fraca para uma escrita disfarçada, é a confirmação de que
// esta tool literalmente não tem poder de escrita nenhum. A escrita real
// continua a ser SEMPRE `create_transaction` (Milestone 3), chamada pelo
// Claude a seguir, com o `accountId` real já resolvido aqui — nunca um id
// inventado por ele. Nenhuma tool nova de escrita foi criada; nenhum
// segundo mecanismo de confirmação; nenhuma segunda ligação à Anthropic.
//
// Fluxo: attachment (Milestone 5a) → Claude entende a imagem/PDF → chama
// esta tool com uma lista de transações extraídas (nomes em texto livre,
// nunca ids) → cada uma é validada e resolvida contra as contas/histórico
// REAIS do utilizador → o resultado (ainda sem nenhuma escrita) volta ao
// Claude → só then o Claude decide chamar create_transaction (HIGH) para
// cada proposta pronta — sujeitas à mesma Permission Layer/Confirmation
// Store/Executor de sempre.
// ============================================================================

import { z } from "zod";
import { CURRENCY_CODES } from "@/lib/currencies";
import { listAccounts } from "@/lib/db/accounts";
import { listTransactions } from "@/lib/db/transactions";
import { findUserById } from "@/lib/db/users";
import { getTodayInTimezone, type AccountRecord } from "@/lib/financial-engine";
import type { AiTool } from "../types";

// [Limite — secção 6/17 do pedido] Bound explícito e defensável: um extrato
// real de uso pessoal (o caso de uso desta V1, nunca uma reconciliação
// contabilística em massa) raramente ultrapassa isto por mês; acima disto o
// custo de tokens/processamento deixa de ser proporcional a "regista isto
// rapidamente". Nunca resolvido por env var (mudar isto é uma decisão de
// código revista em PR, mesmo princípio de src/lib/ai/attachments/validate.ts).
export const MAX_EXTRACTED_TRANSACTIONS = 20;

// [Segurança — nunca aceitar o que o modelo não pode legitimamente ter]
// `type` é sempre INCOME/EXPENSE — nunca TRANSFER: uma transferência exige
// uma conta de DESTINO real, e extrair "isto é uma transferência para a
// conta X" de um recibo/extrato de terceiro é exatamente o tipo de inferência
// que não deve ser feita sem o utilizador dizê-lo explicitamente em texto
// (esse caso já funciona hoje pelo fluxo de chat normal, com create_transaction
// diretamente). `account`/`category` são sempre NOMES em texto livre — nunca
// um id (ver resolução em `execute`, e o mesmo princípio já usado em
// create_transaction/update_transaction para `category`). `.strict()`
// garante que um campo extra tentado pelo modelo (ex: "confirmed": true,
// "accountId": "...") é rejeitado alto e a bom som, nunca ignorado em
// silêncio — é essa rejeição que impede o modelo de alguma vez "declarar"
// uma ação como já confirmada ou de inventar um id.
const ExtractedTransactionSchema = z
  .object({
    type: z.enum(["INCOME", "EXPENSE"]),
    amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    // Opcional de propósito: se o Claude não conseguir ler a moeda no
    // documento, mais vale não adivinhar (ver verificação de mismatch em
    // `execute`) do que assumir a moeda da conta silenciosamente.
    currency: z.enum(CURRENCY_CODES).optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (usa AAAA-MM-DD).")
      .optional(),
    description: z.string().trim().min(1).max(255),
    // Sinal de extração só — nunca um campo do Transaction real (o schema
    // não tem "merchant"); ajuda a resolução de conta/categoria e a
    // deduplicação, mas nunca é persistido tal e qual.
    merchant: z.string().trim().max(255).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    account: z.string().trim().min(1).max(255).optional(),
    confidence: z.enum(["high", "medium", "low"]).optional(),
  })
  .strict();

const ProposeTransactionsParamsSchema = z
  .object({
    transactions: z
      .array(ExtractedTransactionSchema)
      .min(1, "A lista de transações não pode estar vazia.")
      .max(MAX_EXTRACTED_TRANSACTIONS, "Encontrei mais transações do que consigo processar de uma vez."),
  })
  .strict();
type ProposeTransactionsParams = z.infer<typeof ProposeTransactionsParamsSchema>;
type ExtractedTransaction = z.infer<typeof ExtractedTransactionSchema>;

export type ProposedTransactionStatus = "ready" | "needs_clarification";

/**
 * O que esta tool devolve — a PROPOSTA (secção "Extraction vs Proposal vs
 * Persisted Transaction" do pedido). Nunca um poder de escrita: mesmo um
 * item "ready" ainda precisa de o Claude chamar `create_transaction`
 * (HIGH) a seguir, que volta a validar tudo por si mesmo e exige
 * confirmação explícita do utilizador — esta tool nunca grava nada.
 */
export interface ProposedTransaction {
  index: number;
  status: ProposedTransactionStatus;
  type: "INCOME" | "EXPENSE";
  amountMinor: number;
  description: string;
  date: string | null;
  category: string | null;
  accountId: string | null;
  accountName: string | null;
  possibleDuplicate: boolean;
  /** Nunca null quando status é "needs_clarification" — sempre específico ao(s) campo(s) em falta/ambíguo(s), nunca genérico. */
  clarification: string | null;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Resolve um NOME de conta (texto livre, nunca um id) contra as contas reais
 * do utilizador. Nunca escolhe arbitrariamente entre candidatas — 0
 * correspondências ou mais do que 1 ficam por resolver (accountId null),
 * para o Claude ter de perguntar em vez de adivinhar (secção 4 do pedido).
 */
function resolveAccount(hint: string | undefined, accounts: AccountRecord[]): { account: AccountRecord | null; clarification: string | null } {
  if (!hint) {
    if (accounts.length === 1) return { account: accounts[0], clarification: null };
    if (accounts.length === 0) return { account: null, clarification: "Não tens nenhuma conta ativa para registar isto." };
    return {
      account: null,
      clarification: `Não disseste a conta e tens mais do que uma: ${accounts.map((a) => a.name).join(", ")}. Qual devo usar?`,
    };
  }

  const needle = normalize(hint);
  const exact = accounts.filter((a) => normalize(a.name) === needle);
  if (exact.length === 1) return { account: exact[0], clarification: null };

  const partial = accounts.filter((a) => normalize(a.name).includes(needle) || needle.includes(normalize(a.name)));
  if (partial.length === 1) return { account: partial[0], clarification: null };
  if (partial.length > 1) {
    return {
      account: null,
      clarification: `Encontrei mais do que uma conta parecida com "${hint}": ${partial.map((a) => a.name).join(", ")}. Qual devo usar?`,
    };
  }
  return { account: null, clarification: `Não encontrei nenhuma conta chamada "${hint}".` };
}

async function resolveOne(
  userId: string,
  item: ExtractedTransaction,
  index: number,
  accounts: AccountRecord[],
  today: string,
): Promise<ProposedTransaction> {
  const { account, clarification: accountClarification } = resolveAccount(item.account, accounts);

  // [Nunca inventar dados — secção 9 do pedido] Moeda dada mas incompatível
  // com a conta resolvida: nunca se assume silenciosamente a moeda da
  // conta (podia estar a ignorar um extrato genuinamente noutra moeda) —
  // fica por esclarecer.
  const currencyMismatch = !!(item.currency && account && item.currency !== account.currency);

  // [Secção 9] Data ilegível/em falta nunca é assumida como "hoje" — o
  // Claude tem de ter conseguido lê-la no documento, ou pedir ao utilizador.
  const missingDate = !item.date;
  // [Secção 3 — "dados impossíveis"] Um recibo/extrato nunca é datado no
  // futuro — se a extração disser isso, é sinal de leitura errada (ex: dia/
  // mês trocados), nunca aceite às cegas.
  const futureDate = !!(item.date && item.date > today);

  const clarifications = [
    accountClarification,
    currencyMismatch ? `O documento indica ${item.currency}, mas a conta "${account?.name}" é em ${account?.currency}.` : null,
    missingDate ? "Não consegui identificar a data desta transação." : null,
    futureDate ? `A data indicada (${item.date}) é no futuro — confirma se está certa.` : null,
  ].filter((c): c is string => c !== null);

  const resolvedAccountId = account && !currencyMismatch ? account.id : null;

  // [Secção 7 — duplicados, versão segura e limitada] Só verifica quando há
  // conta+data resolvidas — nunca apaga/altera nada, só sinaliza. Mesmo
  // tipo+valor+dia na mesma conta é o critério: simples e barato,
  // deliberadamente sem heurística difusa (nunca "parece parecido").
  let possibleDuplicate = false;
  if (resolvedAccountId && item.date) {
    const existing = await listTransactions(userId, {
      accountId: resolvedAccountId,
      type: item.type,
      from: item.date,
      to: item.date,
      limit: 50,
    });
    possibleDuplicate = existing.some((t) => t.accountId === resolvedAccountId && t.amountMinor === BigInt(item.amountMinor));
  }

  return {
    index,
    status: clarifications.length === 0 ? "ready" : "needs_clarification",
    type: item.type,
    amountMinor: item.amountMinor,
    description: item.description || item.merchant || "Transação",
    date: item.date ?? null,
    category: item.category ?? null,
    accountId: resolvedAccountId,
    accountName: account?.name ?? null,
    possibleDuplicate,
    clarification: clarifications.length > 0 ? clarifications.join(" ") : null,
  };
}

async function execute(userId: string, params: ProposeTransactionsParams): Promise<ProposedTransaction[]> {
  const [user, accountsRaw] = await Promise.all([findUserById(userId), listAccounts(userId)]);
  const today = getTodayInTimezone(user?.timezone ?? "Atlantic/Cape_Verde");
  const accounts = accountsRaw.filter((a) => !a.isArchived);

  const results: ProposedTransaction[] = [];
  for (let index = 0; index < params.transactions.length; index += 1) {
    results.push(await resolveOne(userId, params.transactions[index], index, accounts, today));
  }
  return results;
}

export const proposeTransactionsTool: AiTool<ProposeTransactionsParams, ProposedTransaction[]> = {
  name: "propose_transactions",
  description:
    'Analisa uma lista de transações extraídas de um attachment (recibo, extrato bancário) e resolve-as contra as contas/histórico REAIS do utilizador — nunca escreve nada. Usa `account`/`category` como NOMES em texto livre (nunca um id inventado, ex: "Carteira", "Alimentação"). Chama esta tool ANTES de create_transaction sempre que a informação vier de uma imagem/PDF, para resolver a conta certa e detetar possíveis duplicados. O resultado indica, por transação, se está "ready" (podes propor create_transaction) ou "needs_clarification" (falta perguntar algo específico ao utilizador) — nunca inventes o que falta.',
  paramsSchema: ProposeTransactionsParamsSchema,
  riskTier: "LOW",
  summarize: (params) => `Analisar ${params.transactions.length} transação(ões) extraída(s) de um documento.`,
  execute,
};
