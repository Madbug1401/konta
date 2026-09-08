import { describe, expect, it } from "vitest";
import { AttachmentError } from "./types";
import { MAX_IMAGE_BYTES, MAX_PDF_BYTES, MAX_TEXT_BYTES, validateUploadedFile } from "./validate";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff, 0xe0];
const WEBP_HEADER = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const GIF_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];

function bytesOf(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

describe("validateUploadedFile — deteção por conteúdo real, nunca pelo MIME/extensão declarados", () => {
  it("rejeita um ficheiro vazio", () => {
    expect(() => validateUploadedFile(new Uint8Array(), null)).toThrow(AttachmentError);
  });

  it("reconhece PNG pela assinatura binária, independentemente do declaredKind", () => {
    const result = validateUploadedFile(bytesOf(...PNG_SIGNATURE, 1, 2, 3), "csv");
    expect(result).toEqual({ kind: "image", mimeType: "image/png", bytes: expect.any(Uint8Array) });
  });

  it("reconhece JPEG pela assinatura binária", () => {
    const result = validateUploadedFile(bytesOf(...JPEG_SIGNATURE), null);
    expect(result.kind).toBe("image");
    expect(result.mimeType).toBe("image/jpeg");
  });

  it("reconhece WebP (RIFF....WEBP)", () => {
    const result = validateUploadedFile(bytesOf(...WEBP_HEADER), null);
    expect(result.mimeType).toBe("image/webp");
  });

  it("reconhece GIF", () => {
    const result = validateUploadedFile(bytesOf(...GIF_SIGNATURE), null);
    expect(result.mimeType).toBe("image/gif");
  });

  it("reconhece PDF pela assinatura binária", () => {
    const result = validateUploadedFile(bytesOf(...PDF_SIGNATURE, 1, 2), null);
    expect(result.kind).toBe("pdf");
  });

  it("um ficheiro cujo conteúdo real é um PDF é tratado como PDF mesmo que o cliente declare 'csv' — o conteúdo decide, nunca o campo declarado", () => {
    const result = validateUploadedFile(bytesOf(...PDF_SIGNATURE), "csv");
    expect(result.kind).toBe("pdf");
  });

  it("rejeita uma imagem acima do limite de tamanho", () => {
    const oversized = new Uint8Array(MAX_IMAGE_BYTES + 1);
    oversized.set(PNG_SIGNATURE);
    expect(() => validateUploadedFile(oversized, null)).toThrow(AttachmentError);
  });

  it("rejeita um PDF acima do limite de tamanho", () => {
    const oversized = new Uint8Array(MAX_PDF_BYTES + 1);
    oversized.set(PDF_SIGNATURE);
    expect(() => validateUploadedFile(oversized, null)).toThrow(AttachmentError);
  });

  it("texto plano (sem assinatura binária, decodificável em UTF-8) é aceite como 'text' por omissão", () => {
    const result = validateUploadedFile(new TextEncoder().encode("Olá, isto é um ficheiro de texto."), null);
    expect(result.kind).toBe("text");
    expect(result.mimeType).toBe("text/plain");
  });

  it("texto com declaredKind='csv' é aceite como 'csv'", () => {
    const result = validateUploadedFile(new TextEncoder().encode("data,valor\n2026-09-08,2000"), "csv");
    expect(result.kind).toBe("csv");
    expect(result.mimeType).toBe("text/csv");
  });

  it("rejeita texto acima do limite de tamanho", () => {
    const oversized = new TextEncoder().encode("a".repeat(MAX_TEXT_BYTES + 1));
    expect(() => validateUploadedFile(oversized, null)).toThrow(AttachmentError);
  });

  it("rejeita bytes binários que não correspondem a nenhum formato suportado e não parecem texto (contêm byte nulo)", () => {
    const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe]);
    expect(() => validateUploadedFile(garbage, null)).toThrow(AttachmentError);
  });

  it("aceita um ficheiro 'audio' pelo declaredKind quando não tem assinatura binária conhecida (Milestone 5c)", () => {
    const result = validateUploadedFile(new Uint8Array([1, 2, 3, 4, 5]), "audio");
    expect(result.kind).toBe("audio");
  });
});
