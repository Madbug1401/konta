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
// num bigint/number monetário. Isto mantém a formatação (moeda, casas
// decimais por moeda, sinal) consistente e fácil de mudar num único lugar
// quando o Konta suportar mais do que CVE.
export function MoneyDisplay({
  amountMinor,
  currency,
  locale = "pt-CV",
  className,
  showSign = false,
  size = "md",
}: MoneyDisplayProps) {
  const minorUnitFactor = 1; // CVE não usa subunidade de uso corrente — ver docs/architecture/DECISIONS.md
  const value = Number(amountMinor) / minorUnitFactor;
  const formatted = Math.abs(value).toLocaleString(locale);
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
