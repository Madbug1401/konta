import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { listNotificationsForUser, markAllNotificationsRead } from "@/lib/db/notifications";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

// [Sugestão do utilizador — "quero enviar mensagens aos meus users, como
// notificação, e eles receberem"] Visitar esta página marca tudo como lido
// — mesmo princípio já usado em layout.tsx para materializar recorrências
// em atraso: um efeito secundário idempotente dentro da própria leitura da
// página, sem precisar de uma rota de API à parte só para isto.
export default async function NotificationsPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  const notifications = await listNotificationsForUser(session.userId);
  await markAllNotificationsRead(session.userId);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Notificações</h1>
        <p className="text-sm text-muted-foreground">Avisos enviados pela equipa do Konta.</p>
      </div>

      {notifications.length === 0 ? (
        <EmptyState title="Ainda não tens notificações" description="Quando houver novidades ou avisos, aparecem aqui." />
      ) : (
        <div className="flex flex-col gap-3">
          {notifications.map((n) => (
            <Card key={n.id} className={n.read ? "opacity-70" : undefined}>
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</span>
                {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Não lida" />}
              </div>
              <p className="whitespace-pre-wrap text-sm text-foreground">{n.message}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
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
