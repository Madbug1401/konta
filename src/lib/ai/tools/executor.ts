// ============================================================================
// KONTA AI — Tool Executor (Milestone 3, evoluído no Milestone 4).
//
// Fluxo: localizar a tool no Registry → validar params com o paramsSchema →
// consultar a Permission Layer → LOW executa já; HIGH/MEDIUM devolve
// `confirmation_required` (nunca executa aqui) → CRITICAL/erro devolve o
// resultado correspondente. `userId` sempre explícito, nunca vindo dos
// parâmetros do modelo.
//
// [Milestone 4] Este ficheiro deixou de aceitar um boolean `confirmed` — essa
// era exatamente a limitação identificada no relatório do Milestone 3 (nada
// impedia os params de mudarem entre a proposta e a confirmação). Quem
// precisar de confirmar uma ação HIGH/MEDIUM usa agora
// src/lib/ai/tools/confirmation-store.ts (guarda os params exatos, ligados
// ao utilizador, com expiração e uso único) + `executeConfirmedTool` abaixo
// — nunca reconstrói params a partir de um novo pedido do cliente.
//
// [Isolamento] Não importa `@anthropic-ai/sdk`, não sabe o que é o Claude,
// não sabe o que é HTTP/UI — é uma camada de domínio da infraestrutura de
// IA, chamável de qualquer sítio (o orquestrador de chat, um teste, um
// script).
// ============================================================================

import { logError } from "@/lib/logger";
import { evaluatePermission } from "./permissions";
import { getTool } from "./registry";
import { ToolExecutionError, type RiskTier, type ToolExecutionResult } from "./types";

export async function executeTool(toolName: string, userId: string, rawParams: unknown): Promise<ToolExecutionResult> {
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

  if (decision.requiresConfirmation) {
    return { status: "confirmation_required", toolName, riskTier: tool.riskTier, summary: decision.summary, params: parsed.data };
  }

  return runTool(tool.execute, toolName, userId, parsed.data, tool.riskTier);
}

/**
 * Executa uma tool cujos parâmetros já foram validados E cuja confirmação já
 * foi consumida com sucesso pelo Confirmation Store (ver
 * src/lib/ai/tools/confirmation-store.ts::consumeConfirmation) — nunca
 * chamar isto diretamente a partir de um pedido do cliente sem passar
 * primeiro por essa consumição. Revalida os params contra o paramsSchema
 * atual (defesa extra, barata) antes de executar; nunca volta a perguntar à
 * Permission Layer para LOW/MEDIUM/HIGH — a própria existência de um token
 * consumido já É a confirmação.
 *
 * [Defesa em profundidade] Ainda assim, CRITICAL é sempre recusado aqui
 * também — mesmo sabendo que, no fluxo real, `executeTool` nunca cria uma
 * confirmação para uma tool CRITICAL (por isso `executeConfirmedTool` nunca
 * deveria ser chamado com uma). "Mesmo que qualquer outro parâmetro tente
 * contornar a regra" (pedido explícito do Milestone 4): esta função não
 * confia só na disciplina de quem a chama.
 */
export async function executeConfirmedTool(toolName: string, userId: string, validatedParams: unknown): Promise<ToolExecutionResult> {
  const tool = getTool(toolName);
  if (!tool) {
    return { status: "not_found", toolName };
  }

  if (tool.riskTier === "CRITICAL") {
    return { status: "rejected", toolName, reason: `Ações de risco CRITICAL não são permitidas na V1 (tool: "${toolName}").` };
  }

  const parsed = tool.paramsSchema.safeParse(validatedParams);
  if (!parsed.success) {
    return { status: "invalid_params", toolName, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  return runTool(tool.execute, toolName, userId, parsed.data, tool.riskTier);
}

async function runTool(
  execute: (userId: string, params: unknown) => Promise<unknown>,
  toolName: string,
  userId: string,
  params: unknown,
  riskTier: RiskTier,
): Promise<ToolExecutionResult> {
  try {
    // userId vem sempre deste argumento — nunca de `params`, mesmo que o
    // modelo tenha tentado incluir um campo `userId` (nenhuma tool desta V1
    // tem esse campo no seu paramsSchema, por isso já teria sido descartado/
    // rejeitado antes de chegar aqui).
    const result = await execute(userId, params);
    return { status: "executed", toolName, riskTier, result };
  } catch (error) {
    if (error instanceof ToolExecutionError) {
      return { status: "execution_failed", toolName, error: error.message };
    }
    // Erro verdadeiramente inesperado (bug, falha de rede/BD) — nunca expor
    // detalhes técnicos no resultado; regista-se no log do servidor, mesmo
    // princípio de src/lib/api-error.ts. Nunca `params`/dados financeiros
    // completos no log.
    logError("ai.tools.execute", error, { toolName, userId });
    return { status: "execution_failed", toolName, error: "Não foi possível executar esta ação." };
  }
}
