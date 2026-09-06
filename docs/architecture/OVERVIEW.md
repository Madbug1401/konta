# Konta — Visão geral da arquitetura (Milestone 0–3)

## Estrutura de pastas

```
konta/
├── prisma/
│   ├── schema.prisma           # fonte de verdade do modelo de dados
│   └── manual-sql/             # SQL equivalente, só necessário neste sandbox (ver DECISIONS.md)
├── src/
│   ├── app/
│   │   ├── (auth)/login, register        # páginas públicas
│   │   ├── (app)/dashboard, transactions,
│   │   │         accounts, debts, goals  # páginas autenticadas (protegidas por middleware.ts)
│   │   └── api/
│   │       ├── auth/{register,login,logout,me}
│   │       ├── accounts
│   │       ├── transactions[, /[id]]
│   │       └── categories
│   ├── components/
│   │   ├── ui/                 # design system genérico (Button, Card, Input, Badge, EmptyState, Skeleton)
│   │   └── *.tsx                # componentes de domínio (AccountCard, TransactionItem, MoneyDisplay, AppShell, formulários)
│   ├── lib/
│   │   ├── financial-engine/   # lógica financeira pura, sem DB nem UI (ver abaixo)
│   │   ├── db/                 # acesso a dados (hoje via `pg`, ver DECISIONS.md)
│   │   └── auth/               # password hashing + sessão JWT
│   └── middleware.ts           # 1ª linha de defesa das rotas autenticadas
└── docs/architecture/          # este documento + DECISIONS.md + MIGRATION.md
```

## Modelo Web + API (por que não é "site com API à parte")

Web e o futuro Mobile consomem os mesmos endpoints REST em `src/app/api/**`.
Os Server Components da Web (ex: `dashboard/page.tsx`) chamam diretamente as
funções de `src/lib/db` e `src/lib/financial-engine` — não fazem um pedido
HTTP a si mesmos — por eficiência (evita uma volta de rede desnecessária
dentro do mesmo processo). As rotas de API fazem exatamente a mesma chamada.
Isto garante que **não existem duas implementações da mesma regra
financeira**: há uma única, em `src/lib/financial-engine`, chamada a partir
de dois pontos de entrada (RSC e rota HTTP). O Konta Mobile, mais tarde, usa
só o segundo ponto de entrada.

## Superfície da API

| Rota | Métodos | Autenticação | Descrição |
|---|---|---|---|
| `/api/auth/register` | POST | — | Cria utilizador, devolve cookie de sessão |
| `/api/auth/login` | POST | — | Autentica, devolve cookie de sessão |
| `/api/auth/logout` | POST | sessão | Invalida o cookie |
| `/api/auth/me` | GET | sessão | Dados do utilizador autenticado |
| `/api/accounts` | GET, POST | sessão | Lista contas (com saldo calculado) / cria conta |
| `/api/accounts/:id` | GET, PATCH, DELETE | sessão | Detalhe, edição; remoção só se a conta nunca foi usada (ver `DELETE_POLICY.md`) |
| `/api/accounts/:id/archive` | POST | sessão | Arquiva/desarquiva a conta (soft-delete) |
| `/api/accounts/:id/investment-detail` | GET, POST, PATCH | sessão | Detalhe de investimento associado à conta |
| `/api/accounts/:id/valuations` | GET, POST | sessão | Histórico de avaliações do investimento |
| `/api/transactions` | GET, POST | sessão | Lista (com filtros) / cria transação |
| `/api/transactions/:id` | GET, PATCH, DELETE | sessão | Detalhe, edição, remoção — sempre com verificação de posse |
| `/api/categories` | GET, POST | sessão | Categorias de sistema + do utilizador |
| `/api/debts` | GET, POST | sessão | Lista dívidas (com parcelas) / cria dívida com plano de parcelas |
| `/api/debts/:debtId` | GET, PATCH | sessão | Detalhe, edição |
| `/api/debts/:debtId/default` | POST | sessão | Marca a dívida como incumprida |
| `/api/debts/:debtId/installments/:installmentId/pay` | POST | sessão | Regista o pagamento de uma parcela |
| `/api/goals` | GET, POST | sessão | Lista metas / cria meta |
| `/api/goals/:id` | GET, PATCH | sessão | Detalhe, edição |
| `/api/goals/:id/status` | POST | sessão | Atualiza o estado da meta (ativa/alcançada/abandonada) |
| `/api/recurring-transactions` | GET, POST | sessão | Lista séries recorrentes / cria série |
| `/api/recurring-transactions/:id` | GET, PATCH | sessão | Detalhe, edição |
| `/api/feedback` | POST | sessão | Envia feedback do utilizador autenticado |
| `/api/health` | GET | — | Healthcheck de infraestrutura (processo + ligação à base de dados) |
| `/api/ai/chat` | POST | sessão | **Milestone 1 — Konta AI.** Mensagem de texto livre → resposta do Claude, sem tools nem contexto financeiro. Ver `src/lib/ai/gateway.ts` e `docs/konta-ai-design.html`. |

Autenticação: cookie `konta_session` (httpOnly) para a Web, ou
`Authorization: Bearer <token>` para clientes não-browser (mobile) — ver
`src/lib/auth/session.ts`.

## Financial Engine (`src/lib/financial-engine`)

Módulo puro (sem imports de `@prisma/client`, `pg` ou React) — recebe dados
já carregados e devolve resultados calculados. Testado com Vitest, incluindo
regressão explícita dos 5 bugs da auditoria (`audit-regressions.test.ts`).

| Ficheiro | Funções principais |
|---|---|
| `money.ts` | `splitIntoInstallments`, `installmentsMatchTotal`, `formatMinor`, `sum`, `abs` |
| `datetime.ts` | `getTodayInTimezone`, `getMonthBounds`/`getPreviousMonthBounds`/`getQuarterBounds`/`getYearBounds`/`getWeekBounds`, `addRecurrenceInterval` |
| `balance.ts` | `getAccountBalance`, `getNetWorth`, `getAvailableBalance` |
| `cashflow.ts` | `getIncomeTotal`, `getExpenseTotal`, `getCashflow`, `getSavingsRate`, `getCategoryBreakdown` |
| `debts.ts` | `generateInstallmentPlan`, `getDebtRemaining`, `getUpcomingInstallments`, `getOverdueInstallments` |
| `recurring.ts` | `getOccurrencesOfSeries`, `computeNextRunDate`, `advanceSeries` |
| `goals.ts` | `getGoalProgress`, `calculateGoalProjection` |
| `investments.ts` | `computeInvestmentPerformance` |

## Konta AI (`src/lib/ai`)

Especificação completa em `docs/konta-ai-design.html`. Implementado até agora:

| Ficheiro/diretório | Responsabilidade | Milestone |
|---|---|---|
| `gateway.ts` | Único módulo autorizado a falar com a API da Anthropic (`POST /api/ai/chat`). Sem tools, sem contexto financeiro, sem histórico. | 1 |
| `context/` | Context Builder — transforma dados do utilizador autenticado num DTO orientado a IA (`AiContext`), nos modos `light`/`full`/`directed`. Consome só funções de domínio já existentes (`src/lib/db`, `src/lib/financial-engine`); nunca serializa um record de base de dados em bruto. **Ainda não ligado ao AI Gateway** — módulo isolado e testado por si, sem nenhum dado a sair para a Anthropic nesta fase. `builder.ts` é o ponto de entrada (`buildAiContext`); `collect.ts` (I/O, ownership por `userId`) e `normalize.ts` (puro, DTOs) são detalhes internos. | 2 |
| `tools/` | Tool Registry + Permission/Risk Layer + Tool Executor — ver detalhe abaixo. **Ainda não ligado ao Claude/AI Gateway**: nenhuma tool é anunciada à Anthropic nesta fase, esta é só a infraestrutura, isolada e testada por si. | 3 |

### Tool Registry, Permission Layer e Executor (`src/lib/ai/tools`, Milestone 3)

Prepara o troço `Claude → Tool Registry → Permission/Risk Layer → Tool Executor → Financial Engine/Backend → DB` da arquitetura-alvo (`docs/konta-ai-design.html`, secções D/E/F) — sem ainda ligar o Claude a nada disto.

**Tool contract** (`types.ts`) — cada tool em `tools/tools/*.ts` é um objeto `AiTool<TParams, TResult>`:

| Campo | Papel |
|---|---|
| `name`/`description` | identidade da tool, o texto que um futuro tool-use do Claude veria |
| `paramsSchema` | Zod — sempre que existe um schema equivalente numa rota HTTP (`create_transaction`/`update_transaction`), é literalmente o mesmo, reexportado da rota, nunca redefinido |
| `riskTier` | metadado estático da própria tool — nunca lido de `params`, nunca escolhido pelo modelo |
| `summarize(params)` | síncrono, só com `params` já validados — a frase de confirmação |
| `execute(userId, params)` | chama diretamente a função de domínio existente (`src/lib/db`, ou `buildDebtSummaries`/`buildGoalSummaries` do Context Builder); nunca SQL novo, nunca recalcula o que o Financial Engine já calcula |

`getTool(name)`/`listTools()` (`registry.ts`) são a única fonte de verdade das tools disponíveis — falha no arranque se dois nomes colidirem.

**Risk Tiers** (`RISK_TIERS`, `types.ts`) — `LOW`/`MEDIUM`/`HIGH`/`CRITICAL`, união de literais (mesmo padrão de `AccountType`/`ContextDomain`), nunca strings soltas. Política V1 (`permissions.ts`, `evaluatePermission`), exatamente como a secção F do design:

| Tier | Decisão da Permission Layer |
|---|---|
| `LOW` | `allowed: true, requiresConfirmation: false` — executa sempre |
| `MEDIUM` | `allowed: true, requiresConfirmation: true` — "tratado como HIGH nesta fase" (nenhuma das 7 tools da V1 é MEDIUM; o caso existe na arquitetura para quando isso mudar) |
| `HIGH` | `allowed: true, requiresConfirmation: true` — toda escrita financeira; sem exceção, sem "force execute" |
| `CRITICAL` | `allowed: false` — recusado antes de sequer propor; nenhuma tool da V1 é CRITICAL |

**Tool Executor** (`executor.ts`, `executeTool(toolName, userId, rawParams, { confirmed })`) — fluxo: procura a tool no Registry → valida `rawParams` com `paramsSchema` → pede a decisão à Permission Layer (com `tool.summarize(params)` já calculado) → se `requiresConfirmation` e `!confirmed`, devolve `confirmation_required` sem executar → só executa quando permitido e (LOW, ou HIGH/MEDIUM com `confirmed: true`) → passa sempre `userId` como argumento explícito a `execute` (nunca lido de `params`, que nenhuma tool desta V1 sequer aceita). Resultado sempre tipado (`ToolExecutionResult`: `not_found`/`invalid_params`/`rejected`/`confirmation_required`/`executed`/`execution_failed`) — nunca uma exceção para os casos esperados.

**7 tools da V1**: `get_accounts`, `get_transactions`, `get_debts`, `get_goals` (LOW); `create_transaction`, `update_transaction`, `delete_transaction` (HIGH). `delete_transaction` reutiliza exatamente `deleteTransaction()` (eliminação física, ownership-scoped) — Transaction não tem arquivamento, ao contrário de Account, e esta tool não inventa um.

**Ainda não construído nesta fase** (documentado, não escondido): ligação ao AI Gateway/Claude, UI de confirmação, `AiActionLog` persistente, tool `get_categories` (torna `categoryId`/`goalId` em `create_transaction` inutilizáveis pelo modelo até existir uma forma de descobrir ids válidos), token de confirmação anti-adulteração entre a proposta e a confirmação.

## Design System (`src/components/ui` + componentes de domínio)

Implementados nesta fase: `Button`, `Card`, `Input`, `Badge`, `EmptyState`,
`Skeleton`; `MoneyDisplay`, `AccountCard`, `TransactionItem`, `AppShell`,
`ThemeToggle`, `TransactionForm`, `AccountForm`. Pendentes para o próximo
milestone (só quando as páginas de Dívidas/Metas forem construídas):
`DebtCard`, `GoalCard`, `Dialog`, `Tabs`, `Dropdown`, `Tooltip`, `Toast`,
`Table` genérica, `ChartContainer`.

## Estratégia responsive

Não existe "versão mobile" separada — cada página usa classes Tailwind
responsivas (`sm:`, `md:`, `lg:`) no mesmo JSX. O único ponto onde o layout
muda estruturalmente por breakpoint é a navegação (`AppShell`): sidebar fixa
em `md:` e acima, barra inferior + botão flutuante de "Nova transação" abaixo
de `md:`, ambas geradas a partir da mesma lista `NAV_ITEMS`. Todos os
controlos interativos (botões, inputs, selects) têm `min-height: 2.75rem`
(~44px) globalmente definido em `globals.css`, para touch targets
adequados. As tabelas (ex: lista de transações) usam `overflow-x-auto`
num contentor para nunca partir o layout em ecrãs estreitos.

## O que fica para o próximo milestone

- Geração automática de ocorrências de `RecurringTransaction` (o cálculo de
  `computeNextRunDate`/`advanceSeries` já existe; falta o job/rota que os
  materializa em `Transaction`).
- Script de migração do protótipo executável (o mapeamento está em
  `MIGRATION.md`; falta o script propriamente dito).
- Troca de `src/lib/db/*.ts` para Prisma Client assim que `prisma generate`
  puder correr num ambiente com acesso normal à rede.
