// ============================================================================
// KONTA AI — adaptação Tool Registry → definição de tool da Anthropic
// (Milestone 4).
//
// Único ponto de tradução entre `AiTool` (contrato interno, Milestone 3) e a
// forma que o Claude precisa de ver para tool-calling. NÃO importa
// `@anthropic-ai/sdk` — produz só um objeto simples ({name, description,
// inputSchema}) que src/lib/ai/gateway.ts (o único módulo autorizado a falar
// com o SDK) sabe converter no pedido real.
//
// O Registry (listTools()) continua a ser a única fonte de verdade: esta
// função nunca duplica nem redefine a lista de tools, só a transforma. O
// Claude nunca recebe `execute`, `riskTier` nem qualquer detalhe interno —
// só name/description/inputSchema, exatamente o suficiente para tool-calling.
// ============================================================================

import { z } from "zod";
import { listTools } from "./registry";
import type { ChatToolDefinition } from "../gateway";

/**
 * `z.toJSONSchema` (nativo do Zod v4, sem dependência nova) converte mesmo
 * schemas com `.refine()`/`.extend()` encadeados (ex: CreateTransactionSchema,
 * UpdateTransactionSchema) — confirmado por teste. `additionalProperties`
 * fica sempre `false` por omissão do próprio Zod v4, o que já impede o
 * modelo de "inventar" um campo (ex: userId) e este ser aceite sem erro.
 */
export function getAnthropicToolDefinitions(): ChatToolDefinition[] {
  return listTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: z.toJSONSchema(tool.paramsSchema as z.ZodType) as Record<string, unknown>,
  }));
}
