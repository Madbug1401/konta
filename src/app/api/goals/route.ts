import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getAccountById } from "@/lib/db/accounts";
import { createGoal, listGoals } from "@/lib/db/goals";
import { withErrorHandling } from "@/lib/api-error";

export const GET = withErrorHandling("api.goals.get", async () => {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const goals = await listGoals(session.userId);
  return NextResponse.json({ goals: goals.map((g) => ({ ...g, targetAmountMinor: g.targetAmountMinor.toString() })) });
});

const CreateGoalSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  targetAmountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.string().length(3).optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // [Correção — implementação da interface de Metas] Obrigatório de
  // propósito: sem conta associada, `getGoalProgress`
  // (financial-engine/goals.ts) nunca teria um saldo para calcular
  // progresso, e não existe (nesta fase) forma de associar uma conta a uma
  // meta depois de criada — ver plano de implementação, secção "Metas".
  linkedAccountId: z.string().min(1),
});

export const POST = withErrorHandling("api.goals.post", async (request: Request) => {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = CreateGoalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  // Nunca confiar num linkedAccountId vindo do cliente sem confirmar que
  // pertence ao utilizador autenticado (regra 6 do briefing).
  const account = await getAccountById(session.userId, input.linkedAccountId);
  if (!account) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });

  const goal = await createGoal({
    userId: session.userId,
    name: input.name,
    description: input.description,
    targetAmountMinor: BigInt(input.targetAmountMinor),
    currency: input.currency ?? account.currency,
    targetDate: input.targetDate,
    linkedAccountId: input.linkedAccountId,
  });

  return NextResponse.json({ ...goal, targetAmountMinor: goal.targetAmountMinor.toString() }, { status: 201 });
});
