import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { findUserById } from "@/lib/db/users";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const user = await findUserById(session.userId);
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    timezone: user.timezone,
    locale: user.locale,
    defaultCurrency: user.defaultCurrency,
  });
}
