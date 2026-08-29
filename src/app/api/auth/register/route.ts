import { NextResponse } from "next/server";
import { z } from "zod";
import { createUser, findUserByEmail } from "@/lib/db/users";
import { hashPassword } from "@/lib/auth/password";
import { signSessionToken, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "@/lib/auth/jwt";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-error";

// [Regra 10/11 do briefing] Toda a entrada do utilizador é tratada como não
// confiável: validação estrita com zod antes de tocar em qualquer lógica de
// negócio ou base de dados.
const RegisterSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(200),
  name: z.string().trim().max(120).optional(),
});

// [Correção — Pre-Beta Hardening, Prioridade 3] Limite mais apertado do que
// o login: criar conta é muito menos frequente para um utilizador legítimo,
// e é a rota mais atrativa para um bot criar contas em massa. Ver
// src/lib/rate-limit.ts.
const REGISTER_RATE_LIMIT = 5;
const REGISTER_RATE_WINDOW_MS = 60 * 60 * 1000;

export const POST = withErrorHandling("api.auth.register.post", async (request: Request) => {
  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`register:${ip}`, REGISTER_RATE_LIMIT, REGISTER_RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas tentativas. Tenta novamente mais tarde." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });
  }
  const { email, password, name } = parsed.data;

  const existing = await findUserByEmail(email);
  if (existing) {
    // Mensagem genérica de propósito: não confirmar/negar existência de conta
    // a um atacante que esteja a enumerar emails.
    return NextResponse.json({ error: "Não foi possível criar a conta." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await createUser({ email, passwordHash, name });

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
