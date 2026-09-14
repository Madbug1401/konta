// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AiVisualizationView } from "./ai-visualization";

describe("AiVisualizationView", () => {
  it("renderiza 'metric' com o valor e a variação", () => {
    const { getByText } = render(<AiVisualizationView visualization={{ type: "metric", title: "Despesas", value: "5000 CVE", changePercent: -8.4, direction: "down" }} />);
    expect(getByText("Despesas")).toBeTruthy();
    expect(getByText("5000 CVE")).toBeTruthy();
    expect(getByText("↓ 8.4%")).toBeTruthy();
  });

  it("renderiza 'comparison' com atual e anterior", () => {
    const { getByText } = render(
      <AiVisualizationView
        visualization={{ type: "comparison", title: "Cash flow", current: { label: "Setembro", value: "10000" }, previous: { label: "Agosto", value: "8000" }, changePercent: 25 }}
      />,
    );
    expect(getByText("Setembro")).toBeTruthy();
    expect(getByText("Agosto")).toBeTruthy();
  });

  it("renderiza 'table' com colunas e linhas", () => {
    const { getByText, container } = render(
      <AiVisualizationView visualization={{ type: "table", title: "Categorias", columns: ["Nome", "Valor"], rows: [["Alimentação", "5000"]] }} />,
    );
    expect(getByText("Alimentação")).toBeTruthy();
    expect(container.querySelector("table")).not.toBeNull();
  });

  it("renderiza 'bar'/'line'/'area'/'donut' sem lançar exceção", () => {
    for (const type of ["bar", "line", "area", "donut"] as const) {
      expect(() =>
        render(<AiVisualizationView visualization={{ type, title: "Série", data: [{ label: "Jan", value: 100 }, { label: "Fev", value: 200 }] }} />),
      ).not.toThrow();
    }
  });

  it("um título com HTML literal aparece como texto simples, nunca interpretado (React escapa por omissão)", () => {
    const { container, getByText } = render(<AiVisualizationView visualization={{ type: "metric", title: "<img src=x onerror=alert(1)>", value: "1" }} />);
    expect(container.querySelector("img")).toBeNull();
    expect(getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  });
});
