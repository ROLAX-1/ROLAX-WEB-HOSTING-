"use client";

/**
 * Crash-safe client persistence plus an optional durable server adapter.
 *
 * The browser copy is deliberately additive: a corrupt/empty write or a
 * partial admin update cannot erase older user rows. When DATABASE_URL is
 * configured on the linked Vercel project, the /api/users adapter is also
 * called so registration/login/Google users survive storage loss and another
 * device. If it is not configured, callers retain the local copy but can see
 * `durable: false` instead of being given a false persistence guarantee.
 */
export type PersistentUser = {
  id: string;
  name?: string;
  email?: string;
  status?: string;
  createdAt?: string;
  [key: string]: any;
};

export type ServerUserResult = {
  ok: boolean;
  durable: boolean;
  user?: PersistentUser;
  users?: PersistentUser[];
  error?: string;
};

function backupKey(key: string) {
  return `${key}__backup`;
}

function parseArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function recordKeys(value: any): string[] {
  if (!value || typeof value !== "object") return [];
  return [value.id, value.email, value.chatId, value.chat_id]
    .map(v => String(v ?? "").trim().toLowerCase())
    .filter(Boolean);
}

/** Exported for deterministic merge tests and admin recovery tooling. */
export function mergeRecords<T extends Record<string, any>>(older: T[], newer: T[]): T[] {
  const out: T[] = [];
  const indexes = new Map<string, number>();
  const add = (item: T) => {
    if (!item || typeof item !== "object") return;
    const keys = recordKeys(item);
    const index = keys.map(key => indexes.get(key)).find(v => v !== undefined);
    if (index === undefined) {
      const next = out.length;
      out.push(item);
      keys.forEach(key => indexes.set(key, next));
      return;
    }
    // Keep the first stable id when an old local cache and a server row have
    // the same email but different generated ids; website foreign references
    // in the cache continue to point at the same account.
    const previous = out[index];
    const merged = { ...previous, ...item } as T;
    if ((previous as any).id && (item as any).id && (previous as any).id !== (item as any).id) (merged as any).id = (previous as any).id;
    out[index] = merged;
    recordKeys(merged).forEach(key => indexes.set(key, index));
  };
  older.forEach(add);
  newer.forEach(add);
  return out;
}

export function loadPersistentArray<T extends Record<string, any> = any>(key: string): T[] {
  if (typeof window === "undefined") return [];
  const primary = parseArray<T>(localStorage.getItem(key));
  const backup = parseArray<T>(localStorage.getItem(backupKey(key)));
  // Union primary + backup so a partial/empty write cannot erase older rows.
  const merged = mergeRecords(backup, primary);
  if (merged.length && (primary.length === 0 || merged.length !== primary.length)) {
    try {
      localStorage.setItem(key, JSON.stringify(merged));
      localStorage.setItem(backupKey(key), JSON.stringify(merged));
    } catch { /* storage quota/private mode — caller still gets the in-memory list */ }
  }
  return merged;
}

export function savePersistentArray<T extends Record<string, any> = any>(key: string, value: T[]): T[] {
  if (typeof window === "undefined") return value || [];
  const current = loadPersistentArray<T>(key);
  // For account/user records, omission from a new array is not treated as a
  // delete. Admin can mark a user blocked; historical records remain visible.
  const merged = mergeRecords(current, Array.isArray(value) ? value : []);
  try {
    const raw = JSON.stringify(merged);
    localStorage.setItem(key, raw);
    localStorage.setItem(backupKey(key), raw);
  } catch { /* ignore quota/private-mode errors */ }
  return merged;
}

export function upsertPersistentRecord<T extends Record<string, any> = any>(key: string, record: T): T[] {
  return savePersistentArray<T>(key, [...loadPersistentArray<T>(key), record]);
}

export function loadUsers(): PersistentUser[] {
  return loadPersistentArray<PersistentUser>("rolax_users");
}

export function saveUsers(users: PersistentUser[]): PersistentUser[] {
  return savePersistentArray<PersistentUser>("rolax_users", users);
}

export function upsertUser(user: PersistentUser): PersistentUser[] {
  return upsertPersistentRecord<PersistentUser>("rolax_users", user);
}

/**
 * Server calls never send passwords except for the explicit register/login
 * operation. The server stores a bcrypt hash and returns only public fields.
 */
export async function serverUserAction(
  action: "register" | "login" | "google" | "upsert",
  payload: Record<string, unknown>
): Promise<ServerUserResult> {
  try {
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    return {
      ok: Boolean(result?.ok),
      durable: Boolean(result?.durable),
      user: result?.user,
      users: result?.users,
      error: result?.error || (response.ok ? undefined : `HTTP ${response.status}`),
    };
  } catch (error: any) {
    return { ok: false, durable: false, error: error?.message || "server persistence unavailable" };
  }
}

export async function patchUserToServer(user: PersistentUser): Promise<ServerUserResult> {
  try {
    const response = await fetch("/api/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(user),
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    return {
      ok: Boolean(result?.ok),
      durable: Boolean(result?.durable),
      user: result?.user,
      error: result?.error || (response.ok ? undefined : `HTTP ${response.status}`),
    };
  } catch (error: any) {
    return { ok: false, durable: false, error: error?.message || "server persistence unavailable" };
  }
}

export async function syncUsersToServer(users: PersistentUser[]) {
  const results: ServerUserResult[] = [];
  for (const user of users) {
    let result: ServerUserResult = { ok: false, durable: false };
    // A transient cold start/network failure must not lose an admin plan
    // assignment. Retry a couple of times; permanent state-size errors return
    // immediately on the final attempt and remain visible to the caller.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      result = await patchUserToServer(user);
      if (result.ok || (result.durable && /state_too_large/i.test(result.error || ""))) break;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)));
    }
    results.push(result);
  }
  return results;
}

export async function loadServerUsers(): Promise<ServerUserResult> {
  try {
    const response = await fetch("/api/users", { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    return {
      ok: Boolean(result?.ok),
      durable: Boolean(result?.durable),
      users: Array.isArray(result?.users) ? result.users : [],
      error: result?.error || (response.ok ? undefined : `HTTP ${response.status}`),
    };
  } catch (error: any) {
    return { ok: false, durable: false, users: [], error: error?.message || "server persistence unavailable" };
  }
}

export async function syncUserToServer(user: PersistentUser, password?: string, action: "upsert" | "register" | "login" | "google" = "upsert") {
  const payload: Record<string, unknown> = {
    id: user.id,
    name: user.name,
    email: user.email,
    status: user.status,
    planId: user.planId,
    planExpiry: user.planExpiry,
    entitlements: user.entitlements,
    picture: user.picture,
    googleSub: user.googleSub,
  };
  if (password !== undefined) payload.password = password;
  return serverUserAction(action, payload);
}
