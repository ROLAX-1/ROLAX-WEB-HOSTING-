"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";

type LogLine = { type: "in" | "out" | "err" | "sys"; text: string; at: string };

/** Har bot ke liye ek chhota REPL shell — jo user bot me likhta, wahi chalta hai */
function replSource(entry: string, files: { name: string; content: string }[]) {
  const code = files.find(f => f.name === entry || f.name.endsWith("/" + entry))?.content || files[0]?.content || "";
  const envFile = files.find(f => /(^|\/)\.env$/.test(f.name));
  const env = envFile ? envFile.content.split("\n").filter(Boolean).map(l => {
    const i = l.indexOf("=");
    return i > 0 ? `os.environ[${JSON.stringify(l.slice(0, i).trim())}] = ${JSON.stringify(l.slice(i + 1).trim())}` : "";
  }).filter(Boolean).join("\n") : "";

  return `import os, sys, io, types, traceback, json

REPLY_LOG = []
HANDLERS = {}

# ---- fake bot modules: isliye import fail nahi hota aur handler register hote hain ----
class _Msg:
    def __init__(self, text="/start", cid=1):
        self.text = text
        self.message_id = 1
        self.chat = types.SimpleNamespace(id=cid, type="private")
        self.from_user = types.SimpleNamespace(id=cid, first_name="Tester", username="tester", is_bot=False)

class BotStub:
    def __getattr__(self, name):
        def method(*a, **k):
            if name in ("reply_to", "send_message", "answer") and len(a) >= 2:
                REPLY_LOG.append(str(a[1]))
            return None
        return method
    def message_handler(self, *a, **k):
        cmds = None
        for v in list(a) + list(k.values()):
            if isinstance(v, (list, tuple)):
                cmds = v
            elif callable(v):
                # func handler -> catch-all
                HANDLERS.setdefault("__any__", []).append(v)
                return v
        if cmds is None and "commands" in k:
            cmds = k["commands"]
        def deco(fn):
            for c in (cmds or ["__any__"]):
                HANDLERS.setdefault(str(c), []).append(fn)
            return fn
        return deco
    def callback_query_handler(self, *a, **k):
        def deco(fn): return fn
        return deco

BOT = BotStub()

telebot_mod = types.ModuleType("telebot")
telebot_mod.TeleBot = lambda *a, **k: BOT
telebot_mod.types = types.SimpleNamespace(Message=_Msg)
sys.modules["telebot"] = telebot_mod

telegram_mod = types.ModuleType("telegram")
telegram_mod.Update = dict
sys.modules["telegram"] = telegram_mod
sys.modules["telegram.ext"] = types.ModuleType("telegram.ext")

aiogram_mod = types.ModuleType("aiogram")
aiogram_mod.Bot = lambda *a, **k: BOT
aiogram_mod.Dispatcher = lambda *a, **k: BOT
sys.modules["aiogram"] = aiogram_mod

discord_mod = types.ModuleType("discord")
discord_mod.Client = lambda *a, **k: BOT
discord_mod.Bot = lambda *a, **k: BOT
discord_mod.Intents = types.SimpleNamespace(all=lambda: None, default=lambda: None)
sys.modules["discord"] = discord_mod

dotenv_mod = types.ModuleType("dotenv")
dotenv_mod.load_dotenv = lambda *a, **k: True
sys.modules["dotenv"] = dotenv_mod

CODE = ${JSON.stringify(code)}

# .env values load
${env}

BOT_TOKEN = globals().get("BOT_TOKEN", "")
os.environ.setdefault("BOT_TOKEN", str(BOT_TOKEN) if BOT_TOKEN else "dummy")

LOAD_ERROR = ""
try:
    exec(compile(CODE, "project.py", "exec"), globals())
except BaseException as e:
    LOAD_ERROR = type(e).__name__ + ": " + str(e)[:160]

COMMANDS = sorted([k for k in HANDLERS.keys() if k != "__any__"]) or ["start", "help"]
print("LOADED" + ("|WARN:" + LOAD_ERROR if LOAD_ERROR else ""))
print("COMMANDS " + json.dumps(COMMANDS))

def _call(fn, msg):
    try:
        fn(msg)
    except TypeError:
        try:
            fn(msg, None)
        except TypeError:
            fn()

def run_command(cmd):
    out = io.StringIO()
    old = sys.stdout
    sys.stdout = out
    try:
        REPLY_LOG.clear()
        fns = HANDLERS.get(cmd, []) + HANDLERS.get("__any__", [])
        if not fns:
            print("Command /" + cmd + " ka handler code me nahi mila.")
            return out.getvalue()
        for fn in fns:
            _call(fn, _Msg("/" + cmd))
        printed = out.getvalue().strip()
        replies = [r for r in REPLY_LOG if r]
        if replies:
            for r in replies:
                print("BOT REPLY: " + r)
        elif printed:
            print(printed)
        else:
            print("(handler chala, koi output nahi)")
        return out.getvalue()
    except BaseException:
        traceback.print_exc(file=out)
        return out.getvalue()
    finally:
        sys.stdout = old

def handle(inp):
    line = (inp or "").strip()
    if not line:
        return ""
    bare = line.lstrip("/").split()[0].lower()
    if line.startswith("/") or bare in HANDLERS or bare in ("start", "help", "price", "status"):
        return run_command(bare)
    out = io.StringIO()
    old = sys.stdout
    sys.stdout = out
    try:
        try:
            res = eval(line, globals())
            if res is not None:
                print(repr(res))
        except SyntaxError:
            exec(compile(line, "<stdin>", "exec"), globals())
        return out.getvalue()
    except BaseException:
        return traceback.format_exc()
    finally:
        sys.stdout = old
`;
}

export default function RunPage() {
  const params = useParams();
  const name = decodeURIComponent(String(params?.name || ""));
  const { hydrate, hydrated, websites } = useStore();
  const [log, setLog] = useState<LogLine[]>([]);
  const [input, setInput] = useState("");
  const [ready, setReady] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detected, setDetected] = useState<string[]>([]);
  const pyodide = useRef<any>(null);
  const outRef = useRef<HTMLDivElement | null>(null);

  const site = useMemo(() => websites.find(w =>
    w.name.toLowerCase().replace(/\s+/g, "-") === name.toLowerCase() || w.url === name || w.id === name
  ), [websites, name]);

  const files = (site?.src as { name: string; content: string }[]) || [];
  const entry = site?.entryFile || files.find(f => f.name.endsWith(".py"))?.name || files[0]?.name || "bot.py";

  useEffect(() => { hydrate(); }, [hydrate]);

  const push = useCallback((type: LogLine["type"], text: string) => {
    setLog(l => [...l, { type, text, at: new Date().toISOString() }]);
  }, []);

  // Pyodide boot
  useEffect(() => {
    if (!hydrated || !site || ready || booting === false) return;
    let cancelled = false;
    (async () => {
      try {
        push("sys", "Python runtime (Pyodide) load ho raha hai...");
        const load = () => new Promise<void>((resolve, reject) => {
          if ((window as any).loadPyodide) return resolve();
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js";
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Pyodide CDN load nahi hui (internet chahiye)"));
          document.head.appendChild(s);
        });
        await load();
        const py = await (window as any).loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/" });
        if (cancelled) return;
        pyodide.current = py;
        push("sys", `Python ${py.runPython("import sys; sys.version.split()[0]")} ready`);
        py.setStdout({ batched: (s: string) => push("out", s) });
        py.setStderr({ batched: (s: string) => push("err", s) });
        const info: string = py.runPython(replSource(entry, files));
        setReady(true);
        setBooting(false);
        const warn = String(info).includes("WARN:") ? String(info).split("WARN:")[1]?.split("\n")[0] : "";
        push("sys", `Bot code load ho gaya — entry: ${entry}`);
        if (warn) push("err", "load warning: " + warn);
        const cmdsRaw = String(info).match(/COMMANDS (\[[^\]]*\])/)?.[1] || "[]";
        let cmds: string[] = [];
        try { cmds = JSON.parse(cmdsRaw); } catch {}
        setDetected(cmds);
        push("sys", cmds.length ? `Detected commands: ${cmds.map(c => "/" + c).join(" ")}` : "Code me koi command handler nahi mila — default /start /help /price /status try karo");
        setTimeout(() => { void serverRun("/start"); }, 400);
      } catch (e: any) {
        setError(e?.message || "Python runtime start nahi hua");
        setBooting(false);
        push("err", e?.message || "runtime error");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, site?.id, ready]);

  useEffect(() => {
    outRef.current?.scrollTo({ top: outRef.current.scrollHeight });
  }, [log]);

  const serverRun = useCallback(async (cmd: string) => {
    const src = (site?.src as { name: string; content: string }[]) || [];
    const pyFiles = src.filter(f => /\.py$/i.test(f.name));
    if (!pyFiles.length) return false;
    push("sys", "Real Python (server, python3) me chala rahe hain...");
    try {
      const r = await fetch("/api/py/run", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ files: pyFiles, entry, text: cmd }),
      });
      const j = await r.json();
      if ((j.replies || []).length) {
        (j.replies as string[]).forEach(rep => push("out", "BOT REPLY: " + rep));
        if (j.commands?.length) push("sys", "commands: " + j.commands.map((c: string) => "/" + c).join(" "));
        return true;
      }
      if (j.logs?.length) { (j.logs as string[]).slice(-6).forEach(l => push("out", l)); return true; }
      if (j.error) push("err", j.error);
      push("sys", "Is command ka reply code me nahi mila — dusra command try karo");
      return true;
    } catch { return false; }
  }, [site?.src, entry]);

  const runCommand = async (cmd: string) => {
    push("in", cmd);
    const served = await serverRun(cmd);
    if (served) return;
    if (!pyodide.current) {
      push("err", "Python runtime abhi ready nahi — 2 second wait karo");
      return;
    }
    const py = pyodide.current;
    try {
      const out = py.runPython(`handle(${JSON.stringify(cmd)})`);
      if (out && String(out).trim()) push("out", String(out).trim());
    } catch (e: any) {
      push("err", String(e?.message || e));
    }
  };

  const submit = () => {
    const v = input.trim();
    if (!v) return;
    setInput("");
    runCommand(v);
  };

  const quick = ["/start", "/help", "/price", "/status"];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
      {/* bar */}
      <div style={{ top: "var(--banner-h, 0px)" }} className="sticky z-40 bg-black border-b border-[#222] px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-5 h-5 rounded bg-gradient-to-br from-[#6C5CE7] to-[#00D4FF] flex items-center justify-center font-bold text-[10px]">R</span>
          <span className="font-grotesk font-semibold text-sm truncate">{site?.name || "project"} — Python Runner</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] shrink-0 ${ready ? "bg-[#00ff88]/15 text-[#00ff88]" : error ? "bg-red-500/15 text-red-400" : "bg-yellow-500/15 text-yellow-400"}`}>
            {ready ? "● running" : error ? "✕ error" : "◐ booting"}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden md:inline text-[10px] text-[#888]">entry: {entry}</span>
          <Link href="/dashboard" className="px-3 py-1 rounded-full bg-white text-black text-[11px] font-medium">Dashboard</Link>
        </div>
      </div>

      {!site ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-4xl">🔍</p>
          <p className="text-sm text-[#888]">Is naam ka project nahi mila: {name}</p>
          <Link href="/dashboard" className="px-5 py-2 rounded-full bg-white text-black text-sm">← Dashboard</Link>
        </div>
      ) : (
        <div className="flex-1 max-w-4xl w-full mx-auto p-3 md:p-6 flex flex-col gap-3">
          <div className="rounded-xl bg-[#111] border border-[#222] p-3">
            <p className="text-[11px] text-[#888]">
              {site.botType || site.fileType} • {site.fileCount || files.length} files • {site.status}
            </p>
            <p className="text-[10px] text-[#666] mt-1">
              Asli Python runtime (server python3) me code chalta hai — commands real handlers se reply dete hain.
              {(site as any)?.pythonTest?.tested && (
                <> Test: {((site as any).pythonTest.loaded) ? "✅ load OK" : "❌ " + String((site as any).pythonTest.error).slice(0, 60)}
                  {((site as any).pythonTest.commands || []).length ? " • commands: " + ((site as any).pythonTest.commands as string[]).map(c => "/" + c).join(" ") : ""}</>
              )}
              {site.botRuntime?.status === "online" && <> • Bot @{site.botUsername || site.botRuntime?.username} 24/7 server pe online</>}
            </p>
          </div>

          {/* terminal */}
          <div ref={outRef} className="flex-1 min-h-[300px] max-h-[52vh] overflow-auto rounded-xl bg-black border border-[#222] p-3 font-mono text-[11px] leading-5">
            {log.length === 0 && <p className="text-[#555]">Runtime start ho raha hai...</p>}
            {log.map((l, i) => (
              <div key={i} className={
                l.type === "err" ? "text-red-400" : l.type === "in" ? "text-[#00D4FF]" : l.type === "sys" ? "text-[#888]" : "text-[#ddd]"
              }>
                <span className="text-[#444]">{">"} </span>{l.text}
              </div>
            ))}
          </div>

          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/25 p-3">
              <p className="text-xs text-red-300">{error}</p>
              <p className="text-[10px] text-[#888] mt-1">Python runtime ke liye internet chahiye (CDN). Preview iframe me CDN block ho sakta hai — deploy ke baad perfect chalega.</p>
            </div>
          )}

          {/* quick commands */}
          <div className="flex gap-2 flex-wrap">
            {(detected.length ? detected.map(c => "/" + c) : quick).map(q => (
              <button key={q} onClick={() => runCommand(q)} disabled={!ready} className="px-3 py-1.5 rounded-full bg-[#111] border border-[#222] text-[11px] text-[#ccc] disabled:opacity-40">{q}</button>
            ))}
          </div>

          {/* input */}
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submit(); }}
              placeholder="Command ya Python code likho (jaise /start  ya  print(2+2))"
              className="flex-1 px-4 py-3 rounded-xl bg-black border border-[#222] text-sm font-mono"
            />
            <button onClick={submit} disabled={!ready} className="px-5 py-3 rounded-xl bg-white text-black text-sm font-medium disabled:opacity-40">Run</button>
          </div>
          <p className="text-[10px] text-[#555] pb-3">Har command ka output terminal me dikhega. Bot ke features bilkul waise hi chalte hain jaisa code me likha hai.</p>
        </div>
      )}
    </div>
  );
}
