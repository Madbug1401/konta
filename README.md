# Konta

Gestor financeiro pessoal — regista, entende, prevê e orienta o teu dinheiro.
Ver `docs/architecture/OVERVIEW.md` para a arquitetura completa e
`docs/architecture/DECISIONS.md` para o porquê de cada decisão importante.

## Stack

Next.js 16 (App Router) + React 19 + TypeScript estrito + Tailwind CSS v4,
PostgreSQL com Prisma como ORM-alvo (ver nota abaixo), autenticação por JWT
próprio (`jose`), Vitest para testes.

## Estrutura principal

```
src/app/                    rotas (App Router) — páginas e API Route Handlers
src/lib/financial-engine/   motor de cálculo puro (sem framework, sem SQL)
src/lib/db/                 acesso a dados (pg direto, ver nota sobre o Prisma)
src/lib/auth/               password, JWT e sessão
prisma/schema.prisma        modelo de dados (fonte de verdade)
prisma/manual-sql/          o mesmo schema em SQL puro, pronto a aplicar
scripts/backup/             backup e restauro (Postgres próprio e Neon)
docs/architecture/          decisões, deployment, política de remoção, backup
docs/operations/            guias passo a passo de deploy (Oracle, Render+Neon)
```

## Correr localmente

1. Tens de ter um PostgreSQL a correr — usa `docker compose up -d` (sobe um
   Postgres local em `docker-compose.yml`) ou uma instância já tua. Copia
   `.env.example` para `.env`, ajustando `DATABASE_URL` e `AUTH_SECRET`
   (gera um segredo com `openssl rand -base64 48`).
2. `npm install`
3. Aplica o schema à base de dados:
   - **Ambiente normal (a tua máquina, CI):** `npx prisma generate && npx prisma migrate dev --name init`, depois adapta `src/lib/db/*.ts` para usar o Prisma Client (ver nota abaixo).
   - **Se quiseres reproduzir exatamente como este projeto foi validado:** aplica manualmente, por ordem, `psql -f prisma/manual-sql/0001_init.sql`, `psql -f prisma/manual-sql/0002_seed_categories.sql` e `psql -f prisma/manual-sql/0003_add_last_login.sql` à tua base de dados — a app já está preparada para correr assim.
4. `npm run dev` e abre `http://localhost:3000`.

Guia completo e já validado do zero no Windows: `WINDOWS_SETUP.md`.

### Nota sobre o Prisma

Este projeto foi desenvolvido num ambiente sandbox cujo acesso de rede
bloqueava o download dos binários do CLI da Prisma. Para não bloquear a
entrega, a camada `src/lib/db/*.ts` usa `pg` diretamente com as mesmas
assinaturas que o Prisma Client teria — `prisma/schema.prisma` continua a
ser a fonte de verdade do modelo. Detalhes completos e o caminho para
adotar o Prisma Client por completo estão em
`docs/architecture/DECISIONS.md`, secção "Prisma neste ambiente".

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção (inclui verificação de tipos) |
| `npm run start` | Serve o build de produção |
| `npm run test` | Corre a suite Vitest (Financial Engine) |
| `npm run lint` | ESLint |

## Testes

`npm run test` (equivalente a `npx vitest run`) corre toda a suite —
Financial Engine, rotas de API, autenticação, rate limiting e paginação —
incluindo `src/lib/financial-engine/audit-regressions.test.ts`, regressão
explícita dos 5 bugs encontrados na auditoria do protótipo original
(`Auditoria_Gestor_Financeiro.docx`). Antes de um commit/deploy, correm
também `npx tsc --noEmit` e `npx eslint .`.

## Build e produção

`npm run build` gera o build de produção (inclui verificação de tipos);
`npm run start` serve esse build. Para produção usa-se antes a imagem Docker
(`Dockerfile`, multi-stage, output `standalone`) — nunca `npm run start`
diretamente num servidor exposto.

## Deploy

Este repositório inclui dois caminhos de deploy documentados, sem alterar a
arquitetura da app entre eles:

- **Zero-cost (Beta atual)** — Render (Web Service, Docker) + Neon
  (PostgreSQL gerido), sem cartão de crédito, $0/mês. Ver
  `docs/ZERO_COST_DEPLOYMENT_AUDIT.md` (análise completa) e
  `docs/operations/RENDER-NEON.md` (passo a passo).
- **Self-host (futuro)** — Oracle Cloud Always Free (VM Ampere A1 ARM64),
  Docker Compose com Postgres e Caddy próprios. Ver
  `docs/operations/ORACLE-CLOUD.md` e `docs/operations/PRODUCTION-RUNBOOK.md`.

Detalhes gerais de containerização, variáveis de ambiente de produção e
HTTPS: `docs/architecture/DEPLOYMENT.md`. Política de backups:
`docs/architecture/BACKUP.md`. Política de remoção de dados:
`docs/architecture/DELETE_POLICY.md`.

## Estado deste milestone

Implementado: autenticação (registo/login/logout, isolamento
multi-utilizador), contas com saldo calculado, transações (criar, listar com
filtros e pesquisa, editar, remover), categorias, dashboard com indicadores
reais, tema claro/escuro, navegação responsiva (sidebar desktop / barra
inferior mobile).

Ainda não implementado (por desenho, não por esquecimento — ver
`docs/architecture/OVERVIEW.md`, "O que fica para o próximo milestone"):
interface de Dívidas e Metas, geração automática de transações recorrentes,
script de migração do protótipo pronto a correr, adoção final do Prisma
Client.
