import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { databaseConfigured, ensureUsersTable, getPrisma } from "@/lib/server-db";
import { readTelegramState, writeTelegramState } from "@/lib/telegram-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = (process.env.ROLAX_ADMIN_EMAIL || "yanshkumar9090@gmail.com").toLowerCase();

type UserInput = {
  id?: string;
  name?: string;
  email?: string;
  password?: string;
  status?: string;
  planId?: string | null;
  planExpiry?: string | null;
  entitlements?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  googleSub?: string;
  picture?: string;
};

type PublicUser = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  planId?: string | null;
  planExpiry?: string | null;
  status: string;
  createdAt: string;
  [key: string]: unknown;
};

function normalizedEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function safeName(value: unknown, email: string) {
  const name = String(value || "").trim();
  return (name || email.split("@")[0] || "User").slice(0, 120);
}

function safeMetadata(input: UserInput) {
  const base = input.metadata && typeof input.metadata === "object" ? { ...input.metadata } : {};
  if (input.entitlements !== undefined) base.entitlements = input.entitlements;
  if (input.googleSub) base.googleSub = String(input.googleSub).slice(0, 200);
  if (input.picture) base.picture = String(input.picture).slice(0, 1000);
  return base;
}

function expose(row: any): PublicUser {
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    ...metadata,
    id: String(row.id),
    name: String(row.name || "User"),
    email: String(row.email || "").toLowerCase(),
    isAdmin: Boolean(row.isAdmin),
    planId: row.planId || undefined,
    planExpiry: row.planExpiry ? new Date(row.planExpiry).toISOString() : undefined,
    status: String(row.status || "active"),
    createdAt: new Date(row.createdAt || Date.now()).toISOString(),
  };
}

function unavailable() {
  return NextResponse.json({
    ok: false,
    durable: false,
    error: "Durable user storage is not configured. Add DATABASE_URL, or configure the manager bot webhook fallback.",
  }, { status: 503 });
}

async function ready() {
  if (!databaseConfigured()) return null;
  const db = getPrisma();
  if (!db) return null;
  await ensureUsersTable(db);
  return db;
}

async function readBody(req: NextRequest): Promise<UserInput & { action?: string }> {
  try { return await req.json(); } catch { return {}; }
}

function fallbackRecord(body: UserInput, email: string, passwordHash: string, existing?: any) {
  const metadata = {
    ...((existing?.metadata && typeof existing.metadata === "object") ? existing.metadata : {}),
    ...safeMetadata(body),
  };
  return {
    ...(existing || {}),
    id: String(existing?.id || body.id || "u_" + randomUUID()).slice(0, 80),
    name: safeName(body.name || existing?.name, email),
    email,
    passwordHash: passwordHash || existing?.passwordHash || "",
    isAdmin: email === ADMIN_EMAIL || Boolean(existing?.isAdmin),
    status: body.status === undefined ? String(existing?.status || "active") : String(body.status),
    planId: body.planId === undefined ? existing?.planId : body.planId || undefined,
    planExpiry: body.planExpiry === undefined ? existing?.planExpiry : body.planExpiry || undefined,
    metadata,
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
}

async function telegramFallback(req: NextRequest, body: UserInput & { action?: string }, action: string, email: string) {
  const loaded = await readTelegramState(req);
  if (!loaded.ok) return NextResponse.json({ ok: false, durable: false, error: loaded.error || "Durable state unavailable" }, { status: 503 });
  const rows = (loaded.state.website_users && typeof loaded.state.website_users === "object" ? loaded.state.website_users : {}) as Record<string, any>;
  const existing = rows[email];

  if (action === "login") {
    if (!existing) return NextResponse.json({ ok: false, durable: true, error: "Account not found" }, { status: 401 });
    if (existing.status === "banned") return NextResponse.json({ ok: false, durable: true, error: "This account is blocked" }, { status: 403 });
    const valid = await bcrypt.compare(String(body.password || ""), String(existing.passwordHash || "")).catch(() => false);
    if (!valid) return NextResponse.json({ ok: false, durable: true, error: "Invalid password" }, { status: 401 });
    const row = fallbackRecord({ ...body, name: body.name || existing.name }, email, existing.passwordHash, existing);
    rows[email] = row;
    const saved = await writeTelegramState(req, { ...loaded.state, website_users: rows }, loaded.webhookUrl);
    if (!saved.ok) return NextResponse.json({ ok: false, durable: false, error: saved.error }, { status: 503 });
    return NextResponse.json({ ok: true, durable: true, user: expose(row) });
  }

  if (action === "register" && existing) return NextResponse.json({ ok: false, durable: true, error: "Email already registered" }, { status: 409 });
  if (action === "register" && String(body.password || "").length < 6) {
    return NextResponse.json({ ok: false, durable: true, error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const passwordHash = action === "register"
    ? await bcrypt.hash(String(body.password || ""), 12)
    : action === "google"
      ? (existing?.passwordHash || await bcrypt.hash("google:" + randomUUID(), 12))
      : (existing?.passwordHash || await bcrypt.hash("session:" + randomUUID(), 12));
  const row = fallbackRecord(body, email, passwordHash, existing);
  rows[email] = row;
  const saved = await writeTelegramState(req, { ...loaded.state, website_users: rows }, loaded.webhookUrl);
  if (!saved.ok) return NextResponse.json({ ok: false, durable: false, error: saved.error }, { status: 503 });
  return NextResponse.json({ ok: true, durable: true, user: expose(row) }, { status: existing ? 200 : 201 });
}

/**
 * GET /api/users?email=... or /api/users
 *
 * It never falls back to a Vercel function filesystem. With DATABASE_URL it
 * uses PostgreSQL; otherwise the manager bot's encrypted webhook snapshot is
 * used (and refuses writes if that snapshot would exceed Telegram's URL size).
 */
export async function GET(req: NextRequest) {
  const db = databaseConfigured() ? await ready() : null;
  if (!db && databaseConfigured()) return unavailable();
  try {
    const email = normalizedEmail(req.nextUrl.searchParams.get("email"));
    if (!db) {
      const loaded = await readTelegramState(req);
      if (!loaded.ok) return NextResponse.json({ ok: false, durable: false, error: loaded.error }, { status: 503 });
      const all = Object.values((loaded.state.website_users || {}) as Record<string, any>);
      const rows = email ? all.filter(row => String(row.email || "").toLowerCase() === email).slice(0, 1) : all;
      return NextResponse.json({ ok: true, durable: true, users: rows.map(expose) });
    }
    const rows = email
      ? await db.user.findMany({ where: { email }, take: 1 })
      : await db.user.findMany({ orderBy: { createdAt: "asc" } });
    return NextResponse.json({ ok: true, durable: true, users: rows.map(expose) });
  } catch (error: any) {
    return NextResponse.json({ ok: false, durable: false, error: String(error?.message || "Durable user read failed").slice(0, 300) }, { status: 500 });
  }
}

/**
 * POST actions:
 * - register: create a password-hashed account, never overwrite an existing row
 * - login: verify a password on the server
 * - google: additive email upsert for a verified Google profile
 * - upsert: ensure a session user exists without replacing plan/status fields
 */
export async function POST(req: NextRequest) {
  const body = await readBody(req);
  const db = databaseConfigured() ? await ready() : null;
  if (!db && databaseConfigured()) return unavailable();

  const action = String(body.action || "upsert").toLowerCase();
  const email = normalizedEmail(body.email);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, durable: true, error: "Valid email required" }, { status: 400 });
  }
  if (!db) return telegramFallback(req, body, action, email);

  try {
    const existing = await db.user.findUnique({ where: { email } });

    if (action === "login") {
      if (!existing) return NextResponse.json({ ok: false, durable: true, error: "Account not found" }, { status: 401 });
      const valid = await bcrypt.compare(String(body.password || ""), existing.password).catch(() => false);
      if (!valid) return NextResponse.json({ ok: false, durable: true, error: "Invalid password" }, { status: 401 });
      const row = await db.user.update({ where: { email }, data: { name: safeName(body.name || existing.name, email) } });
      return NextResponse.json({ ok: true, durable: true, user: expose(row) });
    }

    if (action === "register") {
      if (existing) return NextResponse.json({ ok: false, durable: true, error: "Email already registered" }, { status: 409 });
      const password = String(body.password || "");
      if (password.length < 6) return NextResponse.json({ ok: false, durable: true, error: "Password must be at least 6 characters" }, { status: 400 });
      const row = await db.user.create({
        data: {
          id: String(body.id || "u_" + randomUUID()),
          name: safeName(body.name, email),
          email,
          password: await bcrypt.hash(password, 12),
          isAdmin: email === ADMIN_EMAIL,
          status: "active",
          metadata: safeMetadata(body) as any,
        },
      });
      return NextResponse.json({ ok: true, durable: true, user: expose(row) }, { status: 201 });
    }

    if (action === "google") {
      const metadata = safeMetadata(body);
      const row = existing
        ? await db.user.update({
            where: { email },
            data: { name: safeName(body.name || existing.name, email), metadata: { ...(existing.metadata as any || {}), ...metadata } },
          })
        : await db.user.create({
            data: {
              id: String(body.id || (body.googleSub ? "g_" + body.googleSub : "g_" + email)).slice(0, 80),
              name: safeName(body.name, email),
              email,
              password: await bcrypt.hash("google:" + randomUUID(), 12),
              isAdmin: email === ADMIN_EMAIL,
              status: "active",
              metadata: metadata as any,
            },
          });
      return NextResponse.json({ ok: true, durable: true, user: expose(row) }, { status: existing ? 200 : 201 });
    }

    // Generic session upsert: it is additive and intentionally does not accept
    // plan/status changes from a normal browser session.
    if (existing) return NextResponse.json({ ok: true, durable: true, user: expose(existing) });
    const row = await db.user.create({
      data: {
        id: String(body.id || "u_" + randomUUID()).slice(0, 80),
        name: safeName(body.name, email),
        email,
        password: await bcrypt.hash("session:" + randomUUID(), 12),
        isAdmin: email === ADMIN_EMAIL,
        status: "active",
        metadata: safeMetadata(body) as any,
      },
    });
    return NextResponse.json({ ok: true, durable: true, user: expose(row) }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ ok: false, durable: true, error: String(error?.message || "Database write failed").slice(0, 300) }, { status: 500 });
  }
}

/** Admin updates are additive; no DELETE endpoint exists for user records. */
export async function PATCH(req: NextRequest) {
  const db = databaseConfigured() ? await ready() : null;
  const body = await readBody(req);
  const email = normalizedEmail(body.email);
  if (!email) return NextResponse.json({ ok: false, error: "Email required" }, { status: 400 });
  if (!db && databaseConfigured()) return unavailable();
  if (!db) {
    const loaded = await readTelegramState(req);
    if (!loaded.ok) return NextResponse.json({ ok: false, durable: false, error: loaded.error }, { status: 503 });
    const rows = (loaded.state.website_users || {}) as Record<string, any>;
    const current = rows[email];
    if (!current) return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    const next = fallbackRecord(body, email, current.passwordHash || "", {
      ...current,
      metadata: { ...(current.metadata || {}), ...(body.metadata || {}) },
    });
    if (body.entitlements !== undefined) next.metadata.entitlements = body.entitlements;
    rows[email] = next;
    const saved = await writeTelegramState(req, { ...loaded.state, website_users: rows }, loaded.webhookUrl);
    if (!saved.ok) return NextResponse.json({ ok: false, durable: false, error: saved.error }, { status: 503 });
    return NextResponse.json({ ok: true, durable: true, user: expose(next) });
  }
  try {
    const current = await db.user.findUnique({ where: { email } });
    if (!current) return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    const metadata = { ...(current.metadata as any || {}) };
    if (body.entitlements !== undefined) metadata.entitlements = body.entitlements;
    if (body.metadata && typeof body.metadata === "object") Object.assign(metadata, body.metadata);
    const row = await db.user.update({
      where: { email },
      data: {
        name: body.name === undefined ? undefined : safeName(body.name, email),
        status: body.status === undefined ? undefined : String(body.status),
        planId: body.planId === undefined ? undefined : body.planId || null,
        planExpiry: body.planExpiry ? new Date(body.planExpiry) : body.planExpiry === null ? null : undefined,
        metadata,
      },
    });
    return NextResponse.json({ ok: true, durable: true, user: expose(row) });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: String(error?.message || "Database update failed").slice(0, 300) }, { status: 500 });
  }
}
