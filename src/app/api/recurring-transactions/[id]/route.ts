import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getRecurringTransactionById, setRecurringTransactionActive } from "@/lib/db/recurring-transactions";
import { withErrorHandling } from "@/lib/api-error";

export const GET = withErrorHandling(
  "api.recurring-transactions.[id].get",
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await params;
    const series = await getRecurringTransactionById(session.userId, id);
    if (!series) return NextResponse.json({ error: "Recorrência não encontrada." }, { status: 404 });

    return NextResponse.json({ ...series, amountMinor: series.amountMinor.toString() });
  },
);

// [Fase 4 — Recorrências] Só pausa/retoma (`isActive`) — editar valor/
// frequência/conta depois de já haver ocorrências geradas teria exatamente
// o mesmo problema do `originalAmountMinor` de uma Dívida (Fase 2):
// desincronizaria das Transactions já materializadas sem nenhuma
// regeneração. Fica fora deste plano de propósito.
const UpdateRecurringTransactionSchema = z.object({ isActive: z.boolean() });

export const PATCH = withErrorHandling(
  "api.recurring-transactions.[id].patch",
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = UpdateRecurringTransactionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });
    }

    const updated = await setRecurringTransactionActive(session.userId, id, parsed.data.isActive);
    if (!updated) return NextResponse.json({ error: "Recorrência não encontrada." }, { status: 404 });

    return NextResponse.json({ ...updated, amountMinor: updated.amountMinor.toString() });
  },
);
