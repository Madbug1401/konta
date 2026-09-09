// ============================================================================
// KONTA AI — transcrição de voz (Milestone 5c).
//
// Fluxo: sessão + isAiEnabled (mesma verificação de POST /api/ai/chat e
// /api/ai/attachments) + rate limit PRÓPRIO → `request.formData()` nativo →
// validação real do conteúdo (nunca confia no MIME do cliente, ver
// transcription/validate.ts) → transcreve via `transcribeAudio()` → devolve
// só o texto.
//
// [Privacidade — secção 13 do pedido] O áudio nunca é guardado em lado
// nenhum deste servidor — os bytes só existem na memória deste pedido HTTP,
// enviados uma vez ao provider de transcrição, e descartados assim que a
// função termina (nunca escritos em disco, nunca num attachment store,
// nunca associados a uma conversa). O texto devolvido é tratado exatamente
// como se o utilizador o tivesse escrito — nunca entra num "attachment", não
// tem TTL próprio, não tem id: o cliente recebe-o e decide o que fazer, tal
// como com qualquer outro texto que digitasse.
// ============================================================================

import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-error";
import {
  AudioValidationError,
  MAX_AUDIO_SECONDS,
  TranscriptionConfigError,
  TranscriptionProviderError,
  transcribeAudio,
  validateAudioUpload,
} from "@/lib/ai/transcription";
import { getSessionUser } from "@/lib/auth/session";
import { logError } from "@/lib/logger";
import { isAiEnabled } from "@/lib/db/users";
import { checkRateLimit } from "@/lib/rate-limit";

const TRANSCRIPTION_RATE_LIMIT = 20;
const TRANSCRIPTION_RATE_WINDOW_MS = 10 * 60 * 1000;

export const POST = withErrorHandling("api.ai.transcription.post", async (request: Request) => {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  if (!(await isAiEnabled(session.userId))) {
    return NextResponse.json({ error: "O acesso ao Konta AI foi desativado para a tua conta." }, { status: 403 });
  }

  const rateLimit = checkRateLimit(`ai.transcription:${session.userId}`, TRANSCRIPTION_RATE_LIMIT, TRANSCRIPTION_RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiados pedidos de transcrição. Tenta novamente daqui a pouco." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum áudio enviado." }, { status: 400 });
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Não foi possível ler o áudio." }, { status: 400 });
  }

  try {
    const validated = validateAudioUpload(bytes);
    const result = await transcribeAudio(bytes, validated.mimeType);

    // [Secção 5 — duração, quando possível validar] O limite de tamanho já
    // corre antes de qualquer chamada ao provider (barato); a duração real só
    // se conhece depois de transcrever — se ainda assim exceder o limite,
    // rejeita-se o resultado em vez de o entregar como se nada fosse.
    if (result.durationSeconds !== undefined && result.durationSeconds > MAX_AUDIO_SECONDS) {
      return NextResponse.json({ error: "Áudio demasiado longo (máximo 2 minutos)." }, { status: 400 });
    }

    const text = result.text.trim();
    if (text.length === 0) {
      return NextResponse.json({ error: "Não consegui perceber nada no áudio. Tenta gravar de novo." }, { status: 422 });
    }

    return NextResponse.json({ text });
  } catch (error) {
    if (error instanceof AudioValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof TranscriptionConfigError) {
      logError("api.ai.transcription.post", error, { userId: session.userId });
      return NextResponse.json({ error: "A transcrição de voz não está disponível de momento." }, { status: 503 });
    }
    if (error instanceof TranscriptionProviderError) {
      logError("api.ai.transcription.post", error, { userId: session.userId });
      return NextResponse.json({ error: "Não foi possível transcrever o áudio. Tenta novamente." }, { status: 502 });
    }
    logError("api.ai.transcription.post", error, { userId: session.userId });
    return NextResponse.json({ error: "Não foi possível processar o áudio. Tenta novamente." }, { status: 502 });
  }
});
