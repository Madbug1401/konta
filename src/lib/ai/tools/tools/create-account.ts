// KONTA AI — tool: create_account (HIGH, Milestone 6).
// Escrita financeira (nova conta) — a Permission Layer exige sempre
// confirmação explícita antes do executor chamar `execute`.
import { z } from "zod";
import { ACCOUNT_COLOR_IDS } from "@/lib/account-colors";
import { CURRENCY_CODES } from "@/lib/currencies";
import { createAccount } from "@/lib/db/accounts";
import { listAllTransactionsForBalances } from "@/lib/db/transactions";
import { findUserById } from "@/lib/db/users";
import { getTodayInTimezone } from "@/lib/financial-engine";
import { toAiToolAccount, type AiToolAccount } from "../shared";
import type { AiTool } from "../types";

// Mesmo schema (mesmos limites/enums) de POST /api/accounts — nunca mais
// permissão do que o formulário manual já dá.
const CreateAccountToolSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    type: z.enum(["WALLET", "BANK", "SAVINGS", "CREDIT_CARD", "INVESTMENT", "EMERGENCY_FUND", "OTHER"]),
    currency: z.enum(CURRENCY_CODES).optional(),
    initialBalanceMinor: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).optional(),
    color: z.enum(ACCOUNT_COLOR_IDS).optional(),
  })
  .strict();
type CreateAccountParams = z.infer<typeof CreateAccountToolSchema>;

async function execute(userId: string, params: CreateAccountParams): Promise<AiToolAccount> {
  const created = await createAccount({
    userId,
    name: params.name,
    type: params.type,
    currency: params.currency,
    initialBalanceMinor: params.initialBalanceMinor !== undefined ? BigInt(params.initialBalanceMinor) : undefined,
    color: params.color,
  });
  const [user, transactions] = await Promise.all([findUserById(userId), listAllTransactionsForBalances(userId)]);
  const today = getTodayInTimezone(user?.timezone ?? "Atlantic/Cape_Verde");
  return toAiToolAccount(created, transactions, today);
}

export const createAccountTool: AiTool<CreateAccountParams, AiToolAccount> = {
  name: "create_account",
  description:
    "Cria uma nova conta (carteira, banco, poupança, cartão de crédito, investimento, fundo de emergência ou outra). `currency` por omissão CVE. `initialBalanceMinor` é o saldo inicial em cêntimos/unidade mínima (pode ser negativo, ex: dívida já existente num cartão de crédito). Escrita financeira — exige confirmação explícita.",
  paramsSchema: CreateAccountToolSchema,
  riskTier: "HIGH",
  summarize: (params) => `Criar a conta "${params.name}" (${params.type.toLowerCase()})${params.currency ? `, em ${params.currency}` : ""}.`,
  execute,
};
