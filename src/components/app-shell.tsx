"use client";

import { LayoutDashboard, List, Wallet, Landmark, Target, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Resumo", icon: LayoutDashboard },
  { href: "/transactions", label: "Transações", icon: List },
  { href: "/accounts", label: "Contas", icon: Wallet },
  { href: "/debts", label: "Dívidas", icon: Landmark },
  { href: "/goals", label: "Metas", icon: Target },
];

// [Regra 14 do briefing — responsive é prioridade arquitetural, não um
// ajuste posterior] Este é o ÚNICO componente de navegação do Konta Web: no
// desktop/tablet (md e acima) renderiza-se como sidebar fixa; em mobile a
// mesma lista de itens vira uma barra de navegação inferior fixa, com o
// botão "Adicionar transação" em destaque no centro — a ação mais importante
// em mobile (secção 14 do briefing). Não existem duas implementações de
// navegação a divergir: é a mesma NAV_ITEMS renderizada de duas formas via
// CSS responsivo (hidden/flex por breakpoint).
export function AppShell({ children, userEmail }: { children: ReactNode; userEmail: string }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface p-4 md:flex">
        <div className="mb-6 flex items-center justify-between px-2">
          <span className="text-lg font-bold text-primary">Konta</span>
          <ThemeToggle />
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} {...item} active={pathname.startsWith(item.href)} />
          ))}
        </nav>
        <Link
          href="/transactions/new"
          className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
        >
          <Plus className="h-4 w-4" /> Nova transação
        </Link>
        <p className="mt-4 truncate px-2 text-xs text-muted-foreground">{userEmail}</p>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden">
          <span className="text-lg font-bold text-primary">Konta</span>
          <ThemeToggle />
        </header>

        <main className="flex-1 px-4 pb-24 pt-4 sm:px-6 sm:pb-6 md:pb-6">{children}</main>

        <nav className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-around border-t border-border bg-surface py-2 md:hidden">
          {NAV_ITEMS.slice(0, 2).map((item) => (
            <MobileNavLink key={item.href} {...item} active={pathname.startsWith(item.href)} />
          ))}
          <Link
            href="/transactions/new"
            aria-label="Adicionar transação"
            className="flex h-14 w-14 -translate-y-3 items-center justify-center rounded-full bg-success text-white shadow-lg"
          >
            <Plus className="h-6 w-6" />
          </Link>
          {NAV_ITEMS.slice(2, 4).map((item) => (
            <MobileNavLink key={item.href} {...item} active={pathname.startsWith(item.href)} />
          ))}
        </nav>
      </div>
    </div>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground",
        active && "bg-surface-hover text-primary",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

function MobileNavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-w-16 flex-col items-center gap-1 rounded-lg py-1 text-[11px] font-medium text-muted-foreground",
        active && "text-primary",
      )}
    >
      <Icon className="h-5 w-5" />
      {label}
    </Link>
  );
}
