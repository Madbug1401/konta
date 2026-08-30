import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { setAccountArchived } from "@/lib/db/accounts";
import { withErrorHandling } from "@/lib/api-error";

const ArchiveAccountSchema = z.object({ archived: z.boolean() });

// [Fase 3 — arquivar/encerrar] Rota própria (em vez de mais um campo no
// PATCH genérico de src/app/api/accounts/[id]/route.ts) — arquivar não é
// "editar um dado da conta", é uma transição de estado com efeitos próprios
// (rejeitar a conta como origem/destino de novas transações, sumir dos
// seletores de conta), por isso merece o seu próprio endpoint, mesmo padrão
// que as Fases 3 seguintes (Dívida → DEFAULTED, Meta → status) vão usar.
export const POST = withErrorHandling(
  "api.accounts.[id].archive",
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = ArchiveAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });
    }

    const updated = await setAccountArchived(session.userId, id, parsed.data.archived);
    if (!updated) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });

    return NextResponse.json({ ...updated, initialBalanceMinor: updated.initialBalanceMinor.toString() });
  },
);
