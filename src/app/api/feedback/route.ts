import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { createFeedback } from "@/lib/db/feedback";
import { checkRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-error";

const FeedbackSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

// [Sugestão do utilizador — feedback direto na app] Limite generoso (5 por
// hora, por utilizador autenticado — nunca por IP, já que aqui já sabemos
// quem é): o objetivo é impedir um script a martelar a rota, nunca dificultar
// uma pessoa real a mandar duas ou três mensagens seguidas se se lembrar de
// mais alguma coisa. Mesmo padrão de src/lib/rate-limit.ts já usado em
// login/registo.
const FEEDBACK_RATE_LIMIT = 5;
const FEEDBACK_RATE_WINDOW_MS = 60 * 60 * 1000;

export const POST = withErrorHandling("api.feedback.post", async (request: Request) => {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const rateLimit = checkRateLimit(`feedback:${session.userId}`, FEEDBACK_RATE_LIMIT, FEEDBACK_RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas mensagens. Tenta novamente mais tarde." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Escreve uma mensagem antes de enviar." }, { status: 400 });
  }

  // [Sugestão do utilizador — "quero um campo para me dar feedback direto no
  // aplicativo"] userId vem sempre da sessão, nunca do corpo do pedido — a
  // mesma regra já aplicada a todas as outras rotas de escrita.
  await createFeedback(session.userId, parsed.data.message);
  return NextResponse.json({ ok: true }, { status: 201 });
});
