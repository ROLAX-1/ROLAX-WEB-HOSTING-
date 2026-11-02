"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { toast } from "@/components/ui/Toaster";
import { buyScript, downloadScript, hasAccess, useScripts, effectiveAccess } from "@/lib/scripts";

export default function ScriptStore() {
  const { plans } = useStore();
  const { scripts } = useScripts();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [sort, setSort] = useState<"new" | "priceLow" | "priceHigh" | "popular">("new");

  const me = useMemo(() => {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(localStorage.getItem("rolax_auth") || "null"); } catch { return null; }
  }, []);
  const myUser = useMemo(() => {
    if (typeof window === "undefined" || !me) return null;
    try {
      const users = JSON.parse(localStorage.getItem("rolax_users") || "[]");
      const found = users.find((u: any) => u.id === me.id || u.email === me.email);
      return found || me;
    } catch { return me; }
  }, [me]);

  const list = scripts
    .filter(s => s.active)
    .filter(s => cat === "All" || s.category === cat)
    .filter(s => !q || s.name.toLowerCase().includes(q.toLowerCase()) || s.description.toLowerCase().includes(q.toLowerCase()) || (s.tags || []).join(" ").toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => sort === "priceLow" ? a.price - b.price : sort === "priceHigh" ? b.price - a.price : sort === "popular" ? (b.downloads || 0) - (a.downloads || 0) : +new Date(b.createdAt) - +new Date(a.createdAt));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-grotesk text-xl font-bold">🛒 Script Store</h2>
        <p className="text-sm text-[#888]">Ready-made bots, websites aur scripts — search karo, price dekho, download karo.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Script ka naam search karo..." className="flex-1 min-w-[180px] px-4 py-2.5 rounded-xl bg-black border border-[#222] text-sm" />
        <select value={cat} onChange={e => setCat(e.target.value)} className="px-3 py-2.5 rounded-xl bg-black border border-[#222] text-sm">
          {["All", "Telegram Bot", "Website", "Python Script", "Node Script", "Other"].map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value as any)} className="px-3 py-2.5 rounded-xl bg-black border border-[#222] text-sm">
          <option value="new">Naya pehle</option>
          <option value="priceLow">Price: low → high</option>
          <option value="priceHigh">Price: high → low</option>
          <option value="popular">Popular</option>
        </select>
      </div>

      {list.length === 0 && (
        <div className="rounded-2xl bg-[#111] border border-[#222] p-8 text-center">
          <p className="text-3xl mb-2">📦</p>
          <p className="text-sm text-[#888]">Koi script nahi mili. Admin panel se scripts add hoti hain.</p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        {list.map(s => {
          const ok = hasAccess(s, myUser);
          const planNames = (s.planIds || []).map(id => (plans || []).find(p => p.id === id)?.name).filter(Boolean);
          return (
            <div key={s.id} className="rounded-2xl bg-[#111] border border-[#222] p-4 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{s.icon} {s.name}</p>
                  <p className="text-[11px] text-[#666]">{s.category} • {s.stack}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${effectiveAccess(s) === "paid" ? "bg-[#6C5CE7]/15 text-[#a89bff]" : "bg-[#00ff88]/10 text-[#00ff88]"}`}>
                  {effectiveAccess(s) === "paid" ? `$${s.price}` : effectiveAccess(s) === "plan" ? planNames.join("/") || "Plan only" : "FREE"}
                </span>
              </div>
              <p className="text-[11px] text-[#999] mt-2 flex-1">{s.description || "—"}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {(s.tags || []).slice(0, 4).map(t => <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-black border border-[#222] text-[#777]">#{t}</span>)}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-[10px] text-[#666]">{s.downloads || 0} downloads</span>
                {ok ? (
                  <button onClick={() => { downloadScript(s); toast("Download shuru ✅", "success"); }} className="px-4 py-2 rounded-full bg-white text-black text-xs font-medium">⬇ Download</button>
                ) : (
                  <button onClick={() => {
                    if (!myUser) { toast("Pehle login karo", "error"); return; }
                    buyScript(s, myUser);
                    toast(effectiveAccess(s) === "paid" ? `Purchase ho gaya ($${s.price}) — ab download karo` : "Plan me shamil hai — download karo", "success");
                  }} className="px-4 py-2 rounded-full bg-[#6C5CE7] text-white text-xs font-medium">
                    {effectiveAccess(s) === "paid" ? `Buy $${s.price}` : "Unlock"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
