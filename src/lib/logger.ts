// ============================================================================
// KONTA — logging mínimo (Pre-Beta Hardening, Prioridade 5).
//
// Não é Sentry nem observabilidade avançada — isso está explicitamente fora
// do âmbito desta tarefa. O objetivo é só: quando algo corre mal (erro de
// API, erro de base de dados, exceção não esperada), ficar registado com
// contexto suficiente para investigar depois, sem nunca escrever dados
// sensíveis nos logs.
//
// REGRA DURA, sem exceções (exigência explícita do utilizador — Prioridade 5):
//   NUNCA registar: passwords; hashes de password; tokens; cookies; dados
//   financeiros completos desnecessários.
//
// Como isto é imposto na prática: as funções abaixo só aceitam um `meta`
// tipado como `Record<string, string | number | boolean | null | undefined>`
// — ou seja, só campos de diagnóstico simples e "achatados" (ex: `userId`,
// `route`, `code`, `statusCode`), nunca um objeto completo de request/erro
// que possa conter um campo `password`/`token`/`amountMinor` sem quem chama
// reparar. Quem chama tem sempre de escolher explicitamente que campos
// passar — nunca `logError("x", err, req.body)`.
// ============================================================================

type LogMeta = Record<string, string | number | boolean | null | undefined>;

function baseLine(level: "info" | "error", context: string, message: string, meta?: LogMeta) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    context,
    message,
    ...(meta ?? {}),
  });
}

/**
 * Regista um erro inesperado (API, base de dados, ou qualquer exceção não
 * tratada). `context` identifica de onde veio (ex: "db.pool",
 * "api.transactions.post") — usa sempre um valor fixo, nunca interpolação de
 * dados do utilizador. Nunca passar o erro completo de forma opaca quando
 * ele pode conter dados sensíveis (ex: um erro de validação Zod pode incluir
 * o valor inválido no `path`/`message` — extrai só o que precisas).
 */
export function logError(context: string, error: unknown, meta?: LogMeta): void {
  const message = error instanceof Error ? error.message : String(error);
  // `code` é comum em erros do Postgres (ex: "ECONNRESET", "57P01") — é um
  // identificador da classe do erro, não dado sensível.
  const code =
    error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : undefined;

  console.error(baseLine("error", context, message, { ...meta, code }));

  // Stack trace só vai para o log do servidor (nunca para a resposta HTTP ao
  // utilizador — ver src/app/error.tsx / rotas de API). Regista-se à parte,
  // em texto simples, para não poluir a linha JSON principal com quebras de
  // linha.
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
}

/** Registo informativo (não erro) — usar com moderação, o mesmo cuidado com dados sensíveis aplica-se. */
export function logInfo(context: string, message: string, meta?: LogMeta): void {
  console.log(baseLine("info", context, message, meta));
}
