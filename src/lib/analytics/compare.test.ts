import { describe, expect, it } from "vitest";
import { compareAmounts, comparePercent } from "./compare";

describe("compareAmounts", () => {
  it("sem período anterior (null): sem percentagem, direção 'flat'", () => {
    const result = compareAmounts(5000n, null);
    expect(result).toEqual({ current: 5000n, previous: null, changePercent: null, direction: "flat" });
  });

  it("período anterior ZERO: nunca calcula percentagem enganosa (regra explícita do pedido)", () => {
    const result = compareAmounts(5000n, 0n);
    expect(result.changePercent).toBeNull();
    expect(result.direction).toBe("up"); // direção continua a fazer sentido, só a % é que fica de fora
  });

  it("subida normal: percentagem e direção corretas", () => {
    const result = compareAmounts(1500n, 1000n);
    expect(result.changePercent).toBe(50);
    expect(result.direction).toBe("up");
  });

  it("descida normal: percentagem negativa e direção 'down'", () => {
    const result = compareAmounts(500n, 1000n);
    expect(result.changePercent).toBe(-50);
    expect(result.direction).toBe("down");
  });

  it("valores iguais: direção 'flat', percentagem 0", () => {
    const result = compareAmounts(1000n, 1000n);
    expect(result.direction).toBe("flat");
    expect(result.changePercent).toBe(0);
  });

  it("valores negativos (ex: cashflow negativo): compara corretamente", () => {
    const result = compareAmounts(-500n, -1000n);
    expect(result.direction).toBe("up"); // -500 > -1000
    expect(result.changePercent).toBe(-50); // ((-500)-(-1000))/(-1000) * 100 = -50
  });
});

describe("comparePercent", () => {
  it("ambos null: direção 'flat'", () => {
    expect(comparePercent(null, null)).toEqual({ current: null, previous: null, direction: "flat" });
  });

  it("um dos dois null: direção 'flat', nunca inventa uma direção", () => {
    expect(comparePercent(10, null)).toMatchObject({ direction: "flat" });
    expect(comparePercent(null, 10)).toMatchObject({ direction: "flat" });
  });

  it("compara duas percentagens reais", () => {
    expect(comparePercent(20, 10)).toMatchObject({ direction: "up" });
    expect(comparePercent(10, 20)).toMatchObject({ direction: "down" });
  });
});
