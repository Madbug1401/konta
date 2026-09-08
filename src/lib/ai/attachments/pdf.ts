// ============================================================================
// KONTA AI — Attachments: limite de páginas de PDF (Milestone 5a).
//
// Único ficheiro que importa `pdf-lib` — mantém essa dependência isolada,
// para o caso de a trocarmos mais tarde. `pdf-lib` é 100% JavaScript (sem
// binários nativos, ao contrário de alternativas como `pdf-parse@2.x`, que
// arrasta `@napi-rs/canvas`) e é usado só para ler a contagem de páginas —
// nunca para renderizar nem para OCR (a análise visual real do PDF é feita
// pelo próprio Claude, através da Anthropic Files API, não aqui).
//
// [Nota] `pdf-parse@1.x` foi tentado primeiro e descartado: o seu `index.js`
// corre um bloco de "modo debug" à boca do carregamento do módulo sempre que
// `module.parent` é `undefined` — o que acontece sob o carregador de módulos
// do Vitest/Vite, mesmo quando importado como biblioteca — e falha a tentar
// ler um ficheiro de teste que não existe neste projeto. `pdf-lib` não tem
// esse problema (sem código a correr à boca do import).
// ============================================================================

import { PDFDocument } from "pdf-lib";
import { AttachmentError } from "./types";
import { MAX_PDF_PAGES } from "./validate";

export async function assertPdfPageLimit(bytes: Uint8Array): Promise<void> {
  let numPages: number;
  try {
    const document = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    numPages = document.getPageCount();
  } catch {
    throw new AttachmentError("Não foi possível ler este PDF.");
  }

  if (numPages > MAX_PDF_PAGES) {
    throw new AttachmentError(`PDF com demasiadas páginas (máximo ${MAX_PDF_PAGES}).`);
  }
}
