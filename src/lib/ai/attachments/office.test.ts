import * as XLSX from "@e965/xlsx";
import { describe, expect, it } from "vitest";
import { extractOfficeText } from "./office";
import { AttachmentError } from "./types";

function workbookBytes(bookType: "xlsx" | "biff8"): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["Data", "Descrição", "Valor"],
    ["2026-10-01", "Renda", 2500],
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Movimentos");
  return XLSX.write(workbook, { type: "buffer", bookType }) as Uint8Array;
}

describe("extractOfficeText", () => {
  it.each([
    ["relatorio.xlsx", "xlsx"],
    ["relatorio.xls", "biff8"],
  ] as const)("extrai os valores da folha %s", async (filename, bookType) => {
    const text = await extractOfficeText(workbookBytes(bookType), filename);
    expect(text).toContain("Folha: Movimentos");
    expect(text).toContain("Descrição");
    expect(text).toContain("Renda");
    expect(text).toContain("2500");
  });

  it("rejeita um contentor ZIP que não seja um documento Word válido", async () => {
    await expect(extractOfficeText(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "ficheiro.docx")).rejects.toBeInstanceOf(AttachmentError);
  });
});