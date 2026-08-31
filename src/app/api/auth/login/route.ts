import { NextResponse } from "next/server";
import { z } from "zod";
import { findUserByEmail, touchLastLogin } from "@/lib/db/users";
import { verifyPassword } from "@/lib/auth/password";
import { signSessionToken, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "@/lib/auth/jwt";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-error";

const LoginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(200),
});

// [Correção — Pre-Beta Hardening, Prioridade 3] Proteção contra força bruta:
// 10 tentativas por IP a cada 15 minutos. Ver src/lib/rate-limit.ts para a
// justificação completa (porquê em memória, porquê sem CAPTCHA por agora).
const LOGIN_RATE_LIMIT = 10;
const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000;

export const POST = withErrorHandling("api.auth.login.post", async (request: Request) => {
  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`login:${ip}`, LOGIN_RATE_LIMIT, LOGIN_RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas tentativas. Tenta novamente mais tarde." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const user = await findUserByEmail(email);
  // Mensagem de erro idêntica quer o email não exista quer a password esteja
  // errada — evita confirmar a um atacante se um email está registado.
  const genericError = () => NextResponse.json({ error: "Email ou palavra-passe inválidos." }, { status: 401 });

  if (!user) return genericError();
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return genericError();

  // [Sugestão do utilizador — painel de estatísticas do dono do projeto]
  // Nunca bloqueia o login: se isto falhar por algum motivo, a pessoa
  // continua a entrar normalmente — "último login" é informação de
  // conveniência para o dono da app, não uma condição de autenticação.
  await touchLastLogin(user.id).catch(() => undefined);

  const token = await signSessionToken({ userId: user.id, email: user.email });
  const response = NextResponse.json({ id: user.id, email: user.email, name: user.name });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
});
