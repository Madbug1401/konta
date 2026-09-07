import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminEmail } from "@/lib/auth/admin";
import { getSessionUser } from "@/lib/auth/session";
import { setAiEnabledForUser } from "@/lib/db/admin";
import { withErrorHandling } from "@/lib/api-error";

const SetAiAccessSchema = z.object({ enabled: z.boolean() });

// [Sugestão do utilizador — "quero poder ativar/desativar o acesso ao Konta
// AI por utilizador"] Primeira rota de API restrita ao dono do projeto —
// mesma filosofia de autorização já usada em /admin
// (src/app/(app)/admin/page.tsx): 404 genérico ("Não encontrado.") para
// quem não está em ADMIN_EMAILS, nunca "não autorizado"/403. Um 404 não
// confirma sequer que esta rota existe a quem esteja a adivinhar URLs —
// mesmo comportamento fail-closed de isAdminEmail (src/lib/auth/admin.ts):
// sem ADMIN_EMAILS configurado, ninguém, nem o próprio dono, consegue
// chamar isto.
export const POST = withErrorHandling(
  "api.admin.users.[userId].ai-access.post",
  async (request: Request, { params }: { params: Promise<{ userId: string }> }) => {
    const session = await getSessionUser();
    if (!session || !isAdminEmail(session.email)) {
      return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
    }

    const { userId } = await params;
    const body = await request.json().catch(() => null);
    const parsed = SetAiAccessSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });
    }

    const updated = await setAiEnabledForUser(userId, parsed.data.enabled);
    if (!updated) return NextResponse.json({ error: "Utilizador não encontrado." }, { status: 404 });

    return NextResponse.json({ ok: true, aiEnabled: parsed.data.enabled });
  },
);
