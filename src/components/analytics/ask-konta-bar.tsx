"use client";

// ============================================================================
// KONTA ANALYTICS — "Ask Konta" (Milestone Analytics, secção 29 do pedido).
//
// Envia a mensagem pelo MESMO pipeline de sempre (`useAssistant().sendChat`,
// POST /api/ai/chat) — nunca um segundo canal de IA. A única diferença é
// `analyticsContext`: o rótulo do período/comparação/filtro já visíveis
// nesta página, para o utilizador nunca ter de os repetir.
// ============================================================================

import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AiMarkdown } from "@/components/ai/ai-markdown";
import { AiVisualizationView } from "@/components/ai/ai-visualization";
import { useAssistant } from "@/components/ai/assistant-provider";
import type { AnalyticsPageContext } from "@/lib/ai/chat/analytics-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const SUGGESTIONS = ["Por que aumentaram as minhas despesas?", "Onde posso poupar?", "Compara com o período anterior.", "Analisa as minhas dívidas."];

export function AskKontaBar({ analyticsContext }: { analyticsContext: AnalyticsPageContext }) {
  const { turns, pending, sending, error, sendChat, confirmPending, cancelPending } = useAssistant();
  const [value, setValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  function submit(message: string) {
    const trimmed = message.trim();
    if (!trimmed || sending || pending) return;
    setValue("");
    void sendChat(trimmed, { analyticsContext });
  }

  // [Bug corrigido — "clica na sugestão e não acontece nada"] Esta barra
  // enviava a mensagem pelo mesmo `sendChat` do ChatPanel mas nunca desenhava
  // `turns`/`pending`/`error` — a resposta chegava ao AssistantProvider
  // partilhado e ficava sem UI nenhuma aqui para a mostrar. Mesmo padrão de
  // chat-panel.tsx, só que num cartão compacto em vez de página inteira.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [turns.length, pending, sending]);

  const hasConversation = turns.length > 0 || !!pending;

  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
        <p className="text-sm font-semibold text-foreground">Pergunta à Konta</p>
      </div>

      {hasConversation ? (
        <div ref={scrollRef} className="mb-2 flex max-h-72 flex-col gap-2 overflow-y-auto rounded-lg border border-border bg-surface p-2.5">
          {turns.map((turn, i) => (
            <div
              key={i}
              className={cn(
                "flex max-w-[90%] flex-col gap-2 rounded-xl px-3 py-2 text-sm",
                turn.role === "user" ? "self-end bg-primary text-primary-foreground" : "self-start bg-surface-hover text-foreground",
              )}
            >
              {turn.content && (turn.role === "assistant" ? <AiMarkdown text={turn.content} /> : <span>{turn.content}</span>)}
              {turn.visualization && <AiVisualizationView visualization={turn.visualization} />}
            </div>
          ))}

          {pending && (
            <Card className="self-stretch border-primary/40 bg-surface-hover">
              <p className="mb-3 whitespace-pre-line text-sm text-foreground">{pending.summary}</p>
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
      ) : (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => submit(s)}
              disabled={sending || !!pending}
              className="rounded-full border border-border bg-surface-hover px-2.5 py-1 text-xs font-medium text-foreground hover:bg-border disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mb-2 text-xs text-danger">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
        className="flex gap-2"
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Pergunta à Konta sobre esta análise..."
          aria-label="Pergunta à Konta sobre esta análise"
          disabled={sending || !!pending}
          className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
        <Button type="submit" size="sm" disabled={sending || !!pending || value.trim().length === 0}>
          Perguntar
        </Button>
      </form>
    </Card>
  );
}
