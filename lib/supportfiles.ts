// ROLAX HOST — support-file generator (bina "use client", server + client dono use kar sakte hain)
// AI auto-fix se requirements.txt, .env, .env.example, package.json, Procfile, README sab auto bante hain.

export type SourceFile = { name: string; content: string };
export type SupportFile = { file: string; content: string; reason: string };

/** Python module name -> pip package name */
const PY_PACKAGES: Record<string, string> = {
  telebot: "pyTelegramBotAPI",
  telegram: "python-telegram-bot",
  aiogram: "aiogram",
  discord: "discord.py",
  nextcord: "nextcord",
  interactions: "discord-interactions",
  dotenv: "python-dotenv",
  PIL: "Pillow",
  cv2: "opencv-python",
  bs4: "beautifulsoup4",
  yaml: "PyYAML",
  requests: "requests",
  aiohttp: "aiohttp",
  flask: "Flask",
  fastapi: "fastapi",
  uvicorn: "uvicorn",
  sqlalchemy: "SQLAlchemy",
  pymongo: "pymongo",
  psutil: "psutil",
  colorama: "colorama",
  pytz: "pytz",
  numpy: "numpy",
  pandas: "pandas",
  sqlite3: "", // stdlib
  os: "", sys: "", time: "", json: "", random: "", asyncio: "", logging: "", datetime: "",
  re: "", math: "", typing: "", threading: "", subprocess: "", base64: "", io: "",
  hashlib: "", string: "", traceback: "", uuid: "", collections: "", itertools: "", functools: "",
  pathlib: "", shutil: "", glob: "", csv: "", urllib: "", http: "", socket: "", ssl: "",
  telebot_ext: "pyTelegramBotAPI",
};

const STDLIB = new Set([
  "os", "sys", "time", "json", "random", "asyncio", "logging", "datetime", "re", "math", "typing",
  "threading", "subprocess", "base64", "io", "hashlib", "string", "traceback", "uuid", "collections",
  "itertools", "functools", "pathlib", "shutil", "glob", "csv", "urllib", "http", "socket", "ssl", "sqlite3",
]);

export function pythonImports(files: SourceFile[]): string[] {
  const mods = new Set<string>();
  for (const f of files) {
    if (!f.name.endsWith(".py")) continue;
    const re1 = /^\s*import\s+([a-zA-Z0-9_. ,]+)/gm;
    const re2 = /^\s*from\s+([a-zA-Z0-9_]+)[\s.]+import\s/gm;
    let m: RegExpExecArray | null;
    while ((m = re1.exec(f.content))) {
      m[1].split(",").forEach(x => {
        const top = x.trim().split(".")[0].split(" as ")[0].trim();
        if (top) mods.add(top);
      });
    }
    while ((m = re2.exec(f.content))) {
      const top = m[1].trim();
      if (top && top !== ".") mods.add(top);
    }
  }
  return Array.from(mods).filter(m => !STDLIB.has(m) && m !== "__future__");
}

export function envVarsUsed(files: SourceFile[]): string[] {
  const vars = new Set<string>();
  for (const f of files) {
    const patterns = [
      /os\.environ\.get\(\s*["']([A-Z0-9_]+)["']/g,
      /os\.getenv\(\s*["']([A-Z0-9_]+)["']/g,
      /os\.environ\[\s*["']([A-Z0-9_]+)["']\s*\]/g,
      /process\.env\.([A-Z0-9_]+)/g,
      /process\.env\[\s*["']([A-Z0-9_]+)["']\s*\]/g,
      /(?:BOT_TOKEN|API_ID|API_HASH|TELEGRAM_TOKEN|DISCORD_TOKEN)\s*=\s*["']?/g,
    ];
    for (const re of patterns) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(f.content))) {
        if (m[1]) vars.add(m[1]);
      }
    }
  }
  if (!vars.size) {
    const joined = files.map(f => f.content).join("\n");
    if (/telebot|telegram|aiogram/i.test(joined)) { vars.add("BOT_TOKEN"); }
    if (/discord/i.test(joined)) { vars.add("DISCORD_TOKEN"); }
    if (/telegram/i.test(joined) && /api_id|api_hash/i.test(joined)) { vars.add("API_ID"); vars.add("API_HASH"); }
  }
  return Array.from(vars);
}

function literalToken(files: SourceFile[]): string | null {
  const all = files.map(f => f.content).join("\n");
  const m = all.match(/\b(\d{6,12}:[A-Za-z0-9_-]{25,60})/);
  return m ? m[1] : null;
}

function existing(files: SourceFile[], re: RegExp) {
  return files.find(f => re.test(f.name) || re.test((f.name.split("/").pop() || "")));
}

export function generateSupportFiles(files: SourceFile[], stack: string, entryFile?: string): SupportFile[] {
  const out: SupportFile[] = [];
  const token = literalToken(files);

  /* ---------- PYTHON ---------- */
  if (stack === "Python" || files.some(f => f.name.endsWith(".py"))) {
    const imports = pythonImports(files);
    const pkgs = Array.from(new Set(imports.map(i => PY_PACKAGES[i] ?? i).filter(Boolean)));

    const req = existing(files, /^requirements\.txt$/i);
    const existingPkgs = req ? req.content.split("\n").map(l => l.trim().toLowerCase()).filter(Boolean) : [];
    const missing = pkgs.filter(p => !existingPkgs.some(e => e.replace(/[=<>~].*/, "") === p.toLowerCase()));
    const needsReq = !req || missing.length > 0;
    if (needsReq && pkgs.length) {
      const existingCanon = req ? req.content.split("\n").map(l => l.trim()).filter(Boolean) : [];
      const merged = Array.from(new Set([...existingCanon, ...missing]));
      out.push({
        file: "requirements.txt",
        content: merged.join("\n") + "\n",
        reason: req ? `requirements.txt me missing packages add kiye: ${missing.join(", ")}` : `requirements.txt banaya — ${pkgs.join(", ")}`,
      });
    }

    const envs = envVarsUsed(files);
    if (envs.length) {
      const lines = envs.map(v => {
        if (/TOKEN/.test(v) && token) return `${v}=${token}`;
        if (v === "BOT_TOKEN" && token) return `${v}=${token}`;
        if (v === "PORT") return `${v}=8080`;
        return `${v}=`;
      });
      const dotenv = existing(files, /(^|\/)\.env$/i) || existing(files, /\.env\.example$/i);
      const existingKeys = dotenv ? dotenv.content.split("\n").map(l => l.split("=")[0].trim()) : [];
      const addLines = lines.filter(l => !existingKeys.includes(l.split("=")[0]));
      if (addLines.length || !dotenv) {
        const body = (dotenv && /\.env$/i.test(dotenv.name) ? dotenv.content.trimEnd() + "\n" : "") + addLines.join("\n") + "\n";
        out.push({
          file: ".env",
          content: body.trimStart(),
          reason: dotenv ? `.env me missing keys add kiye: ${addLines.map(l => l.split("=")[0]).join(", ")}` : `.env banaya (${envs.join(", ")})${token ? " — token bhi daal diya taaki bot turant chale" : ""}`,
        });
        if (!existing(files, /\.env\.example$/i)) {
          out.push({
            file: ".env.example",
            content: envs.map(v => `${v}=${v === "PORT" ? "8080" : "your_" + v.toLowerCase() + "_here"}`).join("\n") + "\n",
            reason: ".env.example banaya (safe template, token ke bina)",
          });
        }
      }
    }

    if (!existing(files, /^Procfile$/i) && entryFile) {
      out.push({ file: "Procfile", content: `worker: python ${entryFile}\n`, reason: `Procfile banaya — start command: python ${entryFile}` });
    }
  }

  /* ---------- NODE ---------- */
  if (stack === "Node.js" || files.some(f => /\.(js|mjs|ts)$/.test(f.name))) {
    const pkg = existing(files, /^package\.json$/i);
    const all = files.map(f => f.content).join("\n");
    const deps: Record<string, string> = {};
    Array.from(all.matchAll(/require\(\s*["']([^"'.][^"']*)["']\s*\)/g)).forEach(m => {
      const p = m[1].split("/")[0];
      if (!["fs", "path", "http", "https", "crypto", "os", "util", "events", "stream", "child_process", "url"].includes(p)) deps[p] = "latest";
    });
    Array.from(all.matchAll(/from\s+["']([^"'.][^"']*)["']/g)).forEach(m => {
      const p = m[1].split("/")[0];
      if (!["fs", "path", "http", "https", "crypto", "os", "util", "events", "stream", "url"].includes(p)) deps[p] = "latest";
    });

    let parsed: any = {};
    if (pkg) { try { parsed = JSON.parse(pkg.content); } catch { parsed = {}; } }

    const needPkg = !pkg || !parsed.scripts?.start || Object.keys(deps).length > Object.keys(parsed.dependencies || {}).length;
    if (needPkg) {
      const merged = {
        name: parsed.name || "rolax-bot",
        version: parsed.version || "1.0.0",
        main: parsed.main || entryFile || "index.js",
        scripts: { ...(parsed.scripts || {}), start: parsed.scripts?.start || `node ${entryFile || "index.js"}` },
        dependencies: { ...(parsed.dependencies || {}), ...deps },
      };
      out.push({
        file: "package.json",
        content: JSON.stringify(merged, null, 2) + "\n",
        reason: pkg ? "package.json update kiya (dependencies + start script)" : "package.json banaya (start script + dependencies)",
      });
    }

    const envs = envVarsUsed(files);
    if (envs.length && !existing(files, /(^|\/)\.env$/i)) {
      out.push({
        file: ".env",
        content: envs.map(v => `${v}=${/TOKEN/.test(v) && token ? token : v === "PORT" ? "8080" : ""}`).join("\n") + "\n",
        reason: ".env banaya (env variables)",
      });
    }
  }

  /* ---------- README (dono ke liye) ---------- */
  if (!existing(files, /^readme\.md$/i)) {
    out.push({
      file: "README.md",
      content: `# ROLAX HOST project\n\nHosted on ROLAX HOST.\n\n## Run\n${stack === "Python" ? `pip install -r requirements.txt\npython ${entryFile || "bot.py"}` : stack === "Node.js" ? "npm install\nnpm start" : "Open index.html"}\n\n## Files\n${files.map(f => "- " + f.name).join("\n")}\n`,
      reason: "README.md banaya (run instructions ke saath)",
    });
  }

  return out;
}

/** Files me support files merge karo (purani same-name file replace ho jati hai) */
export function mergeSupportFiles(files: SourceFile[], support: SupportFile[]): SourceFile[] {
  const next = files.map(f => ({ ...f }));
  for (const s of support) {
    const idx = next.findIndex(f => f.name === s.file || (f.name.split("/").pop() || "") === s.file);
    if (idx >= 0) next[idx] = { name: next[idx].name, content: s.content };
    else next.push({ name: s.file, content: s.content });
  }
  return next;
}
