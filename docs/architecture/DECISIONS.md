# Konta — Decisões de arquitetura (ADR resumido)

Este documento existe por causa da regra 29 do briefing do produto: nenhuma
decisão que afete o modelo de dados, segurança, UX, API, Financial Engine,
compatibilidade mobile ou estratégia de migração deve ser tomada em silêncio.
Cada decisão abaixo referencia o(s) ficheiro(s) onde está implementada e o
`[DECISÃO N]` correspondente nos comentários do código.

## 1–2. Multi-utilizador desde a fundação + timezone como dado de primeira classe

Todas as tabelas relevantes (`Account`, `Transaction`, `Debt`, `Goal`,
`RecurringTransaction`, `Category`) têm `userId` obrigatório. Toda a função em
`src/lib/db/*.ts` recebe `userId` explicitamente e filtra sempre por ele —
nunca por um id vindo do cliente sem cruzar com o utilizador autenticado. O
`User.timezone` (default `Atlantic/Cape_Verde`) é usado por todo o Financial
Engine para "hoje" e limites de período — nunca `new Date().toISOString()`.

Ficheiros: `prisma/schema.prisma` (User, comentário [DECISÃO 1]/[DECISÃO 2]),
`src/lib/financial-engine/datetime.ts`, `src/lib/db/accounts.ts`,
`src/lib/db/transactions.ts`.

## 3. Contas como razão (ledger), não como saldo gravado

Uma `Account` nunca guarda o seu saldo atual num campo. O saldo é sempre
`initialBalanceMinor + Σ(entradas) − Σ(saídas)`, calculado por
`getAccountBalance()`. Isto elimina por construção o bug da auditoria em que
o Cofre de Emergência somava valores absolutos: já não existe "valor com
sinal ambíguo", existe sempre uma direção (`accountId` = saída,
`destinationAccountId` = entrada) determinada pelo `type` da transação.

Ficheiro: `src/lib/financial-engine/balance.ts`. Prova de regressão:
`src/lib/financial-engine/audit-regressions.test.ts` ("Bug 1").

## 4/20. Dinheiro como inteiro em unidade mínima, nunca float

Todos os campos monetários são `BigInt` em Postgres/Prisma (`amountMinor`,
`initialBalanceMinor`, `targetAmountMinor`, etc.) e `bigint` em TypeScript.
CVE não tem subunidade de uso corrente, por isso `minorUnitFactor = 1`; para
suportar EUR/USD no futuro bastaria uma tabela `minorUnitFactor` por moeda em
`src/components/money-display.tsx` e `src/lib/financial-engine/money.ts` — a
escolha de já guardar tudo como inteiro é o que torna essa mudança futura
segura e sem migração de dados.

## 5. Modelo de dados separado (Accounts / Transactions / Categories / Debts / Goals / Recurring / Investments)

Ver `prisma/schema.prisma` — schema completo com comentários `[DECISÃO N]`
por entidade. Resumo das relações:

- `User` 1—N `Account`, `Category`, `Transaction`, `Debt`, `Goal`, `RecurringTransaction`.
- `Transaction` N—1 `Account` (origem, sempre) e opcionalmente N—1 `Account`
  (destino, só quando `type = TRANSFER`).
- `Transaction` opcionalmente liga-se a `Debt`/`DebtInstallment`/`Goal`/`RecurringTransaction`.
- `Debt` 1—N `DebtInstallment` (plano de parcelas com identidade própria).
- `Goal` opcionalmente N—1 `Account` (a conta dedicada cujo saldo é o progresso da meta).
- `Account` (tipo INVESTMENT) 1—1 `InvestmentDetail` 1—N `InvestmentValuation`.

## 6. Transferências nunca são despesas

`TransactionType` inclui `TRANSFER` como um caso de primeira classe, com
`destinationAccountId`. A rota `POST /api/transactions`
(`src/app/api/transactions/route.ts`) valida com Zod que só `TRANSFER` pode
ter `destinationAccountId` e que `TRANSFER` sempre o exige — impossível
"esconder" uma transferência como despesa.

## 7. Categorias independentes da natureza da transação

`Category.kind` é só `INCOME`/`EXPENSE`, sem qualquer acoplamento a tipo de
conta. `TRANSFER` nunca leva categoria (`categoryId = null`, reforçado na
validação da rota). Categorias de sistema (`userId = null`) são seed de
arranque (`prisma/manual-sql/0002_seed_categories.sql`); o utilizador pode
criar as suas via `POST /api/categories`.

## 8/9. Dívidas como entidade própria + plano de parcelas exato

`Debt` guarda `originalAmountMinor`, `interestRate` (`Decimal`, nunca float),
`status`. `DebtInstallment` é o plano de pagamento (sequência, vencimento,
valor, estado), gerado por `generateInstallmentPlan()` /
`splitIntoInstallments()` em `src/lib/financial-engine/`. A divisão é feita
por aritmética inteira exata (divisão inteira + resto distribuído pelas
últimas parcelas) — a soma bate certo **por construção**, nunca por uma
comparação `installment * count === total` em float. Este é o bug mais citado
na auditoria; ver "Bug 2" em `audit-regressions.test.ts`.

A interface de gestão de dívidas (criar dívida, ver plano, marcar parcela
como paga) fica para o próximo milestone — o modelo de dados e o motor de
cálculo já estão prontos e testados; só falta a UI.

## 10. Múltiplas metas em paralelo

`Goal` é uma entidade independente com `targetAmountMinor` e
`linkedAccountId` próprios — nada partilhado globalmente. v1 assume uma conta
dedicada por meta (o progresso = saldo dessa conta); o padrão alternativo
("contribuições marcadas por `goalId` sem conta dedicada", para quem não
quiser criar uma conta por meta) fica documentado aqui como fast-follow, para
não overengineer a v1. A interface de metas também fica para o próximo
milestone, pela mesma razão que dívidas.

## 11/17. Investimentos: capital aportado ≠ valor atual ≠ rentabilidade

Um investimento é uma `Account(type=INVESTMENT)` + `InvestmentDetail` (tipo,
retorno esperado, vencimento) + `InvestmentValuation` (histórico de
avaliações manuais). `computeInvestmentPerformance()`
(`src/lib/financial-engine/investments.ts`) devolve sempre os dois números
separados: `capitalContributedMinor` (soma das transferências de entrada,
nunca inclui juro) e `currentValueMinor` (última avaliação registada). Sem
avaliação, `hasValuation: false` e `returnPercent: null` — a UI mostra "sem
avaliação registada" em vez de inventar uma rentabilidade, corrigindo
diretamente o bug da auditoria. Ver "Bug 4" em `audit-regressions.test.ts`.

## 12. Página de transações completa (não só "próximos eventos")

`src/app/(app)/transactions/page.tsx` lista com paginação, pesquisa
(`ILIKE` na descrição), filtro por conta/categoria/tipo/período, e ações de
editar/remover por linha (`src/components/transaction-row-actions.tsx`),
com as rotas `GET/PATCH/DELETE /api/transactions/[id]`.

## 13/14. Design system + responsive desde o dia 1

`src/components/ui/*` + `src/components/*` (AccountCard, TransactionItem,
MoneyDisplay, EmptyState) formam a base reutilizável. Cores só existem como
variáveis CSS em `src/app/globals.css` (`--color-*`), nunca "hardcoded" num
componente — é isso que torna o tema claro/escuro (`ThemeToggle`) uma troca
de atributo `data-theme`, sem tocar em nenhum componente.

A navegação (`src/components/app-shell.tsx`) é UM único componente que
renderiza sidebar fixa em desktop/tablet (`md:flex`) e barra inferior +
botão flutuante "Nova transação" em mobile (`md:hidden`) a partir da mesma
lista `NAV_ITEMS` — não há duas implementações de navegação a divergir.

## 15. Modelo alvo é Prisma — mas ver "Prisma neste ambiente" abaixo

`prisma/schema.prisma` é a fonte de verdade do modelo de dados e o alvo de
migração. Foi mantido 100% completo mesmo sem poder correr `prisma generate`
neste sandbox (ver secção seguinte).

## Prisma neste ambiente de desenvolvimento

O CLI da Prisma 7.10.0 (versão estável mais recente disponível) falha
qualquer subcomando — incluindo `prisma --help` — com:

```
Error: Failed to fetch sha256 checksum at
https://binaries.prisma.sh/... - 403 Forbidden
```

Confirmámos que não é um erro específico da Prisma (o mesmo domínio devolve
sempre um corpo de 403 idêntico de 76 bytes para qualquer path testado, e
`fonts.googleapis.com` — usado por `next/font/google` — apresenta exatamente
o mesmo comportamento). Isto é a política de rede deste sandbox de
desenvolvimento a bloquear esses domínios especificamente, não um problema no
schema nem no código.

**Impacto**: não foi possível correr `prisma generate` / `prisma migrate dev`
*dentro deste sandbox*. **Mitigação usada para este entregar ser real e
verificável já hoje**:

1. `prisma/schema.prisma` foi escrito por completo e é a fonte de verdade.
2. `prisma/manual-sql/0001_init.sql` é a tradução manual e fiel desse schema
   para SQL puro — aplicada com sucesso a um PostgreSQL 16 local real
   (`psql`), incluindo enums, chaves estrangeiras, índices e um teste de
   inserção (utilizador, contas, transferência) para confirmar que o modelo
   funciona de facto.
3. `src/lib/db/*.ts` usa `pg` (node-postgres) diretamente em vez do Prisma
   Client gerado, com assinaturas de função idênticas às que o Prisma Client
   teria — para que trocar a implementação por `prisma.<model>.findMany(...)`
   mais tarde não exija tocar em mais nenhum ficheiro da aplicação (rotas de
   API, Server Components e o Financial Engine só dependem destas
   assinaturas, nunca do Prisma diretamente).

**Quando abrires este projeto num ambiente com rede normal** (a tua máquina,
GitHub Actions, Vercel): corre `npx prisma generate && npx prisma migrate dev
--name init`. A partir daí, o caminho recomendado é substituir o corpo de
cada função em `src/lib/db/*.ts` para usar o Prisma Client — sem mudar
nenhuma assinatura.

## Autenticação: JWT próprio em vez de NextAuth "padrão"

Ver `src/lib/auth/jwt.ts` para a justificação completa. Resumo: o requisito
explícito é Web e o futuro Mobile consumirem a mesma API (secção 2 do
briefing). Um JWT assinado com `jose`, devolvido por
`POST /api/auth/login`/`register`, pode ser guardado como cookie httpOnly
pela Web e mais tarde em `SecureStore` pelo Expo — a mesma função
`verifySessionToken()` valida ambos. NextAuth foi considerado e posto de
lado por acoplar fortemente o modelo de sessão a cookies de browser; pode ser
reconsiderado no Milestone 7 se fizer mais sentido nessa altura.

## Fontes: sistema em vez de next/font/google

Mesma limitação de rede do sandbox (ver acima) bloqueia
`fonts.googleapis.com`. `src/app/layout.tsx` usa uma pilha de fontes do
sistema. Isto não é uma limitação do produto — é trivial trocar por uma
fonte própria auto-hospedada (`public/fonts/*.woff2` + `@font-face`) quando
fizer sentido, sem depender de rede em build-time.

## Migração dos dados do protótipo (localStorage)

Ver `docs/architecture/MIGRATION.md` para o mapeamento completo
`financeEvents`/`financeSettings` → o novo modelo.
