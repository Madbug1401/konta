import { describe, expect, it } from "vitest";
import { getPreviousMonthBounds } from "./datetime";

const TZ = "Atlantic/Cape_Verde";

describe("getPreviousMonthBounds", () => {
  it("devolve o mês anterior dentro do mesmo ano", () => {
    // 15 de setembro (UTC) -> mês anterior deve ser agosto.
    const bounds = getPreviousMonthBounds(TZ, new Date("2026-09-15T12:00:00Z"));
    expect(bounds).toEqual({ start: "2026-08-01", end: "2026-08-31" });
  });

  it("atravessa a fronteira do ano corretamente (janeiro -> dezembro do ano anterior)", () => {
    const bounds = getPreviousMonthBounds(TZ, new Date("2026-01-10T12:00:00Z"));
    expect(bounds).toEqual({ start: "2025-12-01", end: "2025-12-31" });
  });

  it("lida com meses de duração diferente (março -> fevereiro, ano não bissexto)", () => {
    const bounds = getPreviousMonthBounds(TZ, new Date("2026-03-31T12:00:00Z"));
    expect(bounds).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });
});
