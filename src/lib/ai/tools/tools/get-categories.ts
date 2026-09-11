// KONTA AI — tool: get_categories (LOW, Milestone 6).
import { z } from "zod";
import { listCategories } from "@/lib/db/categories";
import { toAiToolCategory, type AiToolCategory } from "../shared";
import type { AiTool } from "../types";

const GetCategoriesParamsSchema = z.object({}).strict();
type GetCategoriesParams = z.infer<typeof GetCategoriesParamsSchema>;

async function execute(userId: string): Promise<AiToolCategory[]> {
  const categories = await listCategories(userId);
  return categories.map(toAiToolCategory);
}

export const getCategoriesTool: AiTool<GetCategoriesParams, AiToolCategory[]> = {
  name: "get_categories",
  description:
    "Lista as categorias de receita/despesa do utilizador (categorias de sistema partilhadas + as que ele já criou). Usa para saberes que nomes de categoria já existem antes de perguntares, ou para responder 'que categorias tenho'.",
  paramsSchema: GetCategoriesParamsSchema,
  riskTier: "LOW",
  summarize: () => "Consultar as tuas categorias.",
  execute,
};
