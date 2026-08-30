import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getDebtById, markDebtDefaulted } from "@/lib/db/debts";
import { withErrorHandling } from "@/lib/api-error";

// [Fase 3 — arquivar/encerrar] Sem body — marcar como incumprida não tem
// nenhum campo a preencher, só a confirmação (feita no cliente, via
// window.confirm, antes desta rota sequer ser chamada). Irreversível: ver
// o comentário junto a `markDebtDefaulted` em src/lib/db/debts.ts.
export const POST = withErrorHandling(
  "api.debts.[debtId].default",
  async (_request: Request, { params }: { params: Promise<{ debtId: string }> }) => {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { debtId } = await params;

    // Confirma posse e estado atual antes de tentar a transição, para
    // devolver uma mensagem específica em vez de um 404 genérico quando a
    // dívida existe mas já não está ACTIVE.
    const existing = await getDebtById(session.userId, debtId);
    if (!existing) return NextResponse.json({ error: "Dívida não encontrada." }, { status: 404 });
    if (existing.status !== "ACTIVE") {
      return NextResponse.json({ error: "Só uma dívida ativa pode ser marcada como incumprida." }, { status: 409 });
    }

    const updated = await markDebtDefaulted(session.userId, debtId);
    if (!updated) return NextResponse.json({ error: "Não foi possível marcar a dívida como incumprida." }, { status: 409 });

    return NextResponse.json({ ...updated, originalAmountMinor: updated.originalAmountMinor.toString() });
  },
);
