import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getDebtById, updateDebt } from "@/lib/db/debts";
import { withErrorHandling } from "@/lib/api-error";

export const GET = withErrorHandling(
  "api.debts.[debtId].get",
  async (_request: Request, { params }: { params: Promise<{ debtId: string }> }) => {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { debtId } = await params;
    const debt = await getDebtById(session.userId, debtId);
    if (!debt) return NextResponse.json({ error: "Dívida não encontrada." }, { status: 404 });

    return NextResponse.json({ ...debt, originalAmountMinor: debt.originalAmountMinor.toString() });
  },
);

// [Fase 2 — editar Dívida] Só campos informativos — ver o comentário junto
// a `updateDebt` em src/lib/db/debts.ts para a razão de
// `originalAmountMinor`/`startDate`/`installmentCount`/`frequency`
// ficarem de fora (já usados para gerar o plano de parcelas persistido).
const UpdateDebtSchema = z.object({
  creditorName: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  interestRate: z.number().min(0).max(999.999).nullable().optional(),
});

export const PATCH = withErrorHandling(
  "api.debts.[debtId].patch",
  async (request: Request, { params }: { params: Promise<{ debtId: string }> }) => {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { debtId } = await params;
    const body = await request.json().catch(() => null);
    const parsed = UpdateDebtSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });
    }

    const updated = await updateDebt(session.userId, debtId, parsed.data);
    if (!updated) return NextResponse.json({ error: "Dívida não encontrada." }, { status: 404 });

    return NextResponse.json({ ...updated, originalAmountMinor: updated.originalAmountMinor.toString() });
  },
);
