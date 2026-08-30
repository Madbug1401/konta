"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast-provider";

// [Fase 3 — arquivar/encerrar] Sem window.confirm de propósito — ao
// contrário de marcar uma Dívida como incumprida ou uma Meta como
// alcançada/abandonada (irreversíveis), arquivar uma conta é reversível a
// qualquer momento com o mesmo botão (ver DELETE_POLICY.md). Baixo risco,
// não precisa de fricção extra.
export function AccountArchiveButton({ accountId, isArchived }: { accountId: string; isArchived: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !isArchived }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Não foi possível atualizar a conta.");
        return;
      }
      toast.success(isArchived ? "Conta reativada." : "Conta arquivada.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" variant="ghost" onClick={handleClick} disabled={loading} className="text-xs">
      {loading ? "..." : isArchived ? "Reativar" : "Arquivar"}
    </Button>
  );
}
