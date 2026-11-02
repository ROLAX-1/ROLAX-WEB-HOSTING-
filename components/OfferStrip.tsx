"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { THEMES, getOffers, offerLive, offerLabel, applyOffer, useCountdown, type Offer } from "@/lib/offers";

/** Top ribbon — sirf ek patli line, navbar ke neeche nahi, page ko dhakta nahi */
export function OfferBanner() {
  const { settings, plans, hydrate } = useStore();
  const [closed, setClosed] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { hydrate(); setMounted(true); }, [hydrate]);

  const banners = getOffers(settings).filter(o => offerLive(o) && o.banner);
  const sig = banners.map(b => b.id + b.bannerText).join("|");
  const visible = mounted && !closed && banners.length > 0;
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty("--banner-h", visible ? "30px" : "0px");
  }, [visible]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setClosed(localStorage.getItem("rolax_banner_closed") === sig);
  }, [sig]);

  if (!visible) return null;
  const theme = THEMES[banners[0].theme] || THEMES.custom;

  return (
    <div
      className="w-full text-center font-medium text-black flex items-center justify-center gap-2 px-3 sticky top-0 z-[70] text-[11px] md:text-xs leading-5"
      style={{ background: theme.grad, height: 30 }}
    >
      <span className="truncate max-w-[80vw]">{banners.map(b => b.bannerText || `${b.emoji} ${b.title}`).join("  •  ")}</span>
      <button
        onClick={() => { localStorage.setItem("rolax_banner_closed", sig); setClosed(true); }}
        className="shrink-0 opacity-70 hover:opacity-100 font-bold px-1"
        aria-label="close banner"
      >✕</button>
    </div>
  );
}

function OfferCard({ o, plans }: { o: Offer; plans: any[] }) {
  const theme = THEMES[o.theme] || THEMES.custom;
  const countdown = useCountdown(o.endsAt);
  const list = (plans || []).filter(p => p.price > 0 && (!o.plans?.length || o.plans.includes(p.id))).slice(0, 3);
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-3xl p-[1.5px]" style={{ background: theme.grad }}>
      <div className="rounded-3xl bg-[#0a0a0f] p-5 md:p-6 h-full">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold px-2 py-0.5 rounded-full inline-block text-black" style={{ background: theme.grad }}>{o.badge}</p>
            <h3 className="font-grotesk text-xl md:text-2xl font-bold mt-2">{o.title}</h3>
            <p className="text-sm text-[#999] mt-1">{o.desc}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl md:text-3xl font-bold" style={{ background: theme.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{offerLabel(o)}</p>
            {o.code && (
              <button
                onClick={() => { navigator.clipboard?.writeText(o.code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="mt-1 text-[11px] px-3 py-1 rounded-full border border-dashed border-[#444] text-[#ccc] hover:border-white"
              >Code: <b>{o.code}</b> · {copied ? "copied ✓" : "copy"}</button>
            )}
            {countdown && <p className="text-[11px] mt-1" style={{ color: theme.glow }}>⏳ {countdown}</p>}
          </div>
        </div>

        {list.length > 0 && (
          <div className="mt-4 grid sm:grid-cols-3 gap-2">
            {list.map(p => {
              const final = applyOffer(p.price, o);
              return (
                <div key={p.id} className="rounded-2xl bg-[#111] border border-[#222] p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{p.name}</p>
                    {final !== p.price && <p className="text-[10px] text-[#666] line-through">${p.price}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-bold" style={{ color: theme.glow }}>${final.toFixed(2)}</p>
                    <Link href="/register" className="text-[10px] text-[#888] underline">Claim →</Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[10px] text-[#666] mt-3">
          {o.type === "freebie" ? "Plan kharido, gift free milega — payment ke baad claim karo." : "Payment ke time coupon code daalo — discount turant lag jayega."}
        </p>
      </div>
    </div>
  );
}

/** Landing page pe saare live offers — 1, 2, 4, 6... jitne chaho */
export default function OfferStrip() {
  const { settings, plans, hydrate } = useStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { hydrate(); setMounted(true); }, [hydrate]);
  if (!mounted) return null;

  const offers = getOffers(settings).filter(offerLive);
  if (offers.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-grotesk text-xl md:text-2xl font-bold">🎁 Live Offers <span className="text-[#888] text-sm font-normal">({offers.length})</span></h2>
        <span className="text-[11px] text-[#666]">Coupon payment page pe lagega</span>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        {offers.map(o => <OfferCard key={o.id} o={o} plans={plans} />)}
      </div>
    </section>
  );
}
