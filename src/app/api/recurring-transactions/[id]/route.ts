import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getAccountById } from "@/lib/db/accounts";
import { getCategoryById } from "@/lib/db/categories";
import {
  deleteRecurringTransaction,
  getRecurringTransactionById,
  setRecurringTransactionActive,
  updateRecurringTransaction,
} from "@/lib/db/recurring-transactions";
import { convertByExchangeRate } from "@/lib/financial-engine/money";
import { withErrorHandling } from "@/lib/api-error";

export const GET = withErrorHandling(
  "api.recurring-transactions.[id].get",
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await params;
    const series = await getRecurringTransactionById(session.userId, id);
    if (!series) return NextResponse.json({ error: "Recorrência não encontrada." }, { status: 404 });

    return NextResponse.json({
      ...series,
      amountMinor: series.amountMinor.toString(),
      destinationAmountMinor: series.destinationAmountMinor?.toString() ?? null,
    });
  },
);

// [Task 1 — editar recorrência] `currency` e `type` ficam de fora, de
// propósito — mesma regra de Account.currency (ver comentário em
// updateRecurringTransaction, src/lib/db/recurring-transactions.ts).
// Exportado para a tool `update_recurring_transaction` reutilizar
// literalmente este schema, mesmo padrão de UpdateTransactionSchema.
export const UpdateRecurringTransactionSchema = z.object({
  isActive: z.boolean().optional(),
  accountId: z.string().min(1).optional(),
  destinationAccountId: z.string().min(1).nullable().optional(),
  amountMinor: z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .describe(
      "Valor em unidade mínima da moeda (ex: cêntimos para EUR/USD/CVE — 1050 = 10,50 na moeda da conta).",
    )
    .optional(),
  // [Task 3] Ver comentário em UpdateTransactionSchema
  // (src/app/api/transactions/[id]/route.ts) — mesma regra: só tem efeito
  // numa série que já seja (ou vá passar a ser, se accountId/
  // destinationAccountId mudarem) uma TRANSFER multi-moeda.
  exchangeRate: z
    .string()
    .regex(/^\d+(\.\d+)?$/, "Taxa de câmbio inválida.")
    .optional(),
  categoryId: z.string().min(1).nullable().optional(),
  description: z.string().trim().min(1).max(255).optional(),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]).optional(),
  interval: z.number().int().min(1).max(365).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  occurrencesTotal: z.number().int().min(1).max(10_000).nullable().optional(),
});

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
    const input = parsed.data;

    const existing = await getRecurringTransactionById(session.userId, id);
    if (!existing) return NextResponse.json({ error: "Recorrência não encontrada." }, { status: 404 });

    const { isActive, ...fields } = input;
    const hasFieldEdits = Object.values(fields).some((v) => v !== undefined);

    if (hasFieldEdits) {
      // [Task 1] `type` não é editável — a presença/ausência de destino é
      // sempre decidida pelo type ORIGINAL da série, nunca pelo que o
      // cliente manda agora.
      if (fields.destinationAccountId !== undefined) {
        if (existing.type !== "TRANSFER") {
          return NextResponse.json({ error: "Só uma série de transferência pode ter conta de destino." }, { status: 400 });
        }
        if (fields.destinationAccountId === null) {
          return NextResponse.json({ error: "Uma série de transferência precisa sempre de uma conta de destino." }, { status: 400 });
        }
      }

      const nextAccountId = fields.accountId ?? existing.accountId;
      const nextDestinationAccountId = fields.destinationAccountId !== undefined ? fields.destinationAccountId : existing.destinationAccountId;

      // [Correção — self-transfer] Tem de comparar origem/destino RESULTANTES
      // sempre que qualquer um dos dois muda, nunca só quando
      // destinationAccountId vem no corpo do pedido — mudar só accountId
      // para coincidir com um destinationAccountId já existente é a mesma
      // colisão, só que do outro lado.
      if ((fields.accountId !== undefined || fields.destinationAccountId !== undefined) && nextDestinationAccountId === nextAccountId) {
        return NextResponse.json({ error: "A conta de destino tem de ser diferente da conta de origem." }, { status: 400 });
      }

      if (fields.accountId !== undefined) {
        const account = await getAccountById(session.userId, fields.accountId);
        if (!account) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
        if (account.isArchived) return NextResponse.json({ error: "Esta conta está arquivada." }, { status: 400 });
      }

      if (fields.destinationAccountId) {
        const destination = await getAccountById(session.userId, fields.destinationAccountId);
        if (!destination) return NextResponse.json({ error: "Conta de destino não encontrada." }, { status: 404 });
        if (destination.isArchived) return NextResponse.json({ error: "A conta de destino está arquivada." }, { status: 400 });
      }

      // [Task 3 — câmbio] `fx` undefined = não tocar nos 3 campos (mantém o
      // que já estava); só calculado quando há algo que possa mudar o
      // resultado — origem/destino, valor, ou a taxa em si. Uma edição que
      // só muda a descrição, por exemplo, nunca recalcula nada disto.
      let fx: { destinationCurrency: string | null; destinationAmountMinor: bigint | null; exchangeRate: string | null } | undefined;
      const accountsChanging = fields.accountId !== undefined || fields.destinationAccountId !== undefined;

      if (existing.type === "TRANSFER" && nextDestinationAccountId && accountsChanging) {
        const [origin, destination] = await Promise.all([
          getAccountById(session.userId, nextAccountId),
          getAccountById(session.userId, nextDestinationAccountId),
        ]);
        if (origin && destination) {
          if (origin.currency !== destination.currency) {
            if (!fields.exchangeRate) {
              return NextResponse.json(
                { error: "Transferências entre contas de moedas diferentes precisam de taxa de câmbio (exchangeRate)." },
                { status: 400 },
              );
            }
            const amount = fields.amountMinor !== undefined ? BigInt(fields.amountMinor) : existing.amountMinor;
            try {
              fx = {
                destinationCurrency: destination.currency,
                destinationAmountMinor: convertByExchangeRate(amount, fields.exchangeRate, origin.currency, destination.currency),
                exchangeRate: fields.exchangeRate,
              };
            } catch (e) {
              return NextResponse.json({ error: e instanceof Error ? e.message : "Taxa de câmbio inválida." }, { status: 400 });
            }
          } else {
            // Origem/destino passaram a ter a mesma moeda — limpa os campos de câmbio antigos.
            fx = { destinationCurrency: null, destinationAmountMinor: null, exchangeRate: null };
          }
        }
      } else if (existing.type === "TRANSFER" && (fields.amountMinor !== undefined || fields.exchangeRate !== undefined)) {
        if (existing.destinationCurrency) {
          const rate = fields.exchangeRate ?? existing.exchangeRate;
          if (!rate) return NextResponse.json({ error: "Falta a taxa de câmbio desta transferência." }, { status: 400 });
          const amount = fields.amountMinor !== undefined ? BigInt(fields.amountMinor) : existing.amountMinor;
          try {
            fx = {
              destinationCurrency: existing.destinationCurrency,
              destinationAmountMinor: convertByExchangeRate(amount, rate, existing.currency, existing.destinationCurrency),
              exchangeRate: rate,
            };
          } catch (e) {
            return NextResponse.json({ error: e instanceof Error ? e.message : "Taxa de câmbio inválida." }, { status: 400 });
          }
        } else if (fields.exchangeRate !== undefined) {
          return NextResponse.json({ error: "Esta série não é uma transferência entre moedas diferentes." }, { status: 400 });
        }
      } else if (fields.exchangeRate !== undefined) {
        return NextResponse.json({ error: "Esta série não é uma transferência entre moedas diferentes." }, { status: 400 });
      }

      if (fields.categoryId) {
        const category = await getCategoryById(session.userId, fields.categoryId);
        if (!category) return NextResponse.json({ error: "Categoria não encontrada." }, { status: 404 });
      }

      await updateRecurringTransaction(session.userId, id, {
        accountId: fields.accountId,
        destinationAccountId: fields.destinationAccountId,
        amountMinor: fields.amountMinor !== undefined ? BigInt(fields.amountMinor) : undefined,
        destinationCurrency: fx?.destinationCurrency,
        destinationAmountMinor: fx?.destinationAmountMinor,
        exchangeRate: fx?.exchangeRate,
        categoryId: fields.categoryId,
        description: fields.description,
        frequency: fields.frequency,
        interval: fields.interval,
        startDate: fields.startDate,
        endDate: fields.endDate,
        occurrencesTotal: fields.occurrencesTotal,
      });
    }

    const updated = isActive !== undefined ? await setRecurringTransactionActive(session.userId, id, isActive) : await getRecurringTransactionById(session.userId, id);
    if (!updated) return NextResponse.json({ error: "Recorrência não encontrada." }, { status: 404 });

    return NextResponse.json({
      ...updated,
      amountMinor: updated.amountMinor.toString(),
      destinationAmountMinor: updated.destinationAmountMinor?.toString() ?? null,
    });
  },
);

export const DELETE = withErrorHandling(
  "api.recurring-transactions.[id].delete",
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await params;
    // deleteRecurringTransaction filtra sempre por userId (regra 6 do
    // briefing) — nunca apaga a série de outro utilizador mesmo adivinhando
    // o id. As Transaction já geradas sobrevivem (FK SetNull, ver
    // 0007_recurring_transaction_fk_setnull.sql).
    const deleted = await deleteRecurringTransaction(session.userId, id);
    if (!deleted) return NextResponse.json({ error: "Recorrência não encontrada." }, { status: 404 });

    return NextResponse.json({ ok: true });
  },
);
