import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { createCategory, listCategories } from "@/lib/db/categories";
import { withErrorHandling } from "@/lib/api-error";

export const GET = withErrorHandling("api.categories.get", async () => {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const categories = await listCategories(session.userId);
  return NextResponse.json({ categories });
});

const CreateCategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(["INCOME", "EXPENSE"]),
});

export const POST = withErrorHandling("api.categories.post", async (request: Request) => {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = CreateCategorySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const category = await createCategory({ userId: session.userId, ...parsed.data });
  return NextResponse.json(category, { status: 201 });
});
