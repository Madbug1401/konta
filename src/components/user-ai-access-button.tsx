"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast-provider";

// [Sugestão do utilizador — "quero poder ativar/desativar o acesso ao Konta
// AI por utilizador"] Mesmo padrão do botão de arquivar conta
// (src/components/account-archive-button.tsx): reversível a qualquer
// momento com o mesmo botão, sem window.confirm — desativar o acesso de
// alguém não apaga nada, só impede POST /api/ai/chat de continuar para
// essa conta (ver src/lib/db/users.ts::isAiEnabled). Só renderizado dentro
// de /admin, já atrás de isAdminEmail — este componente não repete essa
// verificação (o próprio botão só existe na página se o servidor decidiu
// mostrá-la), mas a rota que ele chama volta a confirmar isAdminEmail por
// si mesma, nunca confiando só em o botão não aparecer no ecrã.
export function UserAiAccessButton({ userId, aiEnabled }: { userId: string; aiEnabled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/ai-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !aiEnabled }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Não foi possível atualizar o acesso ao Konta AI.");
        return;
      }
      toast.success(aiEnabled ? "Acesso ao Konta AI desativado." : "Acesso ao Konta AI ativado.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" variant={aiEnabled ? "outline" : "secondary"} onClick={handleClick} disabled={loading} className="text-xs">
      {loading ? "..." : aiEnabled ? "Desativar Konta AI" : "Ativar Konta AI"}
    </Button>
  );
}
