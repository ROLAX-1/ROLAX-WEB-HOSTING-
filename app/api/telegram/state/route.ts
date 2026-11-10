import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { databaseConfigured, ensureTelegramStateTable, getPrisma } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function signature() {
  const botToken = String(process.env.ROLAX_MAIN_BOT_TOKEN || process.env.BOT_TOKEN || "").trim();
  return botToken ? createHmac("sha256", botToken).update("rolax-telegram-state-v1").digest("hex") : "";
}

function authorized(req: NextRequest) {
  const expected = signature();
  const supplied = req.headers.get("x-rolax-state-signature") || "";
  if (!expected || supplied.length !== expected.length) return false;
  try { return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)); } catch { return false; }
}

async function dbReady() {
  if (!databaseConfigured()) return null;
  const db = getPrisma();
  if (!db) return null;
  await ensureTelegramStateTable(db);
  return db;
}

function unavailable() {
  return NextResponse.json({ ok: false, durable: false, error: "Telegram database state is not configured" }, { status: 503 });
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const db = await dbReady();
  if (!db) return unavailable();
  try {
    const row = await db.telegramState.findUnique({ where: { id: "main" } });
    return NextResponse.json({ ok: true, durable: true, state: typeof row?.payload === "string" ? row.payload : row?.payload || "" });
  } catch { return NextResponse.json({ ok: false, durable: false, error: "Telegram state read failed" }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const db = await dbReady();
  if (!db) return unavailable();
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }
  const state = String(body.state || "");
  if (!state || state.length > 2_000_000) return NextResponse.json({ ok: false, error: "Invalid state" }, { status: 400 });
  try {
    const row = await db.telegramState.upsert({
      where: { id: "main" },
      create: { id: "main", payload: state },
      update: { payload: state },
    });
    return NextResponse.json({ ok: true, durable: true, updatedAt: row.updatedAt });
  } catch { return NextResponse.json({ ok: false, durable: false, error: "Telegram state write failed" }, { status: 500 }); }
}
