// ============================================================================
// KONTA — tratamento de erros das rotas de API (Pre-Beta Hardening,
// Prioridade 4).
//
// [DECISÃO] Em vez de repetir `try { ... } catch { ... }` em cada uma das 8
// rotas de API (risco real de esquecer uma, ou de cada uma devolver uma
// mensagem/estrutura ligeiramente diferente), este `withErrorHandling` é um
// wrapper único: qualquer exceção não apanhada dentro do handler é
// registada (`logError`, com contexto = nome da rota) e transformada numa
// resposta genérica e segura. Nunca deixa uma exceção não tratada rebentar
// para fora do handler (isso seria "erro silencioso" do ponto de vista do
// utilizador: uma página em branco ou um erro genérico do Next.js em vez de
// uma resposta JSON previsível), e nunca expõe a mensagem técnica do erro
// nem o stack trace na resposta HTTP — só no log do servidor.
//
// A mensagem devolvida ao cliente é sempre a mesma, por pedido explícito do
// utilizador: "Algo correu mal. Tenta novamente."
//
// `UnauthorizedError`/`NotFoundError` (ver abaixo) permitem que uma rota
// sinalize casos esperados (não autenticado, recurso não encontrado) só com
// `throw`, sem cada rota ter de repetir `if (!session) return
// NextResponse.json(...)` só para estes dois casos comuns — mas as rotas
// existentes que já faziam essa verificação manualmente continuam a
// funcionar sem alterações (`withErrorHandling` não obriga a reescrever
// nada que já funcionava).
// ============================================================================

import { NextResponse } from "next/server";
import { logError } from "@/lib/logger";

export const GENERIC_ERROR_MESSAGE = "Algo correu mal. Tenta novamente.";

export class NotFoundError extends Error {
  constructor(message = "Recurso não encontrado.") {
    super(message);
    this.name = "NotFoundError";
  }
}

type RouteHandler<Args extends unknown[]> = (...args: Args) => Promise<Response> | Response;

/**
 * Envolve um handler de rota (GET/POST/PATCH/DELETE) com tratamento de erro
 * uniforme. `context` identifica a rota nos logs (ex:
 * "api.transactions.post") — usa sempre um valor fixo.
 */
export function withErrorHandling<Args extends unknown[]>(
  context: string,
  handler: RouteHandler<Args>,
): RouteHandler<Args> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      // Qualquer outro erro (falha de ligação à base de dados, um bug, uma
      // asserção que falhou) é tratado como inesperado: regista-se o erro
      // técnico completo no servidor (nunca na resposta) e devolve-se
      // sempre a mesma mensagem genérica ao cliente.
      logError(context, error);
      return NextResponse.json({ error: GENERIC_ERROR_MESSAGE }, { status: 500 });
    }
  };
}
