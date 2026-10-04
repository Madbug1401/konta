import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { deleteTransaction, getTransactionById, updateTransaction } from "@/lib/db/transactions";
import { getCategoryById } from "@/lib/db/categories";
import { convertByExchangeRate } from "@/lib/financial-engine/money";
import { withErrorHandling } from "@/lib/api-error";

export const GET = withErrorHandling(
  "api.transactions.[id].get",
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await params;
    const transaction = await getTransactionById(session.userId, id);
    if (!transaction) return NextResponse.json({ error: "Transação não encontrada." }, { status: 404 });

    return NextResponse.json({
      ...transaction,
      amountMinor: transaction.amountMinor.toString(),
      destinationAmountMinor: transaction.destinationAmountMinor?.toString() ?? null,
    });
  },
);

// [Milestone 3 — Tool Registry] Exportado para a tool `update_transaction`
// (src/lib/ai/tools/tools/update-transaction.ts) reutilizar literalmente
// este schema — mesma razão do CreateTransactionSchema em
// src/app/api/transactions/route.ts. Nenhuma regra de validação mudou.
export const UpdateTransactionSchema = z.object({
  // Mesma correção de src/app/api/transactions/route.ts — ver comentário lá.
  amountMinor: z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .describe(
      "Valor em unidade mínima da moeda (ex: cêntimos para EUR/USD — 1050 = €10.50 ou $10.50; CVE também tem 2 casas decimais (centavo) — 1050 = 10,50 CVE).",
    )
    .optional(),
  // [Task 3] Só tem efeito numa TRANSFER que já tenha destinationCurrency
  // (moedas diferentes) — editar isto, ou o valor, recalcula
  // destinationAmountMinor; editar qualquer outro campo nunca o toca (ver
  // PATCH abaixo).
  exchangeRate: z
    .string()
    .regex(/^\d+(\.\d+)?$/, "Taxa de câmbio inválida.")
    .optional(),
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

    // [Task 3 — "edição... só valor/taxa dispara novo cálculo"] Uma
    // transferência já criada com taxa gravada nunca é recalculada ao
    // editar outro campo (ex: descrição). Só entra aqui quando a própria
    // transação já é uma TRANSFER multi-moeda (destinationCurrency != null)
    // E o pedido muda amountMinor e/ou exchangeRate.
    let destinationAmountMinor: bigint | null | undefined;
    if (parsed.data.amountMinor !== undefined || parsed.data.exchangeRate !== undefined) {
      const existing = await getTransactionById(session.userId, id);
      if (!existing) return NextResponse.json({ error: "Transação não encontrada." }, { status: 404 });
      if (existing.destinationCurrency) {
        const rate = parsed.data.exchangeRate ?? existing.exchangeRate;
        if (!rate) return NextResponse.json({ error: "Falta a taxa de câmbio desta transferência." }, { status: 400 });
        const amount = parsed.data.amountMinor !== undefined ? BigInt(parsed.data.amountMinor) : existing.amountMinor;
        try {
          destinationAmountMinor = convertByExchangeRate(amount, rate, existing.currency, existing.destinationCurrency);
        } catch (e) {
          return NextResponse.json({ error: e instanceof Error ? e.message : "Taxa de câmbio inválida." }, { status: 400 });
        }
      } else if (parsed.data.exchangeRate !== undefined) {
        // Taxa só faz sentido numa transferência multi-moeda já existente —
        // nunca inventada numa transação que nunca teve uma.
        return NextResponse.json({ error: "Esta transação não é uma transferência entre moedas diferentes." }, { status: 400 });
      }
    }

    const updated = await updateTransaction(session.userId, id, {
      amountMinor: parsed.data.amountMinor !== undefined ? BigInt(parsed.data.amountMinor) : undefined,
      destinationAmountMinor,
      exchangeRate: parsed.data.exchangeRate,
      categoryId: parsed.data.categoryId,
      description: parsed.data.description,
      date: parsed.data.date,
    });
    if (!updated) return NextResponse.json({ error: "Transação não encontrada." }, { status: 404 });

    return NextResponse.json({
      ...updated,
      amountMinor: updated.amountMinor.toString(),
      destinationAmountMinor: updated.destinationAmountMinor?.toString() ?? null,
    });
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
