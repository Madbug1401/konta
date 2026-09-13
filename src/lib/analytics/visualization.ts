// ============================================================================
// KONTA ANALYTICS — Contrato de visualização declarativa (Milestone Analytics
// + Konta AI).
//
// [Segurança — secção 31 do pedido] A Konta AI nunca gera HTML/SVG/JS — só
// pode devolver uma destas formas, validadas por este schema Zod. O
// componente `AiVisualization` (frontend) é o ÚNICO que decide como
// desenhar cada tipo; nunca interpreta `dangerouslySetInnerHTML` nem
// executa nada vindo dos dados. Isomórfico (zero I/O) — usado tanto pelas
// tools de analytics (que preenchem `visualization` no resultado) como pelo
// componente que o renderiza.
// ============================================================================

import { z } from "zod";

const seriesPointSchema = z.object({ label: z.string().max(60), value: z.number().finite() }).strict();

const metricSchema = z
  .object({
    type: z.literal("metric"),
    title: z.string().max(120),
    value: z.string().max(60),
    changePercent: z.number().finite().nullable().optional(),
    direction: z.enum(["up", "down", "flat"]).optional(),
  })
  .strict();

const comparisonSchema = z
  .object({
    type: z.literal("comparison"),
    title: z.string().max(120),
    current: z.object({ label: z.string().max(60), value: z.string().max(60) }).strict(),
    previous: z.object({ label: z.string().max(60), value: z.string().max(60) }).strict().nullable(),
    changePercent: z.number().finite().nullable().optional(),
  })
  .strict();

const tableSchema = z
  .object({
    type: z.literal("table"),
    title: z.string().max(120),
    columns: z.array(z.string().max(40)).min(1).max(8),
    rows: z.array(z.array(z.string().max(120)).min(1).max(8)).max(50),
  })
  .strict();

const seriesChartSchema = z
  .object({
    type: z.enum(["line", "bar", "area", "donut"]),
    title: z.string().max(120),
    data: z.array(seriesPointSchema).min(1).max(60),
    unit: z.string().max(16).optional(),
  })
  .strict();

export const AiVisualizationSchema = z.discriminatedUnion("type", [metricSchema, comparisonSchema, tableSchema, seriesChartSchema]);
export type AiVisualization = z.infer<typeof AiVisualizationSchema>;

/** Valida uma visualização vinda de qualquer origem — usar SEMPRE antes de renderizar. Nunca lançar: uma visualização inválida é simplesmente omitida. */
export function parseAiVisualization(value: unknown): AiVisualization | null {
  const result = AiVisualizationSchema.safeParse(value);
  return result.success ? result.data : null;
}
