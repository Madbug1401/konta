// ============================================================================
// Acesso à base de dados.
//
// [NOTA DE AMBIENTE] O plano original era usar exclusivamente o Prisma Client
// gerado a partir de prisma/schema.prisma. Neste sandbox de desenvolvimento
// isso não foi possível porque o CLI da Prisma não consegue descarregar os
// binários do schema-engine (ver nota no topo do schema.prisma). Para que o
// projeto corra, tenha testes reais e um build verificável já hoje, esta
// camada usa `pg` (node-postgres) diretamente, com um pequeno mapeamento
// tipado por entidade (ver src/lib/db/*.ts) que espelha 1:1 os modelos do
// schema.prisma.
//
// Isto NÃO é a arquitetura final pretendida — é uma camada de compatibilidade
// para este ambiente. Assim que `npx prisma generate` puder correr (fora deste
// sandbox), a forma recomendada é substituir o conteúdo de cada função em
// src/lib/db/*.ts para usar `prisma.<model>.findMany(...)` em vez de SQL cru,
// mantendo exatamente as mesmas assinaturas — o resto da aplicação (rotas de
// API, Server Components, Financial Engine) não muda nada, porque só depende
// destas assinaturas, nunca do Prisma Client diretamente.
// ============================================================================

import { Pool } from "pg";

declare global {
  var __kontaPgPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!global.__kontaPgPool) {
    global.__kontaPgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
    });
  }
  return global.__kontaPgPool;
}

/** Converte uma coluna BIGINT do Postgres (chega como string) para bigint do JS. */
export function toBigInt(value: string | number | bigint | null): bigint {
  if (value === null) return 0n;
  return BigInt(value);
}

export function toISODateString(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}
