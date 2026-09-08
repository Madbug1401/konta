// ============================================================================
// KONTA AI — upload de attachments (Milestone 5a).
//
// Fluxo: sessão + isAiEnabled (mesma verificação de POST /api/ai/chat) +
// rate limit PRÓPRIO (nunca partilhado com o de mensagens — um upload
// pesado não deve consumir a quota de "conversar") → `request.formData()`
// nativo (Web standard, sem dependência nova) → validação real do conteúdo
// (nunca confia no MIME/extensão do cliente, ver attachments/validate.ts) →
// imagem/PDF vai para a Anthropic Files API; TXT/CSV fica como texto
// inline → guardado no Attachment Store (em memória, ownership-scoped) →
// devolve só o resumo seguro (nunca o `fileId`/texto ao cliente).
// ============================================================================

import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-error";
import {
  ANTHROPIC_FILE_EXPIRES_IN_SECONDS,
  AttachmentError,
  assertPdfPageLimit,
  createAttachment,
  validateUploadedFile,
  type AiAttachmentContent,
  type AiAttachmentSummary,
} from "@/lib/ai/attachments";
import { uploadFileToAnthropic } from "@/lib/ai/gateway";
import { getSessionUser } from "@/lib/auth/session";
import { logError } from "@/lib/logger";
import { isAiEnabled } from "@/lib/db/users";
import { checkRateLimit } from "@/lib/rate-limit";

const ATTACHMENT_UPLOAD_RATE_LIMIT = 20;
const ATTACHMENT_UPLOAD_RATE_WINDOW_MS = 10 * 60 * 1000;

export const POST = withErrorHandling("api.ai.attachments.post", async (request: Request) => {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  if (!(await isAiEnabled(session.userId))) {
    return NextResponse.json({ error: "O acesso ao Konta AI foi desativado para a tua conta." }, { status: 403 });
  }

  const rateLimit = checkRateLimit(`ai.attachments:${session.userId}`, ATTACHMENT_UPLOAD_RATE_LIMIT, ATTACHMENT_UPLOAD_RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiados ficheiros enviados. Tenta novamente daqui a pouco." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum ficheiro enviado." }, { status: 400 });
  }
  // [Milestone 5c — voz] O cliente pode indicar "audio" aqui — nenhum outro
  // valor deste campo é usado para decidir o tipo (imagem/PDF/texto são
  // sempre decididos pelo conteúdo real, nunca por isto, ver validate.ts).
  const declaredKind = form.get("kind");

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Não foi possível ler o ficheiro." }, { status: 400 });
  }

  try {
    const validated = validateUploadedFile(bytes, typeof declaredKind === "string" ? declaredKind : null);

    if (validated.kind === "pdf") {
      await assertPdfPageLimit(bytes);
    }

    let content: AiAttachmentContent;
    if (validated.kind === "image" || validated.kind === "pdf") {
      const fileId = await uploadFileToAnthropic(bytes, file.name || "ficheiro", validated.mimeType, ANTHROPIC_FILE_EXPIRES_IN_SECONDS);
      content = { form: "file", fileId, mimeType: validated.mimeType };
    } else {
      // "text"/"csv" — já passaram pela heurística "parece texto" em
      // validateUploadedFile, por isso a descodificação aqui nunca deveria
      // falhar; `fatal: true` continua ativo por defesa em profundidade.
      content = { form: "text", text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
    }

    const attachment = createAttachment({
      userId: session.userId,
      kind: validated.kind,
      filename: file.name || "ficheiro",
      sizeBytes: bytes.length,
      content,
    });

    const summary: AiAttachmentSummary = {
      attachmentId: attachment.id,
      kind: attachment.kind,
      filename: attachment.filename,
      sizeBytes: attachment.sizeBytes,
    };
    return NextResponse.json(summary, { status: 201 });
  } catch (error) {
    if (error instanceof AttachmentError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    logError("api.ai.attachments.post", error, { userId: session.userId });
    return NextResponse.json({ error: "Não foi possível processar este ficheiro. Tenta novamente." }, { status: 502 });
  }
});
