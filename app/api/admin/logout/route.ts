import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "../../../admin-auth";

export async function POST() {
  const response = NextResponse.json({ role: "viewer" });
  response.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
