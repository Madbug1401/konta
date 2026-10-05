import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminEmail } from "@/lib/auth/admin";
import { getSessionUser } from "@/lib/auth/session";
import { createNotification } from "@/lib/db/notifications";
import { withErrorHandling } from "@/lib/api-error";

const CreateNotificationSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

// [Sugestão do utilizador — "quero enviar mensagens aos meus users, como
// notificação"] Mesmo padrão de autorização de
// src/app/api/admin/users/[userId]/ai-access/route.ts: 404 genérico para
// quem não está em ADMIN_EMAILS, nunca 403 — não confirma sequer que esta
// rota existe. Broadcast para todos os utilizadores de uma vez (ver
// createNotification), sem campo de destinatário — não há como enviar só a
// alguns nesta v1.
export const POST = withErrorHandling("api.admin.notifications.post", async (request: Request) => {
  const session = await getSessionUser();
  if (!session || !isAdminEmail(session.email)) {
    return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = CreateNotificationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Escreve uma mensagem antes de enviar." }, { status: 400 });
  }

  await createNotification(parsed.data.message);
  return NextResponse.json({ ok: true }, { status: 201 });
});
