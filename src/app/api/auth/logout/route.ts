import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/jwt";
import { withErrorHandling } from "@/lib/api-error";

export const POST = withErrorHandling("api.auth.logout.post", async () => {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return response;
});
