import { CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

interface FirstStepsCardProps {
  hasAccounts: boolean;
  hasTransactions: boolean;
}

// [Sugestão do utilizador — antes de abrir a app aos primeiros utilizadores
// da Beta] Cartão de orientação inicial no Dashboard. Aparece só enquanto os
// dois passos essenciais ainda não estão feitos, e desaparece sozinho assim
// que a pessoa cria a primeira conta e regista a primeira transação — nunca
// fica "preso" no dashboard de quem já usa a app a sério (mesma filosofia já
// seguida pelos EmptyState existentes: nunca mostrar orientação que já não
// faz sentido).
export function FirstStepsCard({ hasAccounts, hasTransactions }: FirstStepsCardProps) {
  if (hasAccounts && hasTransactions) return null;

  return (
    <Card className="border-primary/30">
      <p className="mb-3 text-sm font-semibold text-foreground">Primeiros passos</p>
      <ul className="flex flex-col gap-2.5">
        <Step done={hasAccounts} href="/accounts">
          Cria a tua primeira conta (carteira, banco, poupança...)
        </Step>
        <Step done={hasTransactions} href="/transactions/new">
          Regista a tua primeira transação (receita ou despesa)
        </Step>
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Quando estiveres pronto, explora também{" "}
        <Link href="/debts" className="font-medium text-primary hover:underline">
          Dívidas
        </Link>
        ,{" "}
        <Link href="/goals" className="font-medium text-primary hover:underline">
          Metas
        </Link>{" "}
        e{" "}
        <Link href="/recurring" className="font-medium text-primary hover:underline">
          Recorrências
        </Link>{" "}
        — todas opcionais, para quando precisares. Tens dúvidas? Vê a página{" "}
        <Link href="/help" className="font-medium text-primary hover:underline">
          Ajuda
        </Link>
        .
      </p>
    </Card>
  );
}

function Step({ done, href, children }: { done: boolean; href: string; children: ReactNode }) {
  const Icon = done ? CheckCircle2 : Circle;
  return (
    <li className="flex items-center gap-2.5 text-sm">
      <Icon
        className={done ? "h-5 w-5 shrink-0 text-success" : "h-5 w-5 shrink-0 text-muted-foreground"}
        aria-hidden="true"
      />
      {done ? (
        <span className="text-muted-foreground line-through">{children}</span>
      ) : (
        <Link href={href} className="font-medium text-foreground hover:underline">
          {children}
        </Link>
      )}
    </li>
  );
}
