import { ChatPanel } from "@/components/chat-panel";
import { getSessionUser } from "@/lib/auth/session";
import { isAiEnabled } from "@/lib/db/users";
import { Card } from "@/components/ui/card";

// [Milestone 4] Server Component fino de propósito — a sessão já foi
// verificada por src/app/(app)/layout.tsx (getSessionUser + redirect) antes
// de esta página sequer renderizar; não repete essa verificação aqui. Toda a
// lógica de conversa vive no cliente (ChatPanel), que fala com
// POST /api/ai/chat — essa rota é que volta a validar a sessão no servidor
// (nunca confiar só na proteção da página).
//
// [Sugestão do utilizador — "quero poder ativar/desativar o acesso ao Konta
// AI por utilizador"] POST /api/ai/chat já bloqueia (403) um utilizador
// desativado — essa é a verificação que realmente conta. Esta aqui é só
// UX: sem ela, quem foi desativado via /admin abriria um chat normal e só
// descobriria ao enviar a primeira mensagem, como um erro. Verificar aqui
// também mostra logo um estado claro, sem sequer montar o ChatPanel.
export default async function AssistantPage() {
  const session = await getSessionUser();
  const enabled = session ? await isAiEnabled(session.userId) : false;

  if (!enabled) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Konta AI</h1>
          <p className="text-sm text-muted-foreground">Pergunta sobre as tuas finanças ou pede para registar algo.</p>
        </div>
        <Card>
          <p className="text-sm text-foreground">O acesso ao Konta AI está desativado para a tua conta.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Fala com quem administra o Konta se achas que isto não devia estar assim.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col gap-4 sm:h-[calc(100vh-3rem)]">
      <div>
        <h1 className="text-xl font-bold text-foreground">Konta AI</h1>
        <p className="text-sm text-muted-foreground">Pergunta sobre as tuas finanças ou pede para registar algo.</p>
      </div>
      <ChatPanel />
    </div>
  );
}
