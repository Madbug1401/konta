import { notFound } from "next/navigation";
import { isAdminEmail } from "@/lib/auth/admin";
import { getSessionUser } from "@/lib/auth/session";
import { getPlatformTotals, listUsersWithActivity } from "@/lib/db/admin";
import { Card } from "@/components/ui/card";

// [Sugestão do utilizador — "como posso observar os meus utilizadores"]
// Página só para o dono do projeto (ver src/lib/auth/admin.ts). Devolve
// notFound() em vez de uma mensagem "não autorizado" para quem não é
// admin — um 404 genérico não confirma sequer que esta página existe,
// mesmo hipótese de alguém adivinhar o URL.
export default async function AdminPage() {
  const session = await getSessionUser();
  if (!session || !isAdminEmail(session.email)) notFound();

  const [totals, users] = await Promise.all([getPlatformTotals(), listUsersWithActivity()]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Estatísticas</h1>
        <p className="text-sm text-muted-foreground">Visão geral do Konta — visível só para ti.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Utilizadores" value={totals.users} />
        <Stat label="Contas" value={totals.accounts} />
        <Stat label="Transações" value={totals.transactions} />
        <Stat label="Dívidas" value={totals.debts} />
        <Stat label="Metas" value={totals.goals} />
      </div>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-foreground">Utilizadores</h2>
        {users.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ainda não há nenhum utilizador registado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Utilizador</th>
                  <th className="pb-2 pr-3 font-medium">Registo</th>
                  <th className="pb-2 pr-3 font-medium">Último login</th>
                  <th className="pb-2 pr-3 text-right font-medium">Contas</th>
                  <th className="pb-2 text-right font-medium">Transações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 text-foreground">{user.name ? `${user.name} · ${user.email}` : user.email}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{formatDate(user.createdAt)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                      {user.lastLoginAt ? formatDate(user.lastLoginAt) : "Nunca"}
                    </td>
                    <td className="py-2 pr-3 text-right text-muted-foreground">{user.accountsCount}</td>
                    <td className="py-2 text-right text-muted-foreground">{user.transactionsCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>
    </Card>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-CV", { day: "numeric", month: "short", year: "numeric" });
}
