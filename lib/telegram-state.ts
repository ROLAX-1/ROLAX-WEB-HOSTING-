import { createHmac, timingSafeEqual } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";
import type { NextRequest } from "next/server";

/**
 * Small encrypted fallback store carried by the manager bot's webhook URL.
 * PostgreSQL is preferred, but the linked project already has a Telegram
 * secret and a durable webhook configuration. Keeping this fallback here
 * prevents user/plan state from disappearing when DATABASE_URL is not yet
 * attached. It is bounded by Telegram's webhook URL size limit; callers must
 * surface `too_large` instead of pretending it was saved.
 */
export type TelegramState = {
  version?: number;
  users?: Record<string, any>;
  website_users?: Record<string, any>;
  [key: string]: any;
};

type ReadResult = {
  ok: boolean;
  durable: boolean;
  state: TelegramState;
  webhookUrl: string;
  error?: string;
};

const API = process.env.TELEGRAM_API_BASE || "https://api.telegram.org";
const MAX_WEBHOOK_URL = 7000;

function token() {
  return String(process.env.ROLAX_MAIN_BOT_TOKEN || process.env.BOT_TOKEN || "").trim();
}

function keyFor(botToken: string) {
  return createHmac("sha256", botToken).update("rolax-user-state-v1").digest();
}

function stream(key: Buffer, nonce: Buffer, size: number) {
  const chunks: Buffer[] = [];
  let total = 0;
  for (let counter = 0; total < size; counter += 1) {
    const c = Buffer.allocUnsafe(4);
    c.writeUInt32BE(counter, 0);
    const part = createHmac("sha256", key).update(Buffer.concat([nonce, c])).digest();
    chunks.push(part);
    total += part.length;
  }
  return Buffer.concat(chunks).subarray(0, size);
}

export function openTelegramState(encoded: string, botToken = token()): TelegramState | null {
  if (!encoded || !botToken) return null;
  try {
    const blob = Buffer.from(encoded, "base64url");
    if (blob.length < 34 || blob.subarray(0, 2).toString() !== "v1") return null;
    const nonce = blob.subarray(2, 18);
    const tag = blob.subarray(18, 34);
    const cipher = blob.subarray(34);
    const key = keyFor(botToken);
    const expected = createHmac("sha256", key).update(Buffer.concat([Buffer.from("v1"), nonce, cipher])).digest().subarray(0, 16);
    if (tag.length !== expected.length || !timingSafeEqual(tag, expected)) return null;
    const packed = Buffer.alloc(cipher.length);
    const pad = stream(key, nonce, cipher.length);
    for (let i = 0; i < cipher.length; i += 1) packed[i] = cipher[i] ^ pad[i];
    const value = JSON.parse(inflateSync(packed).toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export function sealTelegramState(state: TelegramState, botToken = token()) {
  if (!botToken) return "";
  const raw = Buffer.from(JSON.stringify(state), "utf8");
  const packed = deflateSync(raw, { level: 9 });
  const key = keyFor(botToken);
  const nonce = createHmac("sha256", key).update(Buffer.concat([Buffer.from("nonce:"), packed])).digest().subarray(0, 16);
  const pad = stream(key, nonce, packed.length);
  const cipher = Buffer.alloc(packed.length);
  for (let i = 0; i < packed.length; i += 1) cipher[i] = packed[i] ^ pad[i];
  const tag = createHmac("sha256", key).update(Buffer.concat([Buffer.from("v1"), nonce, cipher])).digest().subarray(0, 16);
  return Buffer.concat([Buffer.from("v1"), nonce, tag, cipher]).toString("base64url");
}

async function telegram(tokenValue: string, method: string, body?: any) {
  try {
    const response = body === undefined
      ? await fetch(`${API}/bot${tokenValue}/${method}`, { cache: "no-store" })
      : await fetch(`${API}/bot${tokenValue}/${method}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        });
    return await response.json().catch(() => null);
  } catch {
    return null;
  }
}

function originFor(req: NextRequest) {
  const configured = process.env.ROLAX_WEBHOOK_BASE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || req.nextUrl.origin;
  const value = String(configured || "").trim().replace(/\/$/, "");
  if (!value) return "";
  return value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`;
}

function webhookSecret(botToken: string) {
  return createHmac("sha256", botToken).update(`rolax-webhook:${botToken}`).digest("hex").slice(0, 32);
}

export async function readTelegramState(req: NextRequest): Promise<ReadResult> {
  const botToken = token();
  if (!botToken) return { ok: false, durable: false, state: { version: 1, users: {}, website_users: {} }, webhookUrl: "", error: "manager bot token is not configured" };
  const info = await telegram(botToken, "getWebhookInfo");
  const webhookUrl = String(info?.result?.url || "");
  let encoded = "";
  try { encoded = new URL(webhookUrl).searchParams.get("state") || ""; } catch { /* no webhook yet */ }
  const decoded = encoded ? openTelegramState(encoded, botToken) : null;
  if (encoded && !decoded) {
    return { ok: false, durable: false, state: { version: 1, users: {}, website_users: {} }, webhookUrl, error: "state_invalid" };
  }
  const state = decoded || { version: 1, users: {}, website_users: {} };
  if (!state.website_users || typeof state.website_users !== "object" || Array.isArray(state.website_users)) state.website_users = {};
  if (!state.users || typeof state.users !== "object" || Array.isArray(state.users)) state.users = {};
  return { ok: true, durable: true, state, webhookUrl };
}

export async function writeTelegramState(req: NextRequest, state: TelegramState, currentWebhookUrl = "") {
  const botToken = token();
  if (!botToken) return { ok: false, durable: false, error: "manager bot token is not configured" };
  const encoded = sealTelegramState({ version: 1, users: {}, website_users: {}, ...state }, botToken);
  if (!encoded) return { ok: false, durable: false, error: "state encryption failed" };
  const origin = originFor(req);
  let url = currentWebhookUrl;
  if (!url) {
    url = `${origin.replace(/\/$/, "")}/api/rolax_webhook`;
  }
  try {
    const parsed = new URL(url);
    parsed.pathname = "/api/rolax_webhook";
    parsed.searchParams.set("state", encoded);
    url = parsed.toString();
  } catch {
    url = `${origin.replace(/\/$/, "")}/api/rolax_webhook?state=${encodeURIComponent(encoded)}`;
  }
  if (!url || url.length > MAX_WEBHOOK_URL) {
    return { ok: false, durable: false, error: "state_too_large" };
  }
  const result = await telegram(botToken, "setWebhook", {
    url,
    drop_pending_updates: false,
    max_connections: 1,
    secret_token: webhookSecret(botToken),
    allowed_updates: ["message", "edited_message", "callback_query", "channel_post"],
  });
  if (!result?.ok) return { ok: false, durable: false, error: "Telegram webhook state write failed" };
  return { ok: true, durable: true, webhookUrl: url };
}
