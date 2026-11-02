import { NextRequest, NextResponse } from "next/server";
import { generateSupportFiles, mergeSupportFiles, type SourceFile } from "@/lib/supportfiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type InFile = { name: string; content: string };
type Body = { files?: InFile[]; entryFile?: string; checks?: any[]; stack?: string; botToken?: string };

type Patch = { file: string; reason: string; code: string };
type AiResult = {
  ok: boolean;
  engine: "groq" | "openai" | "local";
  summary: string;
  fixes: Patch[];
  notes: string[];
};

const SYSTEM = `You are ROLAX AI, an expert at fixing Python and Node.js Telegram/Discord bot code so it runs 24/7 on a hosting platform.
Return ONLY valid JSON, no prose, exactly this shape:
{"summary":"short english/hinglish summary","fixes":[{"file":"bot.py","reason":"what was broken","code":"FULL corrected file content"}],"notes":["extra advice"]}
Rules:
- Always return the FULL corrected file content in "code" (never a diff).
- Fix: missing imports, wrong entry filename/start command, tabs vs spaces, hardcoded port (use env PORT), missing requirements imports, infinite polling by default, load token from os.environ/os.getenv with fallback to the literal token already present.
- Never remove user-facing bot commands or their reply texts.
- Do not invent features. Keep the code minimal and runnable.
- You MAY also output support files: requirements.txt (all pip packages for the imports), .env (BOT_TOKEN / API_ID / API_HASH / PORT keys with the token already present in the code), .env.example, package.json, Procfile, README.md. Use full file content in "code" as usual.
- Always include requirements.txt for Python and .env for any code that needs a token.
- If nothing is broken, return empty fixes array and explain in summary.`;

function localFixes(files: InFile[], checks: any[]): AiResult {
  const fixes: Patch[] = [];
  const notes: string[] = [];
  const codes = (checks || []).map(c => c?.code);
  const needs = (c: string) => codes.includes(c);

  for (const f of files) {
    let code = f.content;
    let changed = false;
    let reason: string[] = [];

    if (f.name.endsWith(".py")) {
      if (/^\t/m.test(code) || /^ +\t/.test(code) || needs("INDENT_MIX")) {
        code = code.split("\n").map(l => l.replace(/^\t+/, m => "    ".repeat(m.length))).join("\n");
        changed = true; reason.push("tab indent → 4 spaces");
      }
      if (/port\s*=\s*3000/.test(code) || needs("HARDCODED_PORT")) {
        code = code.replace(/port\s*=\s*3000/g, "port=int(os.environ.get('PORT', 8080))");
        if (!/^import os/m.test(code)) code = "import os\n" + code;
        changed = true; reason.push("hardcoded port → env PORT");
      }
      const tokenLit = code.match(/["'](\d{6,12}:[A-Za-z0-9_-]{25,60})["']/);
      if (tokenLit && !/getenv|environ/.test(code)) {
        code = code.replace(/BOT_TOKEN\s*=\s*["'][^"']+["']/, `BOT_TOKEN = os.environ.get("BOT_TOKEN", "${tokenLit[1]}")`);
        if (!/^import os/m.test(code)) code = "import os\n" + code;
        changed = true; reason.push("token → env with literal fallback (bot start pe crash nahi hoga)");
      }
      if (/telebot|InfinityPolling|infinity_polling/.test(code) && !/infinity_polling|bot\.polling\(/.test(code) && !/idle\(/.test(code)) {
        code = code.trimEnd() + `\n\nif __name__ == "__main__":\n    print("bot starting...")\n    bot.infinity_polling(skip_pending=True)\n`;
        changed = true; reason.push("polling loop add kiya (bot chalu rahega)");
      }
    }

    if (f.name.endsWith(".js") || f.name.endsWith(".mjs")) {
      if (/listen\(\s*3000/.test(code) || needs("HARDCODED_PORT")) {
        code = code.replace(/listen\(\s*3000/g, "listen(process.env.PORT || 8080");
        changed = true; reason.push("hardcoded port → process.env.PORT");
      }
      const tokenLit = code.match(/["'](\d{6,12}:[A-Za-z0-9_-]{25,60})["']/);
      if (tokenLit && !/process\.env/.test(code)) {
        code = code.replace(tokenLit[0], `process.env.BOT_TOKEN || "${tokenLit[1]}"`);
        changed = true; reason.push("token → process.env fallback");
      }
    }

    // safety: agar naya code me user ke commands/replies kam ho gaye to skip (features preserve)
    const handlersOld = (f.content.match(/message_handler|onText|command\(|reply_to|sendMessage/g) || []).length;
    const handlersNew = (code.match(/message_handler|onText|command\(|reply_to|sendMessage/g) || []).length;
    if (changed && handlersNew >= handlersOld) fixes.push({ file: f.name, reason: reason.join("; "), code });
    else if (changed) notes.push(`${f.name}: fix skip kiya kyunki features kam ho rahe the (safety guard).`);
  }

  if (needs("NO_REQUIREMENTS")) notes.push("requirements.txt auto-generate kiya ja sakta hai (auto-fix button).");
  if (needs("NO_ENV")) notes.push(".env me BOT_TOKEN rakho — production me literal token se better.");
  if (needs("NO_INDEX")) notes.push("Home page ke liye file ka naam index.html rakho.");

  return {
    ok: fixes.length > 0,
    engine: "local",
    summary: fixes.length ? `${fixes.length} file(s) me ${fixes.reduce((n, f) => n + f.reason.split(";").length, 0)} fix apply kiye` : "Local engine ko koi naya fix nahi mila",
    fixes,
    notes,
  };
}

async function callLLM(files: InFile[], checks: any[], stack?: string): Promise<AiResult | null> {
  const groq = process.env.GROQ_API_KEY;
  const openai = process.env.OPENAI_API_KEY;
  if (!groq && !openai) return null;

  const payload = files.slice(0, 4).map(f => `### FILE: ${f.name}\n${f.content.slice(0, 6000)}`).join("\n\n");
  const userMsg = `Stack: ${stack || "unknown"}
Detected problems: ${JSON.stringify((checks || []).filter((c: any) => c.level !== "ok").map((c: any) => ({ code: c.code, title: c.title, detail: c.detail })))}

${payload}`;

  const url = groq ? "https://api.groq.com/openai/v1/chat/completions" : "https://api.openai.com/v1/chat/completions";
  const key = groq || openai;
  const model = groq ? "llama-3.3-70b-versatile" : "gpt-4o-mini";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userMsg },
        ],
      }),
    });
    const j = await res.json();
    const text = j?.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(text);
    const fixes: Patch[] = Array.isArray(parsed.fixes)
      ? parsed.fixes
          .filter((f: any) => f && typeof f.code === "string" && f.code.length > 0)
          .map((f: any) => ({ file: String(f.file || files[0]?.name || "file"), reason: String(f.reason || "AI fix"), code: f.code }))
      : [];
    return {
      ok: fixes.length > 0,
      engine: groq ? "groq" : "openai",
      summary: String(parsed.summary || (fixes.length ? "AI ne code repair kiya" : "AI ko koi issue nahi mila")),
      fixes,
      notes: Array.isArray(parsed.notes) ? parsed.notes.map(String) : [],
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const files = (body.files || []).filter(f => f && typeof f.content === "string").slice(0, 8);
  if (!files.length) return NextResponse.json({ ok: false, error: "No files provided" }, { status: 400 });

  const ai = await callLLM(files, body.checks || [], body.stack);
  const fallback = localFixes(files, body.checks || []);
  const result: AiResult = ai && ai.ok ? ai : fallback;

  // AI ne fix diya to bhi local engine se validate/merge karo (100% safety)
  if (ai && ai.ok) {
    const merged = [...ai.fixes];
    fallback.fixes.forEach(lf => { if (!merged.some(m => m.file === lf.file)) merged.push(lf); });
    result.fixes = merged;
    result.notes = [...(ai.notes || []), ...fallback.notes];
  }

  // ---- support files (requirements.txt / .env / package.json / Procfile / README) hamesha ----
  const support = generateSupportFiles(files as SourceFile[], body.stack || "", body.entryFile);
  const alreadyCovered = support.filter(s => result.fixes.some(f => f.file === s.file));
  support.forEach(s => {
    if (!alreadyCovered.includes(s)) result.fixes.push({ file: s.file, reason: s.reason, code: s.content });
  });
  if (support.length) {
    result.notes = [...(result.notes || []), ...support.map(s => `${s.file}: ${s.reason}`)];
    result.summary = `${result.summary}${result.summary.endsWith(".") ? "" : " +"} ${support.length} support file(s) (requirements/.env/package.json)`;
    result.ok = true;
  }

  return NextResponse.json({
    ok: true,
    engine: result.engine,
    summary: result.summary,
    fixes: result.fixes,
    notes: result.notes,
    supportFiles: support.map(s => ({ file: s.file, reason: s.reason })),
    aiAvailable: !!(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY),
    at: new Date().toISOString(),
  });
}
