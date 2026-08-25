import { notFound } from "next/navigation";
import { TransactionForm } from "@/components/transaction-form";
import { getSessionUser } from "@/lib/auth/session";
import { listAccounts } from "@/lib/db/accounts";
import { listCategories } from "@/lib/db/categories";
import { getTransactionById } from "@/lib/db/transactions";

export default async function EditTransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();

  const [transaction, accounts, categories] = await Promise.all([
    getTransactionById(session!.userId, id),
    listAccounts(session!.userId),
    listCategories(session!.userId),
  ]);

  // getTransactionById já filtra por userId — um utilizador nunca consegue
  // sequer chegar a ver o formulário de edição de uma transação de outro
  // utilizador, mesmo adivinhando o id na URL (regra 6 do briefing).
  if (!transaction) notFound();

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-xl font-bold text-foreground">Editar transação</h1>
      <TransactionForm
        accounts={accounts}
        categories={categories}
        mode="edit"
        transactionId={transaction.id}
        initialValues={{
          type: transaction.type,
          accountId: transaction.accountId,
          destinationAccountId: transaction.destinationAccountId,
          amountMinor: Number(transaction.amountMinor),
          categoryId: transaction.categoryId,
          description: transaction.description,
          date: transaction.date,
        }}
      />
    </div>
  );
}
