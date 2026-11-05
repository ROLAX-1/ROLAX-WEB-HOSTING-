import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/py/run
 * body: { files: {name, content}[], entry?: string, text?: string }
 * Kaam: user ki .py file ko ASLI Python (pybridge.py) me chalata hai,
 * syntax check + real handler execution + asli bot reply return karta hai.
 */
type Body = { files?: { name: string; content: string }[]; entry?: string; text?: string };

const PY = process.env.PYTHON_BIN || "python3";
const BRIDGE = path.join(process.cwd(), "runtime", "pybridge.py");

function pickEntry(files: { name: string; content: string }[], entry?: string) {
  if (entry && files.some(f => f.name === entry || f.name.endsWith("/" + entry))) return entry;
  const py = files.filter(f => /\.py$/i.test(f.name));
  const pref = ["bot.py", "main.py", "app.py", "index.py", "run.py"];
  for (const p of pref) {
    const hit = py.find(f => (f.name.split("/").pop() || "").toLowerCase() === p);
    if (hit) return hit.name;
  }
  return py[0]?.name;
}

function runBridge(dir: string, entry: string, text: string) {
  return new Promise<any>(resolve => {
    const child = spawn(PY, [BRIDGE, dir, entry], {
      cwd: dir,
      env: { ...process.env, ROL_TEXT: text, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" },
    });
    let out = "";
    let err = "";
    const killer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 15000);
    child.stdout.on("data", d => { out += d.toString(); });
    child.stderr.on("data", d => { err += d.toString(); });
    child.on("close", () => {
      clearTimeout(killer);
      const line = out.split("\n").reverse().find(l => l.startsWith("###RESULT###"));
      if (line) {
        try { resolve(JSON.parse(line.slice("###RESULT###".length))); return; } catch {}
      }
      resolve({ ok: false, error: (err || out || "Python runtime ne koi result nahi diya").slice(0, 800), replies: [], commands: [] });
    });
    child.on("error", e => { clearTimeout(killer); resolve({ ok: false, error: "Python launch fail: " + e.message, replies: [], commands: [] }); });
  });
}

function syntaxOnly(dir: string, entry: string) {
  return new Promise<{ ok: boolean; error?: string }>(resolve => {
    const child = spawn(PY, ["-W", "ignore", "-c",
      `import ast,sys;src=open(sys.argv[1],encoding='utf-8',errors='ignore').read();ast.parse(src, sys.argv[1])`, entry], { cwd: dir });
    let err = "";
    child.stderr.on("data", d => { err += d.toString(); });
    child.on("close", code => resolve({ ok: code === 0, error: code === 0 ? undefined : (err.trim().split("\n").slice(-3).join(" ") || "Syntax error") }));
    child.on("error", () => resolve({ ok: true })); // python nahi mila -> bridge batayega
  });
}

export async function POST(req: NextRequest) {
  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const files = (body.files || []).filter(f => f && typeof f.content === "string");
  const py = files.filter(f => /\.py$/i.test(f.name));
  if (!py.length) {
    return NextResponse.json({ ok: false, python: false, error: "Koi .py file nahi mili" }, { status: 200 });
  }

  const dir = await mkdtemp(path.join(tmpdir(), "rolax-py-"));
  try {
    for (const f of files) {
      const safe = f.name.replace(/^\/+/, "").replace(/\.\.(\/|\\)/g, "");
      const target = path.join(dir, safe);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, f.content.slice(0, 400_000), "utf8");
    }
    // .env na ho to banake token inject karo (agar code me mila)
    const entry = pickEntry(files, body.entry) || py[0].name;
    const syntax = await syntaxOnly(dir, entry);
    const exec = await runBridge(dir, entry, body.text || "/start");

    const checks = [
      {
        code: "PY_FILE", level: "ok" as const,
        title: `${py.length} Python file mili`,
        detail: `${py.map(f => f.name).slice(0, 5).join(", ")} — entry: ${entry}`,
      },
      syntax.ok
        ? { code: "PY_SYNTAX_OK", level: "ok" as const, title: "Python syntax valid (asli CPython parser)", detail: "ast.parse pass — code me syntax error nahi hai" }
        : { code: "PY_SYNTAX_ERR", level: "error" as const, title: "Python syntax error", detail: syntax.error || "Syntax error" },
      exec.loaded
        ? { code: "PY_LOAD_OK", level: "ok" as const, title: "Python me code load ho gaya (real run)", detail: `${exec.handlers || 0} handler(s) register hue` }
        : { code: "PY_LOAD_ERR", level: "error" as const, title: "Code chalte hi crash ho gaya", detail: exec.loadError || exec.error || "load fail" },
      (exec.commands || []).length
        ? { code: "PY_CMDS_OK", level: "ok" as const, title: `${exec.commands.length} command handler mile`, detail: (exec.commands || []).map((c: string) => "/" + c).join(" ") }
        : { code: "PY_NO_CMDS", level: "warn" as const, title: "Koi command handler nahi mila", detail: "Bot ke commands (/start etc.) code me register nahi hue — phir bhi script chal jayegi" },
      (exec.replies || []).length
        ? { code: "PY_REPLY_OK", level: "ok" as const, title: "Bot ka asli jawab mila", detail: String((exec.replies || [])[0]).slice(0, 120) }
        : { code: "PY_NO_REPLY", level: "warn" as const, title: "Is command ka reply nahi mila", detail: exec.note || exec.error || "Handler ne kuch bheja nahi — dusra command try karo" },
    ];

    const errors = checks.filter(c => c.level === "error");
    return NextResponse.json({
      ok: errors.length === 0,
      python: true,
      entry,
      syntax,
      loaded: !!exec.loaded,
      commands: exec.commands || [],
      replies: exec.replies || [],
      logs: exec.loadLogs || exec.logs || [],
      tokenFound: !!exec.tokenFound,
      error: exec.loadError || exec.error || "",
      checks,
      errors,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, python: true, error: e?.message || "runtime fail", checks: [], errors: [] }, { status: 200 });
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
