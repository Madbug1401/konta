"use client";

// ============================================================================
// KONTA AI — Chat Panel (Milestone 4).
//
// Cliente fino de apresentação: a conversa em si (turns/pending/sending/
// error) vive agora em src/components/assistant-provider.tsx, montado em
// src/app/(app)/layout.tsx — não aqui. Isso é o que faz a conversa sobreviver
// a navegar para outra página e voltar (ver comentário no topo do provider
// para a explicação completa do bug que isto corrige). Este componente só
// trata da input de texto local e do scroll — nunca decide sozinho que uma
// ação foi executada, só mostra o que o provider já resolveu a partir da
// resposta do servidor.
// ============================================================================

import { Loader2, Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAssistant } from "@/components/assistant-provider";
import { cn } from "@/lib/utils";

const SUGGESTIONS = ["Quanto tenho disponível?", "Quanto gastei este mês?", "Mostra-me as minhas dívidas.", "Quais foram as minhas maiores despesas?"];

export function ChatPanel() {
  const { turns, pending, sending, error, sendChat, confirmPending, cancelPending } = useAssistant();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Rola para o fundo sempre que a conversa muda — incluindo ao montar de
  // novo (ex: ao voltar a esta página) com uma conversa já existente vinda do
  // provider, não só quando uma mensagem nova chega.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [turns.length, pending, sending]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const message = input;
    setInput("");
    void sendChat(message);
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
              <Button type="button" variant="outline" size="sm" onClick={() => void cancelPending()} disabled={sending}>
                Cancelar
              </Button>
              <Button type="button" size="sm" onClick={() => void confirmPending()} disabled={sending}>
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

      <form onSubmit={handleSubmit} className="flex gap-2">
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
