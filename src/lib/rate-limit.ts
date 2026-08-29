// ============================================================================
// KONTA — rate limiting mínimo por IP (Pre-Beta Hardening, Prioridade 3).
//
// [DECISÃO] Em memória (um `Map`), sem nenhuma dependência nova nem
// infraestrutura extra (Redis, etc.) — apropriado para uma Beta pequena
// (10–30 utilizadores) a correr numa única instância (ver
// docs/architecture/DEPLOYMENT.md, "um único VPS"). Isto NÃO sobrevive a um
// restart do processo (a contagem volta a zero) nem funciona corretamente
// se um dia houver mais do que uma instância da app a correr ao mesmo tempo
// atrás de um load balancer (cada instância teria a sua própria contagem
// independente) — aceitável para já, documentado como limitação conhecida,
// não escondido.
//
// [DECISÃO] Sem CAPTCHA nesta fase, por pedido explícito do utilizador ("não
// implementar CAPTCHA a menos que haja uma razão concreta — a Beta vai ter
// poucos utilizadores"). O rate limiting por IP é a defesa suficiente para
// este volume.
//
// Aplica-se a rotas de autenticação (login/registo) — ver
// src/app/api/auth/login/route.ts e .../register/route.ts.
// ============================================================================

interface Bucket {
  count: number;
  windowStart: number;
  windowMs: number;
}

const buckets = new Map<string, Bucket>();

let lastCleanup = 0;
const CLEANUP_INTERVAL_MS = 60_000;

/** Remove entradas cuja janela já expirou há muito, para o Map não crescer sem limite. */
function cleanupExpired(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > bucket.windowMs) {
      buckets.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Segundos até a janela atual terminar — só relevante quando `allowed` é false. */
  retryAfterSeconds: number;
}

/**
 * Janela fixa simples: `limit` pedidos permitidos por `windowMs` para uma
 * dada `key` (normalmente `"<rota>:<ip>"`). `now` só existe para os testes
 * conseguirem avançar o tempo sem `setTimeout` real.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): RateLimitResult {
  cleanupExpired(now);

  const existing = buckets.get(key);
  if (!existing || now - existing.windowStart >= existing.windowMs) {
    buckets.set(key, { count: 1, windowStart: now, windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.windowStart + existing.windowMs - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Só para os testes: limpa todo o estado entre casos de teste. */
export function _resetRateLimitState(): void {
  buckets.clear();
  lastCleanup = 0;
}

/**
 * Extrai o IP do pedido a partir dos cabeçalhos de proxy habituais. Em
 * produção a app corre sempre atrás de um proxy reverso (ver
 * docs/architecture/DEPLOYMENT.md, secção 3 — TLS) que define
 * `x-forwarded-for`; sem isso, não há forma fiável de saber o IP real a
 * partir de um `Request` do Next.js. `"unknown"` como último recurso agrupa
 * todos esses pedidos na mesma contagem — mais restritivo, nunca mais
 * permissivo, se algum dia isso acontecer.
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
