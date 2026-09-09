import { describe, expect, it } from "vitest";
import { AudioValidationError } from "./types";
import { MAX_AUDIO_BYTES, validateAudioUpload } from "./validate";

const WEBM_HEADER = [0x1a, 0x45, 0xdf, 0xa3];
const MP4_HEADER = [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]; // bytes 4-7 = "ftyp"

function bytesOf(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

describe("validateAudioUpload — deteção por conteúdo real, nunca pelo MIME declarado", () => {
  it("rejeita áudio vazio", () => {
    expect(() => validateAudioUpload(new Uint8Array())).toThrow(AudioValidationError);
  });

  it("reconhece WebM (Chrome/Edge/Firefox/Android) pelo cabeçalho EBML", () => {
    const result = validateAudioUpload(bytesOf(...WEBM_HEADER, 1, 2, 3));
    expect(result).toEqual({ kind: "webm", mimeType: "audio/webm" });
  });

  it("reconhece MP4/M4A (Safari/iPhone) pela assinatura 'ftyp'", () => {
    const result = validateAudioUpload(bytesOf(...MP4_HEADER, 1, 2, 3));
    expect(result).toEqual({ kind: "mp4", mimeType: "audio/mp4" });
  });

  it("rejeita um formato não suportado (ex: MP3, WAV) mesmo sendo áudio genuíno", () => {
    const mp3ish = bytesOf(0x49, 0x44, 0x33, 0x04, 0x00); // cabeçalho ID3 de um MP3 real
    expect(() => validateAudioUpload(mp3ish)).toThrow(AudioValidationError);
  });

  it("rejeita bytes arbitrários que não são nenhum formato de áudio conhecido", () => {
    expect(() => validateAudioUpload(bytesOf(1, 2, 3, 4, 5, 6, 7, 8))).toThrow(AudioValidationError);
  });

  it("rejeita áudio acima do limite de tamanho", () => {
    const oversized = new Uint8Array(MAX_AUDIO_BYTES + 1);
    oversized.set(WEBM_HEADER);
    expect(() => validateAudioUpload(oversized)).toThrow(AudioValidationError);
  });

  it("aceita áudio exatamente no limite de tamanho", () => {
    const atLimit = new Uint8Array(MAX_AUDIO_BYTES);
    atLimit.set(WEBM_HEADER);
    expect(() => validateAudioUpload(atLimit)).not.toThrow();
  });
});
