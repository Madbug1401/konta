"use client";

// ============================================================================
// KONTA ANALYTICS — ponte entre a Konta AI e a URL da página (Milestone
// Analytics).
//
// [Segurança — secção 25/26 do pedido] Único componente que "ouve"
// `pendingUiAction` (já revalidado em assistant-provider.tsx contra
// AnalyticsViewActionSchema) e decide como aplicá-lo — sempre por NAVEGAÇÃO
// NORMAL (`router.push` com query params), nunca `eval`, nunca `innerHTML`,
// nunca `localStorage` direto, nunca execução de código vindo da IA. Sem
// saída visual própria — é só o "sistema nervoso" que liga o chat à página.
// ============================================================================

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useAssistant } from "@/components/ai/assistant-provider";

export function AnalyticsUiActionBridge() {
  const { pendingUiAction, consumePendingUiAction } = useAssistant();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pendingUiAction) return;

    const next = new URLSearchParams(searchParams.toString());
    if (pendingUiAction.period) {
      if (pendingUiAction.period.preset) next.set("period", pendingUiAction.period.preset);
      if (pendingUiAction.period.from) next.set("from", pendingUiAction.period.from);
      if (pendingUiAction.period.to) next.set("to", pendingUiAction.period.to);
    }
    if (pendingUiAction.comparisonMode) next.set("comparison", pendingUiAction.comparisonMode);
    if (pendingUiAction.categoryId !== undefined) {
      if (pendingUiAction.categoryId === null) next.delete("categoryId");
      else next.set("categoryId", pendingUiAction.categoryId);
    }
    if (pendingUiAction.accountId !== undefined) {
      if (pendingUiAction.accountId === null) next.delete("accountId");
      else next.set("accountId", pendingUiAction.accountId);
    }
    if (pendingUiAction.transactionType !== undefined) {
      if (pendingUiAction.transactionType === null) next.delete("type");
      else next.set("type", pendingUiAction.transactionType);
    }

    const targetView = pendingUiAction.view;
    router.push(`/analytics?${next.toString()}`);
    consumePendingUiAction();

    if (targetView) {
      // Só depois da navegação — dá tempo ao React de voltar a renderizar a
      // secção antes de tentar fazer scroll até ela. O `id` da secção nunca
      // muda com os filtros (só o conteúdo lá dentro), por isso o elemento
      // já existe no DOM mesmo antes do novo RSC payload chegar.
      requestAnimationFrame(() => {
        const section = document.getElementById(`analytics-section-${targetView}`);
        section?.scrollIntoView({ behavior: "smooth", block: "start" });
        // [Secção 28 do pedido — "a Konta AI monta a página"] Um pulso breve
        // (ver .konta-ai-focus, globals.css) para o utilizador ver
        // claramente ONDE a IA o levou — desaparece sozinho, nunca fica
        // permanente a chamar atenção.
        section?.classList.add("konta-ai-focus");
        setTimeout(() => section?.classList.remove("konta-ai-focus"), 2400);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage a pendingUiAction; router/searchParams são sempre lidos "ao vivo" no momento do efeito, nunca precisam de disparar de novo sozinhos.
  }, [pendingUiAction]);

  return null;
}
