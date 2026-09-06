import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api-error";
import { AiConfigError, AiProviderError } from "@/lib/ai/gateway";
import { cancelPendingAction, confirmPendingAction, sendMessage } from "@/lib/ai/chat";
import { getSessionUser } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/rate-limit";

// [Milestone 4] Três ações possíveis — nunca um campo "userId" em nenhuma
// delas. A identidade vem sempre de getSessionUser() (regra 6 do briefing,
// já aplicada em todas as outras rotas); o cliente não tem forma de se
// fazer passar por outro utilizador.
const SendMessageSchema = z.object({
  action: z.literal("message"),
  message: z.string().trim().min(1).max(4000),
  // Histórico gerido pelo cliente (sem memória persistida no servidor nesta
  // fase — ver docs/architecture/OVERVIEW.md). Limitado em tamanho e em
  // número de turnos para nunca virar um payload arbitrariamente grande.
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) }))
    .max(20)
    .optional(),
});
const ConfirmActionSchema = z.object({ action: z.literal("confirm"), confirmationToken: z.string().min(1).max(200) });
const CancelActionSchema = z.object({ action: z.literal("cancel"), confirmationToken: z.string().min(1).max(200) });

const ChatRequestSchema = z.discriminatedUnion("action", [SendMessageSchema, ConfirmActionSchema, CancelActionSchema]);

// [Custo/abuso — RATE / COST CONTROL] Reutiliza src/lib/rate-limit.ts, já
// usado em login/registo/feedback — nenhuma dependência nova. Chaveado por
// utilizador autenticado (não por IP, ao contrário de login/registo, porque
// aqui já sabemos quem é) — mesmo padrão de POST /api/feedback. Não é
// billing nem um limite diário "a sério" (isso fica documentado como
// próximo passo); só um limite básico contra um cliente a martelar a rota.
const CHAT_RATE_LIMIT = 20;
const CHAT_RATE_WINDOW_MS = 10 * 60 * 1000;

export const POST = withErrorHandling("api.ai.chat.post", async (request: Request) => {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const rateLimit = checkRateLimit(`ai.chat:${session.userId}`, CHAT_RATE_LIMIT, CHAT_RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiados pedidos. Tenta novamente daqui a pouco." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    if (parsed.data.action === "cancel") {
      const outcome = cancelPendingAction(session.userId, parsed.data.confirmationToken);
      if (outcome.type === "error") {
        return NextResponse.json({ error: outcome.message }, { status: 400 });
      }
      return NextResponse.json({ status: "cancelled" });
    }

    const outcome =
      parsed.data.action === "confirm"
        ? await confirmPendingAction(session.userId, parsed.data.confirmationToken)
        : await sendMessage({ userId: session.userId, message: parsed.data.message, history: parsed.data.history });

    if (outcome.type === "final") {
      return NextResponse.json({ status: "final", reply: outcome.reply });
    }
    if (outcome.type === "confirmation_required") {
      return NextResponse.json({
        status: "confirmation_required",
        confirmationToken: outcome.confirmationToken,
        summary: outcome.summary,
        riskTier: outcome.riskTier,
      });
    }
    // outcome.type === "error" — nunca chega aqui a partir de "cancel" (tratado acima).
    // Erro de confirmação inválida/expirada é um 400 (o cliente pode corrigir: pedir de novo);
    // erro do próprio Gateway/Claude é um 502 (falha do lado do fornecedor).
    const status = parsed.data.action === "confirm" ? 400 : 502;
    return NextResponse.json({ error: outcome.message }, { status });
  } catch (error) {
    // AiConfigError/AiProviderError não deviam escapar do orquestrador (ele
    // já as apanha e devolve um outcome "error") — mas se algum caminho novo
    // algum dia deixar passar, tratamos aqui também, nunca deixando a
    // mensagem técnica chegar ao cliente.
    if (error instanceof AiConfigError) {
      return NextResponse.json({ error: "O assistente não está disponível de momento. Tenta novamente mais tarde." }, { status: 503 });
    }
    if (error instanceof AiProviderError) {
      return NextResponse.json({ error: "O assistente não conseguiu responder agora. Tenta novamente." }, { status: 502 });
    }
    throw error;
  }
});
