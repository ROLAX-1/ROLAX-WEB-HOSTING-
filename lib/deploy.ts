"use client";
// ROLAX HOST - REAL deploy verification pipeline
// File padhta hai, bot type detect karta hai, Telegram token ko asli Telegram API se verify karta hai.
import JSZip from "jszip";

export type CheckLevel = "ok" | "warn" | "error";

export type Check = {
  code: string;
  title: string;
  detail: string;
  level: CheckLevel;
  fixable: boolean;
};

export type DeployReport = {
  ok: boolean;
  botType: string;
  fileType: string;
  stack: string;
  checks: Check[];
  errors: Check[];
  warnings: Check[];
  botUsername?: string;
  tokenMasked?: string;
  fileCount: number;
  fileSize: string;
  files: string[];
  entryFile?: string;
  fixedSource?: string;      // agar auto-transform hua
  generatedFiles?: { name: string; content: string }[];
  startedAt: string;
  finishedAt: string;
};

export type UploadedSource = {
  files: { name: string; content: string }[];
  binaryCount: number;
  totalBytes: number;
  zipName?: string;
};

const MAX_TEXT = 200_000; // per file read cap

/* ----------------------------- file reading ----------------------------- */

export async function readUpload(file: File | null, extraFiles?: FileList | null): Promise<UploadedSource> {
  const list: File[] = [];
  if (file) list.push(file);
  if (extraFiles) Array.from(extraFiles).forEach(f => list.push(f));
  if (!list.length) return { files: [], binaryCount: 0, totalBytes: 0 };

  const out: { name: string; content: string }[] = [];
  let binaryCount = 0;
  let totalBytes = 0;

  for (const f of list) {
    totalBytes += f.size;
    if (f.name.toLowerCase().endsWith(".zip")) {
      const zip = await JSZip.loadAsync(f);
      const entries = Object.values(zip.files).filter(e => !e.dir);
      for (const entry of entries.slice(0, 200)) {
        const name = entry.name.replace(/^.*\//, "");
        const isText = /\.(py|js|ts|json|txt|md|html|css|env|yml|yaml|toml|cfg|ini|sh)$/i.test(entry.name) || /(^|\/)\.env/.test(entry.name) || /(^|\/)Dockerfile$/.test(entry.name) || /requirements/i.test(entry.name);
        if (!isText) { binaryCount++; continue; }
        const content = await entry.async("string");
        out.push({ name: entry.name.includes("/") ? name : entry.name, content: content.slice(0, MAX_TEXT) });
      }
      continue;
    }
    const isText = /\.(py|js|ts|json|txt|md|html|css|env|yml|yaml|toml|cfg|ini|sh)$/i.test(f.name) || /(^|\/)\.env/.test(f.name);
    if (!isText) { binaryCount++; continue; }
    const content = (await f.text()).slice(0, MAX_TEXT);
    out.push({ name: f.name, content });
  }

  return { files: out, binaryCount, totalBytes, zipName: list.find(f => f.name.toLowerCase().endsWith(".zip"))?.name };
}

export function findFile(src: UploadedSource, re: RegExp) {
  return src.files.find(f => re.test(f.name) || re.test(f.name.split("/").pop() || ""));
}

export function entryFileOf(src: UploadedSource): string | undefined {
  const priority = [
    /^(bot|main|app|index)\.py$/i,
    /^(bot|main|app|index|server)\.js$/i,
    /^index\.html$/i,
    /\.py$/i,
    /\.js$/i,
  ];
  const names = src.files.map(f => f.name);
  for (const re of priority) {
    const hit = names.find(n => re.test(n.split("/").pop() || ""));
    if (hit) return hit;
  }
  return names[0];
}

/* ----------------------------- detection ----------------------------- */

export type BotKind = "telegram-python" | "telegram-node" | "discord-python" | "discord-node" | "web-python" | "web-node" | "static" | "unknown";

export function detectBotKind(src: UploadedSource): { kind: BotKind; botType: string; fileType: string; stack: string } {
  const all = src.files.map(f => f.content).join("\n");
  const names = src.files.map(f => f.name.toLowerCase()).join(" ");
  const py = src.files.some(f => f.name.endsWith(".py"));
  const js = src.files.some(f => /\.(js|ts)$/.test(f.name));
  const html = src.files.some(f => f.name.endsWith(".html"));

  const telegram = /telebot|pyTelegramBotAPI|aiogram|python-telegram-bot|from telegram|node-telegram-bot-api|telegraf|grammy|BotFather|api\.telegram\.org/i.test(all + " " + names);
  const discord = /discord\.js|discord\.py|discord\.Client|discord\.Intents|nextcord|discord\.ext/i.test(all);
  const web = /flask|fastapi|django|uvicorn|express\(|fastify|createServer|listen\(/i.test(all);

  if (telegram && py) return { kind: "telegram-python", botType: "Telegram Bot (Python)", fileType: "Python Bot", stack: "Python" };
  if (telegram && js) return { kind: "telegram-node", botType: "Telegram Bot (Node.js)", fileType: "Node.js Bot", stack: "Node.js" };
  if (discord && py) return { kind: "discord-python", botType: "Discord Bot (Python)", fileType: "Python Bot", stack: "Python" };
  if (discord && js) return { kind: "discord-node", botType: "Discord Bot (Node.js)", fileType: "Node.js Bot", stack: "Node.js" };
  if (web && py) return { kind: "web-python", botType: "Python Web App", fileType: "Python App", stack: "Python" };
  if (web && js) return { kind: "web-node", botType: "Node.js Web App", fileType: "Node.js App", stack: "Node.js" };
  if (html) return { kind: "static", botType: "Static Site", fileType: "HTML Website", stack: "HTML" };
  if (py) return { kind: "unknown", botType: "Python App (auto-detect)", fileType: "Python File", stack: "Python" };
  if (js) return { kind: "unknown", botType: "Node App (auto-detect)", fileType: "Node.js File", stack: "Node.js" };
  return { kind: "unknown", botType: "Unknown", fileType: "Unknown", stack: "HTML" };
}

/* ----------------------------- checks ----------------------------- */

export function extractTelegramToken(src: UploadedSource): string | null {
  const all = src.files.map(f => f.content).join("\n");
  // Telegram token: <bot_id>:<secret> — secret length Telegram badalta rehta hai, isliye 25-60
  const m = all.match(/\b\d{6,12}:[A-Za-z0-9_-]{25,60}/);
  if (m) return m[0];
  // fallback: BOT_TOKEN="..." jaisa koi bhi env-style value
  const env = all.match(/BOT_TOKEN\s*[=:]\s*["']?([^"'\s]+)["']?/i);
  return env && /:/.test(env[1]) ? env[1] : null;
}

export function maskToken(t: string) {
  const [id, secret] = t.split(":");
  return `${id}:${(secret || "").slice(0, 4)}•••${(secret || "").slice(-3)}`;
}

function bracketBalance(code: string): { ok: boolean; detail: string } {
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  const stack: string[] = [];
  const stripped = code
    .replace(/"""[\s\S]*?"""/g, '""')
    .replace(/'''[\s\S]*?'''/g, "''")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/#.*$/gm, "")
    .replace(/`[^`]*`/g, '""');
  for (const ch of stripped) {
    if (ch === "(" || ch === "[" || ch === "{") stack.push(ch);
    else if (pairs[ch]) {
      const open = stack.pop();
      if (open !== pairs[ch]) return { ok: false, detail: `Bracket mismatch: '${ch}' ka opening nahi mila` };
    }
  }
  if (stack.length) return { ok: false, detail: `${stack.length} bracket band nahi hua (${stack.join("")})` };
  return { ok: true, detail: "Brackets balanced" };
}

function tabsSpacesMixed(code: string): boolean {
  return /^ *\t/m.test(code) || /^\t+ +/.test(code);
}

async function verifyTelegramToken(token: string): Promise<{ ok: boolean; username?: string; detail: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, { method: "GET" });
    const j = await res.json().catch(() => null);
    if (j?.ok && j?.result?.username) {
      return { ok: true, username: j.result.username, detail: `Telegram ne token verify kiya — @${j.result.username} online hai` };
    }
    const desc = j?.description || `HTTP ${res.status}`;
    return { ok: false, detail: `Telegram API: ${desc}` };
  } catch (e: any) {
    return { ok: false, detail: "Telegram API tak nahi pahucha (network/CORS) — token verify nahi ho paya" };
  }
}

export async function runDeployChecks(src: UploadedSource): Promise<DeployReport> {
  const startedAt = new Date().toISOString();
  const checks: Check[] = [];
  const det = detectBotKind(src);
  const entry = entryFileOf(src);
  const entryFile = src.files.find(f => f.name === entry);
  const allText = src.files.map(f => f.content).join("\n");
  const generated: { name: string; content: string }[] = [];

  const push = (c: Check) => checks.push(c);

  // 1. file present
  if (src.files.length === 0) {
    push({ code: "NO_SOURCE", title: "Koi readable file nahi mili", detail: src.binaryCount ? "Sirf binary files mili — .zip ke andar code hona chahiye" : "File select karo (.py / .js / .zip)", level: "error", fixable: false });
  } else {
    push({ code: "SOURCE_OK", title: `${src.files.length} code file(s) read hui`, detail: src.files.map(f => f.name).slice(0, 6).join(", ") + (src.files.length > 6 ? " ..." : ""), level: "ok", fixable: false });
  }

  // 2. entry file
  if (entryFile) {
    push({ code: "ENTRY_OK", title: `Entry file mila: ${entryFile.name}`, detail: `${entryFile.content.length} bytes padhe gaye`, level: "ok", fixable: false });
    if (entryFile.content.trim().length < 10) {
      push({ code: "EMPTY_ENTRY", title: "Entry file khali hai", detail: `${entryFile.name} me koi code nahi — kuch nahi chalega`, level: "error", fixable: false });
    }
  } else if (src.files.length) {
    push({ code: "NO_ENTRY", title: "Entry file detect nahi hui", detail: "bot.py / main.py / index.js / index.html me se koi ek hona chahiye", level: "error", fixable: false });
  }

  // 3. syntax: bracket balance
  if (entryFile) {
    const bal = bracketBalance(entryFile.content);
    push({
      code: bal.ok ? "SYNTAX_OK" : "SYNTAX_ERR",
      title: bal.ok ? "Syntax check pass" : "Syntax error mila",
      detail: bal.ok ? "Brackets/quotes balanced hain" : bal.detail,
      level: bal.ok ? "ok" : "error",
      fixable: false,
    });
  }

  // 4. tabs/spaces (python)
  const indentationFile = src.files.find(f => f.name.endsWith(".py") && tabsSpacesMixed(f.content));
  if (indentationFile) {
    push({ code: "INDENT_MIX", title: "Indentation error (tabs + spaces mix)", detail: `${indentationFile.name} me tabs aur spaces mix hain — Python isse crash karta hai`, level: "error", fixable: true });
  }

  // 5. python deps
  if (det.stack === "Python") {
    const req = findFile(src, /requirements\.txt$/i);
    const imports = Array.from(allText.matchAll(/^\s*(?:from|import)\s+([a-zA-Z0-9_]+)/gm)).map(m => m[1]);
    const thirdParty = Array.from(new Set(imports)).filter(m => !["os", "sys", "time", "json", "random", "asyncio", "logging", "datetime", "re", "math", "typing", "sqlite3", "threading", "subprocess", "requests", "dotenv"].includes(m));
    if (!req && thirdParty.length) {
      push({ code: "NO_REQUIREMENTS", title: "requirements.txt missing", detail: `Ye modules use ho rahe hain par install list nahi hai: ${thirdParty.slice(0, 5).join(", ")}`, level: "warn", fixable: true });
      generated.push({ name: "requirements.txt", content: thirdParty.map(m => m === "telebot" ? "pyTelegramBotAPI" : m === "telegram" ? "python-telegram-bot" : m).join("\n") + "\n" });
    }
    if (/os\.environ|getenv|dotenv|BOT_TOKEN|API_ID|API_HASH/i.test(allText) && !findFile(src, /(^|\/)\.env$|\.env\.example$/i)) {
      push({ code: "NO_ENV", title: ".env file nahi mili", detail: "Code env variable use kar raha hai — .env ke bina bot start hote hi crash hoga", level: "warn", fixable: false });
    }
  }

  // 6. node deps
  if (det.stack === "Node.js") {
    const pkg = findFile(src, /^package\.json$/i);
    if (!pkg) {
      push({ code: "NO_PACKAGE", title: "package.json missing", detail: "Node bot ke liye package.json chahiye — warna dependencies install nahi hongi", level: "warn", fixable: true });
      generated.push({ name: "package.json", content: JSON.stringify({ name: "rolax-bot", version: "1.0.0", main: entryFile?.name || "index.js", scripts: { start: `node ${entryFile?.name || "index.js"}` } }, null, 2) });
    } else {
      try {
        const j = JSON.parse(pkg.content);
        if (!j.scripts?.start) {
          push({ code: "NO_START_SCRIPT", title: "start script missing", detail: "package.json me 'start' script nahi — hostable nahi hai", level: "warn", fixable: true });
          generated.push({ name: "package.json", content: JSON.stringify({ ...j, scripts: { ...(j.scripts || {}), start: `node ${entryFile?.name || "index.js"}` } }, null, 2) });
        } else {
          push({ code: "START_OK", title: "start script mila", detail: j.scripts.start, level: "ok", fixable: false });
        }
      } catch {
        push({ code: "BAD_PACKAGE", title: "package.json invalid JSON", detail: "JSON parse nahi hua — dependencies install fail hongi", level: "error", fixable: true });
      }
    }
  }

  // 7. port binding
  if (entryFile && /listen\(\s*3000|port\s*=\s*3000|PORT\s*=\s*3000/.test(entryFile.content)) {
    push({ code: "HARDCODED_PORT", title: "Port 3000 hardcoded", detail: "Hosting apna PORT deta hai — hardcoded port pe bind fail hota hai", level: "error", fixable: true });
  }

  // 8. TELEGRAM BOT -> asli verification
  const isTelegram = det.kind === "telegram-python" || det.kind === "telegram-node";
  let botUsername: string | undefined;
  let tokenMasked: string | undefined;

  if (isTelegram) {
    const token = extractTelegramToken(src);
    if (!token) {
      push({
        code: "NO_TOKEN",
        title: "Bot token nahi mila — bot chat me online nahi aayega",
        detail: "Code me BOT_TOKEN set nahi hai. @BotFather se token lo aur .env ya code me daalo (BOT_TOKEN=123456:ABC...)",
        level: "error",
        fixable: false,
      });
    } else {
      tokenMasked = maskToken(token);
      const v = await verifyTelegramToken(token);
      if (v.ok) {
        botUsername = v.username;
        push({ code: "TOKEN_OK", title: `Bot verified: @${v.username}`, detail: v.detail, level: "ok", fixable: false });
      } else {
        push({ code: "TOKEN_BAD", title: "Bot token invalid hai", detail: v.detail + " — @BotFather se naya token generate karo (purana revoke ho chuka hoga)", level: "error", fixable: false });
      }
    }
  }

  // 9. discord token heuristics
  if (det.kind === "discord-python" || det.kind === "discord-node") {
    if (!/discord\.(?:Client|Bot)\(|new Client\(/.test(allText)) {
      push({ code: "DISCORD_NO_CLIENT", title: "Discord client init nahi mila", detail: "Script me client run nahi ho raha — bot online nahi aayega", level: "error", fixable: false });
    } else {
      push({ code: "DISCORD_OK", title: "Discord client init mila", detail: "Token Discord Developer Portal se verify karo (Discord API CORS block karta hai)", level: "warn", fixable: false });
    }
  }

  // 10. static site
  if (det.kind === "static") {
    const html = src.files.find(f => f.name.endsWith(".html"));
    if (html && /<html|<!doctype html/i.test(html.content)) {
      push({ code: "HTML_OK", title: "HTML structure valid", detail: `${html.name} serve ho sakta hai`, level: "ok", fixable: false });
    }
  }

  const errors = checks.filter(c => c.level === "error");
  const warnings = checks.filter(c => c.level === "warn");

  return {
    ok: errors.length === 0 && src.files.length > 0,
    botType: det.botType,
    fileType: det.fileType,
    stack: det.stack,
    checks,
    errors,
    warnings,
    botUsername,
    tokenMasked,
    fileCount: src.files.length,
    fileSize: src.totalBytes ? (src.totalBytes / 1024 / 1024).toFixed(2) + " MB" : `${(src.files.reduce((n, f) => n + f.content.length, 0) / 1024).toFixed(1)} KB`,
    files: src.files.map(f => f.name),
    entryFile: entry?.split("/").pop(),
    generatedFiles: generated.length ? generated : undefined,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

/** Auto-fix: jo fix ho sakta hai wo asli me apply karo, phir dobara verify karo */
export async function autoFixAndVerify(src: UploadedSource, report: DeployReport): Promise<{ report: DeployReport; applied: string[] }> {
  const applied: string[] = [];
  const files = src.files.map(f => ({ ...f }));

  for (const c of report.errors.concat(report.warnings)) {
    if (!c.fixable) continue;
    if (c.code === "INDENT_MIX") {
      files.forEach(f => { if (f.name.endsWith(".py")) { f.content = f.content.split("\n").map(l => l.replace(/^\t+/, m => "    ".repeat(m.length))).join("\n"); } });
      applied.push("Tabs → 4 spaces (Python indentation fix)");
    }
    if (c.code === "HARDCODED_PORT") {
      files.forEach(f => {
        if (f.name.endsWith(".py")) f.content = f.content.replace(/port\s*=\s*3000/g, "port=int(os.environ.get('PORT', 8080))");
        if (/\.(js|ts)$/.test(f.name)) f.content = f.content.replace(/listen\(\s*3000/g, "listen(process.env.PORT || 8080");
      });
      applied.push("Hardcoded port → process.env.PORT");
    }
  }

  // generated files add karo (requirements.txt / package.json)
  if (report.generatedFiles?.length) {
    for (const g of report.generatedFiles) {
      const existing = files.findIndex(f => f.name.split("/").pop() === g.name);
      if (existing >= 0) files[existing] = { name: files[existing].name, content: g.content };
      else files.push({ name: g.name, content: g.content });
      applied.push(`Generated ${g.name}`);
    }
  }

  const next = await runDeployChecks({ ...src, files });
  return { report: next, applied };
}

export function reportToSiteFields(r: DeployReport) {
  const blocking = r.errors.length;
  return {
    status: (r.ok ? "Running" : "Error") as "Running" | "Error",
    errorCount: blocking,
    lastError: blocking ? `${r.errors[0].title}: ${r.errors[0].detail}` : undefined,
    checks: r.checks,
    botType: r.botType,
    fileType: r.fileType,
    botUsername: r.botUsername,
    tokenMasked: r.tokenMasked,
    fileCount: r.fileCount,
    deployedAt: new Date().toISOString(),
  };
}
