import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getAccountById } from "@/lib/db/accounts";
import { getCategoryById } from "@/lib/db/categories";
import { getGoalById } from "@/lib/db/goals";
import { createTransaction, listTransactions } from "@/lib/db/transactions";
import { findUserById } from "@/lib/db/users";
import { getTodayInTimezone, type TransactionType } from "@/lib/financial-engine";
import { withErrorHandling } from "@/lib/api-error";
import { parsePagination } from "@/lib/pagination";

const TRANSACTION_TYPES = new Set<TransactionType>(["INCOME", "EXPENSE", "TRANSFER"]);

function parseTransactionType(value: string | null): TransactionType | undefined {
  return value && TRANSACTION_TYPES.has(value as TransactionType) ? (value as TransactionType) : undefined;
}

export const GET = withErrorHandling("api.transactions.get", async (request: Request) => {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const url = new URL(request.url);

  // [Correção — Pre-Beta Hardening, Prioridade 8] Antes rejeitava-se nada:
  // "limit"/"offset" inválidos (NaN, negativos, absurdamente grandes)
  // chegavam direto ao Postgres como parâmetros de LIMIT/OFFSET. Ver
  // src/lib/pagination.ts.
  const pagination = parsePagination(url.searchParams.get("limit"), url.searchParams.get("offset"));
  if (!pagination.ok) {
    return NextResponse.json({ error: pagination.error }, { status: 400 });
  }

  const transactions = await listTransactions(session.userId, {
    accountId: url.searchParams.get("accountId") ?? undefined,
    categoryId: url.searchParams.get("categoryId") ?? undefined,
    type: parseTransactionType(url.searchParams.get("type")),
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
    limit: pagination.limit,
    offset: pagination.offset,
  });

  return NextResponse.json({
    transactions: transactions.map((t) => ({ ...t, amountMinor: t.amountMinor.toString() })),
  });
});

// [Regra 6/7 do briefing] Uma transferência nunca é tratada como despesa — é
// validada e persistida com type=TRANSFER e destinationAccountId, nunca como
// EXPENSE com um campo extra "para onde foi".
const CreateTransactionSchema = z
  .object({
    type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
    accountId: z.string().min(1),
    destinationAccountId: z.string().min(1).optional(),
    // [Correção — auditoria Go-to-Beta, 29/08/2026] Sem limite superior, um
    // número JS "inteiro" mas acima de Number.MAX_SAFE_INTEGER já perde
    // precisão em JSON.parse antes de o Zod sequer o ver, e um valor ainda
    // maior rebenta o BIGINT do Postgres a meio do INSERT (erro não tratado,
    // 500 em vez de 400). O limite é a fronteira técnica onde a precisão
    // deixa de ser garantida — não uma regra de negócio sobre "quanto
    // dinheiro alguém pode ter", que não é uma decisão para tomar aqui.
    amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    categoryId: z.string().min(1).optional(),
    description: z.string().trim().min(1).max(255),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    // [Correção — implementação da interface de Metas] Marca opcionalmente
    // esta transação como uma contribuição para uma Meta — usado por
    // `calculateGoalProjection` (financial-engine/goals.ts) para estimar o
    // ritmo de contribuição real. Não afeta o progresso em si (esse vem
    // sempre do saldo da conta ligada à meta, ver getGoalProgress) — é só
    // um rótulo para análise.
    goalId: z.string().min(1).optional(),
  })
  .refine((data) => (data.type === "TRANSFER" ? !!data.destinationAccountId : true), {
    message: "Uma transferência precisa de uma conta de destino.",
    path: ["destinationAccountId"],
  })
  .refine((data) => (data.type !== "TRANSFER" ? !data.destinationAccountId : true), {
    message: "Só uma transferência pode ter conta de destino.",
    path: ["destinationAccountId"],
  })
  .refine((data) => data.accountId !== data.destinationAccountId, {
    // [Correção — BUG CRÍTICO, auditoria Go-to-Beta, 29/08/2026] Sem este
    // refine, uma TRANSFER com accountId === destinationAccountId passava a
    // validação e chegava a getAccountBalance() (financial-engine/
    // balance.ts) como "entrada" sem a "saída" correspondente ser aplicada
    // (isIncoming era verificado antes de isOutgoing num if/else-if) —
    // qualquer utilizador autenticado conseguia criar dinheiro do nada só
    // transferindo de uma conta para ela própria. Corrigido aqui (rejeitar
    // na validação, defesa principal) e também no próprio motor de cálculo
    // (defesa em profundidade, ver balance.ts).
    message: "A conta de destino tem de ser diferente da conta de origem.",
    path: ["destinationAccountId"],
  });

export const POST = withErrorHandling("api.transactions.post", async (request: Request) => {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = CreateTransactionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  // Nunca confiar em accountId/destinationAccountId sem confirmar que
  // pertencem ao utilizador autenticado — isolamento multi-utilizador (regra 6).
  const account = await getAccountById(session.userId, input.accountId);
  if (!account) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });

  if (input.destinationAccountId) {
    const destination = await getAccountById(session.userId, input.destinationAccountId);
    if (!destination) return NextResponse.json({ error: "Conta de destino não encontrada." }, { status: 404 });
  }

  // [Correção — Pre-Beta Hardening, Prioridade 7] Mesmo princípio já
  // aplicado a accountId/destinationAccountId acima: nunca confiar num
  // categoryId vindo do cliente sem confirmar que é uma categoria de
  // sistema ou pertence a este utilizador. Ver src/lib/db/categories.ts.
  if (input.categoryId) {
    const category = await getCategoryById(session.userId, input.categoryId);
    if (!category) return NextResponse.json({ error: "Categoria não encontrada." }, { status: 404 });
  }

  if (input.goalId) {
    const goal = await getGoalById(session.userId, input.goalId);
    if (!goal) return NextResponse.json({ error: "Meta não encontrada." }, { status: 404 });
  }

  const user = await findUserById(session.userId);
  const date = input.date ?? getTodayInTimezone(user?.timezone ?? "Atlantic/Cape_Verde");

  const transaction = await createTransaction({
    userId: session.userId,
    type: input.type,
    accountId: input.accountId,
    destinationAccountId: input.destinationAccountId,
    amountMinor: BigInt(input.amountMinor),
    currency: account.currency,
    categoryId: input.type === "TRANSFER" ? null : input.categoryId,
    description: input.description,
    date,
    goalId: input.goalId,
  });

  return NextResponse.json({ ...transaction, amountMinor: transaction.amountMinor.toString() }, { status: 201 });
});
