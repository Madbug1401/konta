"use client";

// ============================================================================
// KONTA AI — Chat Panel (Milestone 4).
//
// Cliente fino de apresentação: a conversa em si (turns/pending/sending/
// error) vive agora em src/components/assistant-provider.tsx, montado em
// src/app/(app)/layout.tsx — não aqui. Isso é o que faz a conversa sobreviver
// a navegar para outra página e voltar (ver comentário no topo do provider
// para a explicação completa do bug que isto corrige). Este componente só
// trata da input de texto local e do scroll — nunca decide sozinho que uma
// ação foi executada, só mostra o que o provider já resolveu a partir da
// resposta do servidor.
// ============================================================================

import { FileText, Image as ImageIcon, Loader2, Paperclip, Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAssistant } from "@/components/assistant-provider";
import { cn } from "@/lib/utils";

const SUGGESTIONS = ["Quanto tenho disponível?", "Quanto gastei este mês?", "Mostra-me as minhas dívidas.", "Quais foram as minhas maiores despesas?"];

// [Milestone 5a] Só o que o backend sabe processar hoje (validate.ts decide
// o tipo real pelo conteúdo — isto é só o filtro do seletor de ficheiros,
// nunca a fonte de verdade da validação).
const ACCEPTED_ATTACHMENT_TYPES = "image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,text/csv";

export function ChatPanel() {
  const { turns, pending, sending, error, pendingAttachments, addAttachments, removeAttachment, sendChat, confirmPending, cancelPending } =
    useAssistant();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Rola para o fundo sempre que a conversa muda — incluindo ao montar de
  // novo (ex: ao voltar a esta página) com uma conversa já existente vinda do
  // provider, não só quando uma mensagem nova chega.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [turns.length, pending, sending]);

  const hasUploadingAttachment = pendingAttachments.some((a) => a.status === "uploading");
  const canSend = !sending && !pending && !hasUploadingAttachment && (input.trim().length > 0 || pendingAttachments.some((a) => a.status === "uploaded"));

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSend) return;
    const message = input;
    setInput("");
    void sendChat(message);
  }

  function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = ""; // permite escolher o mesmo ficheiro outra vez depois de o remover
    if (files.length > 0) addAttachments(files);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-surface p-3 sm:p-4">
        {turns.length === 0 && !pending ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-8 text-center">
            <Sparkles className="h-8 w-8 text-primary" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Pergunta o que quiseres sobre as tuas finanças.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void sendChat(suggestion)}
                  className="rounded-full border border-border bg-surface-hover px-3 py-1.5 text-xs font-medium text-foreground hover:bg-border"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((turn, i) => (
            <div
              key={i}
              className={cn(
                "flex max-w-[85%] flex-col gap-2 rounded-xl px-3 py-2 text-sm",
                turn.role === "user" ? "self-end bg-primary text-primary-foreground" : "self-start bg-surface-hover text-foreground",
              )}
            >
              {turn.attachments && turn.attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {turn.attachments.map((a, ai) => (
                    <span key={ai} className="flex items-center gap-1 rounded-full bg-black/10 px-2 py-1 text-xs">
                      {a.kind === "image" ? <ImageIcon className="h-3 w-3" aria-hidden="true" /> : <FileText className="h-3 w-3" aria-hidden="true" />}
                      {a.filename}
                    </span>
                  ))}
                </div>
              )}
              {turn.content && <span>{turn.content}</span>}
            </div>
          ))
        )}

        {pending && (
          <Card className="self-stretch border-primary/40 bg-surface-hover">
            {/* [Milestone 5b] Uma confirmação agrupada (várias transações
                extraídas de um attachment) chega como texto com quebras de
                linha (lista numerada) — `whitespace-pre-line` é o que faz
                essas quebras aparecerem; para uma confirmação de uma única
                ação (o caso comum) o texto continua uma linha só, sem
                alteração visual nenhuma. */}
            <p className="mb-3 whitespace-pre-line text-sm text-foreground">{pending.summary}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void cancelPending()} disabled={sending}>
                Cancelar
              </Button>
              <Button type="button" size="sm" onClick={() => void confirmPending()} disabled={sending}>
                Confirmar
              </Button>
            </div>
          </Card>
        )}

        {sending && (
          <div className="flex items-center gap-2 self-start text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> A pensar...
          </div>
        )}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      {pendingAttachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pendingAttachments.map((a) => (
            <span
              key={a.localId}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                a.status === "error" ? "border-danger/40 bg-danger/10 text-danger" : "border-border bg-surface-hover text-foreground",
              )}
            >
              {a.status === "uploading" ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : a.kind === "image" ? (
                <ImageIcon className="h-3 w-3" aria-hidden="true" />
              ) : (
                <FileText className="h-3 w-3" aria-hidden="true" />
              )}
              <span className="max-w-[10rem] truncate">{a.status === "error" ? (a.error ?? "Erro") : a.file.name}</span>
              <button
                type="button"
                onClick={() => removeAttachment(a.localId)}
                aria-label={`Remover ${a.file.name}`}
                className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-black/10"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_ATTACHMENT_TYPES}
          onChange={handleFilesSelected}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending || !!pending || pendingAttachments.length >= 4}
          aria-label="Anexar imagem ou ficheiro"
          className="px-3"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={pending ? "Confirma ou cancela a ação acima primeiro..." : "Escreve uma mensagem..."}
          aria-label="Mensagem para o Konta AI"
          disabled={sending || !!pending}
          className="h-11"
        />
        <Button type="submit" disabled={!canSend} aria-label="Enviar mensagem">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
