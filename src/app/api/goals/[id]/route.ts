import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getGoalById, updateGoal } from "@/lib/db/goals";
import { withErrorHandling } from "@/lib/api-error";

export const GET = withErrorHandling(
  "api.goals.[id].get",
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await params;
    const goal = await getGoalById(session.userId, id);
    if (!goal) return NextResponse.json({ error: "Meta não encontrada." }, { status: 404 });

    return NextResponse.json({ ...goal, targetAmountMinor: goal.targetAmountMinor.toString() });
  },
);

// [Fase 2 — editar Meta] `linkedAccountId` não faz parte deste schema de
// propósito — ver o comentário junto a `updateGoal` em src/lib/db/goals.ts.
const UpdateGoalSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  targetAmountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

export const PATCH = withErrorHandling(
  "api.goals.[id].patch",
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = UpdateGoalSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });
    }

    const updated = await updateGoal(session.userId, id, {
      name: parsed.data.name,
      description: parsed.data.description,
      targetAmountMinor: parsed.data.targetAmountMinor !== undefined ? BigInt(parsed.data.targetAmountMinor) : undefined,
      targetDate: parsed.data.targetDate,
    });
    if (!updated) return NextResponse.json({ error: "Meta não encontrada." }, { status: 404 });

    return NextResponse.json({ ...updated, targetAmountMinor: updated.targetAmountMinor.toString() });
  },
);
