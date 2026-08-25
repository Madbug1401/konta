import { Landmark, PiggyBank, Shield, TrendingUp, Wallet, CreditCard, MoreHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MoneyDisplay } from "@/components/money-display";
import type { AccountType } from "@/lib/financial-engine";

const ICONS: Record<AccountType, React.ComponentType<{ className?: string }>> = {
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
}

export function AccountCard({ name, type, balanceMinor, currency }: AccountCardProps) {
  const Icon = ICONS[type];
  return (
    <Card className="flex min-w-[200px] flex-1 flex-col gap-3 sm:min-w-[220px]">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="text-sm font-medium">{name}</span>
      </div>
      <MoneyDisplay amountMinor={balanceMinor} currency={currency} size="lg" />
    </Card>
  );
}
