import { createRequire } from "node:module";
import * as XLSX from "@e965/xlsx";
import { AttachmentError } from "./types";
import { MAX_TEXT_BYTES } from "./validate";

const require = createRequire(import.meta.url);
const WordExtractor = require("word-extractor") as new () => {
  extract(buffer: Buffer): Promise<{ getBody(): string }>;
};

const MAX_WORKSHEETS = 20;
const MAX_ROWS_PER_WORKSHEET = 5000;

function ensureExtractedTextLimit(text: string): string {
  if (Buffer.byteLength(text, "utf8") > MAX_TEXT_BYTES) {
    throw new AttachmentError("O conteúdo extraído é demasiado grande (máximo 2 MB).");
  }
  const trimmed = text.trim();
  if (!trimmed) throw new AttachmentError("Não foi encontrado texto neste documento.");
  return trimmed;
}

export async function extractOfficeText(bytes: Uint8Array, filename: string): Promise<string> {
  const extension = filename.toLowerCase().split(".").pop();

  try {
    if (extension === "doc" || extension === "docx") {
      const document = await new WordExtractor().extract(Buffer.from(bytes));
      return ensureExtractedTextLimit(document.getBody());
    }

    if (extension === "xls" || extension === "xlsx") {
      const workbook = XLSX.read(Buffer.from(bytes), { type: "buffer", cellDates: true, sheetRows: MAX_ROWS_PER_WORKSHEET });
      if (workbook.SheetNames.length > MAX_WORKSHEETS) {
        throw new AttachmentError(`O Excel excede o limite de ${MAX_WORKSHEETS} folhas.`);
      }

      const sheets = workbook.SheetNames.map((name) => {
        const worksheet = workbook.Sheets[name];
        if (!worksheet) return "";
        return `Folha: ${name}\n${XLSX.utils.sheet_to_csv(worksheet, { FS: "\t", blankrows: false })}`;
      });
      return ensureExtractedTextLimit(sheets.filter(Boolean).join("\n\n"));
    }
  } catch (error) {
    if (error instanceof AttachmentError) throw error;
    throw new AttachmentError("Não foi possível ler este documento Word ou Excel. Verifica se o ficheiro não está danificado.");
  }

  throw new AttachmentError("Formato de documento Office não suportado.");
}