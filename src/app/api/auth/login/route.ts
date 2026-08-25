import { NextResponse } from "next/server";
import { z } from "zod";
import { findUserByEmail } from "@/lib/db/users";
import { verifyPassword } from "@/lib/auth/password";
import { signSessionToken, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "@/lib/auth/jwt";

const LoginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
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
}
