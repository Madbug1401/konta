// KONTA AI — tool: pay_debt_installment (HIGH, Milestone 6).
// Reutiliza payInstallment (src/lib/db/debts.ts): cria a Transaction de
// despesa ligada à dívida/parcela, marca a parcela PAID e fecha a dívida
// (PAID_OFF) automaticamente quando é a última por pagar — tudo já numa
// única transação SQL. Nunca uma segunda lógica de "marcar como paga" aqui.
import { z } from "zod";
import { getAccountById } from "@/lib/db/accounts";
import { InstallmentNotPayableError, payInstallment } from "@/lib/db/debts";
import { findUserById } from "@/lib/db/users";
import { getTodayInTimezone } from "@/lib/financial-engine";
import { ToolExecutionError, type AiTool } from "../types";

const PayDebtInstallmentToolSchema = z
  .object({
    debtId: z.string().min(1),
    installmentId: z.string().min(1),
    accountId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    // [Cosmético — mesmo padrão de accountName em create_transaction] Só para
    // o texto de confirmação, preenchidos a partir do resultado de get_debts
    // (creditorName, sequence, amount) — nunca usados para decidir o que
    // executa: payInstallment volta sempre a ler o valor/estado reais da
    // parcela na base de dados, nunca confia num valor vindo daqui.
    creditorName: z.string().trim().max(120).optional(),
    installmentSequence: z.number().int().positive().optional(),
    installmentAmount: z.string().trim().max(64).optional(),
  })
  .strict();
type PayDebtInstallmentParams = z.infer<typeof PayDebtInstallmentToolSchema>;

async function execute(userId: string, params: PayDebtInstallmentParams): Promise<{ debtStatus: string; installmentStatus: string }> {
  const account = await getAccountById(userId, params.accountId);
  if (!account) throw new ToolExecutionError("Conta não encontrada.");
  if (account.isArchived) throw new ToolExecutionError("Esta conta está arquivada.");

  const user = await findUserById(userId);
  const date = params.date ?? getTodayInTimezone(user?.timezone ?? "Atlantic/Cape_Verde");

  try {
    const result = await payInstallment(userId, params.debtId, params.installmentId, { accountId: params.accountId, date });
    return { debtStatus: result.debt.status, installmentStatus: result.installment.status };
  } catch (error) {
    if (error instanceof InstallmentNotPayableError) throw new ToolExecutionError(error.message);
    throw error;
  }
}

export const payDebtInstallmentTool: AiTool<PayDebtInstallmentParams, { debtStatus: string; installmentStatus: string }> = {
  name: "pay_debt_installment",
  description:
    "Paga UMA parcela específica de uma dívida — cria automaticamente a despesa correspondente na conta indicada e marca a parcela como paga (fecha a dívida sozinha se for a última por pagar). `debtId`/`installmentId` têm de vir de get_debts (escolhe normalmente a próxima parcela PENDING dessa dívida, salvo indicação contrária do utilizador) — nunca inventes ids nem pagues um valor sem saber a que parcela corresponde. `accountId` tem de vir de get_accounts. Escrita financeira — exige confirmação explícita.",
  paramsSchema: PayDebtInstallmentToolSchema,
  riskTier: "HIGH",
  summarize: (params) => {
    const creditorPhrase = params.creditorName ? ` de "${params.creditorName}"` : "";
    const sequencePhrase = params.installmentSequence ? ` (parcela ${params.installmentSequence})` : "";
    const amountPhrase = params.installmentAmount ? ` de ${params.installmentAmount}` : "";
    return `Pagar a parcela${sequencePhrase}${amountPhrase}${creditorPhrase}${params.date ? `, em ${params.date}` : ", hoje"}.`;
  },
  execute,
};
