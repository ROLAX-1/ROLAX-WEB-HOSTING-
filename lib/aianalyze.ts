"use client";
// Uploaded project ka AI analysis — kisne kya host kiya, kaunsa bot, kaun se commands, kya kaam karta hai
import type { Website } from "./store";

export type ProjectAnalysis = {
  kind: "Telegram Bot" | "Discord Bot" | "Web App" | "Static Website" | "Python Script" | "Node Script" | "Unknown";
  stack: "Python" | "Node.js" | "HTML" | "Unknown";
  summary: string;
  runs: string[];            // kya kya kaam karta hai
  commands: { trigger: string; reply: string }[];
  routes: string[];
  envKeys: string[];
  entryFile?: string;
  packages: string[];
  riskFlags: string[];
  files: string[];
  lineCount: number;
};

const PACKAGE_MAP: Record<string, string> = {
  telebot: "pyTelegramBotAPI", telegram: "python-telegram-bot", aiogram: "aiogram",
  discord: "discord.py", flask: "Flask", fastapi: "fastapi", django: "Django",
  requests: "requests", dotenv: "python-dotenv", PIL: "Pillow", numpy: "numpy", pandas: "pandas",
};

export function analyzeProject(site: Website): ProjectAnalysis {
  const files = (site.src || []) as { name: string; content: string }[];
  const all = files.map(f => f.content).join("\n");
  const names = files.map(f => f.name).join(" ");
  const lineCount = all.split("\n").length;
  const isPy = /\.py\b/i.test(names) || /\bdef \w+\(/.test(all);
  const isJs = /\.(js|mjs|ts)\b/i.test(names);
  const isHtml = /\.html?\b/i.test(names);

  const telegram = /telebot|aiogram|python-telegram-bot|node-telegram-bot-api|telegraf|grammy|api\.telegram\.org|BotFather/i.test(all + " " + names);
  const discord = /discord\.(js|py)|discord\.Client|discord\.Intents|nextcord/i.test(all);
  const web = /flask|fastapi|django|uvicorn|express\(|fastify|createServer|app\.run\(/i.test(all);
  const hasHtmlContent = files.some(f => /\.html?$/i.test(f.name) && /<(html|body|h1|div)/i.test(f.content));

  const kind =
    telegram ? (discord ? "Telegram Bot" : "Telegram Bot")
    : discord ? "Discord Bot"
    : web && isPy ? "Web App"
    : web && isJs ? "Web App"
    : hasHtmlContent ? "Static Website"
    : isPy ? "Python Script"
    : isJs ? "Node Script"
    : "Unknown";

  const stack = isPy ? "Python" : isJs ? "Node.js" : hasHtmlContent ? "HTML" : "Unknown";

  /* commands */
  const commands: { trigger: string; reply: string }[] = [];
  files.forEach(f => {
    const lines = f.content.split("\n");
    lines.forEach((line, i) => {
      const cmdMatch = line.match(/commands\s*=\s*\[([^\]]+)\]/i) || line.match(/\.command\(\s*["']([^"']+)["']/i) || line.match(/onText\(\s*\/\\?\/([a-zA-Z0-9_]+)/);
      if (!cmdMatch) return;
      const triggers = cmdMatch[1].match(/["']([a-zA-Z0-9_]+)["']/g)?.map(x => x.replace(/["']/g, "")) || [cmdMatch[1]];
      const window = lines.slice(i, i + 15).join("\n");
      const reply = window.match(/(?:reply_to|send_message|sendMessage|reply|answer)\s*\([^,)]*,?\s*(?:text\s*=\s*)?[fr]?["'`]([^"'`]{3,300})["'`]/i)?.[1] || "";
      triggers.forEach(t => { if (t && !commands.some(c => c.trigger === t)) commands.push({ trigger: t, reply }); });
    });
  });

  /* routes */
  const routes = Array.from(new Set((all.match(/(?:@app\.(?:get|post|route)|app\.(?:get|post)|router\.(?:get|post)|@router\.(?:get|post))\s*\(\s*["']([^"']+)["']/g) || []).map(m => m.replace(/.*["']([^"']+)["'].*/, "$1"))));

  /* env */
  const envKeys = Array.from(new Set([
    ...(all.match(/os\.(?:environ\.get|getenv)\(\s*["']([A-Z0-9_]+)["']/g) || []).map(m => m.replace(/.*["']([A-Z0-9_]+)["'].*/, "$1")),
    ...(all.match(/process\.env\.([A-Z0-9_]+)/g) || []).map(m => m.replace("process.env.", "")),
    ...(files.find(f => /(^|\/)\.env$/.test(f.name))?.content.split("\n").map(l => l.split("=")[0].trim()).filter(Boolean) || []),
  ]));

  /* packages */
  const imports = Array.from(new Set(
    (all.match(/^\s*(?:from|import)\s+([a-zA-Z0-9_]+)/gm) || []).map(m => m.replace(/^\s*(?:from|import)\s+/, ""))
  )).filter(m => !["os", "sys", "time", "json", "random", "asyncio", "logging", "datetime", "re", "math", "typing", "threading", "subprocess", "io", "traceback"].includes(m));
  const nodeDeps = Array.from(new Set((all.match(/require\(\s*["']([^"'.][^"']*)["']\s*\)/g) || []).map(m => m.replace(/.*["']([^"']+)["'].*/, "$1").split("/")[0])));
  const packages = Array.from(new Set([...imports.map(i => PACKAGE_MAP[i] || i), ...nodeDeps]));

  /* runs — kya kaam karta hai */
  const runs: string[] = [];
  if (telegram) runs.push(`Telegram bot — ${commands.length || 0} command(s) handle karta hai`);
  if (discord) runs.push("Discord bot — server events handle karta hai");
  if (routes.length) runs.push(`${routes.length} web route(s): ${routes.slice(0, 5).join(", ")}`);
  if (hasHtmlContent) runs.push("Website serve karta hai (HTML page)");
  if (/sqlite3|pymongo|psycopg|mysql|prisma|sequelize|mongoose/i.test(all)) runs.push("Database use karta hai");
  if (/cron|schedule|while True|setInterval/i.test(all)) runs.push("Background loop / scheduler chalta hai");
  if (/requests\.|axios|fetch\(/i.test(all)) runs.push("External API calls karta hai");
  if (/open\(|write\(|save\(/i.test(all)) runs.push("File read/write karta hai");
  if (!runs.length) runs.push("Simple script — koi network/service kaam detect nahi hua");

  /* risk flags */
  const riskFlags: string[] = [];
  if (/["']\d{6,12}:[A-Za-z0-9_-]{25,60}["']/.test(all) && !/getenv|environ|process\.env/.test(all)) riskFlags.push("Bot token code me hardcoded hai (leak risk) — .env me daalo");
  if (/rm -rf|os\.remove|shutil\.rmtree/.test(all)) riskFlags.push("File delete operations hain — dhyan se chalao");
  if (/eval\(|exec\(/.test(all)) riskFlags.push("eval/exec use hua hai — untrusted input se bachao");
  if (/SUDO|sudo /.test(all)) riskFlags.push("sudo command mila — hosting me allow nahi hoga");
  if (/subprocess|child_process/.test(all)) riskFlags.push("Shell commands chalata hai (subprocess)");
  if (envKeys.length && !files.some(f => /(^|\/)\.env$/.test(f.name))) riskFlags.push(".env file missing hai (AI Auto-Fix se ban jayegi)");
  if (lineCount > 4000) riskFlags.push("Code bahut bada hai (4000+ lines) — review karo");

  const entryFile = site.entryFile || files.find(f => /^(bot|main|app|index)\.(py|js)$/i.test(f.name))?.name || files[0]?.name;

  const summary = `${kind} (${stack}) — ${files.length} file(s), ~${lineCount} lines` +
    (commands.length ? `, ${commands.length} command` : "") +
    (routes.length ? `, ${routes.length} route` : "") +
    (packages.length ? `, ${packages.length} package` : "");

  return { kind, stack, summary, runs, commands, routes, envKeys, entryFile, packages, riskFlags, files: files.map(f => f.name), lineCount };
}
