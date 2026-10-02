import { getCurrencyDecimalPlaces } from "@/lib/currencies";
import { cn } from "@/lib/utils";

export interface MoneyDisplayProps {
  amountMinor: bigint;
  currency: string;
  locale?: string;
  className?: string;
  /** Mostra sinal +/- explícito (útil em listas de transações). */
  showSign?: boolean;
  size?: "sm" | "md" | "lg";
}

// [DECISÃO] Componente único responsável por formatar dinheiro em toda a
// aplicação — nenhum outro sítio deve fazer `.toLocaleString()` diretamente
// num bigint/number monetário. Casas decimais vêm sempre de
// `getCurrencyDecimalPlaces` (src/lib/currencies.ts) — única fonte de
// verdade, partilhada com `formatMinor` em financial-engine/money.ts — nunca
// um valor fixo duplicado aqui.
export function MoneyDisplay({
  amountMinor,
  currency,
  locale = "pt-CV",
  className,
  showSign = false,
  size = "md",
}: MoneyDisplayProps) {
  const decimals = getCurrencyDecimalPlaces(currency);
  const value = Number(amountMinor) / 10 ** decimals;
  const formatted = Math.abs(value).toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const sign = showSign && value !== 0 ? (value > 0 ? "+" : "-") : value < 0 ? "-" : "";

  const sizeClass = size === "lg" ? "text-2xl font-bold" : size === "sm" ? "text-sm font-medium" : "text-lg font-semibold";
  const colorClass = showSign ? (value > 0 ? "text-success" : value < 0 ? "text-danger" : "") : "";

  return (
    <span className={cn("tabular-nums", sizeClass, colorClass, className)}>
      {sign}
      {formatted} {currency}
    </span>
  );
}
