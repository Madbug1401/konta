import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { deleteTransaction, getTransactionById, updateTransaction } from "@/lib/db/transactions";
import { getCategoryById } from "@/lib/db/categories";
import { withErrorHandling } from "@/lib/api-error";

export const GET = withErrorHandling(
  "api.transactions.[id].get",
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await params;
    const transaction = await getTransactionById(session.userId, id);
    if (!transaction) return NextResponse.json({ error: "Transação não encontrada." }, { status: 404 });

    return NextResponse.json({ ...transaction, amountMinor: transaction.amountMinor.toString() });
  },
);

const UpdateTransactionSchema = z.object({
  // Mesma correção de src/app/api/transactions/route.ts — ver comentário lá.
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  categoryId: z.string().min(1).optional(),
  description: z.string().trim().min(1).max(255).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const PATCH = withErrorHandling(
  "api.transactions.[id].patch",
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = UpdateTransactionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });
    }

    // [Correção — Pre-Beta Hardening, Prioridade 7] Mesma validação da
    // criação (POST /api/transactions): um categoryId de outro utilizador
    // não pode ser aceite só porque a transação em si pertence a quem está
    // autenticado. Ver src/lib/db/categories.ts.
    if (parsed.data.categoryId) {
      const category = await getCategoryById(session.userId, parsed.data.categoryId);
      if (!category) return NextResponse.json({ error: "Categoria não encontrada." }, { status: 404 });
    }

    const updated = await updateTransaction(session.userId, id, {
      amountMinor: parsed.data.amountMinor !== undefined ? BigInt(parsed.data.amountMinor) : undefined,
      categoryId: parsed.data.categoryId,
      description: parsed.data.description,
      date: parsed.data.date,
    });
    if (!updated) return NextResponse.json({ error: "Transação não encontrada." }, { status: 404 });

    return NextResponse.json({ ...updated, amountMinor: updated.amountMinor.toString() });
  },
);

export const DELETE = withErrorHandling(
  "api.transactions.[id].delete",
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await params;
    // deleteTransaction filtra sempre por userId — não é possível apagar uma
    // transação de outro utilizador mesmo adivinhando o id (regra 6 do briefing).
    const deleted = await deleteTransaction(session.userId, id);
    if (!deleted) return NextResponse.json({ error: "Transação não encontrada." }, { status: 404 });

    return NextResponse.json({ ok: true });
  },
);
