import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/jwt";

// [Regra 6 do briefing] Primeira linha de defesa: nenhum pedido a uma rota
// autenticada chega ao Server Component sem, pelo menos, ter um cookie de
// sessão presente. A validação criptográfica do token acontece depois, em
// getSessionUser() (src/lib/auth/session.ts) — este proxy (o antigo
// "middleware" do Next.js, renomeado na versão 16) corre no Edge Runtime e
// evita importar `jose`/verificação completa aqui só para decidir
// redirecionar ou não.
const PROTECTED_PREFIXES = ["/dashboard", "/transactions", "/accounts", "/debts", "/goals", "/assistant"];

export function proxy(request: NextRequest) {
  const isProtected = PROTECTED_PREFIXES.some((p) => request.nextUrl.pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/transactions/:path*", "/accounts/:path*", "/debts/:path*", "/goals/:path*", "/assistant/:path*"],
};
