"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { toast } from "@/components/ui/Toaster";

const PRESETS = [
  { id: "diwali", emoji: "🪔", name: "Diwali Dhamaka", badge: "🪔 DIWALI DHAMAKA", title: "Diwali Special — 50% OFF", desc: "Har plan pe flat 50% off. Sirf Diwali tak!", code: "DIWALI50", discount: 50, banner: "🪔 Diwali Sale LIVE — coupon DIWALI50 se 50% OFF" },
  { id: "newyear", emoji: "🎉", name: "New Year", badge: "🎉 NEW YEAR OFFER", title: "Naye Saal me Naya Project — 40% OFF", desc: "New year special discount har hosting plan pe.", code: "NEWYEAR40", discount: 40, banner: "🎉 New Year Sale — 40% OFF coupon NEWYEAR40" },
  { id: "holi", emoji: "🎨", name: "Holi", badge: "🎨 HOLI SPLASH", title: "Holi Special — 35% OFF", desc: "Rangon wala offer, har plan pe 35% off!", code: "HOLI35", discount: 35, banner: "🎨 Holi Sale — 35% OFF coupon HOLI35" },
  { id: "blackfriday", emoji: "🖤", name: "Black Friday", badge: "🖤 BLACK FRIDAY", title: "Black Friday — 60% OFF", desc: "Saal ka sabse bada discount.", code: "BLACK60", discount: 60, banner: "🖤 BLACK FRIDAY — 60% OFF coupon BLACK60" },
  { id: "custom", emoji: "🔥", name: "Custom offer", badge: "🔥 SPECIAL OFFER", title: "Mega Sale — 25% OFF", desc: "Limited time offer.", code: "SAVE25", discount: 25, banner: "🔥 Mega Sale LIVE — coupon SAVE25" },
];

export default function OffersPanel() {
  const { settings, setSettings, plans } = useStore();
  const s = settings as any;
  const [annText, setAnnText] = useState("");
  const [annEmoji, setAnnEmoji] = useState("📢");

  const set = (patch: any) => setSettings({ ...settings, ...patch } as any);

  const applyPreset = (p: typeof PRESETS[number]) => {
    set({
      offersEnabled: true,
      offerTheme: p.id,
      offerBadge: p.badge,
      offerTitle: p.title,
      offerDesc: p.desc,
      offerCode: p.code,
      offerDiscount: p.discount,
      offerBannerEnabled: true,
      offerBannerText: p.banner,
    } as any);
    toast(`${p.emoji} ${p.name} offer apply ho gaya — Save mat bhoolna`, "success");
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="font-grotesk text-xl font-bold">🎉 Offers & Festivals</h2>
        <p className="text-sm text-[#888]">Diwali ya koi bhi offer banao — landing page pe banner, countdown, coupon code aur discounted price apne aap dikhega.</p>
      </div>

      {/* presets */}
      <div className="rounded-2xl bg-[#111] border border-[#222] p-4">
        <p className="text-xs text-[#888] mb-2">1-click festival presets</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button key={p.id} onClick={() => applyPreset(p)} className="px-3 py-2 rounded-full bg-black border border-[#222] hover:border-white text-xs">
              {p.emoji} {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* offer form */}
      <div className="rounded-2xl bg-[#111] border border-[#222] p-4 space-y-3">
        <label className="flex items-center justify-between">
          <span className="text-sm font-medium">Offer chalau (landing page pe section)</span>
          <input type="checkbox" checked={!!s.offersEnabled} onChange={e => set({ offersEnabled: e.target.checked })} className="w-5 h-5 accent-[#6C5CE7]" />
        </label>

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-[#888]">Badge</label>
            <input value={s.offerBadge || ""} onChange={e => set({ offerBadge: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" placeholder="🪔 DIWALI DHAMAKA" />
          </div>
          <div>
            <label className="text-[11px] text-[#888]">Theme</label>
            <select value={s.offerTheme || "diwali"} onChange={e => set({ offerTheme: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm">
              {PRESETS.map(p => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-[11px] text-[#888]">Title</label>
          <input value={s.offerTitle || ""} onChange={e => set({ offerTitle: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" />
        </div>
        <div>
          <label className="text-[11px] text-[#888]">Description</label>
          <input value={s.offerDesc || ""} onChange={e => set({ offerDesc: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" />
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] text-[#888]">Coupon code</label>
            <input value={s.offerCode || ""} onChange={e => set({ offerCode: e.target.value.toUpperCase() })} className="mt-1 w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm font-mono" />
          </div>
          <div>
            <label className="text-[11px] text-[#888]">Discount %</label>
            <input type="number" value={s.offerDiscount ?? 0} onChange={e => set({ offerDiscount: Number(e.target.value) })} className="mt-1 w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" />
          </div>
          <div>
            <label className="text-[11px] text-[#888]">Kab tak (countdown)</label>
            <input type="datetime-local" value={s.offerEndsAt || ""} onChange={e => set({ offerEndsAt: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" />
          </div>
        </div>

        <div>
          <label className="text-[11px] text-[#888]">Kis plan pe offer lagu (khali = saare paid plans)</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {(plans || []).filter(p => p.price > 0).map(p => {
              const on = (s.offerPlans || []).includes(p.id);
              return (
                <button key={p.id} onClick={() => set({ offerPlans: on ? (s.offerPlans || []).filter((x: string) => x !== p.id) : [...(s.offerPlans || []), p.id] })}
                  className={`px-3 py-1.5 rounded-full text-[11px] border ${on ? "bg-white text-black border-white" : "bg-black border-[#222] text-[#888]"}`}>
                  {p.name} (${p.price})
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* banner */}
      <div className="rounded-2xl bg-[#111] border border-[#222] p-4 space-y-2">
        <label className="flex items-center justify-between">
          <span className="text-sm font-medium">Top banner dikhao (poori site pe)</span>
          <input type="checkbox" checked={!!s.offerBannerEnabled} onChange={e => set({ offerBannerEnabled: e.target.checked })} className="w-5 h-5 accent-[#6C5CE7]" />
        </label>
        <input value={s.offerBannerText || ""} onChange={e => set({ offerBannerText: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" placeholder="🪔 Diwali Sale LIVE — coupon DIWALI50" />
      </div>

      {/* announcements */}
      <div className="rounded-2xl bg-[#111] border border-[#222] p-4 space-y-3">
        <h4 className="text-sm font-semibold">📢 Announcements (chhoti khabrein landing page pe)</h4>
        <div className="flex gap-2">
          <input value={annEmoji} onChange={e => setAnnEmoji(e.target.value)} className="w-14 px-2 py-2 rounded-xl bg-black border border-[#222] text-sm text-center" />
          <input value={annText} onChange={e => setAnnText(e.target.value)} placeholder="Naya feature: Python runner live hai!" className="flex-1 px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" />
          <button onClick={() => {
            if (!annText.trim()) return;
            set({ announcements: [...(s.announcements || []), { id: "an_" + Date.now(), text: annText.trim(), emoji: annEmoji, active: true }] });
            setAnnText(""); toast("Announcement add ho gaya", "success");
          }} className="px-4 py-2 rounded-full bg-white text-black text-xs">+ Add</button>
        </div>
        {(s.announcements || []).length === 0 && <p className="text-[11px] text-[#666]">Koi announcement nahi.</p>}
        {(s.announcements || []).map((a: any) => (
          <div key={a.id} className="flex items-center gap-2 rounded-xl bg-black border border-[#222] p-2">
            <span>{a.emoji}</span>
            <span className="flex-1 text-xs text-[#ddd]">{a.text}</span>
            <button onClick={() => set({ announcements: (s.announcements || []).map((x: any) => x.id === a.id ? { ...x, active: !x.active } : x) })}
              className={`px-2 py-1 rounded-full text-[10px] ${a.active ? "bg-[#00ff88]/15 text-[#00ff88]" : "bg-[#222] text-[#888]"}`}>{a.active ? "ON" : "OFF"}</button>
            <button onClick={() => set({ announcements: (s.announcements || []).filter((x: any) => x.id !== a.id) })} className="px-2 py-1 rounded-full bg-red-500/10 text-red-400 text-[10px]">✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
