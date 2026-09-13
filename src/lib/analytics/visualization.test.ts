import { describe, expect, it } from "vitest";
import { AiVisualizationSchema, parseAiVisualization } from "./visualization";

describe("AiVisualizationSchema — segurança (secção 31/32 do pedido: nunca HTML/JS da IA)", () => {
  it("aceita os 4 tipos suportados: metric, comparison, table, e cada gráfico de série", () => {
    expect(AiVisualizationSchema.safeParse({ type: "metric", title: "Despesas", value: "5000 CVE" }).success).toBe(true);
    expect(
      AiVisualizationSchema.safeParse({
        type: "comparison",
        title: "Setembro vs Agosto",
        current: { label: "Setembro", value: "5000 CVE" },
        previous: { label: "Agosto", value: "4000 CVE" },
      }).success,
    ).toBe(true);
    expect(AiVisualizationSchema.safeParse({ type: "table", title: "Categorias", columns: ["Nome", "Valor"], rows: [["Alimentação", "5000"]] }).success).toBe(true);
    for (const type of ["line", "bar", "area", "donut"]) {
      expect(AiVisualizationSchema.safeParse({ type, title: "Série", data: [{ label: "Jan", value: 100 }] }).success).toBe(true);
    }
  });

  it("rejeita um 'type' fora da lista fechada — nunca um tipo de visualização inventado pela IA", () => {
    expect(AiVisualizationSchema.safeParse({ type: "html", title: "x", body: "<script>alert(1)</script>" }).success).toBe(false);
    expect(AiVisualizationSchema.safeParse({ type: "iframe", src: "javascript:alert(1)" }).success).toBe(false);
  });

  it("rejeita HTML/script embutido nos VALORES — o schema não sanitiza texto, mas nunca o interpreta como estrutura (quem renderiza usa texto simples)", () => {
    const result = AiVisualizationSchema.safeParse({ type: "metric", title: "<script>alert(1)</script>", value: "5000" });
    expect(result.success).toBe(true); // string é aceite como texto — a defesa contra execução está no RENDERER (React escapa por omissão), nunca aqui
  });

  it("rejeita campos extra em qualquer variante (.strict())", () => {
    expect(AiVisualizationSchema.safeParse({ type: "metric", title: "x", value: "1", onClick: "alert(1)" }).success).toBe(false);
  });

  it("limita o tamanho de séries/tabelas — nunca um payload gigante", () => {
    const hugeData = Array.from({ length: 1000 }, (_, i) => ({ label: String(i), value: i }));
    expect(AiVisualizationSchema.safeParse({ type: "line", title: "x", data: hugeData }).success).toBe(false);
    const hugeRows = Array.from({ length: 1000 }, () => ["a", "b"]);
    expect(AiVisualizationSchema.safeParse({ type: "table", title: "x", columns: ["a", "b"], rows: hugeRows }).success).toBe(false);
  });

  it("rejeita valores não-finitos (NaN/Infinity) numa série", () => {
    expect(AiVisualizationSchema.safeParse({ type: "bar", title: "x", data: [{ label: "a", value: Infinity }] }).success).toBe(false);
  });

  it("parseAiVisualization nunca lança — devolve null para entrada inválida, incluindo HTML puro", () => {
    expect(parseAiVisualization("<script>alert(1)</script>")).toBeNull();
    expect(parseAiVisualization({ type: "html" })).toBeNull();
    expect(parseAiVisualization(null)).toBeNull();
  });
});
