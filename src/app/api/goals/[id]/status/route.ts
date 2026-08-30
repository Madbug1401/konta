import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getGoalById, updateGoalStatus } from "@/lib/db/goals";
import { withErrorHandling } from "@/lib/api-error";

// [Fase 3 — arquivar/encerrar] `ACTIVE` não é um valor aceite aqui de
// propósito — não existe forma de "reabrir" uma meta encerrada, mesma
// filosofia de `markDebtDefaulted` (irreversível, ver src/lib/db/goals.ts).
const UpdateGoalStatusSchema = z.object({ status: z.enum(["ACHIEVED", "ABANDONED"]) });

export const POST = withErrorHandling(
  "api.goals.[id].status",
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = UpdateGoalStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });
    }

    const existing = await getGoalById(session.userId, id);
    if (!existing) return NextResponse.json({ error: "Meta não encontrada." }, { status: 404 });
    if (existing.status !== "ACTIVE") {
      return NextResponse.json({ error: "Só uma meta ativa pode mudar de estado." }, { status: 409 });
    }

    const updated = await updateGoalStatus(session.userId, id, parsed.data.status);
    if (!updated) return NextResponse.json({ error: "Não foi possível atualizar a meta." }, { status: 409 });

    return NextResponse.json({ ...updated, targetAmountMinor: updated.targetAmountMinor.toString() });
  },
);
