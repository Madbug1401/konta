import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/lib/auth/session";
import { materializeDueOccurrences } from "@/lib/db/recurring-transactions";
import { findUserById } from "@/lib/db/users";
import { getTodayInTimezone } from "@/lib/financial-engine";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  // Segunda linha de defesa (a primeira é o middleware — ver src/middleware.ts):
  // mesmo que o cookie exista mas o token seja inválido/expirado, nenhum
  // Server Component chega a renderizar dados de outro utilizador.
  if (!session) redirect("/login");

  // [Fase 4 — Recorrências] "Materializar na leitura", nunca um job de
  // fundo (ver comentário no topo de src/lib/db/recurring-transactions.ts):
  // este layout é o único ponto por onde toda a navegação Web sob (app) já
  // passa hoje, por isso é aqui — logo a seguir à verificação de sessão,
  // antes de renderizar qualquer página — que qualquer ocorrência em
  // atraso é gerada. Custo zero para quem não tem séries ativas. Só cobre a
  // Web: um futuro cliente que fale só com a API teria de chamar o mesmo
  // mecanismo por outra via.
  const user = await findUserById(session.userId);
  await materializeDueOccurrences(session.userId, getTodayInTimezone(user?.timezone ?? "Atlantic/Cape_Verde"));

  return <AppShell userEmail={session.email}>{children}</AppShell>;
}
