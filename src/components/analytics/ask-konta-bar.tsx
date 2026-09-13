"use client";

// ============================================================================
// KONTA ANALYTICS — "Ask Konta" (Milestone Analytics, secção 29 do pedido).
//
// Envia a mensagem pelo MESMO pipeline de sempre (`useAssistant().sendChat`,
// POST /api/ai/chat) — nunca um segundo canal de IA. A única diferença é
// `analyticsContext`: o rótulo do período/comparação/filtro já visíveis
// nesta página, para o utilizador nunca ter de os repetir.
// ============================================================================

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { useAssistant } from "@/components/assistant-provider";
import type { AnalyticsPageContext } from "@/lib/ai/chat/analytics-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const SUGGESTIONS = ["Por que aumentaram as minhas despesas?", "Onde posso poupar?", "Compara com o período anterior.", "Analisa as minhas dívidas."];

export function AskKontaBar({ analyticsContext }: { analyticsContext: AnalyticsPageContext }) {
  const { sendChat, sending, pending } = useAssistant();
  const [value, setValue] = useState("");

  function submit(message: string) {
    const trimmed = message.trim();
    if (!trimmed || sending || pending) return;
    setValue("");
    void sendChat(trimmed, { analyticsContext });
  }

  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
        <p className="text-sm font-semibold text-foreground">Pergunta à Konta</p>
      </div>
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
