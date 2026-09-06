// ============================================================================
// KONTA AI — Tool Executor (Milestone 3).
//
// Fluxo: localizar a tool no Registry → validar params com o paramsSchema →
// consultar a Permission Layer → impedir execução quando falta confirmação →
// executar (userId sempre explícito, nunca vindo dos parâmetros) → devolver
// um resultado tipado (nunca lançar exceção para os casos esperados).
//
// [Isolamento] Não importa `@anthropic-ai/sdk`, não sabe o que é o Claude,
// não sabe o que é HTTP/UI — é uma camada de domínio da infraestrutura de
// IA, chamável de qualquer sítio (uma futura rota, um teste, um script).
// ============================================================================

import { logError } from "@/lib/logger";
import { evaluatePermission } from "./permissions";
import { getTool } from "./registry";
import { ToolExecutionError, type ToolExecutionResult } from "./types";

export interface ExecuteToolOptions {
  /**
   * `true` só quando o utilizador já confirmou explicitamente a ação
   * proposta (ver o `summary` devolvido num resultado anterior
   * `confirmation_required`). Nunca lido de um valor enviado pelo
   * modelo — quem chama executeTool() (uma futura rota autenticada) é
   * responsável por só passar `true` depois de um clique real do
   * utilizador.
   *
   * [Limitação conhecida, documentada] Esta V1 não liga criptograficamente
   * a confirmação aos parâmetros originalmente propostos (não existe ainda
   * um token de confirmação opaco nem um registo persistente da proposta
   * pendente — ver secção "AI Log/Audit" do relatório do milestone). Quem
   * chamar `executeTool` com `confirmed: true` tem de reenviar exatamente
   * os mesmos `params` que geraram o resumo mostrado ao utilizador; esta
   * função não deteta se os params mudaram entre a proposta e a
   * confirmação. Corrigir isto (com um token de confirmação de curta
   * duração) é trabalho documentado para o milestone que liga isto a uma
   * rota HTTP real.
   */
  confirmed?: boolean;
}

export async function executeTool(
  toolName: string,
  userId: string,
  rawParams: unknown,
  options: ExecuteToolOptions = {},
): Promise<ToolExecutionResult> {
  const tool = getTool(toolName);
  if (!tool) {
    return { status: "not_found", toolName };
  }

  const parsed = tool.paramsSchema.safeParse(rawParams);
  if (!parsed.success) {
    // .issues[].message nunca inclui o valor submetido (só o que era
    // esperado) — seguro para devolver, tal como as respostas 400 das rotas
    // de API existentes.
    return { status: "invalid_params", toolName, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  const summary = tool.summarize(parsed.data);
  const decision = evaluatePermission({ toolName, riskTier: tool.riskTier, userId, params: parsed.data }, summary);

  if (!decision.allowed) {
    return { status: "rejected", toolName, reason: decision.reason };
  }

  if (decision.requiresConfirmation && !options.confirmed) {
    return { status: "confirmation_required", toolName, riskTier: tool.riskTier, summary: decision.summary };
  }

  try {
    // userId vem sempre deste argumento (resolvido pelo chamador a partir da
    // sessão autenticada) — nunca de `parsed.data`, mesmo que o modelo tenha
    // tentado incluir um campo `userId` nos parâmetros (o paramsSchema de
    // cada tool não tem esse campo, por isso já teria sido descartado/
    // rejeitado antes de chegar aqui).
    const result = await tool.execute(userId, parsed.data);
    return { status: "executed", toolName, riskTier: tool.riskTier, result };
  } catch (error) {
    if (error instanceof ToolExecutionError) {
      return { status: "execution_failed", toolName, error: error.message };
    }
    // Erro verdadeiramente inesperado (bug, falha de rede/BD) — nunca expor
    // detalhes técnicos no resultado; regista-se no log do servidor, mesmo
    // princípio de src/lib/api-error.ts. Nunca `params`/dados financeiros
    // completos no log (ver secção "AI Log/Audit" do relatório).
    logError("ai.tools.execute", error, { toolName, userId });
    return { status: "execution_failed", toolName, error: "Não foi possível executar esta ação." };
  }
}
