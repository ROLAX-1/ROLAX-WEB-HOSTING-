"use client";

import { upsertUser, syncUserToServer, type PersistentUser } from "./persistent";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
};

const AUTH_KEY = "rolax_auth";

export function getAuth(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(AUTH_KEY);
    if (v) return JSON.parse(v);
    // localStorage se gayab ho gaya? session backup se wapas lao
    const backup = sessionStorage.getItem(AUTH_KEY);
    if (backup) {
      localStorage.setItem(AUTH_KEY, backup);
      return JSON.parse(backup);
    }
    return null;
  } catch { return null; }
}

export function setAuth(user: AuthUser, options?: { skipServer?: boolean }) {
  const withStamp = { ...user, loggedInAt: new Date().toISOString() };
  localStorage.setItem(AUTH_KEY, JSON.stringify(withStamp));
  // session backup — refresh/close ke baad bhi admin logout na ho
  try { sessionStorage.setItem(AUTH_KEY, JSON.stringify(withStamp)); } catch {}
  // Local copy is additive and immediately visible to the admin list.
  try {
    const record: PersistentUser = {
      id: user.id,
      name: user.name,
      email: user.email.trim().toLowerCase(),
      status: "active",
      createdAt: new Date().toISOString(),
    };
    upsertUser(record);
    // The server adapter is optional; when configured this makes the session
    // user available after local storage is cleared or on another device.
    if (!options?.skipServer) void syncUserToServer(record);
  } catch {}
}

export function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
  try { sessionStorage.removeItem(AUTH_KEY); } catch {}
}

export function isAdminUser(user: AuthUser | null) {
  return user?.email === "yanshkumar9090@gmail.com";
}
