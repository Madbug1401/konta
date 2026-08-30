import { notFound } from "next/navigation";
import { AccountEditForm } from "@/components/account-edit-form";
import { getSessionUser } from "@/lib/auth/session";
import { getAccountById } from "@/lib/db/accounts";
import type { AccountColorId } from "@/lib/account-colors";

export default async function EditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();

  const account = await getAccountById(session!.userId, id);
  // getAccountById já filtra por userId — um utilizador nunca consegue
  // sequer chegar a ver o formulário de edição de uma conta de outro
  // utilizador, mesmo adivinhando o id na URL (regra 6 do briefing).
  if (!account) notFound();

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-xl font-bold text-foreground">Editar conta</h1>
      <AccountEditForm
        accountId={account.id}
        initialValues={{ name: account.name, type: account.type, color: account.color as AccountColorId | null }}
      />
    </div>
  );
}
