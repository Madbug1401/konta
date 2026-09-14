"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast-provider";

// [Correção — pedido explícito do utilizador, ver deleteAccount em
// src/lib/db/accounts.ts] Ao contrário de arquivar (reversível, sem
// confirmação), isto é um DELETE físico e definitivo — window.confirm de
// propósito, mesmo padrão já usado antes de apagar uma transação ou marcar
// uma dívida como incumprida. Só aparece na página Contas (nunca no
// Dashboard) e a API só aceita se a conta nunca teve nenhuma transação,
// meta, recorrência ou investimento — com histórico, o erro devolvido pede
// para arquivar em vez disso.
export function AccountDeleteButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (!window.confirm("Apagar esta conta definitivamente? Esta ação não pode ser desfeita.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Não foi possível apagar a conta.");
        return;
      }
      toast.success("Conta apagada.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" variant="ghost" onClick={handleClick} disabled={loading} className="text-xs text-danger hover:bg-danger/10">
      {loading ? "..." : "Apagar"}
    </Button>
  );
}
