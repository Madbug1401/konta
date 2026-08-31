"use client";

import { LayoutDashboard, List, Wallet, Landmark, Target, Repeat, Plus, LogOut, HelpCircle } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/components/toast-provider";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Resumo", icon: LayoutDashboard },
  { href: "/transactions", label: "Transações", icon: List },
  { href: "/accounts", label: "Contas", icon: Wallet },
  { href: "/debts", label: "Dívidas", icon: Landmark },
  { href: "/goals", label: "Metas", icon: Target },
  { href: "/recurring", label: "Recorrências", icon: Repeat },
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
        {/* [Sugestão do utilizador — antes de abrir aos primeiros
            utilizadores] "Ajuda" fica fora de NAV_ITEMS de propósito — essa
            lista também define a barra inferior em mobile (slice(0,3)/
            slice(3,6), já bem ajustada aos 6 itens existentes); um 7º item
            ali obrigaria a redesenhar essa barra. Em mobile, o mesmo link
            aparece no cabeçalho (ver abaixo). */}
        <div className="mt-2">
          <NavLink href="/help" label="Ajuda" icon={HelpCircle} active={pathname.startsWith("/help")} />
        </div>
        <div className="mt-4 flex items-center justify-between gap-2 px-2">
          <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
          <LogoutButton />
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden">
          <span className="text-lg font-bold text-primary">Konta</span>
          <div className="flex items-center gap-1">
            <Link
              href="/help"
              aria-label="Ajuda"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            >
              <HelpCircle className="h-4 w-4" />
            </Link>
            <ThemeToggle />
            <LogoutButton iconOnly />
          </div>
        </header>

        <main className="flex-1 px-4 pb-24 pt-4 sm:px-6 sm:pb-6 md:pb-6">{children}</main>

        <nav className="fixed inset-x-0 bottom-0 z-10 flex items-center border-t border-border bg-surface py-2 md:hidden">
          {/* [Correção — feedback do utilizador em uso real no telemóvel]
              Antes eram slice(0,3)/slice(3,6) sem scroll — cabiam à justa em
              ecrãs largos, mas espremiam-se demasiado em ecrãs mais
              estreitos. Cada metade agora é uma faixa com scroll horizontal
              próprio (min-w-0 é o que permite a um filho flex encolher
              abaixo do tamanho do seu conteúdo — sem isto o overflow nunca
              chegava a acontecer); o botão "+" fica fixo e sempre visível no
              centro, nunca dentro da área de scroll. */}
          <div className="flex min-w-0 flex-1 items-center justify-around gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NAV_ITEMS.slice(0, 3).map((item) => (
              <MobileNavLink key={item.href} {...item} active={pathname.startsWith(item.href)} />
            ))}
          </div>
          <Link
            href="/transactions/new"
            aria-label="Adicionar transação"
            className="flex h-14 w-14 shrink-0 -translate-y-3 items-center justify-center rounded-full bg-success text-white shadow-lg"
          >
            <Plus className="h-6 w-6" />
          </Link>
          <div className="flex min-w-0 flex-1 items-center justify-around gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NAV_ITEMS.slice(3, 6).map((item) => (
              <MobileNavLink key={item.href} {...item} active={pathname.startsWith(item.href)} />
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}

// [Correção — pacote UX pós-auditoria] `POST /api/auth/logout` já existia e
// funcionava, mas nada na UI alguma vez o chamava — o email da sessão era só
// texto inerte. Só navega para /login quando a resposta é `ok`: se o pedido
// que limpa o cookie falhar, a sessão continua válida, e navegar na mesma
// seria um logout falso (a pessoa pensa que saiu, mas o cookie continua lá).
function LogoutButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) {
        toast.error("Não foi possível terminar a sessão. Tenta novamente.");
        return;
      }
      router.push("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  if (iconOnly) {
    return (
      <Button variant="ghost" size="sm" onClick={handleLogout} disabled={loggingOut} aria-label="Terminar sessão" className="w-9 px-0">
        <LogOut className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleLogout}
      disabled={loggingOut}
      aria-label="Terminar sessão"
      title="Terminar sessão"
      className="w-9 shrink-0 px-0 text-muted-foreground hover:text-danger"
    >
      <LogOut className="h-4 w-4" />
    </Button>
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
        "flex min-w-16 shrink-0 flex-col items-center gap-1 rounded-lg py-1 text-[11px] font-medium text-muted-foreground",
        active && "text-primary",
      )}
    >
      <Icon className="h-5 w-5" />
      {label}
    </Link>
  );
}
