import { NextRequest, NextResponse } from "next/server";

// Server-side Telegram API bridge — token browser me CORS/leak ke bina verify + webhook control
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API = process.env.TELEGRAM_API_BASE || "https://api.telegram.org";

type Body = {
  action: "getMe" | "getWebhookInfo" | "setWebhook" | "deleteWebhook" | "getUpdates" | "setMyCommands";
  token?: string;
  url?: string;
  dropPendingUpdates?: boolean;
};

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body");
  }

  const { action, token } = body;
  if (!action) return bad("action required");
  if (!token || typeof token !== "string" || !/^\d{6,12}:[A-Za-z0-9_-]{20,60}$/.test(token.trim())) {
    return bad("Valid bot token required (format: 123456789:AA...)");
  }

  const t = token.trim();
  const manager = String(process.env.ROLAX_MAIN_BOT_TOKEN || process.env.BOT_TOKEN || "").trim();
  // The manager bot's webhook URL contains the encrypted user/plan snapshot.
  // Generic webhook controls must not replace or delete it with a clean URL.
  if (manager && t === manager && (action === "setWebhook" || action === "deleteWebhook")) {
    return bad("Manager bot webhook is protected; use the durable webhook state flow.", 409);
  }

  try {
    if (action === "getMe") {
      const r = await fetch(`${API}/bot${t}/getMe`, { cache: "no-store" });
      const j = await r.json();
      return NextResponse.json(j, { status: 200 });
    }

    if (action === "getWebhookInfo") {
      const r = await fetch(`${API}/bot${t}/getWebhookInfo`, { cache: "no-store" });
      const j = await r.json();
      return NextResponse.json(j, { status: 200 });
    }

    if (action === "getUpdates") {
      const r = await fetch(`${API}/bot${t}/getUpdates?limit=1&offset=-1`, { cache: "no-store" });
      const j = await r.json();
      return NextResponse.json(j, { status: 200 });
    }

    if (action === "setWebhook") {
      if (!body.url || !/^https:\/\//i.test(body.url)) return bad("https URL required for webhook");
      const r = await fetch(`${API}/bot${t}/setWebhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: body.url, drop_pending_updates: !!body.dropPendingUpdates, allowed_updates: ["message", "callback_query", "inline_query", "channel_post"] }),
        cache: "no-store",
      });
      const j = await r.json();
      return NextResponse.json(j, { status: 200 });
    }

    if (action === "deleteWebhook") {
      const r = await fetch(`${API}/bot${t}/deleteWebhook?drop_pending_updates=${body.dropPendingUpdates ? "true" : "false"}`, { cache: "no-store" });
      const j = await r.json();
      return NextResponse.json(j, { status: 200 });
    }

    if (action === "setMyCommands") {
      const r = await fetch(`${API}/bot${t}/setMyCommands`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commands: [{ command: "start", description: "Main menu" }] }),
        cache: "no-store",
      });
      const j = await r.json();
      return NextResponse.json(j, { status: 200 });
    }

    return bad("Unknown action");
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Telegram API unreachable: " + (e?.message || "network error") }, { status: 502 });
  }
}
