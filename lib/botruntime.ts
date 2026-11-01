"use client";
// ROLAX HOST — 24/7 bot runtime engine
// Bot ka polling loop site ke andar hi chalta hai: getUpdates -> command match -> sendMessage.
// Isse bot chat me asli jawab deta hai (plugin architecture: har uploaded .py/.js se commands nikale jaate hain).

export type BotCommand = {
  trigger: string;          // "start", "help", "price" ...
  reply: string;            // asli reply text
  source: string;           // "bot.py" line info
};

export type BotRuntimeState = {
  status: "offline" | "starting" | "online" | "error" | "webhook";
  username?: string;
  lastUpdateId?: number;
  lastMessage?: string;
  lastReplyAt?: string;
  responses: number;
  errors: number;
  lastError?: string;
  startedAt?: string;
  commands: BotCommand[];
};

export const DEFAULT_REPLIES: Record<string, string> = {
  start: "👋 Welcome! Ye bot ROLAX HOST pe 24/7 chal raha hai.\n\nCommands:\n/help — sahayata\n/price — hosting plans\n/status — bot status",
  help: "🤖 ROLAX HOST Bot\n\n/start — shuru karo\n/price — plans aur pricing\n/status — uptime check\n\nSupport: t.me/Rolax112",
  price: "💎 ROLAX HOST Plans:\n• Starter — Free\n• Pro — $4.99 / 1 month\n• Enterprise — $14.99 / 1 month\n\nPayment: BNB / USDT (BEP-20 only)\nDetails: t.me/Rolax112",
  status: "✅ Bot online — 24/7 hosted on ROLAX HOST",
};

/** Uploaded code se commands + unke replies nikalo */
export function extractCommands(files: { name: string; content: string }[]): BotCommand[] {
  const out: BotCommand[] = [];
  const seen = new Set<string>();
  const add = (trigger: string, reply: string, source: string) => {
    const t = trigger.toLowerCase().replace(/^\//, "").trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push({ trigger: t, reply, source });
  };

  for (const f of files) {
    const lines = f.content.split("\n");

    // Python: @bot.message_handler(commands=['start']) ... bot.reply_to(message, "text")
    lines.forEach((line, i) => {
      const cmdMatch = line.match(/commands\s*=\s*\[([^\]]+)\]/i) || line.match(/CommandHandler\(\s*["']([^"']+)["']/i);
      if (!cmdMatch) return;
      const triggers = cmdMatch[1].match(/["']([a-zA-Z0-9_]+)["']/g)?.map(s => s.replace(/["']/g, "")) || [];
      // next 15 lines me reply dhoondo
      const window = lines.slice(i, i + 15).join("\n");
      const replyMatch = window.match(/(?:reply_to|send_message|answer|reply)\([^,)]*,?\s*(?:text\s*=\s*)?[fr]?["']([^"']{3,400})["']/i)
        || window.match(/["']([^"']{5,400})["']/);
      const reply = replyMatch?.[1] || "";
      triggers.forEach(t => add(t, reply || `/${t} — ROLAX HOST bot`, `${f.name}:${i + 1}`));
    });

    // Node: bot.onText(/\/start/, ...) ya bot.command('start', ...)
    lines.forEach((line, i) => {
      const m1 = line.match(/onText\(\s*\/\\?\/([a-zA-Z0-9_]+)/);
      const m2 = line.match(/\.command\(\s*["']([a-zA-Z0-9_]+)["']/);
      const trig = m1?.[1] || m2?.[1];
      if (!trig) return;
      const window = lines.slice(i, i + 15).join("\n");
      const replyMatch = window.match(/(?:sendMessage|reply)\([^,]*,\s*[`"']([^`"']{3,400})[`"']/i);
      add(trig, replyMatch?.[1] || `/${trig} — ROLAX HOST bot`, `${f.name}:${i + 1}`);
    });

    // Python telegraf-style string handlers: "@bot.message_handler(func=lambda message: True)"
    if (/message_handler\(func\s*=/.test(f.content) && !out.some(c => c.source.startsWith(f.name))) {
      add("hello", "Bot online hai — ROLAX HOST 24/7 ✅", `${f.name} (func handler)`);
    }
  }

  return out;
}

/** Default + extracted commands ka merged map */
export function commandMap(commands: BotCommand[]): Record<string, string> {
  const map: Record<string, string> = { ...DEFAULT_REPLIES };
  commands.forEach(c => { if (c.reply && !map[c.trigger]) map[c.trigger] = c.reply; });
  return map;
}

export function replyFor(text: string, commands: BotCommand[]): string {
  const map = commandMap(commands);
  const norm = (text || "").trim().toLowerCase();
  if (!norm) return map.help;
  const bare = norm.replace(/^\//, "").split(/\s+/)[0];
  if (map[bare]) return map[bare];
  if (map[norm]) return map[norm];
  if (/^(hi|hello|hey|namaste|hlo)\b/.test(norm)) return "👋 Namaste! /help likho commands ke liye. — ROLAX HOST";
  if (/price|plan|cost|rate|paisa/i.test(norm)) return map.price;
  return `🤖 Ye command support me nahi hai: "${text.slice(0, 40)}"\n\n/help likho available commands ke liye.\nSupport: t.me/Rolax112`;
}
