// ============================================================================
// Paleta de cores disponíveis para marcar visualmente uma conta.
//
// [DECISÃO — Cor das contas] Em vez de um seletor de cor livre (`<input
// type="color">`), que permitiria qualquer hex — incluindo tons quase
// impossíveis de ler sobre o `--surface` da app, claro ou escuro — a app
// oferece uma paleta curada e fixa. É a mesma paleta categórica já validada
// (distinção em daltonismo e contraste testados) usada nos gráficos do
// Financial Engine: aqui serve o mesmo propósito — identidade visual clara
// entre várias contas lado a lado — por isso reaproveita-se em vez de
// inventar cores novas.
//
// Um único hex por cor (sem variante clara/escura) porque é assim que o
// projeto já trata cor de identidade fixa — ver "Cores de categoria" em
// src/app/globals.css (--cat-income, --cat-expense, ...): não mudam com o
// tema, só o fundo à volta muda. Estas cores só são usadas como acento
// (borda, ícone), nunca como cor de texto, por isso o contraste com o fundo
// não é uma preocupação de legibilidade.
// ============================================================================

export const ACCOUNT_COLORS = [
  { id: "blue", label: "Azul", hex: "#2a78d6" },
  { id: "orange", label: "Laranja", hex: "#eb6834" },
  { id: "aqua", label: "Verde-água", hex: "#1baf7a" },
  { id: "yellow", label: "Amarelo", hex: "#eda100" },
  { id: "magenta", label: "Magenta", hex: "#e87ba4" },
  { id: "green", label: "Verde", hex: "#008300" },
  { id: "violet", label: "Violeta", hex: "#4a3aa7" },
  { id: "red", label: "Vermelho", hex: "#e34948" },
] as const;

export type AccountColorId = (typeof ACCOUNT_COLORS)[number]["id"];

// z.enum() exige um tuplo não vazio de literais — construído uma vez aqui a
// partir da mesma lista acima, para nunca haver duas listas de cores
// possíveis a divergir (uma na validação, outra na UI).
export const ACCOUNT_COLOR_IDS = ACCOUNT_COLORS.map((c) => c.id) as [AccountColorId, ...AccountColorId[]];

export function getAccountColorHex(id: string | null | undefined): string | null {
  if (!id) return null;
  return ACCOUNT_COLORS.find((c) => c.id === id)?.hex ?? null;
}
