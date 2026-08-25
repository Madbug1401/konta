import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  // Segunda linha de defesa (a primeira é o middleware — ver src/middleware.ts):
  // mesmo que o cookie exista mas o token seja inválido/expirado, nenhum
  // Server Component chega a renderizar dados de outro utilizador.
  if (!session) redirect("/login");

  return <AppShell userEmail={session.email}>{children}</AppShell>;
}
