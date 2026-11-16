import "server-only";
import { cookies, headers } from "next/headers";

/** A long random id for this browser, kept in a cookie: lets the owner approve devices. */
export const DEVICE_COOKIE = "pdev";

export async function deviceKey(): Promise<string | null> {
  const v = (await cookies()).get(DEVICE_COOKIE)?.value ?? null;
  return v && /^[A-Za-z0-9_-]{20,80}$/.test(v) ? v : null;
}

/** Creates the device id cookie if missing (server actions only). */
export async function ensureDeviceKey(): Promise<string> {
  const have = await deviceKey();
  if (have) return have;
  const key = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  (await cookies()).set(DEVICE_COOKIE, key, { path: "/", maxAge: 60 * 60 * 24 * 365 * 5, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  return key;
}

export async function userAgent(): Promise<string> {
  return ((await headers()).get("user-agent") ?? "").slice(0, 300);
}
