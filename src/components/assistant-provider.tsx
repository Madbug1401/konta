"use client";

// ============================================================================
// KONTA AI — Assistant Provider (correção: conversa desaparecia ao mudar de
// página).
//
// [Bug corrigido] `turns`/`pending` viviam antes em `useState` dentro do
// próprio `ChatPanel`, montado só por `src/app/(app)/assistant/page.tsx`. O
// App Router desmonta o conteúdo de `page.tsx` sempre que se navega para
// outra rota (ex: Resumo) e volta a montar `ChatPanel` do zero ao regressar a
// `/assistant` — por isso a conversa "desaparecia" e um chat novo aparecia a
// cada troca de página, mesmo dentro da mesma sessão.
//
// Este provider é montado uma única vez em `src/app/(app)/layout.tsx`, que o
// App Router NUNCA desmonta ao navegar entre páginas dentro do grupo `(app)`
// (só o `children`/`page.tsx` é substituído) — por isso este estado sobrevive
// a qualquer troca de página dentro da app.
//
// Continua 100% em memória — sem persistência no servidor, em localStorage
// nem em sessionStorage (mesma decisão de arquitetura documentada
// originalmente aqui: ver docs/konta-ai-design.html, secção H, "Conversation
// State" é descartável de propósito). Um refresh completo da página, fechar o
// separador, ou sair para `/login` (fora do grupo `(app)`, outra árvore de
// layout) continuam a limpar a conversa — o último caso é intencional: nunca
// deixar a conversa de um utilizador visível para o próximo que iniciar
// sessão no mesmo browser.
// ============================================================================

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { useToast } from "@/components/toast-provider";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface PendingConfirmation {
  confirmationToken: string;
  summary: string;
  riskTier: string;
}

interface AssistantContextValue {
  turns: ChatTurn[];
  pending: PendingConfirmation | null;
  sending: boolean;
  error: string | null;
  sendChat: (message: string) => Promise<void>;
  confirmPending: () => Promise<void>;
  cancelPending: () => Promise<void>;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function useAssistant(): AssistantContextValue {
  const value = useContext(AssistantContext);
  if (!value) throw new Error("useAssistant() só pode ser usado dentro de <AssistantProvider>.");
  return value;
}

async function postChat(body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // [Auditoria de segurança M4 — double-click] Ver comentário equivalente que
  // existia antes em chat-panel.tsx: um ref muda de valor imediatamente, sem
  // esperar por um render — fecha a janela de dois cliques na mesma "tick"
  // síncrona. A garantia real contra execução duplicada está no servidor
  // (confirmation-store.ts consome o token de forma atómica, single-use).
  const inFlightRef = useRef(false);

  // [Correção — ação a "desaparecer" ao confirmar] Uma resposta do servidor
  // a uma mensagem OU a uma confirmação pode devolver `status:
  // "confirmation_required"` outra vez — por exemplo, se o pedido original
  // implicava mais do que uma escrita ("regista esta despesa e cria uma meta
  // com o resto") e o Claude encadeia uma segunda tool de alto risco logo a
  // seguir à primeira confirmação (ver orchestrator.ts::confirmPendingAction,
  // que devolve o resultado de `runLoop` tal e qual). A versão anterior deste
  // ficheiro só tratava `status === "final"` em `handleConfirm` — ao receber
  // `confirmation_required` outra vez, limpava `pending` sem mostrar o novo
  // cartão de confirmação, dando a impressão de que "confirmar não fez nada"
  // mesmo a primeira ação já tendo sido executada no servidor. `applyOutcome`
  // é agora o único sítio que decide o que fazer com uma resposta do
  // servidor, usado tanto para mensagens novas como para confirmações.
  function applyOutcome(data: Record<string, unknown>) {
    if (data.status === "confirmation_required") {
      setPending({
        confirmationToken: String(data.confirmationToken),
        summary: String(data.summary),
        riskTier: String(data.riskTier),
      });
      return;
    }
    if (data.status === "final") {
      setPending(null);
      setTurns((current) => [...current, { role: "assistant", content: String(data.reply) }]);
    }
  }

  async function sendChat(message: string) {
    const trimmed = message.trim();
    if (!trimmed || inFlightRef.current) return;
    inFlightRef.current = true;

    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((current) => [...current, { role: "user", content: trimmed }]);
    setError(null);
    setSending(true);

    try {
      const { ok, data } = await postChat({ action: "message", message: trimmed, history });
      if (!ok) {
        const message = typeof data.error === "string" ? data.error : "Não foi possível falar com o assistente. Tenta novamente.";
        setError(message);
        toast.error(message);
        return;
      }
      applyOutcome(data);
    } finally {
      inFlightRef.current = false;
      setSending(false);
    }
  }

  async function confirmPending() {
    if (!pending || inFlightRef.current) return;
    inFlightRef.current = true;
    setError(null);
    setSending(true);
    try {
      const { ok, data } = await postChat({ action: "confirm", confirmationToken: pending.confirmationToken });
      if (!ok) {
        // Token inválido/expirado/já usado — não há confirmação nenhuma para
        // manter à espera; nunca deixar o utilizador preso a um cartão que já
        // não pode confirmar.
        setPending(null);
        const message = typeof data.error === "string" ? data.error : "Não foi possível confirmar esta ação.";
        setError(message);
        toast.error(message);
        return;
      }
      applyOutcome(data);
    } finally {
      inFlightRef.current = false;
      setSending(false);
    }
  }

  async function cancelPending() {
    if (!pending || inFlightRef.current) return;
    inFlightRef.current = true;
    const token = pending.confirmationToken;
    setPending(null);
    setTurns((current) => [...current, { role: "assistant", content: "Ação cancelada — não fiz nada." }]);
    try {
      // Melhor esforço: mesmo que isto falhe (ex: já expirou sozinho), a UI já
      // não deixa confirmar outra vez porque `pending` foi limpo acima.
      await postChat({ action: "cancel", confirmationToken: token }).catch(() => {});
    } finally {
      inFlightRef.current = false;
    }
  }

  return (
    <AssistantContext.Provider value={{ turns, pending, sending, error, sendChat, confirmPending, cancelPending }}>
      {children}
    </AssistantContext.Provider>
  );
}
