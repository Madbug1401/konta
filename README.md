# Konta

Gestor financeiro pessoal — regista, entende, prevê e orienta o teu dinheiro.
Ver `docs/architecture/OVERVIEW.md` para a arquitetura completa e
`docs/architecture/DECISIONS.md` para o porquê de cada decisão importante.

## Stack

Next.js 16 (App Router) + React 19 + TypeScript estrito + Tailwind CSS v4,
PostgreSQL com Prisma como ORM-alvo (ver nota abaixo), autenticação por JWT
próprio (`jose`), Vitest para testes.

## Correr localmente

1. Tens de ter um PostgreSQL a correr. Cria a base de dados e copia
   `.env.example` para `.env`, ajustando `DATABASE_URL` e `AUTH_SECRET`
   (gera um segredo com `openssl rand -base64 48`).
2. `npm install`
3. Aplica o schema à base de dados:
   - **Ambiente normal (a tua máquina, CI):** `npx prisma generate && npx prisma migrate dev --name init`, depois adapta `src/lib/db/*.ts` para usar o Prisma Client (ver nota abaixo).
   - **Se quiseres reproduzir exatamente como este projeto foi validado:** aplica manualmente `psql -f prisma/manual-sql/0001_init.sql` e `psql -f prisma/manual-sql/0002_seed_categories.sql` à tua base de dados — a app já está preparada para correr assim.
4. `npm run dev` e abre `http://localhost:3000`.

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

`npm run test` corre a suite do Financial Engine, incluindo
`src/lib/financial-engine/audit-regressions.test.ts` — regressão explícita
dos 5 bugs encontrados na auditoria do protótipo original
(`Auditoria_Gestor_Financeiro.docx`).

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
