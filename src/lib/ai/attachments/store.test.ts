import { afterEach, describe, expect, it } from "vitest";
import { _resetAttachmentStoreForTests, createAttachment, getAttachment } from "./store";

const CONTENT = { form: "text" as const, text: "olá" };

afterEach(() => {
  _resetAttachmentStoreForTests();
});

describe("Attachment Store — ownership e expiração (mesmo padrão de confirmation-store.ts)", () => {
  it("um attachment criado por um utilizador é devolvido só a esse utilizador", () => {
    const attachment = createAttachment({ userId: "user-1", kind: "text", filename: "notas.txt", sizeBytes: 5, content: CONTENT });

    expect(getAttachment(attachment.id, "user-1")).toEqual(attachment);
  });

  it("userId errado devolve undefined — nunca confirma que o attachment pertence a outra pessoa", () => {
    const attachment = createAttachment({ userId: "user-1", kind: "text", filename: "notas.txt", sizeBytes: 5, content: CONTENT });

    expect(getAttachment(attachment.id, "user-2")).toBeUndefined();
  });

  it("um id inexistente devolve undefined, indistinguível de um id de outro utilizador", () => {
    expect(getAttachment("id-que-nao-existe", "user-1")).toBeUndefined();
  });

  it("um attachment expirado deixa de ser devolvido, mesmo pelo dono", () => {
    const now = 1_000_000;
    const attachment = createAttachment({ userId: "user-1", kind: "text", filename: "x.txt", sizeBytes: 1, content: CONTENT }, now);

    const THIRTY_ONE_MINUTES = 31 * 60 * 1000;
    expect(getAttachment(attachment.id, "user-1", now + THIRTY_ONE_MINUTES)).toBeUndefined();
  });

  it("cada attachment criado tem um id único", () => {
    const a = createAttachment({ userId: "user-1", kind: "text", filename: "a.txt", sizeBytes: 1, content: CONTENT });
    const b = createAttachment({ userId: "user-1", kind: "text", filename: "b.txt", sizeBytes: 1, content: CONTENT });

    expect(a.id).not.toBe(b.id);
  });
});
