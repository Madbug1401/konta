import { ChatPanel } from "@/components/chat-panel";

// [Milestone 4] Server Component fino de propósito — a sessão já foi
// verificada por src/app/(app)/layout.tsx (getSessionUser + redirect) antes
// de esta página sequer renderizar; não repete essa verificação aqui. Toda a
// lógica de conversa vive no cliente (ChatPanel), que fala com
// POST /api/ai/chat — essa rota é que volta a validar a sessão no servidor
// (nunca confiar só na proteção da página).
export default function AssistantPage() {
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
