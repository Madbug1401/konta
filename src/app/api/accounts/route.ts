import { NextResponse } from "next/server";
import { z } from "zod";
import { ACCOUNT_COLOR_IDS } from "@/lib/account-colors";
import { CURRENCY_CODES } from "@/lib/currencies";
import { getSessionUser } from "@/lib/auth/session";
import { createAccount, listAccounts } from "@/lib/db/accounts";
import { listAllTransactionsForBalances } from "@/lib/db/transactions";
import { findUserById } from "@/lib/db/users";
import { getAccountBalance, getTodayInTimezone } from "@/lib/financial-engine";
import { withErrorHandling } from "@/lib/api-error";

// [DECISÃO — API primeiro] Esta rota é consumida hoje pela Web (Server
// Components chamam as mesmas funções de src/lib/db diretamente, sem passar
// por HTTP, por eficiência) e amanhã pelo Konta Mobile via HTTP, com a mesma
// autenticação (Bearer token) e a mesma forma de calcular saldo (Financial
// Engine). Ver docs/architecture/DECISIONS.md, secção "Web + API".
// [Correção — Pre-Beta Hardening, Prioridade 4] `withErrorHandling` garante
// que uma falha inesperada (ex: base de dados em baixo) nunca chega ao
// cliente como uma exceção não tratada — fica registada no servidor
// (src/lib/logger.ts) e devolve sempre a mesma mensagem genérica segura.
export const GET = withErrorHandling("api.accounts.get", async () => {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const [user, accounts, transactions] = await Promise.all([
    findUserById(session.userId),
    listAccounts(session.userId),
    listAllTransactionsForBalances(session.userId),
  ]);
  // [Correção — mesma causa do bug do dashboard] Ver DECISIONS.md: saldo
  // nunca conta transações datadas no futuro. Esta rota é a que a Web e o
  // futuro Mobile consomem, por isso a correção tem de estar aqui, não só
  // nas páginas Server Component.
  const today = getTodayInTimezone(user?.timezone ?? "Atlantic/Cape_Verde");

  const withBalance = accounts.map((account) => ({
    ...account,
    initialBalanceMinor: account.initialBalanceMinor.toString(),
    balanceMinor: getAccountBalance(account, transactions, today).toString(),
  }));

  return NextResponse.json({ accounts: withBalance });
});

const CreateAccountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(["WALLET", "BANK", "SAVINGS", "CREDIT_CARD", "INVESTMENT", "EMERGENCY_FUND", "OTHER"]),
  // [Sugestão do utilizador — pedido de amigos fora de Cabo Verde] Só um
  // código da lista curada (ver src/lib/currencies.ts) — nunca um código
  // ISO 4217 livre vindo do cliente, mesmo princípio já aplicado à cor da
  // conta acima.
  currency: z.enum(CURRENCY_CODES).optional(),
  // Mesma correção de src/app/api/transactions/route.ts (limite técnico de
  // precisão, não uma regra de negócio) — negativo continua permitido de
  // propósito (ex: saldo inicial de um cartão de crédito).
  initialBalanceMinor: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).optional(),
  // Só um id da paleta curada (ver src/lib/account-colors.ts) — nunca um hex
  // livre vindo do cliente.
  color: z.enum(ACCOUNT_COLOR_IDS).optional(),
});

export const POST = withErrorHandling("api.accounts.post", async (request: Request) => {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = CreateAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });
  }

  const account = await createAccount({
    userId: session.userId,
    name: parsed.data.name,
    type: parsed.data.type,
    currency: parsed.data.currency,
    initialBalanceMinor:
      parsed.data.initialBalanceMinor !== undefined ? BigInt(parsed.data.initialBalanceMinor) : undefined,
    color: parsed.data.color,
  });

  return NextResponse.json({ ...account, initialBalanceMinor: account.initialBalanceMinor.toString() }, { status: 201 });
});
