"use client";

// ============================================================================
// KONTA AI — Chat Panel (Milestone 4).
//
// Cliente fino: guarda a conversa em memória (sem persistência — ver
// docs/architecture/OVERVIEW.md, "Conversation"), envia `history` (só texto,
// role+content) a cada mensagem nova, e mostra o cartão de confirmação
// quando o servidor devolve `confirmation_required`. Nunca decide sozinho
// que uma ação foi executada — só mostra o texto final que o servidor
// devolve depois de confirmar.
// ============================================================================

import { Loader2, Send, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast-provider";
import { cn } from "@/lib/utils";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface PendingConfirmation {
  confirmationToken: string;
  summary: string;
  riskTier: string;
}

const SUGGESTIONS = ["Quanto tenho disponível?", "Quanto gastei este mês?", "Mostra-me as minhas dívidas.", "Quais foram as minhas maiores despesas?"];

async function postChat(body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function ChatPanel() {
  const toast = useToast();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // [Auditoria de segurança M4 — double-click] `sending` (estado React) só
  // atualiza no próximo render; dois cliques na mesma "tick" síncrona podiam,
  // em teoria, ler `sending === false` nos dois antes de qualquer re-render
  // acontecer. Um ref muda de valor imediatamente, sem esperar por um
  // render — fecha essa janela por completo. Isto é uma segunda camada de
  // defesa: a garantia real contra execução duplicada está no servidor
  // (confirmation-store.ts consome o token de forma atómica, síncrona,
  // single-use); isto aqui só evita um pedido de rede supérfluo.
  const inFlightRef = useRef(false);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }

  async function sendChat(message: string) {
    const trimmed = message.trim();
    if (!trimmed || inFlightRef.current) return;
    inFlightRef.current = true;

    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((current) => [...current, { role: "user", content: trimmed }]);
    setInput("");
    setError(null);
    setSending(true);
    scrollToBottom();

    try {
      const { ok, data } = await postChat({ action: "message", message: trimmed, history });
      if (!ok) {
        const message = typeof data.error === "string" ? data.error : "Não foi possível falar com o assistente. Tenta novamente.";
        setError(message);
        toast.error(message);
        return;
      }
      if (data.status === "confirmation_required") {
        setPending({
          confirmationToken: String(data.confirmationToken),
          summary: String(data.summary),
          riskTier: String(data.riskTier),
        });
      } else if (data.status === "final") {
        setTurns((current) => [...current, { role: "assistant", content: String(data.reply) }]);
      }
    } finally {
      inFlightRef.current = false;
      setSending(false);
      scrollToBottom();
    }
  }

  async function handleConfirm() {
    if (!pending || inFlightRef.current) return;
    inFlightRef.current = true;
    setSending(true);
    try {
      const { ok, data } = await postChat({ action: "confirm", confirmationToken: pending.confirmationToken });
      setPending(null);
      if (!ok) {
        const message = typeof data.error === "string" ? data.error : "Não foi possível confirmar esta ação.";
        setError(message);
        toast.error(message);
        return;
      }
      if (data.status === "final") {
        setTurns((current) => [...current, { role: "assistant", content: String(data.reply) }]);
      }
    } finally {
      inFlightRef.current = false;
      setSending(false);
      scrollToBottom();
    }
  }

  async function handleCancel() {
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
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-surface p-3 sm:p-4">
        {turns.length === 0 && !pending ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-8 text-center">
            <Sparkles className="h-8 w-8 text-primary" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Pergunta o que quiseres sobre as tuas finanças.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void sendChat(suggestion)}
                  className="rounded-full border border-border bg-surface-hover px-3 py-1.5 text-xs font-medium text-foreground hover:bg-border"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((turn, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                turn.role === "user" ? "self-end bg-primary text-primary-foreground" : "self-start bg-surface-hover text-foreground",
              )}
            >
              {turn.content}
            </div>
          ))
        )}

        {pending && (
          <Card className="self-stretch border-primary/40 bg-surface-hover">
            <p className="mb-3 text-sm text-foreground">{pending.summary}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void handleCancel()} disabled={sending}>
                Cancelar
              </Button>
              <Button type="button" size="sm" onClick={() => void handleConfirm()} disabled={sending}>
                Confirmar
              </Button>
            </div>
          </Card>
        )}

        {sending && (
          <div className="flex items-center gap-2 self-start text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> A pensar...
          </div>
        )}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendChat(input);
        }}
        className="flex gap-2"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={pending ? "Confirma ou cancela a ação acima primeiro..." : "Escreve uma mensagem..."}
          aria-label="Mensagem para o Konta AI"
          disabled={sending || !!pending}
          className="h-11"
        />
        <Button type="submit" disabled={sending || !!pending || !input.trim()} aria-label="Enviar mensagem">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
