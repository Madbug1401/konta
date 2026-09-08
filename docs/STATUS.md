# Konta — Estado atual do projeto (atualizado 07/09/2026)

Este documento é um retrato honesto do que existe hoje no repositório, com
referências a ficheiros reais — não uma descrição de intenções. Escrito
originalmente em 25/08/2026; as secções 5, 7 e 10 foram atualizadas em
06/09/2026 (Dívidas, Metas, arquivamento/remoção de conta, painel de
Estatísticas, feedback in-app, agrupamento por moeda no Dashboard); as
secções 1, 4, 5, 7, 8 e 10 foram atualizadas de novo em 07/09/2026 para
refletir o Milestone 1–4 do Konta AI (Gateway, Context Builder, Tool
Registry/Permission Layer, orquestrador de chat e a página `/assistant`) —
ver `git log` para o histórico exato.

## 1. O que é o Konta hoje

Um gestor financeiro pessoal (Next.js 16 + React 19 + TypeScript + Tailwind
v4, API própria em Node, PostgreSQL) que evoluiu o protótipo `index.html`
(um único ficheiro, tudo em `localStorage`, um campo `type` genérico) para
uma aplicação multi-utilizador, com base de dados real, autenticação própria,
um motor de cálculo financeiro isolado da interface — arquitetado para que
uma app mobile (React Native/Expo) possa consumir exatamente a mesma lógica
mais tarde, sem reescrever nada — e, desde o Milestone 4, um assistente de
IA (Claude, via `@anthropic-ai/sdk`) capaz de responder sobre os dados
financeiros do utilizador e propor ações (criar/editar/apagar transação),
sempre com confirmação explícita para qualquer escrita. Ver
`docs/architecture/OVERVIEW.md`, secções "Konta AI" e "Konta AI Chat", para
o desenho completo.

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
  `GET/PATCH/DELETE /api/transactions/[id]`, `GET /api/categories`, e as
  rotas de Dívidas, Metas, Recorrências e Feedback listadas na tabela de
  `docs/architecture/OVERVIEW.md`.
- Isolamento por utilizador confirmado com teste real: um segundo utilizador
  registado recebe uma lista vazia de contas, mesmo havendo dados de outro.
- `POST /api/ai/chat` — três ações (`message`/`confirm`/`cancel`), sessão
  obrigatória, `userId` nunca do corpo; ver secção "Konta AI" abaixo.

## 5. Páginas (estado real, não aspiracional)

**Funcionais, com dados reais, sem números inventados:**

- `/login`, `/register`
- `/dashboard` — saldo disponível, património, receitas/despesas do mês,
  fluxo de caixa, cartões de conta, últimas transações, agrupado por moeda
- `/accounts` — lista de contas com saldo calculado, criação (com escolha de
  moeda), edição, arquivamento e remoção (só quando a conta nunca foi usada
  — ver `docs/architecture/DELETE_POLICY.md`); detalhe de investimento e
  histórico de avaliações para contas do tipo INVESTMENT
- `/transactions` — histórico completo com pesquisa, filtros (conta,
  categoria, tipo, período), edição e remoção
- `/transactions/new`, `/transactions/[id]/edit`
- `/debts` — criação de dívida com plano de parcelas, pagamento de parcela,
  marcação de incumprimento
- `/goals` — criação de meta (ligada opcionalmente a uma conta dedicada),
  edição, progresso e projeção de data de conclusão
- `/recurring` — séries recorrentes (criação, edição)
- `/admin` — estatísticas da plataforma, só visível para emails em
  `ADMIN_EMAILS`
- Feedback in-app (formulário ligado a `POST /api/feedback`, visível para o
  dono em `/admin`)
- `/assistant` — Konta AI: chat com Claude sobre os dados financeiros do
  utilizador, com pedido de confirmação explícita (botões Confirmar/Cancelar)
  antes de qualquer escrita (criar/editar/apagar transação)

**Ainda por construir** — nenhuma UI dedicada, mesmo com dados/motor prontos
onde aplicável:

- Materialização automática de `RecurringTransaction` em `Transaction` real
  (o cálculo de próxima ocorrência já existe em `financial-engine/recurring.ts`,
  falta o job/rota que a executa)
- Onboarding
- No Konta AI: memória persistente entre sessões, tool `get_categories`,
  streaming de resposta, voz, notificações proativas — ver secção "Konta AI"
  abaixo e `docs/architecture/OVERVIEW.md` para o detalhe de cada um

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

## 7. Testes

```
npm test
```

A suite (Vitest) cresceu desde a versão original deste documento — cobre
hoje, além do Financial Engine (`money`, `balance`, `cashflow`,
`audit-regressions`), também `accounts`, `debts`, `goals`,
`recurring-transactions`, `users`, `admin`, `feedback`, `client` (tratamento
de erro da pool do Postgres), `pagination`, `rate-limit`, `api-error`, rotas
de API (`transactions`, `transactions/[id]`, `health`, `ai/chat`), e todo o
Konta AI (`gateway`, `context/builder`, `context/normalize`,
`chat/orchestrator`, `chat/context-presentation`, `tools/registry`,
`tools/permissions`, `tools/executor`, `tools/confirmation-store`,
`tools/anthropic-adapter`, as 7 tools individuais) — 38 ficheiros `*.test.ts`
no total, 261 testes. Confirmado a passar de facto em 07/09/2026 (`npx
vitest run`), junto com `npx tsc --noEmit`, `npx eslint .` e `npm run
build`, os quatro sem erros — mas corre `npm test` para o número atual em
vez de confiar num valor escrito neste documento, que fica desatualizado a
cada novo teste.

## 8. Onde a arquitetura ainda não é a "final"

- **Prisma Client não gerado neste ambiente de desenvolvimento** — a rede do
  sandbox onde construí o projeto bloqueia `binaries.prisma.sh`. Contornei
  com SQL manual (`prisma/manual-sql/`) + `pg` diretamente em
  `src/lib/db/*.ts`, com assinaturas idênticas às que o Prisma Client teria.
  Na tua máquina isto pode não ser necessário — `npx prisma generate && npx
  prisma db push` deve funcionar sem bloqueios (ver `WINDOWS_SETUP.md`).
- **Sem materialização automática de transações recorrentes** — a função que
  calcula "quando é a próxima ocorrência" existe (`recurring.ts`), mas nada
  a transforma ainda numa `Transaction` real na base de dados.
- **Migração do protótipo** — só o mapeamento/desenho existe
  (`docs/architecture/MIGRATION.md`); o script executável de migração dos
  dados de `localStorage` ainda não foi escrito.
- **IA (Konta AI)** — Milestones 1–4 implementados: AI Gateway
  (`src/lib/ai/gateway.ts`), Context Builder (`src/lib/ai/context/`), Tool
  Registry + Permission/Risk Layer + Executor + Confirmation Store
  (`src/lib/ai/tools/`), e o orquestrador de chat + página `/assistant`
  (`src/lib/ai/chat/`) — ver `docs/architecture/OVERVIEW.md`, secções "Konta
  AI" e "Konta AI Chat", para o detalhe completo de cada peça e o que cada
  uma ainda não faz (memória persistente, `get_categories`, streaming, mais
  de uma ação a exigir confirmação no mesmo turno). `AiActionLog`
  persistente (registo de auditoria de ações da IA) ainda não existe.
  Requer `ANTHROPIC_API_KEY` (ver `.env.example`); `render.yaml` já declara
  a variável para o deploy de produção.

## 9. Como correr

Ver `WINDOWS_SETUP.md` na raiz do projeto — já confirmado a funcionar do
zero na tua máquina: Docker Desktop para o Postgres, `npm install`, as
migrações SQL em `prisma/manual-sql/` (por ordem numérica), `npm test`,
`npm run dev`.

## 10. Próximo passo recomendado

Konta AI já tem uma primeira experiência real (Milestone 4, chat + tools com
confirmação) — deixou de ser o próximo passo em aberto. `docs/KONTA_BETA_GATE.md`
(29/08/2026) classifica o projeto como **NOT BETA READY**, mas apenas por uma
checklist de infraestrutura de produção (HTTPS/TLS real, `docker build`
confirmado num ambiente com Docker Hub, cron de backup agendado, segredos de
produção novos, ciclo backup→restauro real) — não por dívida de código.
Frentes em aberto, sem uma depender da outra:

1. **Fechar o Beta Gate de infraestrutura** — os 5 pontos de
   `docs/KONTA_BETA_GATE.md`, secção "Ainda bloqueia Beta", executáveis num
   VPS real seguindo `docs/architecture/DEPLOYMENT.md` e
   `docs/architecture/BACKUP.md`.
2. **Evoluir o Konta AI** — `AiActionLog` persistente, tool `get_categories`,
   memória entre sessões, ou encadear mais de uma ação por turno.
3. **Migração do protótipo** — o mapeamento está em
   `docs/architecture/MIGRATION.md`; o script executável ainda não foi
   escrito.
4. **Adoção final do Prisma Client** — `src/lib/db/*.ts` continua sobre `pg`
   direto (ver secção 8); só necessário quando `prisma generate` puder
   correr sem bloqueio de rede.
