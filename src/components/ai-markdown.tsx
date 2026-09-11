// ============================================================================
// KONTA AI — renderização segura de Markdown das respostas da IA.
//
// [Segurança — conteúdo não confiável] O texto do Claude nunca passa por
// `dangerouslySetInnerHTML`. `react-markdown` converte Markdown diretamente
// em elementos React (nunca em HTML bruto interpretado) e, sem o plugin
// `rehype-raw` (nunca importado aqui), qualquer HTML literal que apareça no
// texto é tratado como texto simples, nunca renderizado como tag. Isso já
// elimina XSS por injeção de `<script>`/`<img onerror>`/etc.
//
// Por cima disso, restringimos ainda mais por decisão de produto (não
// segurança pura): `allowedElements` só deixa passar formatação estrutural
// (títulos, listas, tabelas, negrito, citação, código inline). Removemos
// deliberadamente `a` (links) e `img` — o Konta AI só fala dos dados
// financeiros do próprio utilizador, nunca precisa de apontar para fora nem
// de carregar uma imagem externa, e um link/imagem podia ser o único vetor
// realista de phishing/exfiltração vindo de texto de um anexo malicioso que
// o modelo copiasse sem querer (ver personality.ts sobre tratar conteúdo de
// anexos sempre como dado, nunca como instrução). `unwrapDisallowed` garante
// que um elemento não permitido não desaparece em silêncio — o texto lá
// dentro continua visível, só perde a formatação.
// ============================================================================

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const ALLOWED_ELEMENTS = [
  "p",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "blockquote",
  "code",
  "br",
  "hr",
];

const components: Components = {
  h2: ({ children }) => <h2 className="mt-1 text-sm font-semibold text-foreground first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-1 text-sm font-semibold text-foreground first:mt-0">{children}</h3>,
  p: ({ children }) => <p className="leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  ul: ({ children }) => <ul className="list-disc space-y-0.5 pl-4">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-0.5 pl-4">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-primary/40 pl-2 text-muted-foreground">{children}</blockquote>,
  code: ({ children }) => <code className="rounded bg-black/10 px-1 py-0.5 text-xs">{children}</code>,
  hr: () => <hr className="border-border" />,
  // Tabelas ficam largas facilmente (várias colunas de transações) — o
  // scroll horizontal fica preso a este contentor, nunca à página inteira
  // (mesmo princípio de qualquer conteúdo largo num ecrã pequeno).
  table: ({ children }) => (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-max text-left text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-black/5">{children}</thead>,
  th: ({ children }) => <th className="whitespace-nowrap px-2 py-1 font-medium text-muted-foreground">{children}</th>,
  td: ({ children }) => <td className="whitespace-nowrap px-2 py-1">{children}</td>,
};

export function AiMarkdown({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1.5 text-sm text-foreground [&_table]:my-0.5">
      <ReactMarkdown remarkPlugins={[remarkGfm]} allowedElements={ALLOWED_ELEMENTS} unwrapDisallowed components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
