import { afterEach, describe, expect, it, vi } from "vitest";
import { getPool } from "./client";
import * as logger from "@/lib/logger";

describe("bug crítico da auditoria Go-to-Beta: erro de ligação não pode derrubar o processo", () => {
  afterEach(() => {
    // getPool() usa um singleton em `global` — cada teste começa com uma
    // pool nova para não interferir com o estado dos outros.
    delete (global as unknown as { __kontaPgPool?: unknown }).__kontaPgPool;
    vi.restoreAllMocks();
  });

  it("um evento 'error' na pool é registado (logError) e NÃO é relançado como exceção não tratada", () => {
    const pool = getPool();
    const logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});

    // Reproduz exatamente o cenário do achado 5.3: uma ligação IDLE perde-se
    // (ex: o Postgres reiniciou, a rede falhou) e o driver `pg` emite
    // 'error' na Pool. Antes da correção, sem nenhum listener registado,
    // isto seria uma exceção não tratada do EventEmitter e derrubaria todo o
    // processo Next.js — não só o pedido em curso.
    const connectionLost = Object.assign(new Error("Connection terminated unexpectedly"), {
      code: "ECONNRESET",
    });

    // Se não houvesse listener 'error' registado, esta linha lançaria a
    // exceção e o teste falharia com um erro não apanhado — a própria
    // chamada a `expect(...).not.toThrow()` é a prova de que a correção
    // funciona.
    expect(() => pool.emit("error", connectionLost)).not.toThrow();

    // E o erro não pode desaparecer silenciosamente — tem de ficar
    // registado (Prioridade 2: "não pode esconder o erro").
    expect(logErrorSpy).toHaveBeenCalledWith("db.pool", connectionLost);
  });
});
