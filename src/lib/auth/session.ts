import { cookies, headers } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken, type SessionPayload } from "./jwt";

/**
 * Extrai o utilizador autenticado a partir do cookie de sessão (Web) ou do
 * header Authorization: Bearer (futuro Mobile / integrações). Nunca confia
 * em nenhum identificador de utilizador vindo do corpo do pedido.
 */
export async function getSessionUser(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (cookieToken) {
    const payload = await verifySessionToken(cookieToken);
    if (payload) return payload;
  }

  const headerList = await headers();
  const authHeader = headerList.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length);
    return verifySessionToken(token);
  }

  return null;
}

export async function requireSessionUser(): Promise<SessionPayload> {
  const user = await getSessionUser();
  if (!user) {
    throw new UnauthorizedError();
  }
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Não autenticado.");
    this.name = "UnauthorizedError";
  }
}
