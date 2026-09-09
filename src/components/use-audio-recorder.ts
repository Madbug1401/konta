"use client";

// ============================================================================
// KONTA AI — hook de gravação de voz (Milestone 5c).
//
// [Isolamento — secção 4/15 do pedido] Único sítio do frontend que sabe
// gravar áudio (MediaRecorder) e falar com POST /api/ai/transcription. O
// ChatPanel nunca sabe o que é um MediaRecorder nem o que é a API da Groq —
// só chama `start()`/`stop()`/`cancel()` e recebe texto simples via
// `onTranscribed`. Trocar de provider de transcrição no servidor nunca
// exige tocar neste ficheiro.
//
// O resultado é sempre TEXTO — nunca uma ação financeira. `onTranscribed`
// entrega a transcrição ao mesmo composer de texto que já existe (ver
// chat-panel.tsx), para o utilizador rever/corrigir antes de enviar,
// exatamente como se a tivesse escrito.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
// [Isolamento cliente/servidor] Importa diretamente de `validate.ts` (só
// constantes/validação pura, sem I/O) — nunca do barrel `@/lib/ai/
// transcription`, que também reexporta `service.ts`/`groq-provider.ts`
// (chamadas de rede, leitura de env vars). Mesmo cuidado já aplicado a
// `assistant-provider.tsx` (Milestone 5a) para o Attachment Store.
import { MAX_AUDIO_SECONDS } from "@/lib/ai/transcription/validate";

export type RecorderStatus = "idle" | "recording" | "processing" | "error";

// [Milestone 5c] Ordem de preferência: WebM/Opus (melhor compressão,
// suportado por Chrome/Edge/Firefox/Android) primeiro; MP4/AAC como
// alternativa para o Safari/iPhone, que não suporta WebM. Nunca força um
// formato que o browser não sabe gravar.
const CANDIDATE_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"];

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

async function uploadForTranscription(blob: Blob): Promise<string> {
  const form = new FormData();
  form.set("file", blob, "gravacao");
  const res = await fetch("/api/ai/transcription", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Não foi possível transcrever o áudio.");
  }
  return String(data.text ?? "");
}

export interface UseAudioRecorderResult {
  status: RecorderStatus;
  elapsedSeconds: number;
  error: string | null;
  /** `false` quando o browser não suporta gravação (MediaRecorder em falta) — o botão de microfone deve ficar desativado/escondido. */
  supported: boolean;
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
}

export function useAudioRecorder(onTranscribed: (text: string) => void): UseAudioRecorderResult {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // [Correção — evitar transcrever depois de cancelar] `cancel()` para o
  // MediaRecorder, mas `onstop` ainda dispara — este ref é o que distingue
  // "parei para enviar" de "cancelei", já que ambos chegam ao mesmo handler.
  const cancelledRef = useRef(false);

  const supported = typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Nunca deixar o microfone "aceso" (indicador do browser ligado) se o
  // componente desmontar a meio de uma gravação (ex: o utilizador navega
  // para outra página do Konta enquanto grava).
  useEffect(() => stopStream, [stopStream]);

  const start = useCallback(async () => {
    if (status === "recording" || status === "processing") return; // nunca duas gravações ao mesmo tempo
    if (!supported) {
      setStatus("error");
      setError("O teu navegador não suporta gravação de voz.");
      return;
    }

    setError(null);
    cancelledRef.current = false;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setStatus("error");
      setError("Permissão de microfone negada.");
      return;
    }

    const mimeType = pickSupportedMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      stopStream();
      if (cancelledRef.current) {
        setStatus("idle");
        setElapsedSeconds(0);
        return;
      }
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
      chunksRef.current = [];
      setStatus("processing");
      uploadForTranscription(blob)
        .then((text) => {
          setStatus("idle");
          setElapsedSeconds(0);
          onTranscribed(text);
        })
        .catch((err: unknown) => {
          setStatus("error");
          setError(err instanceof Error ? err.message : "Não foi possível transcrever o áudio.");
        });
    };

    recorder.onerror = () => {
      stopStream();
      setStatus("error");
      setError("A gravação falhou. Tenta novamente.");
    };

    mediaRecorderRef.current = recorder;
    streamRef.current = stream;
    recorder.start();
    setStatus("recording");
    setElapsedSeconds(0);

    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      setElapsedSeconds(seconds);
      // [Secção 8/12 — limite de duração] Para automaticamente ao atingir o
      // limite — nunca deixa gravar indefinidamente à espera que o
      // utilizador se lembre de parar.
      if (seconds >= MAX_AUDIO_SECONDS) {
        recorder.stop();
      }
    }, 250);
  }, [status, supported, onTranscribed, stopStream]);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    } else {
      stopStream();
      setStatus("idle");
      setElapsedSeconds(0);
    }
  }, [stopStream]);

  return { status, elapsedSeconds, error, supported, start, stop, cancel };
}
