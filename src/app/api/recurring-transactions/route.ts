import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getAccountById } from "@/lib/db/accounts";
import { getCategoryById } from "@/lib/db/categories";
import { createRecurringTransaction, listRecurringTransactions } from "@/lib/db/recurring-transactions";
import { withErrorHandling } from "@/lib/api-error";

export const GET = withErrorHandling("api.recurring-transactions.get", async () => {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const series = await listRecurringTransactions(session.userId);
  return NextResponse.json({ recurringTransactions: series.map((s) => ({ ...s, amountMinor: s.amountMinor.toString() })) });
});

// [Fase 4 — Recorrências] Mesmas regras já usadas em
// src/app/api/transactions/route.ts (TRANSFER exige destinationAccountId
// diferente da origem, valor um inteiro positivo dentro do limite técnico
// de precisão) — replicadas aqui porque uma série recorrente é a "receita"
// que gera exatamente esse tipo de Transaction mais tarde.
const CreateRecurringTransactionSchema = z
  .object({
    type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
    accountId: z.string().min(1),
    destinationAccountId: z.string().min(1).optional(),
    amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    categoryId: z.string().min(1).optional(),
    description: z.string().trim().min(1).max(255),
    frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
    interval: z.number().int().min(1).max(365).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    occurrencesTotal: z.number().int().min(1).max(10_000).optional(),
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
    message: "A conta de destino tem de ser diferente da conta de origem.",
    path: ["destinationAccountId"],
  });

export const POST = withErrorHandling("api.recurring-transactions.post", async (request: Request) => {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = CreateRecurringTransactionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  // Nunca confiar num accountId/destinationAccountId/categoryId vindo do
  // cliente sem confirmar que pertence ao utilizador autenticado (regra 6
  // do briefing) — mesmo princípio de POST /api/transactions.
  const account = await getAccountById(session.userId, input.accountId);
  if (!account) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
  if (account.isArchived) return NextResponse.json({ error: "Esta conta está arquivada." }, { status: 400 });

  if (input.destinationAccountId) {
    const destination = await getAccountById(session.userId, input.destinationAccountId);
    if (!destination) return NextResponse.json({ error: "Conta de destino não encontrada." }, { status: 404 });
    if (destination.isArchived) return NextResponse.json({ error: "A conta de destino está arquivada." }, { status: 400 });
  }

  if (input.categoryId) {
    const category = await getCategoryById(session.userId, input.categoryId);
    if (!category) return NextResponse.json({ error: "Categoria não encontrada." }, { status: 404 });
  }

  const series = await createRecurringTransaction({
    userId: session.userId,
    type: input.type,
    accountId: input.accountId,
    destinationAccountId: input.destinationAccountId,
    amountMinor: BigInt(input.amountMinor),
    currency: account.currency,
    categoryId: input.type === "TRANSFER" ? null : input.categoryId,
    description: input.description,
    frequency: input.frequency,
    interval: input.interval,
    startDate: input.startDate,
    endDate: input.endDate,
    occurrencesTotal: input.occurrencesTotal,
  });

  return NextResponse.json({ ...series, amountMinor: series.amountMinor.toString() }, { status: 201 });
});
