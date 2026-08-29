"use client";

// ============================================================================
// KONTA — error boundary da raiz (Pre-Beta Hardening, Prioridade 4).
//
// Só é usado se o próprio `layout.tsx` raiz falhar a renderizar (ex: um erro
// dentro do RootLayout, fora do alcance de src/app/error.tsx). O Next.js
// exige que este ficheiro renderize o seu próprio <html>/<body> — não pode
// depender do layout que acabou de falhar. Mantido deliberadamente simples
// (sem componentes de UI partilhados) para minimizar o risco de este próprio
// ficheiro também falhar.
// ============================================================================

import { useEffect } from "react";
import { logError } from "@/lib/logger";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError("app.global-error-boundary", error, { digest: error.digest });
  }, [error]);

  return (
    <html lang="pt">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          backgroundColor: "#0b0f14",
          color: "#f5f5f5",
        }}
      >
        <p style={{ fontSize: "1.125rem", fontWeight: 600 }}>Algo correu mal. Tenta novamente.</p>
        <button
          onClick={() => reset()}
          style={{
            borderRadius: "0.5rem",
            padding: "0.6rem 1.25rem",
            fontWeight: 600,
            backgroundColor: "#16a34a",
            color: "white",
            border: "none",
            cursor: "pointer",
          }}
        >
          Tentar novamente
        </button>
      </body>
    </html>
  );
}
