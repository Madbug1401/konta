import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { createAccount, listAccounts } from "@/lib/db/accounts";
import { listAllTransactionsForBalances } from "@/lib/db/transactions";
import { getAccountBalance } from "@/lib/financial-engine";

// [DECISÃO — API primeiro] Esta rota é consumida hoje pela Web (Server
// Components chamam as mesmas funções de src/lib/db diretamente, sem passar
// por HTTP, por eficiência) e amanhã pelo Konta Mobile via HTTP, com a mesma
// autenticação (Bearer token) e a mesma forma de calcular saldo (Financial
// Engine). Ver docs/architecture/DECISIONS.md, secção "Web + API".
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const accounts = await listAccounts(session.userId);
  const transactions = await listAllTransactionsForBalances(session.userId);

  const withBalance = accounts.map((account) => ({
    ...account,
    initialBalanceMinor: account.initialBalanceMinor.toString(),
    balanceMinor: getAccountBalance(account, transactions).toString(),
  }));

  return NextResponse.json({ accounts: withBalance });
}

const CreateAccountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(["WALLET", "BANK", "SAVINGS", "CREDIT_CARD", "INVESTMENT", "EMERGENCY_FUND", "OTHER"]),
  currency: z.string().length(3).optional(),
  initialBalanceMinor: z.number().int().optional(),
});

export async function POST(request: Request) {
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
  });

  return NextResponse.json({ ...account, initialBalanceMinor: account.initialBalanceMinor.toString() }, { status: 201 });
}
