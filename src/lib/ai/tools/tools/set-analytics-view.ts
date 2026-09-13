// KONTA AI — tool: set_analytics_view (LOW, Milestone Analytics).
//
// [Segurança — secção 25 do pedido] ÚNICO ponto onde a Konta AI pode propor
// uma mudança ao que a página de Análises mostra — nunca DOM, nunca JS,
// nunca localStorage, nunca uma URL livre. Esta tool só CONSTRÓI um
// `AnalyticsViewAction` (src/lib/analytics/view-action.ts), resolvendo
// nome de categoria/conta em texto livre contra dados REAIS do utilizador
// (mesma disciplina de resolveCategoryByName) — nunca aceita um id vindo
// do modelo. `riskTier: LOW` porque não há nenhuma escrita financeira: é
// sempre a APLICAÇÃO (a página de Análises, no cliente) que decide, ao
// receber esta ação, se e como a aplica — sempre por navegação normal
// (router.push com query params), sempre revalidando contra o mesmo
// schema antes de aplicar (nunca confia só em "isto veio do servidor").
import { z } from "zod";
import {
  ANALYTICS_VIEWS,
  AnalyticsViewActionSchema,
  collectAnalyticsDataset,
  COMPARISON_MODE_VALUES,
  PERIOD_PRESETS,
  resolveCategoryName,
  type AnalyticsDataset,
  type AnalyticsViewAction,
} from "@/lib/analytics";
import { ToolExecutionError, type AiTool } from "../types";

const SetAnalyticsViewToolSchema = z
  .object({
    periodPreset: z.enum(PERIOD_PRESETS).optional(),
    periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    comparisonMode: z.enum(COMPARISON_MODE_VALUES).optional(),
    categoryName: z.string().trim().min(1).max(120).optional(),
    clearCategory: z.boolean().optional(),
    accountName: z.string().trim().min(1).max(255).optional(),
    clearAccount: z.boolean().optional(),
    transactionType: z.enum(["INCOME", "EXPENSE", "TRANSFER"]).optional(),
    clearTransactionType: z.boolean().optional(),
    view: z.enum(ANALYTICS_VIEWS).optional(),
  })
  .strict()
  .refine(
    (d) =>
      d.periodPreset !== undefined ||
      d.comparisonMode !== undefined ||
      d.categoryName !== undefined ||
      d.clearCategory ||
      d.accountName !== undefined ||
      d.clearAccount ||
      d.transactionType !== undefined ||
      d.clearTransactionType ||
      d.view !== undefined,
    { message: "Tens de pedir pelo menos uma mudança." },
  );
type SetAnalyticsViewParams = z.infer<typeof SetAnalyticsViewToolSchema>;

function findAccountIdByName(dataset: AnalyticsDataset, name: string): string | null {
  const trimmed = name.trim().toLowerCase();
  const matches = dataset.accounts.filter((a) => !a.isArchived && a.name.toLowerCase() === trimmed);
  return matches.length === 1 ? matches[0].id : null;
}

async function execute(userId: string, params: SetAnalyticsViewParams): Promise<{ uiAction: AnalyticsViewAction }> {
  const dataset = await collectAnalyticsDataset(userId);
  const action: Record<string, unknown> = {};

  if (params.periodPreset) {
    action.period = { preset: params.periodPreset, from: params.periodFrom, to: params.periodTo };
  }
  if (params.comparisonMode) action.comparisonMode = params.comparisonMode;
  if (params.view) action.view = params.view;

  if (params.clearCategory) {
    action.categoryId = null;
  } else if (params.categoryName) {
    const resolution = resolveCategoryName(dataset, params.categoryName);
    if (resolution.status === "not_found") throw new ToolExecutionError(`Categoria "${params.categoryName}" não encontrada.`);
    if (resolution.status === "ambiguous") throw new ToolExecutionError(`Categoria ambígua: ${resolution.matches.join(", ")}.`);
    action.categoryId = resolution.categoryId;
    action.categoryName = resolution.categoryName;
  }

  if (params.clearAccount) {
    action.accountId = null;
  } else if (params.accountName) {
    // Resolve sempre contra `dataset.accounts` (já ownership-scoped por
    // collectAnalyticsDataset) — nunca aceita um accountId vindo do modelo.
    const accountId = findAccountIdByName(dataset, params.accountName);
    if (!accountId) throw new ToolExecutionError(`Conta "${params.accountName}" não encontrada (ou o nome é ambíguo).`);
    action.accountId = accountId;
    action.accountName = params.accountName;
  }

  if (params.clearTransactionType) {
    action.transactionType = null;
  } else if (params.transactionType) {
    action.transactionType = params.transactionType;
  }

  // Revalida SEMPRE contra o mesmo schema isomórfico que o cliente usa —
  // nunca confia na construção acima sem esta validação final.
  const parsed = AnalyticsViewActionSchema.safeParse(action);
  if (!parsed.success) throw new ToolExecutionError("Não foi possível construir uma alteração válida para a página.");
  return { uiAction: parsed.data };
}

export const setAnalyticsViewTool: AiTool<SetAnalyticsViewParams, { uiAction: AnalyticsViewAction }> = {
  name: "set_analytics_view",
  description:
    "Propõe uma mudança ao que a página de Análises está a mostrar (período, comparação, categoria, conta, tipo de transação, ou secção/'view'). NUNCA manipula a página diretamente — só resolve nomes em texto livre (categoryName/accountName) contra dados reais e devolve uma ação que a aplicação decide aplicar. Usa isto quando o utilizador pedir para mudar o foco da análise (ex: 'mostra só alimentação', 'compara com o ano passado', 'analisa os últimos 3 meses').",
  paramsSchema: SetAnalyticsViewToolSchema,
  riskTier: "LOW",
  summarize: () => "Atualizar a vista de Análises.",
  execute,
};
