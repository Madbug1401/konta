import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

export default async function RootPage() {
  const session = await getSessionUser();
  redirect(session ? "/dashboard" : "/login");
}
