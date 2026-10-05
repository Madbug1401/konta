"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/toast-provider";

// [Sugestão do utilizador — "quero enviar mensagens aos meus users, como
// notificação"] Mesmo padrão do FeedbackForm (src/components/feedback-form.tsx):
// limpa o campo e mostra um toast, sem redirecionar. `router.refresh()` para
// a lista "Enviadas recentemente", logo abaixo neste painel, mostrar a nova
// mensagem sem a pessoa ter de recarregar a página à mão.
export function NotificationComposeForm() {
  const router = useRouter();
  const toast = useToast();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit() {
    if (!message.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Não foi possível enviar a notificação. Tenta novamente.");
        return;
      }
      setMessage("");
      toast.success("Notificação enviada a todos os utilizadores.");
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        placeholder="Mensagem a enviar a todos os utilizadores (ex: aviso de atualização, manutenção, contacto)..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        aria-label="Mensagem da notificação"
      />
      <Button type="button" disabled={sending || !message.trim()} onClick={() => void handleSubmit()} className="self-end">
        {sending ? "A enviar..." : "Enviar a todos"}
      </Button>
    </div>
  );
}
