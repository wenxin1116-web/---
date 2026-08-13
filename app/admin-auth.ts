import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const ADMIN_COOKIE = "deerma-admin-session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

function credentials() {
  return {
    username: process.env.DEERMA_ADMIN_USERNAME || "admin",
    password: process.env.DEERMA_ADMIN_PASSWORD || "deerma-admin",
    secret: process.env.DEERMA_AUTH_SECRET || "deerma-local-development-secret-change-me",
  };
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function signature(payload: string) {
  return createHmac("sha256", credentials().secret).update(payload).digest("base64url");
}

export function validAdminCredentials(username: string, password: string) {
  const configured = credentials();
  return safeEqual(username, configured.username) && safeEqual(password, configured.password);
}

export function createAdminSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `admin.${expiresAt}`;
  return { token: `${payload}.${signature(payload)}`, maxAge: SESSION_TTL_SECONDS };
}

export function isAdminRequest(request: NextRequest) {
  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  if (!token) return false;
  const [role, expires, suppliedSignature] = token.split(".");
  const expiresAt = Number(expires);
  if (role !== "admin" || !suppliedSignature || !Number.isFinite(expiresAt) || expiresAt <= Date.now() / 1000) return false;
  return safeEqual(suppliedSignature, signature(`${role}.${expires}`));
}
