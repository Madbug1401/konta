# Konta — Estado atual do projeto (25/08/2026)

Este documento é um retrato honesto do que existe hoje no repositório, com
referências a ficheiros reais — não uma descrição de intenções. A app está
a correr localmente no teu PC (`http://localhost:3000`), com base de dados
Postgres real (Docker), 21 testes automáticos a passar, e já foi usada por
ti para criar contas e transações a sério — incluindo um bug que encontraste
em uso real e que já foi corrigido (ver secção 6).

## 1. O que é o Konta hoje

Um gestor financeiro pessoal (Next.js 16 + React 19 + TypeScript + Tailwind
v4, API própria em Node, PostgreSQL) que evoluiu o protótipo `index.html`
(um único ficheiro, tudo em `localStorage`, um campo `type` genérico) para
uma aplicação multi-utilizador, com base de dados real, autenticação própria,
e um motor de cálculo financeiro isolado da interface — arquitetado para que
uma app mobile (React Native/Expo) possa consumir exatamente a mesma lógica
mais tarde, sem reescrever nada.

## 2. Modelo de dados (`prisma/schema.prisma`, 398 linhas)

Nove entidades, cada uma com responsabilidade própria — ao contrário do
protótipo, que misturava tudo num único registo genérico:

- **User** — inclui `timezone` e `defaultCurrency` por utilizador (nunca
  assumido globalmente).
- **Account** — carteira, banco, poupança, cartão de crédito, investimento,
  fundo de emergência. Tem o seu próprio `initialBalanceMinor`; o saldo
  "atual" nunca é guardado diretamente, é sempre calculado.
- **Category** — categorias de receita/despesa, independentes por tipo.
- **Transaction** — `type` (INCOME/EXPENSE/TRANSFER) + `status`
  (COMPLETED/PENDING/CANCELED). Uma transferência tem `destinationAccountId`
  próprio — nunca é tratada como despesa.
- **RecurringTransaction** — identidade própria (id), nunca identificada por
  título+valor como no protótipo.
- **Debt** + **DebtInstallment** — dívida como entidade completa (credor,
  juros, histórico de parcelas), separada de Goal.
- **Goal** — múltiplas metas simultâneas, cada uma com o seu alvo e,
  opcionalmente, uma conta dedicada.
- **InvestmentDetail** + **InvestmentValuation** — capital investido e valor
  atual são sempre dois números guardados separadamente (nunca um a fingir
  de outro).

Todas as quantias em dinheiro são `BigInt` em unidade mínima (cêntimos),
nunca `float`.

Este schema está espelhado 1:1 em SQL puro em `prisma/manual-sql/0001_init.sql`
(ver secção 8 sobre porquê).

## 3. Financial Engine (`src/lib/financial-engine/`, módulo puro)

Isolado de qualquer framework — não importa React, Next.js nem SQL — para
poder ser reutilizado por Web, futuro Mobile, relatórios e (mais tarde) IA.

| Ficheiro | Responsabilidade |
|---|---|
| `types.ts` | Tipos de domínio (`AccountRecord`, `TransactionRecord`, etc.) |
| `money.ts` | Aritmética em `BigInt`; `splitIntoInstallments` (divide um valor em parcelas sem perder nem duplicar cêntimos) |
| `datetime.ts` | "Hoje" e limites de período sempre calculados no fuso horário do utilizador (nunca `new Date().toISOString()` nu) |
| `balance.ts` | `getAccountBalance`/`getNetWorth`/`getAvailableBalance` — saldo = inicial + Σ movimentos, sempre calculado, nunca guardado |
| `cashflow.ts` | Receitas/despesas/poupança por período |
| `debts.ts` | Cálculo de parcelas e progresso de dívida (lógica pronta; sem UI ainda) |
| `recurring.ts` | Próxima data de ocorrência de uma série recorrente (lógica pronta; sem materialização automática ainda) |
| `goals.ts` | Progresso de metas e projeção de data de conclusão |
| `investments.ts` | Separa capital aportado de valor atual/retorno |

## 4. Autenticação e API

- `src/lib/auth/{password,jwt,session}.ts` — bcrypt (12 rounds) + JWT próprio
  (`jose`), pensado para Web (cookie httpOnly) e Mobile (Bearer token) usarem
  a mesma verificação.
- `src/app/proxy.ts` — bloqueia acesso a rotas protegidas sem sessão.
- Rotas reais e validadas com Zod: `POST /api/auth/{register,login,logout}`,
  `GET /api/auth/me`, `GET/POST /api/accounts`, `GET/POST /api/transactions`,
  `GET/PATCH/DELETE /api/transactions/[id]`, `GET /api/categories`.
- Isolamento por utilizador confirmado com teste real: um segundo utilizador
  registado recebe uma lista vazia de contas, mesmo havendo dados de outro.

## 5. Páginas (estado real, não aspiracional)

**Funcionais, com dados reais, sem números inventados:**

- `/login`, `/register`
- `/dashboard` — saldo disponível, património, receitas/despesas do mês,
  fluxo de caixa, cartões de conta, últimas transações
- `/accounts` — lista de contas com saldo calculado + criação de conta
- `/transactions` — histórico completo com pesquisa, filtros (conta,
  categoria, tipo, período), edição e remoção
- `/transactions/new`, `/transactions/[id]/edit`

**Deliberadamente por construir** (schema e Financial Engine já prontos,
interface não — ver `src/app/(app)/debts/page.tsx` e `.../goals/page.tsx`,
que mostram um "Em construção" explícito em vez de fingir dados):

- `/debts`
- `/goals`

## 6. Bugs — os 5 da auditoria original + 1 encontrado em uso real

Os 5 bugs da auditoria ao `index.html` têm teste de regressão dedicado em
`src/lib/financial-engine/audit-regressions.test.ts`:

1. Fundo de emergência a mostrar valor absoluto em vez de líquido — corrigido
   por construção (saldo é sempre inicial + soma de movimentos).
2. Parcelas validadas por igualdade de floats — corrigido com
   `splitIntoInstallments` em aritmética inteira.
3. "Hoje" calculado em UTC (mudava de dia horas antes/depois da meia-noite
   real em Cabo Verde) — corrigido com Luxon + timezone explícito.
4. Crescimento de investimento confundido com rentabilidade real — corrigido
   separando capital aportado de valor atual.
5. Série recorrente identificada por título/valor — corrigido com id próprio.

**Bug novo, encontrado por ti a testar a app a sério (25/08/2026):** uma
transação datada no futuro ("Salário Estágio IEFP", Setembro) aparecia já
somada ao saldo de hoje. Causa e correção documentadas em
`docs/architecture/DECISIONS.md`, secção "Saldo não pode incluir o futuro".
Teste de regressão novo em `balance.test.ts`. Este é exatamente o tipo de
problema que só aparece com uso real — a suite de testes cresceu de 20 para
21 por causa dele.

## 7. Testes — 21/21 a passar

```
npm test
```

`money.test.ts` (7), `balance.test.ts` (7), `audit-regressions.test.ts` (7).
Corridos e confirmados na tua própria máquina, não só no ambiente de
desenvolvimento.

## 8. Onde a arquitetura ainda não é a "final"

- **Prisma Client não gerado neste ambiente de desenvolvimento** — a rede do
  sandbox onde construí o projeto bloqueia `binaries.prisma.sh`. Contornei
  com SQL manual (`prisma/manual-sql/`) + `pg` diretamente em
  `src/lib/db/*.ts`, com assinaturas idênticas às que o Prisma Client teria.
  Na tua máquina isto pode não ser necessário — `npx prisma generate && npx
  prisma db push` deve funcionar sem bloqueios (ver `WINDOWS_SETUP.md`).
- **Sem camada db/API para Debts, Goals, Recurring, Investments** — só a
  lógica de cálculo (Financial Engine) existe; falta persistência e rotas.
- **Sem materialização automática de transações recorrentes** — a função que
  calcula "quando é a próxima ocorrência" existe (`recurring.ts`), mas nada
  a transforma ainda numa `Transaction` real na base de dados.
- **Migração do protótipo** — só o mapeamento/desenho existe
  (`docs/architecture/MIGRATION.md`); o script executável de migração dos
  dados de `localStorage` ainda não foi escrito.
- **IA (Konta AI)** — deliberadamente fora de âmbito nesta fase, mas o
  desenho já isola o Financial Engine em funções puras reutilizáveis por um
  futuro agente controlado.

## 9. Como correr

Ver `WINDOWS_SETUP.md` na raiz do projeto — já confirmado a funcionar do
zero na tua máquina: Docker Desktop para o Postgres, `npm install`, duas
migrações SQL, `npm test`, `npm run dev`.

## 10. Próximo passo recomendado

Interface de **Dívidas** e **Metas** — é o trabalho que falta para as duas
páginas deixarem de dizer "Em construção", e o schema/Financial Engine já
estão prontos para isso. Alternativa: escrever o script de migração real do
`localStorage` do protótipo, se preferires garantir primeiro que nenhum
dado antigo se perde.
