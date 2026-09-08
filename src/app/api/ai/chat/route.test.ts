import { afterEach, describe, expect, it, vi } from "vitest";
import { _resetRateLimitState } from "@/lib/rate-limit";

const getSessionUserMock = vi.fn();
const sendMessageMock = vi.fn();
const confirmPendingActionMock = vi.fn();
const cancelPendingActionMock = vi.fn();
// [Sugestão do utilizador — "quero poder ativar/desativar o acesso ao Konta
// AI por utilizador"] Por omissão resolve `true` em todos os testes já
// existentes (nenhum deles é sobre este interruptor) — clearAllMocks() só
// limpa histórico de chamadas, nunca a implementação definida com
// mockResolvedValue, por isso este valor por omissão sobrevive entre
// testes. Os testes do novo bloco "acesso desativado" abaixo é que o
// substituem, um de cada vez, com mockResolvedValueOnce(false).
const isAiEnabledMock = vi.fn().mockResolvedValue(true);

vi.mock("@/lib/auth/session", () => ({ getSessionUser: getSessionUserMock }));
vi.mock("@/lib/db/users", () => ({ isAiEnabled: isAiEnabledMock }));
vi.mock("@/lib/ai/chat", () => ({
  sendMessage: sendMessageMock,
  confirmPendingAction: confirmPendingActionMock,
  cancelPendingAction: cancelPendingActionMock,
}));

const SESSION = { userId: "user-1", email: "user1@konta.cv" };

function postRequest(body: unknown) {
  return new Request("http://localhost/api/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/chat", () => {
  afterEach(() => {
    vi.clearAllMocks();
    _resetRateLimitState();
  });

  describe("autenticação e validação", () => {
    it("rejeita um pedido sem sessão com 401, sem chamar o orquestrador", async () => {
      getSessionUserMock.mockResolvedValue(null);

      const { POST } = await import("./route");
      const response = await POST(postRequest({ action: "message", message: "Olá" }));

      expect(response.status).toBe(401);
      expect(sendMessageMock).not.toHaveBeenCalled();
    });

    it("rejeita um corpo sem 'action' reconhecido com 400", async () => {
      getSessionUserMock.mockResolvedValue(SESSION);
      const { POST } = await import("./route");
      const response = await POST(postRequest({ message: "Olá" }));
      expect(response.status).toBe(400);
      expect(sendMessageMock).not.toHaveBeenCalled();
    });

    it("rejeita uma mensagem vazia com 400", async () => {
      getSessionUserMock.mockResolvedValue(SESSION);
      const { POST } = await import("./route");
      const response = await POST(postRequest({ action: "message", message: "   " }));
      expect(response.status).toBe(400);
      expect(sendMessageMock).not.toHaveBeenCalled();
    });

    it("rejeita uma mensagem acima do limite de tamanho", async () => {
      getSessionUserMock.mockResolvedValue(SESSION);
      const { POST } = await import("./route");
      const response = await POST(postRequest({ action: "message", message: "x".repeat(4001) }));
      expect(response.status).toBe(400);
    });

    it("rejeita um history com mais de 20 turnos", async () => {
      getSessionUserMock.mockResolvedValue(SESSION);
      const history = Array.from({ length: 21 }, () => ({ role: "user" as const, content: "x" }));
      const { POST } = await import("./route");
      const response = await POST(postRequest({ action: "message", message: "Olá", history }));
      expect(response.status).toBe(400);
      expect(sendMessageMock).not.toHaveBeenCalled();
    });

    it("action 'confirm' sem confirmationToken é rejeitado com 400", async () => {
      getSessionUserMock.mockResolvedValue(SESSION);
      const { POST } = await import("./route");
      const response = await POST(postRequest({ action: "confirm" }));
      expect(response.status).toBe(400);
    });
  });

  // [Milestone 5a — Multimodal]
  describe("attachments", () => {
    it("mensagem só com attachmentIds (sem texto) é aceite — uma imagem pode não ter legenda", async () => {
      getSessionUserMock.mockResolvedValue(SESSION);
      sendMessageMock.mockResolvedValue({ type: "final", reply: "ok" });
      const { POST } = await import("./route");

      const response = await POST(postRequest({ action: "message", message: "", attachmentIds: ["att_1"] }));

      expect(response.status).toBe(200);
      expect(sendMessageMock).toHaveBeenCalledWith(expect.objectContaining({ attachmentIds: ["att_1"] }));
    });

    it("mensagem vazia E sem attachmentIds continua rejeitada com 400", async () => {
      getSessionUserMock.mockResolvedValue(SESSION);
      const { POST } = await import("./route");

      const response = await POST(postRequest({ action: "message", message: "", attachmentIds: [] }));

      expect(response.status).toBe(400);
      expect(sendMessageMock).not.toHaveBeenCalled();
    });

    it("rejeita mais attachmentIds do que o limite permitido por mensagem", async () => {
      getSessionUserMock.mockResolvedValue(SESSION);
      const { POST } = await import("./route");

      const response = await POST(postRequest({ action: "message", message: "olá", attachmentIds: ["a", "b", "c", "d", "e"] }));

      expect(response.status).toBe(400);
      expect(sendMessageMock).not.toHaveBeenCalled();
    });
  });

  // [Sugestão do utilizador — "quero poder ativar/desativar o acesso ao
  // Konta AI por utilizador"] Verificação nova, à frente de tudo o resto
  // (antes do rate limit e do parsing do corpo) — ver comentário em
  // ./route.ts junto de isAiEnabled.
  describe("acesso desativado (isAiEnabled)", () => {
    it("bloqueia 'message' com 403 quando o acesso está desativado, sem chamar o orquestrador nem gastar rate limit", async () => {
      getSessionUserMock.mockResolvedValue(SESSION);
      isAiEnabledMock.mockResolvedValueOnce(false);

      const { POST } = await import("./route");
      const response = await POST(postRequest({ action: "message", message: "Olá" }));

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "O acesso ao Konta AI foi desativado para a tua conta." });
      expect(sendMessageMock).not.toHaveBeenCalled();
    });

    it("bloqueia também 'confirm' com 403 — desativar o acesso é uma paragem total, não só \"não inicies conversas novas\"", async () => {
      getSessionUserMock.mockResolvedValue(SESSION);
      isAiEnabledMock.mockResolvedValueOnce(false);

      const { POST } = await import("./route");
      const response = await POST(postRequest({ action: "confirm", confirmationToken: "tok_abc" }));

      expect(response.status).toBe(403);
      expect(confirmPendingActionMock).not.toHaveBeenCalled();
    });

    it("bloqueia também 'cancel' com 403", async () => {
      getSessionUserMock.mockResolvedValue(SESSION);
      isAiEnabledMock.mockResolvedValueOnce(false);

      const { POST } = await import("./route");
      const response = await POST(postRequest({ action: "cancel", confirmationToken: "tok_abc" }));

      expect(response.status).toBe(403);
      expect(cancelPendingActionMock).not.toHaveBeenCalled();
    });

    it("verifica isAiEnabled com o userId da sessão, nunca com um valor do corpo do pedido", async () => {
      getSessionUserMock.mockResolvedValue(SESSION);
      sendMessageMock.mockResolvedValue({ type: "final", reply: "ok" });

      const { POST } = await import("./route");
      await POST(postRequest({ action: "message", message: "Olá", userId: "outro-utilizador" }));

      expect(isAiEnabledMock).toHaveBeenCalledWith("user-1");
    });

    it("com o acesso ativado (omisso — valor por omissão do mock), o pedido segue normalmente", async () => {
      getSessionUserMock.mockResolvedValue(SESSION);
      sendMessageMock.mockResolvedValue({ type: "final", reply: "ok" });

      const { POST } = await import("./route");
      const response = await POST(postRequest({ action: "message", message: "Olá" }));

      expect(response.status).toBe(200);
    });
  });

  describe("identidade", () => {
    it("userId vem sempre da sessão — nunca é lido nem influenciado por um campo do corpo", async () => {
      getSessionUserMock.mockResolvedValue(SESSION);
      sendMessageMock.mockResolvedValue({ type: "final", reply: "ok" });

      const { POST } = await import("./route");
      await POST(postRequest({ action: "message", message: "Olá", userId: "outro-utilizador" }));

      expect(sendMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1", message: "Olá" }),
      );
      // O schema nem tem campo "userId" — confirma que não sobreviveu ao parse.
      const callArg = sendMessageMock.mock.calls[0][0];
      expect(callArg).not.toHaveProperty("userIdOverride");
      expect(callArg.userId).toBe("user-1");
    });

    it("confirmPendingAction/cancelPendingAction também recebem sempre o userId da sessão", async () => {
      getSessionUserMock.mockResolvedValue(SESSION);
      confirmPendingActionMock.mockResolvedValue({ type: "final", reply: "ok" });
      cancelPendingActionMock.mockReturnValue({ type: "cancelled" });

      const { POST } = await import("./route");
      await POST(postRequest({ action: "confirm", confirmationToken: "tok_abc" }));
      await POST(postRequest({ action: "cancel", confirmationToken: "tok_abc" }));

      expect(confirmPendingActionMock).toHaveBeenCalledWith("user-1", "tok_abc");
      expect(cancelPendingActionMock).toHaveBeenCalledWith("user-1", "tok_abc");
    });
  });

  describe("respostas", () => {
    it("mensagem válida: devolve 200 com status final e a resposta", async () => {
      getSessionUserMock.mockResolvedValue(SESSION);
      sendMessageMock.mockResolvedValue({ type: "final", reply: "Tens 25000 CVE." });

      const { POST } = await import("./route");
      const response = await POST(postRequest({ action: "message", message: "Quanto tenho?" }));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "final", reply: "Tens 25000 CVE." });
    });

    it("HIGH: devolve 200 com status confirmation_required, token, summary e riskTier", async () => {
      getSessionUserMock.mockResolvedValue(SESSION);
      sendMessageMock.mockResolvedValue({
        type: "confirmation_required",
        confirmationToken: "tok_abc123",
        summary: "Registar uma despesa de 500.",
        riskTier: "HIGH",
      });

      const { POST } = await import("./route");
      const response = await POST(postRequest({ action: "message", message: "Gastei 500 no almoço" }));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        status: "confirmation_required",
        confirmationToken: "tok_abc123",
        summary: "Registar uma despesa de 500.",
        riskTier: "HIGH",
      });
    });

    it("confirmação válida: devolve 200 com status final depois de confirmar", async () => {
      getSessionUserMock.mockResolvedValue(SESSION);
      confirmPendingActionMock.mockResolvedValue({ type: "final", reply: "Registei a despesa." });

      const { POST } = await import("./route");
      const response = await POST(postRequest({ action: "confirm", confirmationToken: "tok_abc123" }));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "final", reply: "Registei a despesa." });
    });

    it("token de confirmação inválido/expirado: devolve 400 com a mensagem segura do orquestrador", async () => {
      getSessionUserMock.mockResolvedValue(SESSION);
      confirmPendingActionMock.mockResolvedValue({ type: "error", message: "Esta confirmação expirou. Pede a ação outra vez." });

      const { POST } = await import("./route");
      const response = await POST(postRequest({ action: "confirm", confirmationToken: "tok_expirado" }));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Esta confirmação expirou. Pede a ação outra vez." });
    });

    it("cancelamento válido: devolve 200 com status cancelled, nunca executa nada", async () => {
      getSessionUserMock.mockResolvedValue(SESSION);
      cancelPendingActionMock.mockReturnValue({ type: "cancelled" });

      const { POST } = await import("./route");
      const response = await POST(postRequest({ action: "cancel", confirmationToken: "tok_abc123" }));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "cancelled" });
    });

    it("erro do Gateway/Claude durante uma mensagem: devolve 502, nunca 400", async () => {
      getSessionUserMock.mockResolvedValue(SESSION);
      sendMessageMock.mockResolvedValue({ type: "error", message: "O assistente não está disponível de momento. Tenta novamente." });

      const { POST } = await import("./route");
      const response = await POST(postRequest({ action: "message", message: "Olá" }));

      expect(response.status).toBe(502);
    });
  });

  describe("rate limiting", () => {
    it("bloqueia depois do limite de pedidos por utilizador, com Retry-After", async () => {
      getSessionUserMock.mockResolvedValue(SESSION);
      sendMessageMock.mockResolvedValue({ type: "final", reply: "ok" });
      const { POST } = await import("./route");

      for (let i = 0; i < 20; i++) {
        const response = await POST(postRequest({ action: "message", message: "Olá" }));
        expect(response.status).toBe(200);
      }
      const blocked = await POST(postRequest({ action: "message", message: "Olá" }));
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get("Retry-After")).toBeTruthy();
    });

    it("o limite é contado por utilizador — outro utilizador não é afetado", async () => {
      sendMessageMock.mockResolvedValue({ type: "final", reply: "ok" });
      const { POST } = await import("./route");

      getSessionUserMock.mockResolvedValue(SESSION);
      for (let i = 0; i < 20; i++) await POST(postRequest({ action: "message", message: "Olá" }));

      getSessionUserMock.mockResolvedValue({ userId: "user-2", email: "user2@konta.cv" });
      const response = await POST(postRequest({ action: "message", message: "Olá" }));
      expect(response.status).toBe(200);
    });
  });

  describe("privacidade dos erros", () => {
    it("nunca regista/expõe o texto da mensagem do utilizador numa resposta de erro", async () => {
      getSessionUserMock.mockResolvedValue(SESSION);
      sendMessageMock.mockResolvedValue({ type: "error", message: "O assistente não conseguiu responder agora. Tenta novamente." });

      const { POST } = await import("./route");
      const response = await POST(postRequest({ action: "message", message: "informação financeira sensível do utilizador" }));
      const body = await response.json();

      expect(JSON.stringify(body)).not.toContain("informação financeira sensível");
    });
  });
});
