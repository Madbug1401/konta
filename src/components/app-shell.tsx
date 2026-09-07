"use client";

import { LayoutDashboard, List, Wallet, Landmark, Target, Repeat, Plus, LogOut, HelpCircle, BarChart3, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/components/toast-provider";
import { cn } from "@/lib/utils";

// [Milestone 4 — Konta AI] "Konta AI" entra logo a seguir a "Resumo", de
// propósito: é a primeira experiência real do Konta AI, não uma
// funcionalidade secundária a esconder atrás de "Ajuda"/"Estatísticas"
// (essas ficam fora desta lista por serem utilitárias, não centrais — ver
// comentário mais abaixo). Isto sobe a lista de 6 para 7 itens; a barra
// inferior em mobile deixou de assumir "sempre 6" (ver slice(3) abaixo).
//
// [Sugestão do utilizador — "quero que uma conta nova venha logo sem o
// Konta AI, depois de eu ativar para aparecer"] Este array continua fixo
// (sempre com "Konta AI" — mais simples do que duas versões da lista) mas
// deixa de ser usado diretamente: `AppShell` filtra o item "/assistant"
// fora dele quando `aiEnabled` é false, antes de o passar à sidebar e à
// barra inferior. Não é só uma proteção de acesso (isso já existe em
// POST /api/ai/chat e em /assistant, ver src/lib/db/users.ts::isAiEnabled)
// — é literalmente o pedido: a entrada "aparece" quando o dono do projeto
// ativa o utilizador em /admin, não antes.
const NAV_ITEMS = [
  { href: "/dashboard", label: "Resumo", icon: LayoutDashboard },
  { href: "/assistant", label: "Konta AI", icon: Sparkles },
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
export function AppShell({
  children,
  userEmail,
  isAdmin = false,
  aiEnabled = true,
}: {
  children: ReactNode;
  userEmail: string;
  isAdmin?: boolean;
  aiEnabled?: boolean;
}) {
  const pathname = usePathname();
  // [Sugestão do utilizador — "quero que uma conta nova venha logo sem o
  // Konta AI, depois de eu ativar para aparecer"] Ver comentário junto de
  // NAV_ITEMS acima — filtrado aqui, uma única vez, para a sidebar E a
  // barra inferior usarem sempre a mesma lista já sem "Konta AI" quando
  // desativado (nunca duas fontes de verdade a poder divergir).
  const navItems = aiEnabled ? NAV_ITEMS : NAV_ITEMS.filter((item) => item.href !== "/assistant");

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface p-4 md:flex">
        <div className="mb-6 flex items-center justify-between px-2">
          <span className="text-lg font-bold text-primary">Konta</span>
          <ThemeToggle />
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
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
        <div className="mt-2 flex flex-col gap-1">
          <NavLink href="/help" label="Ajuda" icon={HelpCircle} active={pathname.startsWith("/help")} />
          {/* [Sugestão do utilizador — "como posso observar os meus
              utilizadores"] Mesma razão do "Ajuda" para ficar fora de
              NAV_ITEMS: só visível para o dono do projeto (ver
              src/lib/auth/admin.ts), nunca ocuparia lugar na barra inferior
              em mobile para o resto dos utilizadores. */}
          {isAdmin && (
            <NavLink href="/admin" label="Estatísticas" icon={BarChart3} active={pathname.startsWith("/admin")} />
          )}
        </div>
        <div className="mt-4 flex items-center justify-between gap-2 px-2">
          <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
          <LogoutButton />
        </div>
      </aside>

      {/* [Correção — feedback beta, ecrã "precisa de zoom out" no iPhone e
          Android] `min-w-0` é o mesmo truque já usado abaixo na barra de
          navegação (ver comentário na `<nav>`), só que em falta aqui, um
          nível acima: sem isto, uma tabela larga em qualquer página (ex: a
          de Transações, com `min-w-[600px]`) tem `min-width: auto` por
          omissão como filho flex — o browser recusa-se a encolhê-la abaixo
          do conteúdo, e como este é o único filho principal da linha flex
          `flex min-h-screen` acima, a página INTEIRA cresce para caber a
          tabela, em vez de só a tabela ganhar scroll horizontal próprio
          (que já tinha `overflow-x-auto`, mas nunca chegava a entrar em
          ação). Confirmado em Chrome com user-agent Android e no motor
          WebKit — não é um bug específico do Safari, por isso corrige-se
          aqui, na estrutura partilhada por toda a app, não tabela a
          tabela. */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
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
            {isAdmin && (
              <Link
                href="/admin"
                aria-label="Estatísticas"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              >
                <BarChart3 className="h-4 w-4" />
              </Link>
            )}
            <ThemeToggle />
            <LogoutButton iconOnly />
          </div>
        </header>

        {/* [Correção — feedback beta, compatibilidade Safari/iPhone] O
            padding inferior reserva espaço para a barra de navegação fixa
            (abaixo) — em iPhones com indicador de "home" (todos os atuais),
            essa barra agora também cresce com `env(safe-area-inset-bottom)`
            (ver viewport `viewportFit: "cover"` em layout.tsx), por isso o
            espaço reservado aqui tem de crescer com ela — senão a última
            transação/botão de cada página ficava tapado pela barra. */}
        <main className="flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-6 md:pb-6">{children}</main>

        <nav className="fixed inset-x-0 bottom-0 z-10 flex items-center border-t border-border bg-surface pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:hidden">
          {/* [Correção — feedback do utilizador em uso real no telemóvel]
              Antes eram slice(0,3)/slice(3,6) sem scroll — cabiam à justa em
              ecrãs largos, mas espremiam-se demasiado em ecrãs mais
              estreitos. Cada metade agora é uma faixa com scroll horizontal
              próprio (min-w-0 é o que permite a um filho flex encolher
              abaixo do tamanho do seu conteúdo — sem isto o overflow nunca
              chegava a acontecer); o botão "+" fica fixo e sempre visível no
              centro, nunca dentro da área de scroll.
              [Milestone 4] A segunda metade passou de slice(3,6) para
              slice(3) — com "Konta AI" a entrar em NAV_ITEMS, esta barra
              passou a ter 7 itens; um limite fixo em 6 faria o último
              (Recorrências) desaparecer da navegação móvel em silêncio. O
              scroll horizontal já existente absorve o item extra sem
              precisar de redesenhar o layout. */}
          <div className="flex min-w-0 flex-1 items-center justify-around gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {navItems.slice(0, 3).map((item) => (
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
            {navItems.slice(3).map((item) => (
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
