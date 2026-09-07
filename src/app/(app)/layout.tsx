import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AssistantProvider } from "@/components/assistant-provider";
import { isAdminEmail } from "@/lib/auth/admin";
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

  // [Correção — Konta AI, conversa a desaparecer ao navegar] `AssistantProvider`
  // fica aqui, acima de `<AppShell>{children}</AppShell>` — este layout é o
  // único ponto que o App Router NUNCA desmonta ao navegar entre páginas
  // dentro do grupo (app) (só `children`/`page.tsx` é substituído). Ver
  // src/components/assistant-provider.tsx para a explicação completa. Sair
  // para /login (fora deste grupo, outra árvore de layout) desmonta este
  // provider e limpa a conversa — intencional, para nunca deixar a conversa
  // de um utilizador visível para o próximo que iniciar sessão no mesmo browser.
  return (
    <AssistantProvider>
      <AppShell userEmail={session.email} isAdmin={isAdminEmail(session.email)}>
        {children}
      </AppShell>
    </AssistantProvider>
  );
}
