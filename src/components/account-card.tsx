import type { CSSProperties } from "react";
import { Landmark, PiggyBank, Pencil, Shield, TrendingUp, Wallet, CreditCard, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { AccountArchiveButton } from "@/components/account-archive-button";
import { AccountDeleteButton } from "@/components/account-delete-button";
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
  // [Fase 2 — editar Conta] Necessário para o link "Editar" abaixo — antes
  // deste cartão nunca precisava de saber o próprio id.
  id: string;
  name: string;
  type: AccountType;
  balanceMinor: bigint;
  currency: string;
  // Id de uma cor da paleta curada (src/lib/account-colors.ts) — null/
  // undefined para contas criadas antes desta funcionalidade existir, que
  // continuam a mostrar-se exatamente como antes (sem acento de cor).
  color?: string | null;
  // [Fase 3 — arquivar/encerrar] Controla o botão Arquivar/Reativar no
  // rodapé do cartão. Omitido (undefined) equivale a `false` — cartões
  // antigos que ainda não passam esta prop continuam a mostrar-se iguais.
  isArchived?: boolean;
  // [Correção — pedido explícito do utilizador] O Dashboard mostra estes
  // cartões só como atalho visual (a página Contas é que tem a gestão a
  // sério) — por isso não deve ter "Arquivar" ali. Omitido equivale a
  // `true`, para não quebrar nenhum sítio que já usa este cartão sem passar
  // esta prop.
  showArchiveButton?: boolean;
  // Só a página Contas passa isto como `true` — "Apagar" nunca aparece no
  // Dashboard. Omitido equivale a `false`.
  showDeleteButton?: boolean;
  // [Correção — pedido explícito do utilizador] O lápis "Editar conta" só
  // deve aparecer na página Contas (onde a conta é mesmo gerida) — no
  // Resumo o cartão é só um atalho visual e o lápis ali confundia com
  // "editar o saldo". Omitido equivale a `true` (mesma convenção de
  // showArchiveButton acima), para não esconder o botão em nenhum sítio
  // que já usa este cartão sem passar esta prop; só o Resumo passa
  // `showEditButton={false}` explicitamente.
  showEditButton?: boolean;
}

export function AccountCard({
  id,
  name,
  type,
  balanceMinor,
  currency,
  color,
  isArchived = false,
  showArchiveButton = true,
  showDeleteButton = false,
  showEditButton = true,
}: AccountCardProps) {
  const Icon = ICONS[type];
  const hex = getAccountColorHex(color);

  return (
    <Card
      className="flex min-w-[200px] flex-1 flex-col gap-3 border-l-4 sm:min-w-[220px]"
      style={hex ? { borderLeftColor: hex, opacity: isArchived ? 0.6 : 1 } : { opacity: isArchived ? 0.6 : 1 }}
    >
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <div className="flex items-center gap-2">
          {/* Emblema do ícone com um tom suave (16% opacidade) da cor da
              conta por trás — o mesmo acento da borda esquerda, sem repintar
              o cartão todo (que arriscaria contraste com o texto em cima). */}
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full"
            style={hex ? { backgroundColor: `${hex}29` } : undefined}
          >
            <Icon className="h-4 w-4" style={hex ? { color: hex } : undefined} aria-hidden="true" />
          </span>
          <span className="text-sm font-medium">{name}</span>
        </div>
        {showEditButton && (
          <Link
            href={`/accounts/${id}/edit`}
            aria-label="Editar conta"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-hover hover:text-foreground"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>
      <MoneyDisplay amountMinor={balanceMinor} currency={currency} size="lg" />
      <div className="flex items-center justify-between gap-2">
        {/* [Fase 5 — Investimentos] Só contas de tipo INVESTMENT têm
            InvestmentDetail — o link só aparece aqui, nunca noutro tipo. */}
        {type === "INVESTMENT" ? (
          <Link href={`/accounts/${id}/investment`} className="text-xs font-medium text-primary hover:underline">
            Ver investimento
          </Link>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1">
          {showArchiveButton && <AccountArchiveButton accountId={id} isArchived={isArchived} />}
          {showDeleteButton && <AccountDeleteButton accountId={id} />}
        </div>
      </div>
    </Card>
  );
}
