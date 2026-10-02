-- [Task 1 — Recorrências: editar/eliminar] Sem isto, eliminar uma
-- RecurringTransaction que já tenha gerado pelo menos uma Transaction falha
-- na BD (a FK por omissão é NO ACTION/restrict). A arquitetura já documentada
-- em [DECISÃO 7] (schema.prisma) diz que uma ocorrência gerada é totalmente
-- independente do template assim que é criada — por isso SET NULL é a opção
-- coerente: o template desaparece, as Transactions já geradas ficam intactas,
-- só perdem a ligação (`recurringTransactionId = NULL`).
--
-- Nome da constraint é o automático do Postgres para uma FK inline sem nome
-- explícito ("<tabela>_<coluna>_fkey") — confirmado contra o schema aplicado
-- em 0001_init.sql.
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_recurringTransactionId_fkey";
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recurringTransactionId_fkey"
  FOREIGN KEY ("recurringTransactionId") REFERENCES "RecurringTransaction"(id) ON DELETE SET NULL;
