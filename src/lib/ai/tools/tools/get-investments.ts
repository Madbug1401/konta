// KONTA AI — tool: get_investments (LOW, Milestone 6).
//
// Não é um consultor de investimentos autónomo — só expõe o que o produto já
// calcula: capital investido (soma de transferências de entrada), valor
// atual (última avaliação manual registada) e retorno, sempre via
// `computeInvestmentPerformance` (Financial Engine), nunca reimplementado
// aqui. Contas do tipo INVESTMENT sem `InvestmentDetail` ainda aparecem
// (para o utilizador saber que a conta existe), mas com `investmentType:
// null` e sem performance inventada.
import { z } from "zod";
import { listAccounts } from "@/lib/db/accounts";
import { getInvestmentDetailByAccountId, listValuations } from "@/lib/db/investments";
import { listAllTransactionsForBalances } from "@/lib/db/transactions";
import { computeInvestmentPerformance } from "@/lib/financial-engine";
import { toAiToolInvestment, type AiToolInvestment } from "../shared";
import type { AiTool } from "../types";

const GetInvestmentsParamsSchema = z.object({}).strict();
type GetInvestmentsParams = z.infer<typeof GetInvestmentsParamsSchema>;

async function execute(userId: string): Promise<AiToolInvestment[]> {
  const [accounts, transactions] = await Promise.all([listAccounts(userId), listAllTransactionsForBalances(userId)]);
  const investmentAccounts = accounts.filter((a) => a.type === "INVESTMENT" && !a.isArchived);

  return Promise.all(
    investmentAccounts.map(async (account) => {
      const [detail, valuations] = await Promise.all([
        getInvestmentDetailByAccountId(userId, account.id),
        listValuations(userId, account.id),
      ]);
      const performance = computeInvestmentPerformance(account.id, transactions, valuations);
      return toAiToolInvestment(account, detail, performance);
    }),
  );
}

export const getInvestmentsTool: AiTool<GetInvestmentsParams, AiToolInvestment[]> = {
  name: "get_investments",
  description:
    "Lista as contas de investimento do utilizador com capital investido, valor atual (se já houver avaliação registada) e retorno. Usa `accountId` (o mesmo id de get_accounts) para create_investment_detail/update_investment_detail/add_investment_valuation.",
  paramsSchema: GetInvestmentsParamsSchema,
  riskTier: "LOW",
  summarize: () => "Consultar os teus investimentos.",
  execute,
};
