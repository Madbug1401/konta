"use client";

// ============================================================================
// Sistema de notificações (toast).
//
// [DECISÃO — pacote UX pós-auditoria] Nenhuma biblioteca de toast estava
// instalada, e nenhuma ação da app (criar conta, pagar parcela, ...) dava
// qualquer confirmação de sucesso além do próprio ecrã atualizar em
// silêncio (`router.refresh()`). Em vez de adicionar uma dependência nova
// só para isto, este ficheiro é a implementação mínima que a app precisa:
// um Context + um botão de fechar manual (nunca só auto-dismiss — um toast
// que desaparece sozinho antes de a pessoa o ler é uma falha de
// acessibilidade, não só de gosto).
//
// `useToast()` lança um erro descritivo se chamado fora do Provider — a
// mesma convenção de "falhar alto" já usada no resto do projeto
// (`UnauthorizedError`, `InstallmentNotPayableError`), em vez de devolver
// um objeto que finge funcionar mas não faz nada.
// ============================================================================

import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error";

interface ToastItem {
  id: string;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const AUTO_DISMISS_MS = 5000;

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast() só pode ser usado dentro de <ToastProvider>. Ver src/app/layout.tsx.");
  }
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = `toast-${nextId.current++}`;
      setToasts((current) => [...current, { id, tone, message }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  // [Correção — regra react-hooks/refs] `useRef(...).current` lia o ref
  // durante a própria renderização, o que a nova regra do eslint-plugin-
  // react-hooks proíbe (refs só devem ser lidos fora do render — em
  // handlers/efeitos). `push` já é estável (useCallback com `dismiss` como
  // única dependência, e `dismiss` tem deps vazias), por isso `useMemo` dá o
  // mesmo objeto estável sem tocar em nenhum ref.
  const api = useMemo<ToastApi>(
    () => ({
      success: (message: string) => push("success", message),
      error: (message: string) => push("error", message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Topo em mobile, canto inferior direito em desktop — a barra de
          navegação inferior + botão flutuante já ocupam o fundo do ecrã em
          mobile (ver app-shell.tsx), por isso um toast ali colidiria. */}
      <div
        className="pointer-events-none fixed inset-x-4 top-4 z-50 flex flex-col gap-2 sm:inset-x-auto sm:bottom-6 sm:left-auto sm:right-6 sm:top-auto sm:w-80"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto flex items-start gap-2 rounded-xl border border-border border-l-4 bg-surface p-3 text-sm shadow-sm",
              t.tone === "success" ? "border-l-success" : "border-l-danger",
            )}
          >
            {t.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
            )}
            <p className="flex-1 text-foreground">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Fechar notificação"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
