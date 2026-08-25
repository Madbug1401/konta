import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { deleteTransaction, getTransactionById, updateTransaction } from "@/lib/db/transactions";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await params;
  const transaction = await getTransactionById(session.userId, id);
  if (!transaction) return NextResponse.json({ error: "Transação não encontrada." }, { status: 404 });

  return NextResponse.json({ ...transaction, amountMinor: transaction.amountMinor.toString() });
}

const UpdateTransactionSchema = z.object({
  amountMinor: z.number().int().positive().optional(),
  categoryId: z.string().min(1).optional(),
  description: z.string().trim().min(1).max(255).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = UpdateTransactionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await updateTransaction(session.userId, id, {
    amountMinor: parsed.data.amountMinor !== undefined ? BigInt(parsed.data.amountMinor) : undefined,
    categoryId: parsed.data.categoryId,
    description: parsed.data.description,
    date: parsed.data.date,
  });
  if (!updated) return NextResponse.json({ error: "Transação não encontrada." }, { status: 404 });

  return NextResponse.json({ ...updated, amountMinor: updated.amountMinor.toString() });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await params;
  // deleteTransaction filtra sempre por userId — não é possível apagar uma
  // transação de outro utilizador mesmo adivinhando o id (regra 6 do briefing).
  const deleted = await deleteTransaction(session.userId, id);
  if (!deleted) return NextResponse.json({ error: "Transação não encontrada." }, { status: 404 });

  return NextResponse.json({ ok: true });
}
