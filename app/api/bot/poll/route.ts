import { NextRequest, NextResponse } from "next/server";
import type { BotCommand } from "@/lib/botruntime";
import { DEFAULT_REPLIES } from "@/lib/botruntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const API = process.env.TELEGRAM_API_BASE || "https://api.telegram.org";

// per-bot processed update ids (double reply rokne ke liye)
const processed = new Map<string, number>();

type Body = {
  token?: string;
  since?: number;
  commands?: BotCommand[];
  timeout?: number;
  ownerName?: string;
};

/** Deprecated endpoints: agar webhook lag chuka hai to polling possible nahi — auto clean */
async function cleanWebhook(token: string) {
  try {
    const info = await fetch(`${API}/bot${token}/getWebhookInfo`, { cache: "no-store" });
    const j = await info.json().catch(() => null);
    const url = j?.result?.url || "";
    if (url) {
      await fetch(`${API}/bot${token}/deleteWebhook?drop_pending_updates=false`, { cache: "no-store" });
      return { removed: url };
    }
  } catch { /* ignore */ }
  return { removed: "" };
}

function managerToken() {
  return String(process.env.ROLAX_MAIN_BOT_TOKEN || process.env.BOT_TOKEN || "").trim();
}

function isManagerBot(token: string) {
  const configured = managerToken();
  return Boolean(configured) && token === configured;
}

function buildMap(commands: BotCommand[] | undefined): Record<string, string> {
  const map: Record<string, string> = { ...DEFAULT_REPLIES };
  (commands || []).forEach(c => { if (c?.trigger && c?.reply && !map[c.trigger]) map[c.trigger] = c.reply; });
  return map;
}

function answer(text: string, map: Record<string, string>, botName?: string): string {
  const norm = (text || "").trim().toLowerCase();
  if (!norm) return map.help;
  const bare = norm.replace(/^\//, "").split(/\s+/)[0];
  if (map[bare]) return map[bare];
  if (/^(hi|hello|hey|namaste|hlo|hlw)\b/.test(norm)) return `👋 Namaste! Main ${botName || "ROLAAX HOST bot"} hoon — 24/7 online.\n\n/help likho commands ke liye.`;
  if (/price|plan|cost|rate|paisa|kitna/i.test(norm)) return map.price;
  if (/status|online|alive|uptime/i.test(norm)) return `${map.status}\n\nBot: ${botName || "ROLAAX bot"}`;
  return `🤖 Ye command support me nahi hai: "${text.slice(0, 40)}"\n\n/help likho available commands ke liye.\nSupport: t.me/Rolax112`;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const token = (body.token || "").trim();
  if (!/^\d{6,12}:[A-Za-z0-9_-]{20,60}$/.test(token)) {
    return NextResponse.json({ ok: false, error: "Valid bot token required" }, { status: 400 });
  }
  // The manager bot is webhook-driven. Never let the legacy browser polling
  // endpoint delete its webhook, because that also removes the encrypted user
  // snapshot carried in the webhook URL.
  if (isManagerBot(token)) {
    return NextResponse.json({ ok: false, protected: true, error: "Manager bot webhook is protected; polling is disabled." }, { status: 409 });
  }

  const map = buildMap(body.commands);

  try {
    // 1. verify bot
    const meRes = await fetch(`${API}/bot${token}/getMe`, { cache: "no-store" });
    const me = await meRes.json();
    if (!me?.ok) {
      return NextResponse.json({ ok: false, error: me?.description || "Token invalid", fatal: true }, { status: 200 });
    }

    // 2. webhook laga ho to polling fail hoti hai -> auto remove (auto-fix)
    const cleaned = await cleanWebhook(token);

    // 3. ek poll: purane updates + naye
    const updatesRes = await fetch(`${API}/bot${token}/getUpdates?offset=-1&limit=100&timeout=0`, { cache: "no-store" });
    const upd = await updatesRes.json();
    if (!upd?.ok) {
      return NextResponse.json({ ok: false, error: upd?.description || "getUpdates failed", bot: me.result }, { status: 200 });
    }

    const key = token.slice(-12);
    const seen = Math.max(processed.get(key) || 0, Number(body.since) || 0);
    const updates: any[] = (upd.result || []).filter((u: any) => (u.update_id || 0) > seen);
    let lastId = seen;
    const replies: { to: string; text: string }[] = [];
    let skipped = 0;

    for (const u of updates) {
      lastId = Math.max(lastId, u.update_id || 0);
      const msg = u.message || u.edited_message || u.channel_post;
      if (!msg) continue;
      const text: string = msg.text || msg.caption || "";
      if (!text) continue;
      const chatId = msg.chat?.id;
      if (!chatId) continue;
      const reply = answer(text, map, me.result?.username ? "@" + me.result.username : undefined);

      const send = await fetch(`${API}/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: reply,
          disable_web_page_preview: true,
          reply_to_message_id: msg.message_id,
        }),
        cache: "no-store",
      });
      const sent = await send.json().catch(() => null);
      if (sent?.ok) replies.push({ to: String(chatId), text: reply.slice(0, 60) });
      else skipped++;
    }

    if (lastId > 0) processed.set(key, lastId);
    if (processed.size > 200) processed.clear();

    return NextResponse.json({
      ok: true,
      bot: { username: me.result?.username, id: me.result?.id, first_name: me.result?.first_name },
      webhookRemoved: cleaned.removed || null,
      updateCount: updates.length,
      skipped,
      lastUpdateId: lastId,
      replies,
      polledAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Network: " + (e?.message || "telegram unreachable") }, { status: 200 });
  }
}
