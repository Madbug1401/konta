import { notFound } from "next/navigation";
import { DebtEditForm } from "@/components/debt-edit-form";
import { getSessionUser } from "@/lib/auth/session";
import { getDebtById } from "@/lib/db/debts";

export default async function EditDebtPage({ params }: { params: Promise<{ debtId: string }> }) {
  const { debtId } = await params;
  const session = await getSessionUser();

  const debt = await getDebtById(session!.userId, debtId);
  // getDebtById já filtra por userId — mesma proteção de acesso já usada
  // em EditTransactionPage/EditAccountPage.
  if (!debt) notFound();

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-xl font-bold text-foreground">Editar dívida</h1>
      <DebtEditForm
        debtId={debt.id}
        initialValues={{ creditorName: debt.creditorName, description: debt.description, interestRate: debt.interestRate }}
      />
    </div>
  );
}
