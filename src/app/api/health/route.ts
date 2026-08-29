import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/client";
import { logError } from "@/lib/logger";

// ============================================================================
// KONTA — health check (Pre-Beta Hardening, Prioridade 6).
//
// Sem isto, a única forma de saber que a app caiu era um utilizador
// reportar (achado 5.6 do GO_TO_BETA_AUDIT.md). Usado por:
// - o healthcheck do serviço "app" em docker-compose.prod.yml;
// - qualquer monitorização externa futura (ex: "avisa-me se isto ficar
//   unhealthy por mais de 5 minutos").
//
// Verifica as duas coisas mínimas exigidas: o processo está a responder
// (só por chegar aqui, já está) e a base de dados está acessível (um
// `SELECT 1` real, não assumido). Sem autenticação de propósito — um
// healthcheck de infraestrutura (Docker, load balancer) não tem sessão de
// utilizador — e sem devolver nenhum dado sensível (nunca a connection
// string, nunca detalhes internos do erro).
// ============================================================================

export async function GET() {
  try {
    await getPool().query("SELECT 1");
    return NextResponse.json({ status: "healthy" }, { status: 200 });
  } catch (error) {
    // Um health check "unhealthy" é um resultado esperado do endpoint (é
    // literalmente para isto que ele existe), mas o motivo técnico continua
    // a ter de ficar registado no servidor — não é um erro para silenciar.
    logError("api.health.get", error);
    return NextResponse.json({ status: "unhealthy" }, { status: 503 });
  }
}
