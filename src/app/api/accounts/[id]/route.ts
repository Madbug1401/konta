import { NextResponse } from "next/server";
import { z } from "zod";
import { ACCOUNT_COLOR_IDS } from "@/lib/account-colors";
import { getSessionUser } from "@/lib/auth/session";
import { AccountNotEmptyError, deleteAccount, getAccountById, updateAccount } from "@/lib/db/accounts";
import { withErrorHandling } from "@/lib/api-error";

export const GET = withErrorHandling(
  "api.accounts.[id].get",
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await params;
    const account = await getAccountById(session.userId, id);
    if (!account) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });

    return NextResponse.json({ ...account, initialBalanceMinor: account.initialBalanceMinor.toString() });
  },
);

// [Fase 2 — editar Conta] Só `name`/`type`/`color` — ver o comentário junto
// a `updateAccount` em src/lib/db/accounts.ts para a razão de `currency` e
// `initialBalanceMinor` ficarem de fora.
const UpdateAccountSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  type: z.enum(["WALLET", "BANK", "SAVINGS", "CREDIT_CARD", "INVESTMENT", "EMERGENCY_FUND", "OTHER"]).optional(),
  color: z.enum(ACCOUNT_COLOR_IDS).nullable().optional(),
});

export const PATCH = withErrorHandling(
  "api.accounts.[id].patch",
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = UpdateAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });
    }

    const updated = await updateAccount(session.userId, id, parsed.data);
    if (!updated) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });

    return NextResponse.json({ ...updated, initialBalanceMinor: updated.initialBalanceMinor.toString() });
  },
);

// [Correção — pedido explícito do utilizador, ver comentário em
// deleteAccount, src/lib/db/accounts.ts] Ao contrário de arquivar (sempre
// permitido, reversível), isto só é aceite quando a conta nunca foi usada —
// AccountNotEmptyError vira um 409 claro em vez de deixar a base de dados
// rebentar com um erro de foreign key cru, ou pior, apagar histórico em
// cascata.
export const DELETE = withErrorHandling(
  "api.accounts.[id].delete",
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id } = await params;
    try {
      const deleted = await deleteAccount(session.userId, id);
      if (!deleted) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
      return NextResponse.json({ ok: true });
    } catch (err) {
      if (err instanceof AccountNotEmptyError) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      throw err;
    }
  },
);
