import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api-error";
import { MAX_ATTACHMENTS_PER_MESSAGE } from "@/lib/ai/attachments";
import { AiConfigError, AiProviderError } from "@/lib/ai/gateway";
import { cancelPendingAction, confirmPendingAction, sendMessage } from "@/lib/ai/chat";
import { getSessionUser } from "@/lib/auth/session";
import { isAiEnabled } from "@/lib/db/users";
import { checkRateLimit } from "@/lib/rate-limit";

// [Milestone 4] Três ações possíveis — nunca um campo "userId" em nenhuma
// delas. A identidade vem sempre de getSessionUser() (regra 6 do briefing,
// já aplicada em todas as outras rotas); o cliente não tem forma de se
// fazer passar por outro utilizador.
//
// [Milestone 5a — Multimodal] `message` deixou de exigir `min(1)` — uma
// mensagem pode ser só um attachment (ex: uma foto de recibo sem legenda).
// A regra "tem de haver pelo menos texto OU um attachment" é validada à
// parte, depois do parse (ver abaixo) — um `.refine()` aqui quebraria
// `z.discriminatedUnion` (mesma limitação já documentada em
// src/lib/ai/tools/tools/create-transaction.ts).
const SendMessageSchema = z.object({
  action: z.literal("message"),
  message: z.string().trim().max(4000),
  // [Milestone 5a] Ids devolvidos por POST /api/ai/attachments — nunca
  // bytes no corpo desta rota. Ownership verificado de novo no Orchestrator
  // (nunca confiar só em o cliente ter recebido o id de um upload seu).
  attachmentIds: z.array(z.string().min(1).max(64)).max(MAX_ATTACHMENTS_PER_MESSAGE).optional(),
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

  // [Sugestão do utilizador — "quero poder ativar/desativar o acesso ao
  // Konta AI por utilizador"] Verificado ANTES do rate limit e de qualquer
  // parsing do corpo — um utilizador desativado não deve sequer gastar a
  // sua quota de pedidos a descobrir isso. Aplica-se às três ações
  // (message/confirm/cancel): desativar o acesso bloqueia por completo,
  // nunca só "não inicies conversas novas" — mesma leitura estrita que um
  // dono de produto esperaria de um interruptor "desativar para este
  // utilizador". Ver src/lib/db/users.ts::isAiEnabled (fail-closed).
  if (!(await isAiEnabled(session.userId))) {
    return NextResponse.json({ error: "O acesso ao Konta AI foi desativado para a tua conta." }, { status: 403 });
  }

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

  // [Milestone 5a] Ver comentário junto de SendMessageSchema — esta regra não
  // pode viver num `.refine()` do schema (quebraria o discriminatedUnion).
  if (parsed.data.action === "message" && parsed.data.message.length === 0 && !parsed.data.attachmentIds?.length) {
    return NextResponse.json({ error: "Escreve uma mensagem ou anexa pelo menos um ficheiro." }, { status: 400 });
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
        : await sendMessage({
            userId: session.userId,
            message: parsed.data.message,
            attachmentIds: parsed.data.attachmentIds,
            history: parsed.data.history,
          });

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
