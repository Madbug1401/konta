// Superfície pública do Attachment Store — só isto deve ser importado por
// fora de src/lib/ai/attachments/. Mesmo padrão de src/lib/ai/context/index.ts
// e src/lib/ai/tools/index.ts.
export { assertPdfPageLimit } from "./pdf";
export { ANTHROPIC_FILE_EXPIRES_IN_SECONDS, createAttachment, getAttachment, type CreateAttachmentInput } from "./store";
export {
  AI_ATTACHMENT_KINDS,
  AttachmentError,
  type AiAttachment,
  type AiAttachmentContent,
  type AiAttachmentKind,
  type AiAttachmentSummary,
} from "./types";
export {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_SECONDS,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
  MAX_TEXT_BYTES,
  validateUploadedFile,
  type ValidatedFile,
} from "./validate";
