import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { withErrorHandling } from "@/lib/api-error";
import { logError } from "@/lib/logger";
import { AiConfigError, AiProviderError, sendChatMessage } from "@/lib/ai/gateway";

// [Milestone 1 — AI Gateway] Só texto livre do utilizador, sem contexto
// financeiro nem histórico — ver src/lib/ai/gateway.ts para o porquê. O
// limite de 4000 carateres é só uma fronteira técnica razoável para uma
// única mensagem de chat, não uma regra de produto.
const ChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
});

// [Regra 6 do briefing, já aplicada em todas as outras rotas] userId vem
// sempre de getSessionUser() (cookie/Bearer validado), nunca do corpo do
// pedido — o cliente não tem forma de se fazer passar por outro utilizador.
export const POST = withErrorHandling("api.ai.chat.post", async (request: Request) => {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const reply = await sendChatMessage(parsed.data.message);
    return NextResponse.json({ reply });
  } catch (error) {
    // Nunca registar `parsed.data.message` (texto livre do utilizador) nos
    // logs — só o erro em si, tal como em qualquer outra rota (ver
    // src/lib/logger.ts).
    if (error instanceof AiConfigError) {
      logError("api.ai.chat.post", error);
      return NextResponse.json(
        { error: "O assistente não está disponível de momento. Tenta novamente mais tarde." },
        { status: 503 },
      );
    }
    if (error instanceof AiProviderError) {
      logError("api.ai.chat.post", error);
      return NextResponse.json(
        { error: "O assistente não conseguiu responder agora. Tenta novamente." },
        { status: 502 },
      );
    }
    // Qualquer outra exceção (ex: erro de rede não tipado) continua para
    // withErrorHandling — mesmo tratamento genérico usado em todas as rotas.
    throw error;
  }
});
