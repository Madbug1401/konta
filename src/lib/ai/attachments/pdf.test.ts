import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { AttachmentError } from "./types";
import { MAX_PDF_PAGES } from "./validate";
import { assertPdfPageLimit } from "./pdf";

async function makePdfWithPages(count: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < count; i += 1) {
    doc.addPage();
  }
  return doc.save();
}

describe("assertPdfPageLimit", () => {
  it("aceita um PDF com poucas páginas", async () => {
    const bytes = await makePdfWithPages(2);
    await expect(assertPdfPageLimit(bytes)).resolves.toBeUndefined();
  });

  it("aceita um PDF exatamente no limite", async () => {
    const bytes = await makePdfWithPages(MAX_PDF_PAGES);
    await expect(assertPdfPageLimit(bytes)).resolves.toBeUndefined();
  });

  it("rejeita um PDF acima do limite de páginas", async () => {
    const bytes = await makePdfWithPages(MAX_PDF_PAGES + 1);
    await expect(assertPdfPageLimit(bytes)).rejects.toBeInstanceOf(AttachmentError);
  });

  it("rejeita bytes que não são um PDF válido, em vez de deixar a exceção do parser escapar", async () => {
    await expect(assertPdfPageLimit(new Uint8Array([1, 2, 3, 4]))).rejects.toBeInstanceOf(AttachmentError);
  });
});
