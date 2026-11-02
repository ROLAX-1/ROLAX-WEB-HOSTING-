"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { toast } from "@/components/ui/Toaster";
import { OFFER_PRESETS, THEMES, getOffers, makeOffer, type Offer } from "@/lib/offers";

export default function OffersPanel() {
  const { settings, setSettings, plans, hydrate } = useStore();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [annText, setAnnText] = useState("");
  const [annEmoji, setAnnEmoji] = useState("📢");

  useEffect(() => { hydrate(); }, [hydrate]);
  useEffect(() => { setOffers(getOffers(settings)); }, [settings]);

  const persist = (next: Offer[]) => {
    setOffers(next);
    setSettings({ ...settings, offers: next } as any);
  };

  const addPreset = (p: typeof OFFER_PRESETS[number]) => {
    const o = makeOffer(p, offers.length);
    persist([...offers, o]);
    setOpenId(o.id);
    toast(`${p.emoji} ${p.name} add ho gaya — neeche details edit karo`, "success");
  };

  const addBlank = () => {
    const o = makeOffer(OFFER_PRESETS[OFFER_PRESETS.length - 1], offers.length);
    o.title = "Naya Offer"; o.badge = "🔥 NEW OFFER"; o.desc = "Kuch bhi offer banao"; o.code = "NEWOFFER";
    persist([...offers, o]);
    setOpenId(o.id);
    toast("Naya offer ban gaya — sab kuch tumhare control me", "success");
  };

  const update = (id: string, patch: Partial<Offer>) => persist(offers.map(o => o.id === id ? { ...o, ...patch } : o));
  const [lastDeleted, setLastDeleted] = useState<{ offer: Offer; index: number } | null>(null);

  const remove = (id: string) => {
    const idx = offers.findIndex(o => o.id === id);
    const gone = offers[idx];
    if (!gone) return;
    persist(offers.filter(o => o.id !== id));
    setLastDeleted({ offer: gone, index: idx });
    setOpenId(null);
    toast("Offer delete ho gaya — Undo dabao wapas laane ke liye", "info");
  };

  const undoDelete = () => {
    if (!lastDeleted) return;
    const next = [...offers];
    next.splice(Math.min(lastDeleted.index, next.length), 0, lastDeleted.offer);
    persist(next);
    setLastDeleted(null);
    toast("Offer wapas aa gaya", "success");
  };
  const duplicate = (o: Offer) => { const copy = { ...o, id: "of_" + Date.now(), title: o.title + " (copy)" }; persist([...offers, copy]); toast("Offer duplicate ho gaya", "success"); };

  const saveAll = () => {
    setSettings({ ...settings, offers } as any);
    toast(`✅ Save ho gaya — ${offers.filter(o => o.enabled).length} offer live hain (landing page pe turant dikhenge)`, "success");
  };

  const anns = (settings as any).announcements || [];

  return (
    <div className="space-y-5 max-w-4xl pb-24">
      <div>
        <h2 className="font-grotesk text-xl font-bold">🎉 Offers & Festivals</h2>
        <p className="text-sm text-[#888]">Jitne chahe offers banao — percentage, flat $, ya free gift. Har offer ka apna coupon, countdown aur top banner.</p>
      </div>

      <div className="rounded-2xl bg-[#111] border border-[#222] p-4">
        <p className="text-xs text-[#888] mb-2">1-click presets (jitne chahe add karo — 6, 8, 10...) • har offer ke saamne 🗑 delete button hai</p>
        <div className="flex flex-wrap gap-2">
          {OFFER_PRESETS.map(p => (
            <button key={p.key} onClick={() => addPreset(p)} className="px-3 py-2 rounded-full bg-black border border-[#222] hover:border-white text-xs">{p.emoji} {p.name}</button>
          ))}
          <button onClick={addBlank} className="px-3 py-2 rounded-full bg-white text-black text-xs font-medium">+ Koi bhi naya offer</button>
        </div>
      </div>

      {offers.length === 0 && (
        <div className="rounded-2xl bg-[#111] border border-[#222] p-6 text-center">
          <p className="text-3xl mb-2">🎁</p>
          <p className="text-sm text-[#888]">Abhi koi offer nahi. Upar se preset chuno ya &ldquo;Koi bhi naya offer&rdquo; dabao.</p>
        </div>
      )}

      <div className="space-y-3">
        {offers.map((o, idx) => {
          const theme = THEMES[o.theme] || THEMES.custom;
          const open = openId === o.id;
          return (
            <div key={o.id} className="rounded-2xl bg-[#111] border border-[#222] overflow-hidden">
              <div className="p-3 flex items-center gap-3">
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0" style={{ background: theme.grad }}>{o.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{o.title}</p>
                  <p className="text-[11px] text-[#666] truncate">{o.code || "no code"} • {o.type === "percent" ? `${o.discount}%` : o.type === "flat" ? `$${o.flatOff} off` : (o.freebie || "freebie")} • {o.banner ? "banner ON" : "banner off"}</p>
                </div>
                <button onClick={() => update(o.id, { enabled: !o.enabled })} className={`px-2.5 py-1 rounded-full text-[10px] shrink-0 ${o.enabled ? "bg-[#00ff88]/15 text-[#00ff88]" : "bg-[#222] text-[#888]"}`}>{o.enabled ? "LIVE" : "OFF"}</button>
                <button onClick={() => setOpenId(open ? null : o.id)} className="px-3 py-1 rounded-full bg-[#111] border border-[#222] text-[10px] shrink-0">{open ? "Close" : "Edit"}</button>
                <button onClick={() => remove(o.id)} title="Offer delete karo" className="px-2.5 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-[11px] font-semibold shrink-0">🗑 Delete</button>
              </div>

              {open && (
                <div className="p-4 border-t border-[#222] space-y-3 bg-black/40">
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="md:col-span-2">
                      <label className="text-[11px] text-[#888]">Offer ka type</label>
                      <div className="flex gap-2 mt-1">
                        {[["percent", "% discount"], ["flat", "Flat $ off"], ["freebie", "Free gift"]] .map(([v, l]) => (
                          <button key={v} onClick={() => update(o.id, { type: v as any })}
                            className={`px-3 py-1.5 rounded-full text-[11px] border ${o.type === v ? "bg-white text-black border-white" : "bg-black border-[#222] text-[#888]"}`}>{l}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] text-[#888]">Title</label>
                      <input value={o.title} onChange={e => update(o.id, { title: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" />
                    </div>
                    <div>
                      <label className="text-[11px] text-[#888]">Badge</label>
                      <input value={o.badge} onChange={e => update(o.id, { badge: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-[11px] text-[#888]">Description</label>
                      <input value={o.desc} onChange={e => update(o.id, { desc: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" />
                    </div>
                    <div>
                      <label className="text-[11px] text-[#888]">Coupon code</label>
                      <input value={o.code} onChange={e => update(o.id, { code: e.target.value.toUpperCase() })} className="mt-1 w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm font-mono" />
                    </div>
                    {o.type === "percent" && (
                      <div>
                        <label className="text-[11px] text-[#888]">Discount %</label>
                        <input type="number" value={o.discount} onChange={e => update(o.id, { discount: Number(e.target.value) })} className="mt-1 w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" />
                      </div>
                    )}
                    {o.type === "flat" && (
                      <div>
                        <label className="text-[11px] text-[#888]">Flat $ off</label>
                        <input type="number" value={o.flatOff} onChange={e => update(o.id, { flatOff: Number(e.target.value) })} className="mt-1 w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" />
                      </div>
                    )}
                    {o.type === "freebie" && (
                      <div>
                        <label className="text-[11px] text-[#888]">Free gift kya hai</label>
                        <input value={o.freebie} onChange={e => update(o.id, { freebie: e.target.value })} placeholder="Free .com domain, 1 month extra…" className="mt-1 w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" />
                      </div>
                    )}
                    <div>
                      <label className="text-[11px] text-[#888]">Theme</label>
                      <select value={o.theme} onChange={e => update(o.id, { theme: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm">
                        {Object.entries(THEMES).map(([k, t]) => <option key={k} value={k}>{t.emoji} {t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-[#888]">Emoji</label>
                      <input value={o.emoji} onChange={e => update(o.id, { emoji: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm text-center" />
                    </div>
                    <div>
                      <label className="text-[11px] text-[#888]">Kab tak (countdown)</label>
                      <input type="datetime-local" value={o.endsAt} onChange={e => update(o.id, { endsAt: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-[11px] text-[#888]">Kis plan pe (khali = saare paid plans)</label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {(plans || []).filter(p => p.price > 0).map(p => {
                          const on = (o.plans || []).includes(p.id);
                          return (
                            <button key={p.id} onClick={() => update(o.id, { plans: on ? (o.plans || []).filter(x => x !== p.id) : [...(o.plans || []), p.id] })}
                              className={`px-3 py-1.5 rounded-full text-[11px] border ${on ? "bg-white text-black border-white" : "bg-black border-[#222] text-[#888]"}`}>{p.name} (${p.price})</button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl bg-[#111] border border-[#222] p-3">
                    <label className="flex items-center justify-between">
                      <span className="text-xs">Top banner me dikhao</span>
                      <input type="checkbox" checked={o.banner} onChange={e => update(o.id, { banner: e.target.checked })} className="w-4 h-4 accent-[#6C5CE7]" />
                    </label>
                    <input value={o.bannerText} onChange={e => update(o.id, { bannerText: e.target.value })} placeholder="Banner text" className="mt-2 w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-xs" />
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => duplicate(o)} className="px-3 py-1.5 rounded-full bg-[#111] border border-[#222] text-[11px]">Duplicate</button>
                    <button onClick={() => remove(o.id)} className="px-4 py-1.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-[11px] font-medium">🗑 Delete this offer</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Announcements */}
      <div className="rounded-2xl bg-[#111] border border-[#222] p-4 space-y-3">
        <h4 className="text-sm font-semibold">📢 Announcements</h4>
        <div className="flex gap-2">
          <input value={annEmoji} onChange={e => setAnnEmoji(e.target.value)} className="w-14 px-2 py-2 rounded-xl bg-black border border-[#222] text-sm text-center" />
          <input value={annText} onChange={e => setAnnText(e.target.value)} placeholder="Naya feature: Python runner live hai!" className="flex-1 px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" />
          <button onClick={() => {
            if (!annText.trim()) return;
            setSettings({ ...settings, announcements: [...anns, { id: "an_" + Date.now(), text: annText.trim(), emoji: annEmoji, active: true }] } as any);
            setAnnText(""); toast("Announcement add ho gaya", "success");
          }} className="px-4 py-2 rounded-full bg-white text-black text-xs">+ Add</button>
        </div>
        {anns.length === 0 && <p className="text-[11px] text-[#666]">Koi announcement nahi.</p>}
        {anns.map((a: any) => (
          <div key={a.id} className="flex items-center gap-2 rounded-xl bg-black border border-[#222] p-2">
            <span>{a.emoji}</span>
            <span className="flex-1 text-xs text-[#ddd]">{a.text}</span>
            <button onClick={() => setSettings({ ...settings, announcements: anns.map((x: any) => x.id === a.id ? { ...x, active: !x.active } : x) } as any)}
              className={`px-2 py-1 rounded-full text-[10px] ${a.active ? "bg-[#00ff88]/15 text-[#00ff88]" : "bg-[#222] text-[#888]"}`}>{a.active ? "ON" : "OFF"}</button>
            <button onClick={() => setSettings({ ...settings, announcements: anns.filter((x: any) => x.id !== a.id) } as any)} className="px-2 py-1 rounded-full bg-red-500/10 text-red-400 text-[10px]">✕</button>
          </div>
        ))}
      </div>

      {/* sticky save */}
      <div className="fixed bottom-0 left-0 right-0 md:left-[260px] z-40 bg-[#0a0a0f]/95 backdrop-blur border-t border-[#222] px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] text-[#888]">{offers.filter(o => o.enabled).length} live / {offers.length} total offers</p>
          {lastDeleted && (
            <button onClick={undoDelete} className="text-[11px] text-[#FF8A00] underline">↩ Undo delete — {lastDeleted.offer.title}</button>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => { setOffers(getOffers(settings)); setLastDeleted(null); toast("Changes discard", "info"); }} className="px-4 py-2.5 rounded-full bg-[#111] border border-[#222] text-xs">Discard</button>
          <button onClick={saveAll} className="px-6 py-2.5 rounded-full bg-white text-black text-sm font-semibold">💾 Save offers</button>
        </div>
      </div>
    </div>
  );
}
