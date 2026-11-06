import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * ROLAX HOST — 24/7 server-side bot registry + watchdog.
 *
 * POST   {siteId, token, name, entry, files, expiresAt, ownerEmail}  -> register (ya update)
 * DELETE ?siteId=xxx                                                -> unregister
 * GET                                                               -> status list (watchdog live?)
 *
 * Watchdog: server process ke andar hi setInterval chalta hai (module singleton),
 * har 5 second me Telegram getUpdates -> pybridge.py se ASLI python reply -> sendMessage.
 * Isliye bot browser band hone par bhi online rehta hai.
 */

type Reg = {
  siteId: string;
  token: string;
  name: string;
  entry: string;
  files: { name: string; content: string }[];
  expiresAt?: string;
  ownerEmail?: string;
  addedAt: string;
};

type Stat = {
  siteId: string; status: "online" | "error" | "starting"; username?: string;
  responses: number; errors: number; lastError?: string; lastReplyAt?: string; lastMessage?: string;
  updateOffset?: number; checkedAt?: string; mode: string;
};

const STORE = path.join(process.cwd(), ".rolax-runtime", "bots.json");
const PY = process.env.PYTHON_BIN || "python3";
const BRIDGE = path.join(process.cwd(), "runtime", "pybridge.py");
const API = process.env.TELEGRAM_API_BASE || "https://api.telegram.org";
const TICK_MS = 5000;
const DEFAULT_SITE_ID = "rolax-main-hosted";
const DEFAULT_ENTRY = "ROLAX HOSTING FINAL.py";
const DEFAULT_SOURCE = path.join(process.cwd(), "hosted", DEFAULT_ENTRY);

type G = {
  bots: Map<string, Reg>;
  stats: Map<string, Stat>;
  timer?: NodeJS.Timeout;
  busy: Set<string>;
  loaded: boolean;
};

const g: G = ((globalThis as any).__rolaxBotWatchdog ||= {
  bots: new Map(), stats: new Map(), busy: new Set(), loaded: false,
});

function loadDefaultBotFromEnvironment() {
  const token = String(process.env.ROLAX_MAIN_BOT_TOKEN || "").trim();
  if (!/^\d{6,12}:[A-Za-z0-9_-]{20,60}$/.test(token) || g.bots.has(DEFAULT_SITE_ID)) return;
  try {
    if (!existsSync(DEFAULT_SOURCE)) return;
    const content = readFileSync(DEFAULT_SOURCE, "utf8");
    g.bots.set(DEFAULT_SITE_ID, {
      siteId: DEFAULT_SITE_ID,
      token,
      name: "ROLAX HOSTING FINAL",
      entry: DEFAULT_ENTRY,
      files: [{ name: DEFAULT_ENTRY, content }],
      ownerEmail: process.env.ROLAX_OWNER_EMAIL || "",
      addedAt: new Date().toISOString(),
    });
    saveToDisk();
  } catch { /* source/env may be unavailable during a partial build */ }
}


function loadFromDisk() {
  if (g.loaded) return;
  g.loaded = true;
  try {
    if (existsSync(STORE)) {
      const arr: Reg[] = JSON.parse(readFileSync(STORE, "utf8"));
      arr.forEach(r => g.bots.set(r.siteId, r));
    }
  } catch { /* ignore */ }
}

function saveToDisk() {
  try {
    mkdir(path.dirname(STORE), { recursive: true });
    writeFileSync(STORE, JSON.stringify([...g.bots.values()], null, 0));
  } catch { /* ignore */ }
}

function setStat(id: string, patch: Partial<Stat>) {
  const prev = g.stats.get(id) || { siteId: id, status: "starting" as const, responses: 0, errors: 0, mode: "python" };
  g.stats.set(id, { ...prev, ...patch, checkedAt: new Date().toISOString() });
}

/** real python reply: bot file likho -> pybridge chalao -> output lo */
async function pyReply(reg: Reg, text: string): Promise<{ reply: string; commands: string[]; ok: boolean; error?: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "rolax-bot-"));
  try {
    for (const f of reg.files.slice(0, 60)) {
      const safe = f.name.replace(/^\/+/, "").replace(/\.\.(\/|\\)/g, "");
      const t = path.join(dir, safe);
      await mkdir(path.dirname(t), { recursive: true });
      await writeFile(t, String(f.content || "").slice(0, 400_000), "utf8");
    }
    const env: any = {
      ...process.env,
      ROL_TEXT: text,
      BOT_TOKEN: reg.token,
      TELEGRAM_BOT_TOKEN: reg.token,
      PYTHONUNBUFFERED: "1",
      PYTHONIOENCODING: "utf-8",
    };
    const res = await new Promise<any>(resolve => {
      const child: any = spawn(PY, [BRIDGE, dir, reg.entry], { cwd: dir, env });
      let out = "";
      let err = "";
      const killer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 12000);
      child.stdout.on("data", (d: any) => { out += d.toString(); });
      child.stderr.on("data", (d: any) => { err += d.toString(); });
      child.on("close", () => {
        clearTimeout(killer);
        const line = out.split("\n").reverse().find(l => l.startsWith("###RESULT###"));
        if (line) { try { resolve(JSON.parse(line.slice(12))); return; } catch {} }
        resolve({ ok: false, replies: [], commands: [], error: (err || out).slice(0, 300) });
      });
      child.on("error", (e: any) => { clearTimeout(killer); resolve({ ok: false, replies: [], commands: [], error: e.message }); });
    });
    const replies: string[] = res.replies || [];
    return { reply: replies[0] || "", commands: res.commands || [], ok: !!res.ok, error: res.error || res.loadError };
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function tg(token: string, method: string, payload?: any) {
  const url = `${API}/bot${token}/${method}`;
  try {
    const r = payload
      ? await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" })
      : await fetch(url, { cache: "no-store" });
    return await r.json();
  } catch (e: any) {
    return { ok: false, description: "network: " + (e?.message || "unreachable") };
  }
}

function webhookSecret(token: string) {
  return createHash("sha256").update(`rolax-webhook:${token}`).digest("hex").slice(0, 32);
}

function publicOrigin(req: NextRequest) {
  const configured = process.env.ROLAX_WEBHOOK_BASE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || req.nextUrl.origin;
  const value = String(configured || "").trim();
  if (!value) return "";
  return value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`;
}

/** Vercel par default ROLAX bot ko polling ke bajaye event-driven webhook do. */
async function ensureDefaultWebhook(req: NextRequest) {
  const reg = g.bots.get(DEFAULT_SITE_ID);
  if (!reg) return { ok: false, url: "" };
  const origin = publicOrigin(req);
  // localhost/preview se Telegram ko webhook set karna bekaar hai.
  if (!origin || /localhost|127\.0\.0\.1/.test(origin)) return { ok: false, url: "" };
  const url = `${origin.replace(/\/$/, "")}/api/rolax_webhook`;
  const info = await tg(reg.token, "getWebhookInfo");
  if (info?.result?.url !== url || info?.result?.has_custom_certificate) {
    const set = await tg(reg.token, "setWebhook", {
      url,
      drop_pending_updates: false,
      secret_token: webhookSecret(reg.token),
      allowed_updates: ["message", "edited_message", "callback_query", "channel_post"],
    });
    if (!set?.ok) return { ok: false, url, error: set?.description || "setWebhook failed" };
  }
  // Webhook requests do not run PTB's post_init hook, so keep Telegram's
  // command menu in sync here as well. This is harmless when the commands are
  // already set and makes /start, /help and /redeem discoverable again.
  await tg(reg.token, "setMyCommands", {
    commands: [
      { command: "start", description: "Main menu / bot host karo" },
      { command: "help", description: "Saare commands dekho" },
      { command: "redeem", description: "Redeem code se credits add karo" },
    ],
  });
  return { ok: true, url };
}

async function tickBot(reg: Reg) {
  if (g.busy.has(reg.siteId)) return;
  g.busy.add(reg.siteId);
  try {
    if (reg.expiresAt && new Date(reg.expiresAt).getTime() < Date.now()) {
      setStat(reg.siteId, { status: "error", lastError: "Plan expired — renew karo" });
      return;
    }
    const prev = g.stats.get(reg.siteId);
    const me = await tg(reg.token, "getMe");
    if (!me?.ok) {
      setStat(reg.siteId, { status: "error", lastError: me?.description || "Token invalid" });
      return;
    }
    const wh = await tg(reg.token, "getWebhookInfo");
    // Preloaded ROLAX bot is event-driven on Vercel. Never delete its webhook
    // and never start getUpdates for it (that would create a 409 conflict).
    if (reg.siteId === DEFAULT_SITE_ID && /\/api\/rolax_webhook$/.test(String(wh?.result?.url || ""))) {
      setStat(reg.siteId, { status: "online", username: me.result?.username, mode: "python" });
      return;
    }
    // User-uploaded polling bots: an old webhook would block getUpdates.
    if (wh?.result?.url) await tg(reg.token, "deleteWebhook", { drop_pending_updates: false });

    const upd = await tg(reg.token, `getUpdates?offset=${(prev?.updateOffset || 0) + 1}&limit=20&timeout=0`);
    if (!upd?.ok) {
      setStat(reg.siteId, { status: "error", lastError: upd?.description || "getUpdates fail", username: me.result?.username });
      return;
    }
    const updates: any[] = upd.result || [];
    let offset = prev?.updateOffset || 0;
    let responses = prev?.responses || 0;
    let lastReplyAt = prev?.lastReplyAt;
    let lastMessage = prev?.lastMessage;
    let lastError: string | undefined;

    for (const u of updates) {
      offset = Math.max(offset, u.update_id || 0);
      const msg = u.message || u.edited_message || u.channel_post;
      if (!msg?.chat?.id) continue;
      const text: string = msg.text || msg.caption || "";
      if (!text) continue;
      const py = await pyReply(reg, text);
      const reply = py.reply || `🤖 "${text.slice(0, 30)}" ka koi handler aapke code me nahi mila.\n\n/help try karo.`;
      const sent = await tg(reg.token, "sendMessage", { chat_id: msg.chat.id, text: reply.slice(0, 4000), reply_to_message_id: msg.message_id });
      if (sent?.ok) { responses++; lastReplyAt = new Date().toISOString(); lastMessage = text.slice(0, 60); }
      else lastError = sent?.description || "sendMessage fail";
    }

    setStat(reg.siteId, {
      status: "online", username: me.result?.username, updateOffset: offset,
      responses, lastReplyAt, lastMessage, lastError, errors: lastError ? (prev?.errors || 0) + 1 : prev?.errors || 0,
      mode: "python",
    });
  } catch (e: any) {
    setStat(reg.siteId, { status: "error", lastError: e?.message || "watchdog error" });
  } finally {
    g.busy.delete(reg.siteId);
  }
}

function startWatchdog() {
  loadFromDisk();
  if (g.timer) return;
  g.timer = setInterval(async () => {
    const bots = [...g.bots.values()];
    for (const b of bots) await tickBot(b);
  }, TICK_MS);
  // pehla tick turant
  setTimeout(() => { [...g.bots.values()].forEach(b => tickBot(b)); }, 500);
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const token = String(body.token || "").trim();
  if (!/^\d{6,12}:[A-Za-z0-9_-]{20,60}$/.test(token)) {
    return NextResponse.json({ ok: false, error: "Valid bot token chahiye (123456:AA...)" }, { status: 400 });
  }
  const siteId = String(body.siteId || "site_" + Date.now());
  const files = Array.isArray(body.files) ? body.files : [];
  const isPy = files.some((f: any) => /\.py$/i.test(f?.name || ""));
  const entry = String(body.entry || files.find((f: any) => /\.py$/i.test(f?.name || ""))?.name || "bot.py");

  const reg: Reg = {
    siteId, token, name: String(body.name || "bot"), entry, files,
    expiresAt: body.expiresAt, ownerEmail: body.ownerEmail, addedAt: new Date().toISOString(),
  };
  g.bots.set(siteId, reg);
  saveToDisk();
  startWatchdog();

  // verify + pehla check (asli python)
  const me = await tg(token, "getMe");
  if (!me?.ok) {
    setStat(siteId, { status: "error", lastError: me?.description || "Token invalid" });
    return NextResponse.json({ ok: false, error: me?.description || "Token invalid — @BotFather se naya lo", username: undefined }, { status: 200 });
  }
  const py = isPy ? await pyReply(reg, "/start") : { reply: "", commands: [], ok: true };
  setStat(siteId, { status: "online", username: me.result?.username, mode: isPy ? "python" : "js", responses: g.stats.get(siteId)?.responses || 0 });

  return NextResponse.json({
    ok: true, siteId, mode: isPy ? "python" : "js",
    username: me.result?.username, botId: me.result?.id,
    commands: py.commands || [], sampleReply: py.reply || "",
    pyLoaded: py.ok, pyError: py.error || "",
    watchdog: "server-side, har 5s",
  });
}

export async function GET(req: NextRequest) {
  loadFromDisk();
  loadDefaultBotFromEnvironment();
  const webhook = await ensureDefaultWebhook(req);
  startWatchdog();
  // Do one synchronous health check before replying. Previously the first
  // admin/dashboard request returned `stat: null` or `starting` and the UI
  // appeared unresponsive until the next interval tick.
  const defaultBot = g.bots.get(DEFAULT_SITE_ID);
  if (defaultBot) await tickBot(defaultBot);
  return NextResponse.json({
    ok: true,
    watchdog: !!g.timer,
    count: g.bots.size,
    webhook: webhook.ok ? webhook.url : undefined,
    bots: [...g.bots.values()].map(b => ({ siteId: b.siteId, name: b.name, entry: b.entry, files: b.files.length, stat: g.stats.get(b.siteId) || null })),
  });
}

export async function DELETE(req: NextRequest) {
  loadFromDisk();
  const siteId = req.nextUrl.searchParams.get("siteId") || "";
  g.bots.delete(siteId);
  g.stats.delete(siteId);
  saveToDisk();
  return NextResponse.json({ ok: true, removed: siteId });
}
