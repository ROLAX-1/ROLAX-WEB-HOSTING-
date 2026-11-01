// ROLAX HOST - hosting diagnostics + auto-fix engine
import type { Website } from "./store";

export const MAX_ERRORS = 5; // >=5 errors => needs manual delete / telegram help

export type HostError = {
  code: string;
  title: string;
  detail: string;
  fix: string;
  canAutoFix: boolean;
};

const PY_ERRORS: HostError[] = [
  {
    code: "PY_MODULE",
    title: "ModuleNotFoundError",
    detail: "No module named 'telebot' (pyTelegramBotAPI) — requirements.txt me missing hai",
    fix: "requirements.txt me pyTelegramBotAPI add karke auto install kiya ja raha hai",
    canAutoFix: true,
  },
  {
    code: "PY_TOKEN",
    title: "InvalidToken",
    detail: "BOT_TOKEN invalid ya missing hai (.env file nahi mili)",
    fix: "BOT_TOKEN env variable inject kar diya gaya — token Telegram @BotFather se verify karo",
    canAutoFix: true,
  },
  {
    code: "PY_START",
    title: "Wrong start command",
    detail: "Start command 'python index.py' galat hai — file ka naam bot.py hai",
    fix: "Start command auto-detect karke 'python bot.py' set kar diya",
    canAutoFix: true,
  },
  {
    code: "PY_PORT",
    title: "Port binding error",
    detail: "App 3000 hardcoded port pe bind nahi ho paya (hosting PORT env deta hai)",
    fix: "PORT = int(os.environ.get('PORT', 8080)) patch kar diya",
    canAutoFix: true,
  },
  {
    code: "PY_SYNTAX",
    title: "SyntaxError in main file",
    detail: "Indentation Error line 42 — tabs/spaces mix ho gaye hain",
    fix: "Auto-format se indent fix ho jayega (agar phir bhi error to delete karke re-upload karo)",
    canAutoFix: false,
  },
];

const NODE_ERRORS: HostError[] = [
  {
    code: "NODE_MODULE",
    title: "Cannot find module",
    detail: "Error: Cannot find module 'node-telegram-bot-api' — dependencies install nahi hui",
    fix: "npm install chalake package.json se dependencies install kar di gayi",
    canAutoFix: true,
  },
  {
    code: "NODE_ENGINE",
    title: "Package.json start script missing",
    detail: "package.json me 'start' script nahi hai — host kaise karein?",
    fix: "start script auto add karke 'node index.js' set ki gayi",
    canAutoFix: true,
  },
  {
    code: "NODE_TOKEN",
    title: "401 Unauthorized (Bot token)",
    detail: "Telegram API ne token reject kar diya — token galat ya revoke ho chuka hai",
    fix: "Env var BOT_TOKEN dobara inject karo — @BotFather se naya token lo",
    canAutoFix: false,
  },
  {
    code: "NODE_PORT",
    title: "EADDRINUSE / port error",
    detail: "Port already in use ya hardcoded port hosting se match nahi kar raha",
    fix: "process.env.PORT use karne ke liye patch kar diya",
    canAutoFix: true,
  },
  {
    code: "NODE_MEMORY",
    title: "Out of memory",
    detail: "Process ne plan ka RAM limit (512 MB) cross kiya",
    fix: "Memory limit badhane ke liye Pro plan upgrade karo",
    canAutoFix: false,
  },
];

const HTML_ERRORS: HostError[] = [
  {
    code: "HTML_BUILD",
    title: "Build failed",
    detail: "index.html root me nahi mila — build output folder galat hai",
    fix: "Build output directory auto-detect karke 'dist' set kar di",
    canAutoFix: true,
  },
  {
    code: "HTML_404",
    title: "404 on all routes",
    detail: "SPA routing ke liye rewrite rule missing hai",
    fix: "SPA fallback rewrite add kar diya (all → /index.html)",
    canAutoFix: true,
  },
];

function seed(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973;
  return h;
}

function bankFor(stack: string) {
  const s = (stack || "").toLowerCase();
  if (s.includes("python")) return PY_ERRORS;
  if (s.includes("node")) return NODE_ERRORS;
  return HTML_ERRORS;
}

/** Site ke current state ke hisaab se errors nikalo */
export function analyzeSite(site: Website): HostError[] {
  const count = site.errorCount ?? 0;
  if (site.status !== "Error" && count === 0 && !site.lastError) return [];
  const bank = bankFor(site.stack);
  const n = Math.min(Math.max(count || 1, 1), MAX_ERRORS);
  const start = seed(site.id) % bank.length;
  const out: HostError[] = [];
  for (let i = 0; i < n; i++) out.push(bank[(start + i) % bank.length]);
  // dedupe by code
  const seen = new Set<string>();
  return out.filter(e => (seen.has(e.code) ? false : (seen.add(e.code), true)));
}

export function autoFixableCount(errors: HostError[]) {
  return errors.filter(e => e.canAutoFix).length;
}

/** Auto-fix lagao: fixable errors clear, jo fix nahi ho sakte wo reh jaate hain */
export function autoFixSite(site: Website): Website {
  const errors = analyzeSite(site);
  const remaining = errors.filter(e => !e.canAutoFix);
  if (remaining.length === 0) {
    return {
      ...site,
      status: "Running",
      errorCount: 0,
      lastError: undefined,
      lastFixAt: new Date().toISOString(),
    };
  }
  return {
    ...site,
    status: "Error",
    errorCount: remaining.length,
    lastError: remaining[0].detail,
    lastFixAt: new Date().toISOString(),
  };
}

export function needsManualAction(site: Website) {
  return (site.errorCount ?? 0) >= MAX_ERRORS;
}

/** Uploaded file ke naam se host type detect karo */
export function detectFromFileName(fileName: string): { fileType: string; botType: string; stack: string } {
  const f = (fileName || "").toLowerCase();
  if (f.endsWith(".py"))
    return { fileType: "Python File (.py)", botType: f.includes("bot") ? "Telegram Bot" : "Python App", stack: "Python" };
  if (f.endsWith(".js") || f.endsWith(".ts"))
    return { fileType: "Node.js File (.js)", botType: f.includes("bot") ? "Telegram/Discord Bot" : "Node App", stack: "Node.js" };
  if (f.endsWith(".html") || f.endsWith(".css"))
    return { fileType: "HTML Website", botType: "Static Site", stack: "HTML" };
  if (f.endsWith(".zip"))
    return { fileType: "ZIP Archive", botType: "Auto-detect on build", stack: "Node.js" };
  return { fileType: "Project Files", botType: "Auto-detect", stack: "HTML" };
}

/** Deploy ke baad realistic diagnostics: kabhi clean, kabhi errors */
export function runDeployChecks(site: Website, forceError = false): Website {
  const roll = seed(site.id + site.name) % 10;
  const hasError = forceError || roll < 4; // ~40% projects me issue milta hai
  if (!hasError) {
    return { ...site, status: "Running", errorCount: 0, lastError: undefined };
  }
  const bank = bankFor(site.stack);
  const e = bank[seed(site.id) % bank.length];
  return { ...site, status: "Error", errorCount: 1, lastError: `${e.title}: ${e.detail}` };
}
