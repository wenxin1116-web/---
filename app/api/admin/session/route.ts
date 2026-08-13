import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "../../../admin-auth";

export async function GET(request: NextRequest) {
  return NextResponse.json({ role: isAdminRequest(request) ? "admin" : "viewer" });
}
