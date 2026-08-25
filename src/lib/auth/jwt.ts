// ============================================================================
// Sessão / autenticação.
//
// [DECISÃO 13] Optou-se por um JWT assinado (via `jose`) em vez de uma
// solução de sessão presa a cookies do browser (ex: NextAuth no modo
// "padrão"), porque o requisito explícito do produto é que Web e o futuro
// Mobile consumam A MESMA API (secção 2 e 27 do briefing). Um JWT devolvido
// por /api/auth/login pode ser guardado como cookie httpOnly pela Web (mais
// seguro contra XSS do que localStorage) E, mais tarde, guardado em
// SecureStore pelo Expo/React Native e enviado como header
// "Authorization: Bearer <token>" — a mesma função `verifySessionToken`
// valida os dois casos, sem duplicar lógica de autenticação por cliente.
//
// Alternativa considerada: NextAuth/Auth.js. Foi posta de lado nesta fase
// por acoplar fortemente o modelo de sessão ao ecossistema de cookies do
// browser, exigindo trabalho extra para servir um cliente mobile nativo mais
// tarde. Pode ser reconsiderado no Milestone 7 (Konta Mobile) se o Auth.js
// tiver evoluído a sua história de suporte a mobile nessa altura — decisão
// documentada aqui para não ser tomada "em silêncio".
// ============================================================================

import { jwtVerify, SignJWT } from "jose";

const SESSION_COOKIE_NAME = "konta_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 dias

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET não está definido. Define uma string aleatória longa em .env antes de correr a aplicação.",
    );
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  email: string;
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.userId !== "string" || typeof payload.email !== "string") return null;
    return { userId: payload.userId, email: payload.email };
  } catch {
    return null;
  }
}

export { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS };
