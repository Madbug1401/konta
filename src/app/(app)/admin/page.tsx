import { notFound } from "next/navigation";
import { isAdminEmail } from "@/lib/auth/admin";
import { getSessionUser } from "@/lib/auth/session";
import { getPlatformTotals, listUsersWithActivity } from "@/lib/db/admin";
import { listFeedback } from "@/lib/db/feedback";
import { Card } from "@/components/ui/card";

// [Sugestão do utilizador — "como posso observar os meus utilizadores"]
// Página só para o dono do projeto (ver src/lib/auth/admin.ts). Devolve
// notFound() em vez de uma mensagem "não autorizado" para quem não é
// admin — um 404 genérico não confirma sequer que esta página existe,
// mesmo hipótese de alguém adivinhar o URL.
export default async function AdminPage() {
  const session = await getSessionUser();
  if (!session || !isAdminEmail(session.email)) notFound();

  const [totals, users, feedback] = await Promise.all([getPlatformTotals(), listUsersWithActivity(), listFeedback()]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Estatísticas</h1>
        <p className="text-sm text-muted-foreground">Visão geral do Konta — visível só para ti.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Utilizadores" value={totals.users} />
        <Stat label="Contas" value={totals.accounts} />
        <Stat label="Transações" value={totals.transactions} />
        <Stat label="Dívidas" value={totals.debts} />
        <Stat label="Metas" value={totals.goals} />
        <Stat label="Feedback" value={totals.feedback} />
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

      <Card>
        <h2 className="mb-3 text-base font-semibold text-foreground">Feedback dos utilizadores</h2>
        {feedback.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ainda não há nenhuma mensagem de feedback.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {feedback.map((item) => (
              <div key={item.id} className="rounded-lg border border-border p-3">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                  <span className="text-sm font-medium text-foreground">
                    {item.userName ? `${item.userName} · ${item.userEmail}` : item.userEmail}
                  </span>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{item.message}</p>
              </div>
            ))}
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

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-CV", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
