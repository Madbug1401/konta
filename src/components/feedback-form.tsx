"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/toast-provider";

// [Sugestão do utilizador — "quero um campo para me dar feedback direto no
// aplicativo"] Sem redirecionar nem recarregar nada: só limpa o campo e
// mostra um toast de sucesso, para a pessoa continuar na página de Ajuda
// exatamente onde estava — mesmo padrão de category-quick-create.tsx.
export function FeedbackForm() {
  const toast = useToast();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit() {
    if (!message.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Não foi possível enviar a mensagem. Tenta novamente.");
        return;
      }
      setMessage("");
      toast.success("Obrigado! A tua mensagem foi enviada.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        placeholder="Sugestões, problemas ou melhorias que gostavas de ver no Konta..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        aria-label="A tua mensagem de feedback"
      />
      <Button
        type="button"
        disabled={sending || !message.trim()}
        onClick={() => void handleSubmit()}
        className="self-end"
      >
        {sending ? "A enviar..." : "Enviar feedback"}
      </Button>
    </div>
  );
}
