import type { CSSProperties } from "react";
import { Landmark, PiggyBank, Shield, TrendingUp, Wallet, CreditCard, MoreHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MoneyDisplay } from "@/components/money-display";
import { getAccountColorHex } from "@/lib/account-colors";
import type { AccountType } from "@/lib/financial-engine";

const ICONS: Record<AccountType, React.ComponentType<{ className?: string; style?: CSSProperties }>> = {
  WALLET: Wallet,
  BANK: Landmark,
  SAVINGS: PiggyBank,
  CREDIT_CARD: CreditCard,
  INVESTMENT: TrendingUp,
  EMERGENCY_FUND: Shield,
  OTHER: MoreHorizontal,
};

export interface AccountCardProps {
  name: string;
  type: AccountType;
  balanceMinor: bigint;
  currency: string;
  // Id de uma cor da paleta curada (src/lib/account-colors.ts) — null/
  // undefined para contas criadas antes desta funcionalidade existir, que
  // continuam a mostrar-se exatamente como antes (sem acento de cor).
  color?: string | null;
}

export function AccountCard({ name, type, balanceMinor, currency, color }: AccountCardProps) {
  const Icon = ICONS[type];
  const hex = getAccountColorHex(color);

  return (
    <Card
      className="flex min-w-[200px] flex-1 flex-col gap-3 border-l-4 sm:min-w-[220px]"
      style={hex ? { borderLeftColor: hex } : undefined}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        {/* Emblema do ícone com um tom suave (16% opacidade) da cor da conta
            por trás — o mesmo acento da borda esquerda, sem repintar o
            cartão todo (que arriscaria contraste com o texto em cima). */}
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full"
          style={hex ? { backgroundColor: `${hex}29` } : undefined}
        >
          <Icon className="h-4 w-4" style={hex ? { color: hex } : undefined} aria-hidden="true" />
        </span>
        <span className="text-sm font-medium">{name}</span>
      </div>
      <MoneyDisplay amountMinor={balanceMinor} currency={currency} size="lg" />
    </Card>
  );
}
