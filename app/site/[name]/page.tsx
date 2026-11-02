"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";

type BundleFile = { path: string; content: string; type: string };

function normalize(p: string) {
  return p.replace(/^\.?\//, "").replace(/\\/g, "/");
}

export default function HostedSitePage() {
  const params = useParams();
  const name = decodeURIComponent(String(params?.name || ""));
  const { hydrate, hydrated, websites } = useStore();
  const [route, setRoute] = useState("index.html");

  useEffect(() => { hydrate(); }, [hydrate]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("p");
    if (q) setRoute(normalize(q));
  }, []);

  const site = useMemo(() => {
    return websites.find(w => w.name.toLowerCase().replace(/\s+/g, "-") === name.toLowerCase() || w.url === name || w.id === name);
  }, [websites, name]);

  const bundle: BundleFile[] = (site?.bundle as BundleFile[]) || [];

  const fileMap = useMemo(() => {
    const m: Record<string, BundleFile> = {};
    bundle.forEach(f => { m[normalize(f.path)] = f; });
    return m;
  }, [bundle]);

  const current = fileMap[normalize(route)] || fileMap["index.html"] || (bundle.find(f => f.type === "text/html") as BundleFile | undefined);

  // CSS + JS ko asli me inline karo taaki page bilkul chale
  const html = useMemo(() => {
    if (!current) return "";
    let out = current.content;

    // <link rel="stylesheet" href="style.css"> -> <style>...</style>
    out = out.replace(/<link[^>]*href=["'](\.?\/?)([^"']+\.css)["'][^>]*>/gi, (_m, _s, file) => {
      const f = fileMap[normalize(file)];
      return f ? `<style data-rolax="${file}">${f.content}</style>` : `<!-- missing ${file} -->`;
    });

    // <script src="app.js"></script> -> <script>...</script>
    out = out.replace(/<script([^>]*)src=["'](\.?\/?)([^"']+\.(?:m?js))["']([^>]*)><\/script>/gi, (_m, a, _s, file, b) => {
      const f = fileMap[normalize(file)];
      return f ? `<script data-rolax="${file}">${f.content}</script>` : `<!-- missing ${file} -->`;
    });

    // page ke andar doosre html page ka link -> data-asset (SPA routing)
    out = out.replace(/href=["'](\.?\/?)([\w-]+\.html?)["']/gi, (_m, _s, file) => `href="#" data-asset="${file}"`);

    return out;
  }, [current, fileMap]);

  useEffect(() => {
    if (!current) return;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement)?.closest?.("[data-asset]") as HTMLElement | null;
      if (!el) return;
      e.preventDefault();
      const asset = el.getAttribute("data-asset") || "";
      setRoute(normalize(asset));
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [current]);

  if (!hydrated) return <div className="min-h-screen bg-black text-white flex items-center justify-center text-sm">Loading hosted site...</div>;

  if (!site) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-5xl">🔍</p>
        <h1 className="font-grotesk text-2xl font-bold">Site not found</h1>
        <p className="text-sm text-[#888] max-w-md">Is naam se koi hosted site nahi mili: <span className="text-white font-mono">{name}</span>. Dashboard se deploy karo ya naam check karo.</p>
        <Link href="/dashboard" className="px-6 py-3 rounded-full bg-white text-black text-sm font-medium">← Dashboard</Link>
      </div>
    );
  }

  if (site.status === "Error") {
    const errs = (site.checks || []).filter(c => c.level === "error");
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-5xl">⚠️</p>
        <h1 className="font-grotesk text-2xl font-bold">502 — Deploy failed</h1>
        <p className="text-sm text-[#888] max-w-lg">{site.name} online nahi hai. Neeche wajah dekho, phir dashboard me Auto-Fix chalao.</p>
        <div className="w-full max-w-lg text-left space-y-2 mt-2">
          {(errs.length ? errs : [{ code: "ERR", title: site.lastError || "Unknown error", detail: "Dashboard me logs dekho", level: "error" as const, fixable: false }]).map((e, i) => (
            <div key={i} className="rounded-xl bg-red-500/10 border border-red-500/25 p-3">
              <p className="text-xs text-red-300 font-medium">✕ {e.title}</p>
              <p className="text-[11px] text-[#999] mt-1">{e.detail}</p>
              <p className="text-[10px] font-mono text-[#666] mt-1">{e.code}</p>
            </div>
          ))}
        </div>
        <Link href="/dashboard" className="mt-3 px-6 py-3 rounded-full bg-white text-black text-sm font-medium">Dashboard me fix karo →</Link>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-5xl">🧩</p>
        <h1 className="font-grotesk text-2xl font-bold">{site.name} — koi web page nahi</h1>
        <p className="text-sm text-[#888] max-w-md">
          Ye {site.botType || site.fileType} hai, website nahi. Bot processes VPS/worker pe chalte hain —
          yahan bot ka status aur report dikhega.
        </p>
        <div className="rounded-2xl bg-[#111] border border-[#222] p-4 text-left w-full max-w-md">
          <p className="text-xs text-[#888]">Status</p>
          <p className={`text-sm font-semibold ${site.status === "Running" ? "text-[#00ff88]" : "text-red-400"}`}>● {site.status}</p>
          {site.botUsername && <p className="text-xs text-[#00ff88] mt-2">✓ Bot verified: @{site.botUsername}</p>}
          <p className="text-xs text-[#666] mt-2">{site.fileCount || 0} files • entry: {site.entryFile || "—"} • {site.fileSize || "—"}</p>
        </div>
        <Link href="/dashboard" className="mt-2 px-6 py-3 rounded-full bg-white text-black text-sm font-medium">← Dashboard</Link>
      </div>
    );
  }

  const siteUrl = `site/${name}`;

  return (
    <div className="min-h-screen bg-white">
      {/* ROLAX hosted bar */}
      <div className="sticky top-0 z-50 bg-black text-white px-4 py-2 flex items-center justify-between text-xs gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-5 h-5 rounded bg-gradient-to-br from-[#6C5CE7] to-[#00D4FF] flex items-center justify-center font-bold text-[10px]">R</span>
          <span className="font-grotesk font-semibold truncate">{site.url}</span>
          <span className="px-2 py-0.5 rounded-full bg-[#00ff88]/15 text-[#00ff88] shrink-0">● live</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden md:inline text-[#888]">hosted by {useStore.getState().settings.logoText}</span>
          <Link href="/dashboard" className="px-3 py-1 rounded-full bg-white text-black font-medium">Dashboard</Link>
        </div>
      </div>

      {/* asset switcher for non-html files */}
      {current.type !== "text/html" ? (
        <pre className="p-6 text-xs overflow-auto bg-[#0b0b0b] text-[#ddd] min-h-[80vh] font-mono whitespace-pre-wrap break-words">{current.content}</pre>
      ) : (
        <iframe
          title={site.name}
          srcDoc={`<meta name="viewport" content="width=device-width,initial-scale=1">${html}<style>#__rolax_nav{position:fixed;bottom:12px;right:12px;z-index:99999;font:12px system-ui;background:#111;color:#fff;padding:8px 12px;border-radius:999px;opacity:.85}</style><div id="__rolax_nav">${site.url}</div>`}
          className="w-full border-0"
          style={{ height: "calc(100vh - 36px)" }}
          sandbox="allow-scripts allow-forms allow-popups allow-modals"
        />
      )}
      <div className="fixed bottom-3 left-3 z-50 text-[10px] text-[#666] bg-white/80 px-2 py-1 rounded">
        /{siteUrl}{route !== "index.html" ? ` → ${route}` : ""}
      </div>
    </div>
  );
}
