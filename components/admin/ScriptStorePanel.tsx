"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { toast } from "@/components/ui/Toaster";
import { deleteScript, downloadScript, getPurchases, saveScript, setScripts, getScripts, effectiveAccess, type StoreScript } from "@/lib/scripts";

const EMPTY: StoreScript = {
  id: "", name: "", category: "Telegram Bot", description: "", price: 0, access: "free",
  planIds: [], stack: "Python", fileName: "", content: "", icon: "🤖", tags: [], downloads: 0, active: true, createdAt: "",
};

export default function ScriptStorePanel() {
  const { plans } = useStore();
  const [list, setList] = useState<StoreScript[]>([]);
  const [form, setForm] = useState<StoreScript>({ ...EMPTY });
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  const reload = () => setList(getScripts());
  useEffect(() => { reload(); const on = () => reload(); window.addEventListener("rolax:sync", on); window.addEventListener("focus", on); return () => { window.removeEventListener("rolax:sync", on); window.removeEventListener("focus", on); }; }, []);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      if (file.size > 3 * 1024 * 1024) { toast("3MB tak ki file allowed hai", "error"); return; }
      const isZip = /\.zip$/i.test(file.name);
      if (isZip) {
        const buf = await file.arrayBuffer();
        let bin = "";
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
        setForm(f => ({ ...f, fileName: file.name, content: btoa(bin), isZip: true, name: f.name || file.name.replace(/\.zip$/i, "") }));
      } else {
        const text = await file.text();
        const stack: StoreScript["stack"] = /\.py$/i.test(file.name) ? "Python" : /\.(js|mjs|json)$/i.test(file.name) ? "Node.js" : "HTML";
        const category: StoreScript["category"] = /bot|telegram/i.test(text.slice(0, 4000)) ? "Telegram Bot" : /<html/i.test(text.slice(0, 2000)) ? "Website" : stack === "Python" ? "Python Script" : "Node Script";
        setForm(f => ({ ...f, fileName: file.name, content: text, isZip: false, stack, category, name: f.name || file.name.replace(/\.[^.]+$/, "") }));
      }
      toast("File padh li gayi — naam / price / plan set karo", "success");
    } catch (e: any) {
      toast("File read fail: " + (e?.message || ""), "error");
    } finally { setBusy(false); }
  };

  const save = () => {
    if (!form.name.trim()) { toast("Naam likho", "error"); return; }
    if (!form.content) { toast("Pehle file upload karo", "error"); return; }
    if (form.access === "plan" && !(form.planIds || []).length) { toast("Kam se kam ek plan chuno", "error"); return; }
    if (form.access === "plan" && (form.price || 0) > 0) { toast("Plan access wale script ka price 0 rakho (ya access=paid chuno)", "info"); }
    const autoAccess = form.access === "free" && (form.price || 0) > 0 ? "paid" : form.access;
    const item: StoreScript = { ...form, access: autoAccess, id: form.id || "sc_" + Date.now(), createdAt: form.createdAt || new Date().toISOString() };
    saveScript(item);
    toast(form.id ? "Script update ho gayi ✅" : "Script store me add ho gayi ✅", "success");
    setForm({ ...EMPTY });
    reload();
  };

  const filtered = list.filter(s => !q || s.name.toLowerCase().includes(q.toLowerCase()) || s.category.toLowerCase().includes(q.toLowerCase()));
  const purchases = typeof window !== "undefined" ? getPurchases() : [];

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h2 className="font-grotesk text-xl font-bold">🛒 Script Store</h2>
        <p className="text-sm text-[#888]">Script / bot / website upload karo — naam, price aur kaun sa plan access dekh sakta hai, sab yahan set karo. User dashboard me search karke download karega.</p>
      </div>

      {/* upload form */}
      <div className="rounded-2xl bg-[#111] border border-[#222] p-4 space-y-3">
        <h4 className="text-sm font-semibold">{form.id ? "✏️ Script edit" : "➕ Naya script upload"}</h4>

        <label className="block rounded-xl border border-dashed border-[#333] bg-black p-4 text-center cursor-pointer hover:border-white">
          <input type="file" accept=".py,.js,.html,.zip,.json,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
          <p className="text-xs text-[#ccc]">{busy ? "Padh raha hoon..." : form.fileName ? `📄 ${form.fileName} (${form.isZip ? "ZIP" : "source"})` : "📤 Script file upload karo (.py / .js / .html / .zip)"}</p>
          <p className="text-[10px] text-[#666] mt-1">3MB tak</p>
        </label>

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-[#888]">Script ka naam</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="jaise: Crypto Price Bot" className="mt-1 w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" />
          </div>
          <div>
            <label className="text-[11px] text-[#888]">Category</label>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as any })} className="mt-1 w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm">
              {["Telegram Bot", "Website", "Python Script", "Node Script", "Other"].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-[11px] text-[#888]">Description</label>
          <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Kya karta hai ye script" className="mt-1 w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" />
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] text-[#888]">Price (USD, 0 = free)</label>
            <input type="number" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: Number(e.target.value) })} className="mt-1 w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" />
          </div>
          <div>
            <label className="text-[11px] text-[#888]">Kaun le sakta hai</label>
            <select value={form.access} onChange={e => setForm({ ...form, access: e.target.value as any })} className="mt-1 w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm">
              <option value="free">Free — sabko</option>
              <option value="paid">Paid — kharidna padega</option>
              <option value="plan">Sirf selected plans</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] text-[#888]">Icon</label>
            <input value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm text-center" />
          </div>
        </div>

        {form.access === "plan" && (
          <div>
            <label className="text-[11px] text-[#888]">Kaun se plan (Ultra Pro etc.)</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {(plans || []).map(p => {
                const on = (form.planIds || []).includes(p.id);
                return (
                  <button key={p.id} onClick={() => setForm({ ...form, planIds: on ? (form.planIds || []).filter(x => x !== p.id) : [...(form.planIds || []), p.id] })}
                    className={`px-3 py-1.5 rounded-full text-[11px] border ${on ? "bg-white text-black border-white" : "bg-black border-[#222] text-[#888]"}`}>{p.name}</button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <label className="text-[11px] text-[#888]">Tags (comma se)</label>
          <input value={(form.tags || []).join(", ")} onChange={e => setForm({ ...form, tags: e.target.value.split(",").map(t => t.trim()).filter(Boolean) })} placeholder="telegram, crypto, python" className="mt-1 w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" />
        </div>

        <div className="flex gap-2">
          <button onClick={save} className="px-5 py-2.5 rounded-full bg-white text-black text-sm font-medium">{form.id ? "Update script" : "Add to store"}</button>
          {form.id && <button onClick={() => setForm({ ...EMPTY })} className="px-4 py-2.5 rounded-full bg-[#111] border border-[#222] text-sm">Cancel</button>}
        </div>
      </div>

      {/* list */}
      <div className="rounded-2xl bg-[#111] border border-[#222] p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h4 className="text-sm font-semibold">Store me {list.length} script(s)</h4>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search..." className="px-3 py-1.5 rounded-full bg-black border border-[#222] text-xs w-40" />
        </div>

        {filtered.length === 0 && <p className="text-[11px] text-[#666]">Abhi koi script nahi — upar se upload karo.</p>}

        <div className="space-y-2">
          {filtered.map(s => {
            const buys = purchases.filter(p => p.scriptId === s.id);
            return (
              <div key={s.id} className="rounded-xl bg-black border border-[#222] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.icon} {s.name} {!s.active && <span className="text-[10px] text-red-400">(hidden)</span>}</p>
                    <p className="text-[11px] text-[#666] truncate">{s.category} • {s.stack} • {s.fileName}{s.isZip ? " (zip)" : ""}</p>
                    <p className="text-[11px] text-[#888] mt-1">{s.description || "—"}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#6C5CE7]/15 text-[#a89bff]">{effectiveAccess(s) === "free" ? "FREE" : effectiveAccess(s) === "paid" ? `$${s.price}` : (s.planIds || []).map(id => (plans || []).find(p => p.id === id)?.name).filter(Boolean).join(", ") || "PLAN"}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#00ff88]/10 text-[#00ff88]">{buys.length} kharida / {s.downloads || 0} download</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button onClick={() => setForm(s)} className="px-3 py-1 rounded-full bg-[#111] border border-[#222] text-[10px]">Edit</button>
                    <button onClick={() => { const l = getScripts().map(x => x.id === s.id ? { ...x, active: !x.active } : x); setScripts(l); reload(); }} className="px-3 py-1 rounded-full bg-[#111] border border-[#222] text-[10px]">{s.active ? "Hide" : "Show"}</button>
                    <button onClick={() => downloadScript(s)} className="px-3 py-1 rounded-full bg-white text-black text-[10px]">⬇</button>
                    <button onClick={() => { if (confirm("Delete " + s.name + "?")) { deleteScript(s.id); reload(); toast("Deleted", "info"); } }} className="px-3 py-1 rounded-full bg-red-500/10 text-red-400 text-[10px]">✕</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* who bought */}
      <div className="rounded-2xl bg-[#111] border border-[#222] p-4">
        <h4 className="text-sm font-semibold mb-2">🧾 Kaun-kisne kharida ({purchases.length})</h4>
        {purchases.length === 0 ? <p className="text-[11px] text-[#666]">Abhi koi purchase nahi.</p> : (
          <div className="space-y-1 max-h-64 overflow-auto">
            {purchases.slice().reverse().map(p => (
              <div key={p.id} className="flex items-center justify-between text-[11px] rounded-lg bg-black border border-[#222] px-2 py-1.5">
                <span className="text-[#ccc]">{p.email || p.userId}</span>
                <span className="text-[#888]">{list.find(s => s.id === p.scriptId)?.name || p.scriptId}</span>
                <span className="text-[#00ff88]">{p.price > 0 ? `$${p.price}` : "free"}</span>
                <span className="text-[#555]">{new Date(p.at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
