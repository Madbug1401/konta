import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { createDebtWithInstallments, listDebts } from "@/lib/db/debts";
import { withErrorHandling } from "@/lib/api-error";

export const GET = withErrorHandling("api.debts.get", async () => {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const debts = await listDebts(session.userId);
  return NextResponse.json({
    debts: debts.map((d) => ({
      ...d,
      originalAmountMinor: d.originalAmountMinor.toString(),
      installments: d.installments.map((i) => ({ ...i, amountMinor: i.amountMinor.toString() })),
    })),
  });
});

// [Correção — implementação da interface de Dívidas] `finalDueDate` não faz
// parte deste schema de propósito: é sempre derivado (ver
// src/lib/db/debts.ts, createDebtWithInstallments) a partir do plano de
// parcelas gerado por `generateInstallmentPlan` — nunca um valor que o
// cliente possa enviar diretamente, para não abrir uma segunda fonte de
// verdade que pudesse divergir da última parcela real.
const CreateDebtSchema = z.object({
  creditorName: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  // Mesmo limite técnico (não regra de negócio) já usado em
  // src/app/api/transactions/route.ts e accounts/route.ts.
  originalAmountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.string().length(3).optional(),
  interestRate: z.number().min(0).max(999.999).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  installmentCount: z.number().int().min(1).max(600),
  frequency: z.enum(["MONTHLY", "WEEKLY", "DAILY", "YEARLY"]).optional(),
});

export const POST = withErrorHandling("api.debts.post", async (request: Request) => {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = CreateDebtSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const debt = await createDebtWithInstallments({
    userId: session.userId,
    creditorName: input.creditorName,
    description: input.description,
    originalAmountMinor: BigInt(input.originalAmountMinor),
    currency: input.currency,
    interestRate: input.interestRate,
    startDate: input.startDate,
    installmentCount: input.installmentCount,
    frequency: input.frequency,
  });

  return NextResponse.json(
    {
      ...debt,
      originalAmountMinor: debt.originalAmountMinor.toString(),
      installments: debt.installments.map((i) => ({ ...i, amountMinor: i.amountMinor.toString() })),
    },
    { status: 201 },
  );
});
