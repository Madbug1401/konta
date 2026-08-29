# Política de eliminação de dados (ON DELETE)

> **Prioridade 10 do Pre-Beta Hardening.** Este documento é apenas de
> análise/decisão. **Não foi implementada nenhuma funcionalidade de delete**
> (UI, rota de API ou alteração de schema) como parte desta tarefa — por
> pedido explícito do utilizador. O objetivo é decidir a política *antes* de
> qualquer botão "eliminar" existir na aplicação, para que quando for
> construído siga a decisão certa desde o início.

## Porque é que isto importa antes de existir qualquer botão "eliminar"

Hoje a aplicação **não tem nenhuma rota de delete** para Accounts, Debts,
Goals ou Recurring Transactions (confirmado: não existe nenhum
`DELETE /api/accounts/[id]`, nem equivalente para as outras entidades). Mas
o schema da base de dados já define o que aconteceria *se* essa rota
existisse, através das constraints `ON DELETE` em cada chave estrangeira —
e uma dessas constraints, tal como está hoje, apagaria dados financeiros
que o utilizador precisa de manter.

## Levantamento completo: todas as chaves estrangeiras e o seu comportamento ON DELETE

Baseado em `prisma/manual-sql/0001_init.sql` (schema real aplicado):

| Tabela.coluna | Referencia | Comportamento ON DELETE |
|---|---|---|
| `Account.userId` | `User` | `CASCADE` |
| `Category.userId` | `User` | `CASCADE` (coluna nullable) |
| `RecurringTransaction.userId` | `User` | `CASCADE` |
| `RecurringTransaction.accountId` | `Account` | *(nenhuma ação explícita → NO ACTION)* |
| `Debt.userId` | `User` | `CASCADE` |
| `DebtInstallment.debtId` | `Debt` | `CASCADE` |
| `Goal.userId` | `User` | `CASCADE` |
| `Goal.linkedAccountId` | `Account` | *(nenhuma ação explícita → NO ACTION)* |
| `Transaction.userId` | `User` | `CASCADE` |
| **`Transaction.accountId`** | **`Account`** | **`CASCADE`** ⚠️ |
| `Transaction.destinationAccountId` | `Account` | *(nenhuma ação explícita → NO ACTION)* |
| `Transaction.categoryId` | `Category` | *(nenhuma ação explícita → NO ACTION)* |
| `Transaction.debtId` | `Debt` | *(nenhuma ação explícita → NO ACTION)* |
| `Transaction.debtInstallmentId` | `DebtInstallment` | *(nenhuma ação explícita → NO ACTION)* |
| `Transaction.goalId` | `Goal` | *(nenhuma ação explícita → NO ACTION)* |
| `Transaction.recurringTransactionId` | `RecurringTransaction` | *(nenhuma ação explícita → NO ACTION)* |
| `InvestmentDetail.accountId` | `Account` | `CASCADE` |
| `InvestmentValuation.investmentDetailId` | `InvestmentDetail` | `CASCADE` |

`NO ACTION` em Postgres (o comportamento por omissão quando `ON DELETE` não
é especificado) impede o `DELETE` de ser executado enquanto existir alguma
linha a referenciar a linha-alvo — a base de dados recusa a operação com um
erro de foreign key, em vez de apagar ou deixar `NULL`. Na prática, hoje,
isto funciona como uma rede de segurança acidental: tentar apagar uma
`Category`, `Debt`, `Goal` ou `RecurringTransaction` que tenha
`Transaction`s associadas falha imediatamente em vez de destruir histórico
ou corromper dados — apesar de nenhuma destas tabelas ter sido pensada
deliberadamente com essa proteção.

## O problema concreto: `Transaction.accountId ON DELETE CASCADE`

Esta é a constraint identificada no `GO_TO_BETA_AUDIT.md` como bloqueadora.
Ao contrário de todas as outras relações da tabela `Transaction`, esta usa
`CASCADE`: **apagar uma `Account` apaga automaticamente, em cascata, todas
as `Transaction`s cujo `accountId` aponte para essa conta** — mesmo que
essas transações tenham anos de histórico financeiro do utilizador.

Isto é inconsistente com o resto do schema por duas razões:

1. **Assimetria dentro da própria tabela `Transaction`**: uma transferência
   tem `accountId` (conta de origem) e `destinationAccountId` (conta de
   destino). Apagar a conta de origem apaga a transação inteira em cascata;
   apagar a conta de destino da mesma transação seria bloqueado pelo
   Postgres (`NO ACTION`). A mesma linha da tabela `Transaction` tem dois
   comportamentos opostos consoante qual das duas contas é apagada.
2. **Contradiz o princípio geral do resto do schema**: todas as outras
   ligações de `Transaction` a entidades "de negócio" (`Category`, `Debt`,
   `DebtInstallment`, `Goal`, `RecurringTransaction`) protegem a transação
   por omissão (`NO ACTION`). Só a relação com `Account` — provavelmente a
   mais importante de todas, já que toda a transação pertence sempre a uma
   conta — escolhe apagar em vez de proteger.

Numa aplicação de finanças pessoais, uma `Transaction` é o registo de um
acontecimento financeiro real (um pagamento, um depósito, uma
transferência). Perder esse registo porque a conta associada foi arquivada
ou fechada — por exemplo, o utilizador fechou uma conta bancária antiga —
apagaria retroativamente o histórico de receitas/despesas desses meses,
distorcendo relatórios, o cálculo de patrimonio ao longo do tempo, e
qualquer exportação/auditoria futura. Isto é inaceitável para dados
financeiros, mesmo em beta.

## Decisão: não eliminar Accounts (nem Debts/Goals/Recurring) fisicamente — usar arquivamento

**Não implementar delete físico (hard delete) para nenhuma destas
entidades.** Em vez disso, a política recomendada para quando esta
funcionalidade for construída é:

- **Accounts**: já existe no schema o campo `Account.isArchived BOOLEAN NOT
  NULL DEFAULT false` — criado antes desta tarefa, mas **nunca usado** por
  nenhuma rota de API nem nenhum componente de UI até hoje. É exatamente o
  mecanismo certo para isto: "eliminar" uma conta do ponto de vista do
  utilizador deve significar marcar `isArchived = true` (deixa de aparecer
  nas listas ativas, deixa de poder receber novas transações) e **nunca**
  `DELETE FROM "Account"`. O histórico de transações associado permanece
  intacto e consultável (ex: para relatórios anuais, exportação, ou caso o
  utilizador queira reativar a conta).
- **Debts, Goals, Recurring Transactions**: nenhuma destas tabelas tem hoje
  um campo de arquivamento equivalente a `isArchived`. Quando a
  funcionalidade de eliminação for desenhada para estas entidades (fora do
  âmbito desta Beta — ver lista de exclusões), recomenda-se adicionar o
  mesmo padrão (`isArchived`/`status` correspondente já existe parcialmente
  em `Debt.status` com o valor `PAID_OFF`, e em `Goal.status` com
  `ACHIEVED`/`ABANDONED` — estes estados já cobrem o caso de "já não está
  ativo" sem apagar nada) em vez de introduzir `DELETE` físico.
- **Nunca** expor uma operação "eliminar conta" na UI/API que resulte num
  `DELETE FROM "Account"` real enquanto a constraint `ON DELETE CASCADE`
  em `Transaction.accountId` não for corrigida (ver secção seguinte) — do
  contrário até um arquivamento mal implementado que caia para hard-delete
  por engano destruiria histórico silenciosamente.

## Recomendação para uma migração futura (não feita agora)

Quando uma funcionalidade real de "encerrar conta" for construída (fora do
âmbito desta Beta), a migração correta é alterar
`Transaction.accountId` de `ON DELETE CASCADE` para `ON DELETE RESTRICT`
(ou o `NO ACTION` já usado nas colunas irmãs, por consistência) — assim a
base de dados passa a recusar apagar fisicamente uma `Account` que ainda
tenha `Transaction`s associadas, tornando o hard-delete acidental
impossível ao nível da própria base de dados, e não apenas por convenção no
código da aplicação. Esta alteração não é feita agora porque:

- Não existe hoje nenhuma funcionalidade de delete que dependa dela — é uma
  proteção para um caso de uso que ainda não existe na aplicação.
- É uma migração de schema com risco (`ALTER TABLE ... DROP CONSTRAINT` +
  `ADD CONSTRAINT`), e o pedido explícito desta tarefa é apenas
  **documentar a decisão**, não implementar ou migrar nada.
- Faz mais sentido implementá-la no mesmo momento em que a funcionalidade
  de arquivamento de conta for construída, para que o teste de regressão
  cubra as duas coisas juntas (a rota que arquiva a conta e a garantia ao
  nível de base de dados de que um hard-delete nunca destrói histórico).

## Resumo

| Pergunta | Resposta |
|---|---|
| Existe hoje alguma rota de delete para Account/Debt/Goal/RecurringTransaction? | Não. |
| O schema atual permite apagar uma Account e perder transações em cascata? | Sim — `Transaction.accountId ON DELETE CASCADE`. Este é o risco identificado no audit. |
| Foi implementada alguma funcionalidade de delete nesta tarefa? | Não — tarefa apenas de documentação/decisão, por pedido explícito. |
| Qual é a política recomendada quando a funcionalidade for construída? | Soft-delete/arquivamento (`Account.isArchived`, já existente no schema e ainda não usado), nunca hard-delete físico. |
| E quanto ao schema em si? | Recomenda-se, nessa altura, migrar `Transaction.accountId` para `ON DELETE RESTRICT`/`NO ACTION` como defesa adicional ao nível da base de dados. Não feito agora. |
