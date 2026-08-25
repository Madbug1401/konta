import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getAccountById } from "@/lib/db/accounts";
import { createTransaction, listTransactions } from "@/lib/db/transactions";
import { findUserById } from "@/lib/db/users";
import { getTodayInTimezone, type TransactionType } from "@/lib/financial-engine";

const TRANSACTION_TYPES = new Set<TransactionType>(["INCOME", "EXPENSE", "TRANSFER"]);

function parseTransactionType(value: string | null): TransactionType | undefined {
  return value && TRANSACTION_TYPES.has(value as TransactionType) ? (value as TransactionType) : undefined;
}

export async function GET(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const url = new URL(request.url);
  const transactions = await listTransactions(session.userId, {
    accountId: url.searchParams.get("accountId") ?? undefined,
    categoryId: url.searchParams.get("categoryId") ?? undefined,
    type: parseTransactionType(url.searchParams.get("type")),
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
    offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
  });

  return NextResponse.json({
    transactions: transactions.map((t) => ({ ...t, amountMinor: t.amountMinor.toString() })),
  });
}

// [Regra 6/7 do briefing] Uma transferência nunca é tratada como despesa — é
// validada e persistida com type=TRANSFER e destinationAccountId, nunca como
// EXPENSE com um campo extra "para onde foi".
const CreateTransactionSchema = z
  .object({
    type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
    accountId: z.string().min(1),
    destinationAccountId: z.string().min(1).optional(),
    amountMinor: z.number().int().positive(),
    categoryId: z.string().min(1).optional(),
    description: z.string().trim().min(1).max(255),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((data) => (data.type === "TRANSFER" ? !!data.destinationAccountId : true), {
    message: "Uma transferência precisa de uma conta de destino.",
    path: ["destinationAccountId"],
  })
  .refine((data) => (data.type !== "TRANSFER" ? !data.destinationAccountId : true), {
    message: "Só uma transferência pode ter conta de destino.",
    path: ["destinationAccountId"],
  });

export async function POST(request: Request) {
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
  });

  return NextResponse.json({ ...transaction, amountMinor: transaction.amountMinor.toString() }, { status: 201 });
}
