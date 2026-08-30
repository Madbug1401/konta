import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getAccountById } from "@/lib/db/accounts";
import { InstallmentNotPayableError, payInstallment } from "@/lib/db/debts";
import { findUserById } from "@/lib/db/users";
import { getTodayInTimezone } from "@/lib/financial-engine";
import { withErrorHandling } from "@/lib/api-error";

const PayInstallmentSchema = z.object({
  accountId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const POST = withErrorHandling(
  "api.debts.installments.pay",
  async (request: Request, { params }: { params: Promise<{ debtId: string; installmentId: string }> }) => {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { debtId, installmentId } = await params;

    const body = await request.json().catch(() => null);
    const parsed = PayInstallmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;

    // Nunca confiar num accountId vindo do cliente sem confirmar que
    // pertence ao utilizador autenticado — mesmo princípio já aplicado em
    // src/app/api/transactions/route.ts.
    const account = await getAccountById(session.userId, input.accountId);
    if (!account) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });

    const user = await findUserById(session.userId);
    const date = input.date ?? getTodayInTimezone(user?.timezone ?? "Atlantic/Cape_Verde");

    try {
      const result = await payInstallment(session.userId, debtId, installmentId, {
        accountId: input.accountId,
        date,
      });
      return NextResponse.json({
        debt: { ...result.debt, originalAmountMinor: result.debt.originalAmountMinor.toString() },
        installment: { ...result.installment, amountMinor: result.installment.amountMinor.toString() },
      });
    } catch (err) {
      if (err instanceof InstallmentNotPayableError) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      throw err;
    }
  },
);
