import { afterEach, describe, expect, it } from "vitest";
import { cancelConfirmation, consumeConfirmation, createConfirmation, _resetConfirmationStoreForTests } from "./confirmation-store";

const NOW = 1_000_000;
const FIVE_MIN = 5 * 60 * 1000;

function makeConfirmation(overrides: Partial<Parameters<typeof createConfirmation>[0]> = {}) {
  return createConfirmation(
    {
      userId: "user-1",
      toolCalls: [{ toolUseId: "toolu_1", toolName: "create_transaction", params: { amountMinor: 500, description: "Almoço" } }],
      summary: "Registar uma despesa de 500.",
      conversationSnapshot: { some: "state" },
      roundsUsed: 1,
      ...overrides,
    },
    NOW,
  );
}

describe("confirmation-store", () => {
  afterEach(() => {
    _resetConfirmationStoreForTests();
  });

  it("cria uma confirmação com um token opaco e não vazio", () => {
    const confirmation = makeConfirmation();
    expect(confirmation.token.length).toBeGreaterThan(20);
    expect(confirmation.status).toBe("pending");
  });

  it("dois tokens gerados nunca colidem (aleatoriedade suficiente)", () => {
    const a = makeConfirmation();
    const b = makeConfirmation();
    expect(a.token).not.toBe(b.token);
  });

  it("consumeConfirmation com sucesso devolve os toolCalls e params exatos guardados na proposta", () => {
    const confirmation = makeConfirmation();
    const result = consumeConfirmation(confirmation.token, "user-1", NOW + 1000);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.confirmation.toolCalls).toEqual([
        { toolUseId: "toolu_1", toolName: "create_transaction", params: { amountMinor: 500, description: "Almoço" } },
      ]);
    }
  });

  it("token errado (inexistente) é rejeitado com not_found", () => {
    const result = consumeConfirmation("token-que-nao-existe", "user-1", NOW);
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("token de outro utilizador é rejeitado — nunca revela que o token existe para outra pessoa", () => {
    const confirmation = makeConfirmation({ userId: "user-1" });
    const result = consumeConfirmation(confirmation.token, "user-2", NOW);
    expect(result).toEqual({ ok: false, reason: "not_found" }); // nunca "wrong_user" — anti-enumeração
  });

  it("token expirado é rejeitado com expired", () => {
    const confirmation = makeConfirmation();
    const result = consumeConfirmation(confirmation.token, "user-1", NOW + FIVE_MIN + 1);
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("uma confirmação já consumida não pode ser reutilizada", () => {
    const confirmation = makeConfirmation();
    const first = consumeConfirmation(confirmation.token, "user-1", NOW + 10);
    expect(first.ok).toBe(true);

    const second = consumeConfirmation(confirmation.token, "user-1", NOW + 20);
    expect(second).toEqual({ ok: false, reason: "already_used" });
  });

  it("os parâmetros não podem ser alterados depois da proposta — consumeConfirmation nunca aceita novos params, só devolve os guardados", () => {
    const confirmation = makeConfirmation({
      toolCalls: [{ toolUseId: "toolu_1", toolName: "create_transaction", params: { amountMinor: 500 } }],
    });
    // A API nem sequer tem um parâmetro para "novos params" — consumeConfirmation
    // só recebe token + userId. Isto é a prova estrutural de que um cliente não
    // pode transformar 500 em 50000 nesta chamada.
    const result = consumeConfirmation(confirmation.token, "user-1", NOW + 10);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.confirmation.toolCalls[0].params).toEqual({ amountMinor: 500 });
    }
  });

  it("cancelConfirmation impede uma consumição posterior", () => {
    const confirmation = makeConfirmation();
    const cancelled = cancelConfirmation(confirmation.token, "user-1", NOW + 10);
    expect(cancelled).toEqual({ ok: true });

    const consumeAttempt = consumeConfirmation(confirmation.token, "user-1", NOW + 20);
    expect(consumeAttempt).toEqual({ ok: false, reason: "already_used" });
  });

  it("cancelConfirmation também respeita ownership (token de outro utilizador → not_found)", () => {
    const confirmation = makeConfirmation({ userId: "user-1" });
    const result = cancelConfirmation(confirmation.token, "user-2", NOW);
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("cancelConfirmation num token já expirado devolve expired", () => {
    const confirmation = makeConfirmation();
    const result = cancelConfirmation(confirmation.token, "user-1", NOW + FIVE_MIN + 1);
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  describe("concorrência — duas requests a confirmar o mesmo token ao mesmo tempo", () => {
    // [Porque isto é seguro por construção, não por sorte] consumeConfirmation
    // não tem NENHUM `await`/I/O — é pura sincronia. O JavaScript do Node
    // corre num único thread: uma função síncrona corre do início ao fim sem
    // ceder o controlo a mais ninguém no meio. Por isso, mesmo que duas
    // pedidos HTTP "cheguem ao mesmo tempo" (duas chamadas a
    // confirmPendingAction disparadas em paralelo), a MUDANÇA DE ESTADO
    // (pending -> consumed) de cada uma delas é atómica entre si — não existe
    // uma janela onde as duas leem "pending" antes de qualquer uma escrever
    // "consumed". Isto só vale DENTRO DE UMA INSTÂNCIA do processo Node
    // (ver auditoria de "in-memory storage" no relatório).
    it("Promise.all a consumir o mesmo token duas vezes: só uma tem sucesso", () => {
      const confirmation = makeConfirmation();

      const [a, b] = [
        consumeConfirmation(confirmation.token, "user-1", NOW + 10),
        consumeConfirmation(confirmation.token, "user-1", NOW + 10),
      ];

      const successes = [a, b].filter((r) => r.ok);
      const failures = [a, b].filter((r) => !r.ok);
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      if (!failures[0].ok) expect(failures[0].reason).toBe("already_used");
    });

    /**
     * Teste mais rigoroso: simula o padrão REAL do orquestrador —
     * `consumeConfirmation` (síncrono) seguido de trabalho assíncrono lento
     * (o equivalente a `executeConfirmedTool` -> escrita na base de dados).
     * As duas "requests" arrancam via Promise.all — cada uma corre a sua
     * parte síncrona (incluindo o consumo) até ao primeiro `await`, ANTES de
     * a outra sequer começar o seu trabalho assíncrono. Prova que o "portão"
     * fecha antes de qualquer escrita financeira começar, não depois.
     */
    it("simula duas requests concorrentes com trabalho assíncrono lento a seguir ao consumo — a tool nunca executa duas vezes", async () => {
      const confirmation = makeConfirmation();
      let executions = 0;

      async function simulateConfirmRequest() {
        const result = consumeConfirmation(confirmation.token, "user-1", NOW + 10);
        if (!result.ok) return result;
        // Simula a escrita real na base de dados (lenta, depois do portão já ter fechado).
        await new Promise((resolve) => setTimeout(resolve, 20));
        executions += 1;
        return result;
      }

      const [a, b] = await Promise.all([simulateConfirmRequest(), simulateConfirmRequest()]);

      const successes = [a, b].filter((r) => r.ok);
      expect(successes).toHaveLength(1);
      expect(executions).toBe(1); // nunca duas execuções financeiras para a mesma confirmação
    });
  });
});
