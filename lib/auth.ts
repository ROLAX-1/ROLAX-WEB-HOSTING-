"use client";

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
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}

export function setAuth(user: AuthUser) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  // also ensure user exists in users list
  try {
    const users = JSON.parse(localStorage.getItem("rolax_users") || "[]");
    if (!users.find((u: any) => u.email === user.email)) {
      users.push({ id: user.id, name: user.name, email: user.email, status: "active", createdAt: new Date().toISOString() });
      localStorage.setItem("rolax_users", JSON.stringify(users));
    }
  } catch {}
}

export function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
}

export function isAdminUser(user: AuthUser | null) {
  return user?.email === "yanshkumar9090@gmail.com";
}
