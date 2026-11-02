"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";

const THEMES: Record<string, { grad: string; glow: string; emoji: string }> = {
  diwali: { grad: "linear-gradient(135deg,#FF8A00,#FF3D71,#6C5CE7)", glow: "#FF8A00", emoji: "🪔" },
  holi:   { grad: "linear-gradient(135deg,#FF0080,#FFD700,#00D4FF)", glow: "#FF0080", emoji: "🎨" },
  newyear:{ grad: "linear-gradient(135deg,#00D4FF,#6C5CE7,#FFD700)", glow: "#00D4FF", emoji: "🎉" },
  blackfriday: { grad: "linear-gradient(135deg,#111,#333,#000)", glow: "#888", emoji: "🖤" },
  custom: { grad: "linear-gradient(135deg,#6C5CE7,#00D4FF)", glow: "#6C5CE7", emoji: "🔥" },
};

function useCountdown(endsAt?: string) {
  const [left, setLeft] = useState<string>("");
  useEffect(() => {
    if (!endsAt) { setLeft(""); return; }
    const tick = () => {
      const ms = new Date(endsAt).getTime() - Date.now();
      if (ms <= 0) { setLeft("Offer khatam"); return; }
      const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
      setLeft(`${d > 0 ? d + "d " : ""}${h}h ${m}m ${s}s`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [endsAt]);
  return left;
}

/** Top ribbon — Site Customizer se on/off + text change */
export function OfferBanner() {
  const { settings, hydrated, hydrate } = useStore();
  const [closed, setClosed] = useState(false);
  useEffect(() => { hydrate(); const c = localStorage.getItem("rolax_banner_closed"); if (c === (settings as any)?.offerBannerText) setClosed(true); }, [hydrate, settings]);
  if (!hydrated || closed || !(settings as any)?.offerBannerEnabled) return null;
  const theme = THEMES[(settings as any)?.offerTheme || "diwali"] || THEMES.diwali;
  return (
    <div className="w-full text-center text-[11px] md:text-xs font-medium text-black px-3 py-1.5 flex items-center justify-center gap-2 relative z-[60]" style={{ background: theme.grad }}>
      <span>{theme.emoji}</span>
      <span className="truncate">{(settings as any)?.offerBannerText}</span>
      <button
        onClick={() => { localStorage.setItem("rolax_banner_closed", (settings as any)?.offerBannerText || ""); setClosed(true); }}
        className="ml-2 opacity-70 hover:opacity-100 shrink-0"
        aria-label="close"
      >✕</button>
    </div>
  );
}

/** Festival offer card — Diwali / Holi / New Year / custom, coupon + countdown + discounted prices */
export default function OfferStrip() {
  const { settings, plans } = useStore();
  const s = settings as any;
  const countdown = useCountdown(s?.offerEndsAt);
  if (!s?.offersEnabled) return null;
  const theme = THEMES[s.offerTheme || "diwali"] || THEMES.diwali;
  const discount = Number(s.offerDiscount) || 0;
  const list = (plans || []).filter(p => p.price > 0 && (!s.offerPlans?.length || s.offerPlans.includes(p.id))).slice(0, 3);

  return (
    <section id="offers" className="max-w-7xl mx-auto px-4 md:px-6 py-8">
      <div className="rounded-3xl p-[1.5px]" style={{ background: theme.grad }}>
        <div className="rounded-3xl bg-[#0a0a0f] p-5 md:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-full inline-block text-black" style={{ background: theme.grad }}>
                {s.offerBadge}
              </p>
              <h3 className="font-grotesk text-2xl md:text-3xl font-bold mt-2">{s.offerTitle}</h3>
              <p className="text-sm text-[#999] mt-1">{s.offerDesc}</p>
            </div>
            <div className="text-right">
              {discount > 0 && (
                <p className="text-3xl md:text-4xl font-bold" style={{ background: theme.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{discount}% OFF</p>
              )}
              {s.offerCode && (
                <button
                  onClick={() => { navigator.clipboard?.writeText(s.offerCode); }}
                  className="mt-1 text-[11px] px-3 py-1 rounded-full border border-dashed border-[#444] text-[#ccc] hover:border-white"
                  title="Copy coupon"
                >Code: <b>{s.offerCode}</b> · copy</button>
              )}
              {countdown && <p className="text-[11px] text-[#FF8A00] mt-1">⏳ {countdown}</p>}
            </div>
          </div>

          {list.length > 0 && (
            <div className="mt-4 grid md:grid-cols-3 gap-3">
              {list.map(p => {
                const off = p.price * (1 - discount / 100);
                return (
                  <div key={p.id} className="rounded-2xl bg-[#111] border border-[#222] p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-[11px] text-[#666] line-through">${p.price}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold" style={{ color: theme.glow }}>${off.toFixed(2)}</p>
                      <Link href="/register" className="text-[10px] text-[#888] underline">Claim →</Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-[10px] text-[#666] mt-3">Payment ke time coupon code daalo — discount turant lag jayega.</p>
        </div>
      </div>
    </section>
  );
}
