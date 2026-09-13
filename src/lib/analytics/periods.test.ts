import { describe, expect, it } from "vitest";
import { autoGranularity, bucketizePeriod, InvalidPeriodError, resolveComparisonPeriod, resolvePeriod } from "./periods";

const TZ = "Atlantic/Cape_Verde";
const NOW = new Date("2026-09-15T12:00:00Z"); // "hoje" local = 2026-09-15 (UTC-1)

describe("resolvePeriod", () => {
  it("this_month resolve para o mês corrente completo", () => {
    const period = resolvePeriod("this_month", TZ, NOW);
    expect(period).toEqual({ start: "2026-09-01", end: "2026-09-30", label: "Setembro de 2026" });
  });

  it("last_month resolve para o mês anterior completo", () => {
    const period = resolvePeriod("last_month", TZ, NOW);
    expect(period.start).toBe("2026-08-01");
    expect(period.end).toBe("2026-08-31");
  });

  it("last_30d/last_90d terminam hoje e cobrem exatamente N dias", () => {
    const p30 = resolvePeriod("last_30d", TZ, NOW);
    expect(p30.end).toBe("2026-09-15");
    expect(p30.start).toBe("2026-08-17");
    const p90 = resolvePeriod("last_90d", TZ, NOW);
    expect(p90.end).toBe("2026-09-15");
  });

  it("this_year/last_year resolvem o ano corrente/anterior completo", () => {
    expect(resolvePeriod("this_year", TZ, NOW)).toMatchObject({ start: "2026-01-01", end: "2026-12-31" });
    expect(resolvePeriod("last_year", TZ, NOW)).toMatchObject({ start: "2025-01-01", end: "2025-12-31" });
  });

  it("last_12_months começa no primeiro dia do mês há 11 meses e termina no fim do mês corrente", () => {
    const period = resolvePeriod("last_12_months", TZ, NOW);
    expect(period.start).toBe("2025-10-01");
    expect(period.end).toBe("2026-09-30");
  });

  it("custom aceita um intervalo válido", () => {
    const period = resolvePeriod("custom", TZ, NOW, { from: "2026-01-01", to: "2026-03-31" });
    expect(period).toMatchObject({ start: "2026-01-01", end: "2026-03-31" });
  });

  it("custom sem 'from'/'to' lança InvalidPeriodError", () => {
    expect(() => resolvePeriod("custom", TZ, NOW)).toThrow(InvalidPeriodError);
  });

  // [Achado de auditoria, corrigido] `from`/`to` como strings VAZIAS (não
  // `undefined`) passava por `!custom` sem ser apanhado, e produzia um
  // PeriodRange vazio e silencioso em vez de lançar — nunca deve acontecer.
  it("custom com 'from'/'to' vazios (strings vazias, não undefined) lança InvalidPeriodError — nunca um período vazio silencioso", () => {
    expect(() => resolvePeriod("custom", TZ, NOW, { from: "", to: "" })).toThrow(InvalidPeriodError);
  });

  it("custom com 'from'/'to' mal formados (não AAAA-MM-DD) lança InvalidPeriodError", () => {
    expect(() => resolvePeriod("custom", TZ, NOW, { from: "01/09/2026", to: "2026-09-30" })).toThrow(InvalidPeriodError);
  });

  it("custom com from > to lança InvalidPeriodError", () => {
    expect(() => resolvePeriod("custom", TZ, NOW, { from: "2026-03-01", to: "2026-01-01" })).toThrow(InvalidPeriodError);
  });

  it("custom absurdamente longo (décadas) lança InvalidPeriodError", () => {
    expect(() => resolvePeriod("custom", TZ, NOW, { from: "1990-01-01", to: "2026-01-01" })).toThrow(InvalidPeriodError);
  });
});

describe("resolveComparisonPeriod", () => {
  it("previous_period para um mês de calendário completo compara com o MÊS DE CALENDÁRIO anterior inteiro (exemplo do pedido: Setembro vs Agosto)", () => {
    const period = resolvePeriod("this_month", TZ, NOW); // Setembro 2026 (30 dias)
    const comparison = resolveComparisonPeriod(period, "previous_period");
    // Nunca "2 a 31 de Agosto" só porque Setembro tem 30 dias e Agosto 31 —
    // um mês de calendário compara sempre com o mês de calendário anterior
    // inteiro, matematicamente correto e o que o utilizador espera ver.
    expect(comparison).toMatchObject({ start: "2026-08-01", end: "2026-08-31" });
  });

  it("previous_period para um intervalo arbitrário (não alinhado a mês) usa mesma duração, imediatamente antes", () => {
    const period = { start: "2026-09-10", end: "2026-09-19", label: "x" }; // 10 dias, não é um mês completo
    const comparison = resolveComparisonPeriod(period, "previous_period");
    expect(comparison).toMatchObject({ start: "2026-08-31", end: "2026-09-09" });
  });

  it("previous_period para um ano de calendário completo compara com o ano de calendário anterior inteiro", () => {
    const period = resolvePeriod("this_year", TZ, NOW);
    const comparison = resolveComparisonPeriod(period, "previous_period");
    expect(comparison).toMatchObject({ start: "2025-01-01", end: "2025-12-31" });
  });

  it("previous_year desloca exatamente um ano, mantendo mês/dia", () => {
    const period = resolvePeriod("this_month", TZ, NOW);
    const comparison = resolveComparisonPeriod(period, "previous_year");
    expect(comparison).toMatchObject({ start: "2025-09-01", end: "2025-09-30" });
  });

  it("none devolve null — nunca inventa uma comparação não pedida", () => {
    const period = resolvePeriod("this_month", TZ, NOW);
    expect(resolveComparisonPeriod(period, "none")).toBeNull();
  });
});

describe("autoGranularity", () => {
  it("período <= 31 dias -> day; <= 180 dias -> week; maior -> month", () => {
    expect(autoGranularity({ start: "2026-09-01", end: "2026-09-30", label: "x" })).toBe("day");
    expect(autoGranularity({ start: "2026-01-01", end: "2026-04-01", label: "x" })).toBe("week");
    expect(autoGranularity({ start: "2025-01-01", end: "2026-01-01", label: "x" })).toBe("month");
  });
});

describe("bucketizePeriod", () => {
  it("granularidade 'day' produz um bucket por dia", () => {
    const buckets = bucketizePeriod({ start: "2026-09-01", end: "2026-09-03", label: "x" }, "day");
    expect(buckets.map((b) => b.start)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
  });

  it("granularidade 'month' produz um bucket por mês, clampado ao período", () => {
    const buckets = bucketizePeriod({ start: "2026-07-15", end: "2026-09-10", label: "x" }, "month");
    expect(buckets).toHaveLength(3);
    expect(buckets[0].start).toBe("2026-07-15"); // clampado ao início real do período
    expect(buckets[2].end).toBe("2026-09-10"); // clampado ao fim real do período
  });

  it("cada bucket tem uma 'key' estável para o drill-down encontrar o período exato depois", () => {
    const buckets = bucketizePeriod({ start: "2026-01-01", end: "2026-03-31", label: "x" }, "month");
    expect(new Set(buckets.map((b) => b.key)).size).toBe(buckets.length);
  });
});
