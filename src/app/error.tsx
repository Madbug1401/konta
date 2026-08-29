"use client";

// ============================================================================
// KONTA — error boundary de rota (Pre-Beta Hardening, Prioridade 4).
//
// Apanha qualquer erro de renderização que aconteça dentro de uma página
// (Server ou Client Component) da app — antes disto, um erro assim mostrava
// a página de erro genérica do próprio Next.js (ou, em produção, uma página
// em branco), sem nenhuma ação para o utilizador seguir. Texto exigido
// explicitamente pelo utilizador: "Algo correu mal. Tenta novamente." — sem
// nenhum detalhe técnico do erro (mensagem, stack) visível aqui.
// ============================================================================

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { logError } from "@/lib/logger";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // Nunca falhar em silêncio: o erro técnico completo fica registado (só
    // na consola do browser, aqui — não é enviado para o servidor; ver
    // src/lib/api-error.ts para o equivalente do lado das rotas de API, que
    // regista no log do servidor).
    logError("app.error-boundary", error, { digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-lg font-semibold text-foreground">Algo correu mal. Tenta novamente.</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        O erro já ficou registado. Podes tentar de novo ou voltar ao Dashboard.
      </p>
      <div className="flex gap-3">
        <Button onClick={() => reset()}>Tentar novamente</Button>
        <Button variant="outline" onClick={() => router.push("/dashboard")}>
          Ir para o Dashboard
        </Button>
      </div>
    </div>
  );
}
