import { describe, expect, it, vi } from "vitest";
import { GENERIC_ERROR_MESSAGE, NotFoundError, withErrorHandling } from "./api-error";
import * as logger from "@/lib/logger";

describe("withErrorHandling", () => {
  it("deixa passar uma resposta normal sem alterações", async () => {
    const handler = withErrorHandling("test.ok", async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const response = await handler();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("converte um NotFoundError num 404 com a mensagem do erro", async () => {
    const handler = withErrorHandling("test.not-found", async () => {
      throw new NotFoundError("Conta não encontrada.");
    });
    const response = await handler();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Conta não encontrada." });
  });

  it("bug que isto evita: um erro inesperado não pode rebentar para fora do handler (ficava sem resposta / crash da rota)", async () => {
    const handler = withErrorHandling("test.unexpected", async () => {
      throw new Error("ECONNREFUSED: a base de dados está em baixo");
    });
    // Antes desta correção, chamar o handler diretamente teria lançado a
    // exceção — quem chama (o Next.js, a correr a rota) não a apanha
    // sozinho, resultando numa resposta de erro genérica do próprio
    // framework em vez de um JSON previsível.
    await expect(handler()).resolves.toBeInstanceOf(Response);
  });

  it("nunca expõe a mensagem técnica do erro na resposta — só a mensagem genérica exigida", async () => {
    const logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});
    const handler = withErrorHandling("test.leak", async () => {
      throw new Error("password incorreta para o utilizador admin@konta.cv");
    });
    const response = await handler();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: GENERIC_ERROR_MESSAGE });
    expect(JSON.stringify(body)).not.toContain("admin@konta.cv");

    // Mas o erro técnico TEM de ficar registado no servidor — "sem erros
    // silenciosos" é tão importante como "não vazar detalhes ao cliente".
    expect(logErrorSpy).toHaveBeenCalledWith("test.leak", expect.any(Error));
    logErrorSpy.mockRestore();
  });
});
