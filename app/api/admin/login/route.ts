import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, createAdminSession, validAdminCredentials } from "../../../admin-auth";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { username?: unknown; password?: unknown } | null;
  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!validAdminCredentials(username, password)) {
    return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });
  }
  const session = createAdminSession();
  const response = NextResponse.json({ role: "admin" });
  response.cookies.set(ADMIN_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: session.maxAge,
  });
  return response;
}
