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

import { FileText, Image as ImageIcon, Loader2, Mic, Paperclip, Send, Sparkles, Square, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { AiMarkdown } from "@/components/ai-markdown";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAssistant } from "@/components/assistant-provider";
import { useAudioRecorder } from "@/components/use-audio-recorder";
import { useToast } from "@/components/toast-provider";
import { cn } from "@/lib/utils";

// [Composer — auto-resize] Cresce naturalmente com o conteúdo (texto normal
// ou uma transcrição de voz longa) até este limite, a partir do qual passa a
// fazer scroll interno em vez de continuar a crescer — nunca uma altura fixa
// enorme, nunca corta o texto sem forma de o ler todo.
const COMPOSER_MIN_HEIGHT_PX = 44;
const COMPOSER_MAX_HEIGHT_PX = 160;

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const SUGGESTIONS = ["Quanto tenho disponível?", "Quanto gastei este mês?", "Mostra-me as minhas dívidas.", "Quais foram as minhas maiores despesas?"];

// [Milestone 5a] Só o que o backend sabe processar hoje (validate.ts decide
// o tipo real pelo conteúdo — isto é só o filtro do seletor de ficheiros,
// nunca a fonte de verdade da validação).
const ACCEPTED_ATTACHMENT_TYPES = "image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,text/csv";

export function ChatPanel() {
  const { turns, pending, sending, error, pendingAttachments, addAttachments, removeAttachment, sendChat, confirmPending, cancelPending } =
    useAssistant();
  const toast = useToast();
  const [input, setInput] = useState("");
  // [Milestone 5c — UX] Nota discreta "transcrição pronta" — só enquanto o
  // utilizador ainda não reagiu (editou ou enviou); nunca bloqueia nada,
  // desaparece sozinha para não virar ruído permanente no ecrã.
  const [showTranscribedHint, setShowTranscribedHint] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // [Milestone 5c — Voz] A transcrição só preenche o composer de texto —
  // nunca envia nada sozinha. O utilizador revê/corrige e carrega em Enviar
  // como faria com qualquer texto escrito à mão (secção 9 do pedido).
  function handleTranscribed(text: string) {
    if (!text) return;
    setInput((current) => (current.trim().length > 0 ? `${current.trim()} ${text}` : text));
    setShowTranscribedHint(true);
  }
  const recorder = useAudioRecorder(handleTranscribed);

  useEffect(() => {
    if (recorder.error) toast.error(recorder.error);
  }, [recorder.error, toast]);

  // Some sozinha ao fim de alguns segundos — é só uma pista, não um estado
  // que precise de confirmação do utilizador.
  useEffect(() => {
    if (!showTranscribedHint) return;
    const timeout = setTimeout(() => setShowTranscribedHint(false), 6000);
    return () => clearTimeout(timeout);
  }, [showTranscribedHint]);

  // Auto-resize: cresce com o conteúdo até COMPOSER_MAX_HEIGHT_PX; o `max-h`
  // + `overflow-y-auto` no próprio elemento tratam do scroll interno a partir
  // daí — este efeito só mede o conteúdo real (`scrollHeight`), nunca impõe
  // uma altura fixa.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
  }, [input]);

  function handleMicClick() {
    if (recorder.status === "recording") {
      recorder.stop();
    } else if (recorder.status === "idle" || recorder.status === "error") {
      void recorder.start();
    }
  }

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

  function submitMessage() {
    if (!canSend) return;
    const message = input;
    setInput("");
    setShowTranscribedHint(false);
    void sendChat(message);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submitMessage();
  }

  // Enter envia (convenção já usada no <Input> anterior); Shift+Enter insere
  // uma quebra de linha — necessário agora que o composer é um textarea
  // multi-linha (antes, um <input> de linha única nem permitia quebras).
  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submitMessage();
    }
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
              {turn.content && (turn.role === "assistant" ? <AiMarkdown text={turn.content} /> : <span>{turn.content}</span>)}
            </div>
          ))
        )}

        {pending && (
          <Card className="self-stretch border-primary/40 bg-surface-hover">
            {/* [Segurança — cartão de confirmação] Texto LITERAL, nunca
                Markdown — `pending.summary` inclui `description`/`category`
                de texto livre (pode vir de um attachment ou de uma
                transcrição de voz); interpretá-lo como Markdown permitia a
                um attachment/voz adversarial injetar um heading/lista real
                dentro desta superfície de segurança (achado de auditoria,
                corrigido aqui). `whitespace-pre-line` só preserva as quebras
                de linha da lista numerada do Milestone 5b como texto — nunca
                as transforma em estrutura. */}
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

      {/* [Milestone 5c — Voz] Estados claros de gravação/transcrição (secção 8 do pedido) */}
      {recorder.status === "recording" && (
        <div className="flex items-center gap-2 text-xs text-danger">
          <span className="h-2 w-2 animate-pulse rounded-full bg-danger" aria-hidden="true" />
          A gravar... {formatElapsed(recorder.elapsedSeconds)}
          <button type="button" onClick={recorder.cancel} className="underline underline-offset-2">
            Cancelar
          </button>
        </div>
      )}
      {recorder.status === "processing" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> A transcrever...
        </div>
      )}
      {showTranscribedHint && recorder.status === "idle" && (
        <p className="text-xs text-muted-foreground">Transcrição pronta — revê antes de enviar.</p>
      )}

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

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
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
        {recorder.supported && (
          <Button
            type="button"
            variant={recorder.status === "recording" ? "danger" : "outline"}
            onClick={handleMicClick}
            disabled={sending || !!pending || recorder.status === "processing"}
            aria-label={recorder.status === "recording" ? "Parar gravação e transcrever" : "Gravar mensagem de voz"}
            className="px-3"
          >
            {recorder.status === "recording" ? (
              <Square className="h-4 w-4" />
            ) : recorder.status === "processing" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>
        )}
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder={pending ? "Confirma ou cancela a ação acima primeiro..." : "Escreve uma mensagem..."}
          aria-label="Mensagem para o Konta AI"
          disabled={sending || !!pending}
          rows={1}
          className="resize-none py-2.5 leading-normal"
          style={{ minHeight: COMPOSER_MIN_HEIGHT_PX, maxHeight: COMPOSER_MAX_HEIGHT_PX, overflowY: "auto" }}
        />
        <Button type="submit" disabled={!canSend} aria-label="Enviar mensagem">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
