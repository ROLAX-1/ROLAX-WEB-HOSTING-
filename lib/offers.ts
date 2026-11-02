"use client";
// ROLAX OFFERS ENGINE — kitne bhi offers (percentage / flat / freebie / custom), har ek ka apna code + banner
import type { SiteSettings } from "./store";

export type Offer = {
  id: string;
  enabled: boolean;
  emoji: string;
  badge: string;
  title: string;
  desc: string;
  type: "percent" | "flat" | "freebie";
  code: string;
  discount: number;      // percent ke liye
  flatOff: number;       // flat $ off
  freebie: string;       // "Free .com domain" jaisa
  endsAt: string;        // countdown (optional)
  theme: string;         // diwali / holi / newyear / blackfriday / custom
  plans: string[];       // khali = saare paid plans
  banner: boolean;       // top banner me dikhaye
  bannerText: string;
};

export const THEMES: Record<string, { grad: string; glow: string; emoji: string; label: string }> = {
  diwali: { grad: "linear-gradient(135deg,#FF8A00,#FF3D71,#6C5CE7)", glow: "#FF8A00", emoji: "🪔", label: "Diwali" },
  holi: { grad: "linear-gradient(135deg,#FF0080,#FFD700,#00D4FF)", glow: "#FF0080", emoji: "🎨", label: "Holi" },
  newyear: { grad: "linear-gradient(135deg,#00D4FF,#6C5CE7,#FFD700)", glow: "#00D4FF", emoji: "🎉", label: "New Year" },
  blackfriday: { grad: "linear-gradient(135deg,#1a1a1a,#444,#000)", glow: "#bbb", emoji: "🖤", label: "Black Friday" },
  monsoon: { grad: "linear-gradient(135deg,#00B4DB,#0083B0,#6C5CE7)", glow: "#00D4FF", emoji: "🌧️", label: "Monsoon" },
  custom: { grad: "linear-gradient(135deg,#6C5CE7,#00D4FF)", glow: "#6C5CE7", emoji: "🔥", label: "Custom" },
};

export const OFFER_PRESETS = [
  { key: "diwali", emoji: "🪔", name: "Diwali Dhamaka", badge: "🪔 DIWALI DHAMAKA", title: "Diwali Special — 50% OFF", desc: "Har plan pe flat 50% off. Sirf Diwali tak!", type: "percent" as const, code: "DIWALI50", discount: 50, theme: "diwali", bannerText: "🪔 Diwali Sale LIVE — coupon DIWALI50 se 50% OFF" },
  { key: "newyear", emoji: "🎉", name: "New Year", badge: "🎉 NEW YEAR OFFER", title: "Naye Saal me Naya Project — 40% OFF", desc: "New year special discount har hosting plan pe.", type: "percent" as const, code: "NEWYEAR40", discount: 40, theme: "newyear", bannerText: "🎉 New Year Sale — 40% OFF coupon NEWYEAR40" },
  { key: "holi", emoji: "🎨", name: "Holi Splash", badge: "🎨 HOLI SPLASH", title: "Holi Special — 35% OFF", desc: "Rangon wala offer, har plan pe 35% off!", type: "percent" as const, code: "HOLI35", discount: 35, theme: "holi", bannerText: "🎨 Holi Sale — 35% OFF coupon HOLI35" },
  { key: "blackfriday", emoji: "🖤", name: "Black Friday", badge: "🖤 BLACK FRIDAY", title: "Black Friday — 60% OFF", desc: "Saal ka sabse bada discount.", type: "percent" as const, code: "BLACK60", discount: 60, theme: "blackfriday", bannerText: "🖤 BLACK FRIDAY — 60% OFF coupon BLACK60" },
  { key: "monsoon", emoji: "🌧️", name: "Monsoon Sale", badge: "🌧️ MONSOON SALE", title: "Monsoon Special — 30% OFF", desc: "Baarish ke season me hosting sasti!", type: "percent" as const, code: "RAIN30", discount: 30, theme: "monsoon", bannerText: "🌧️ Monsoon Sale — 30% OFF coupon RAIN30" },
  { key: "flat", emoji: "💵", name: "Flat $ discount", badge: "💵 FLAT OFF", title: "Flat $3 OFF har plan pe", desc: "Koi bhi plan lo, $3 seedha kam.", type: "flat" as const, code: "SAVE3", flatOff: 3, theme: "custom", bannerText: "💵 Flat $3 OFF — coupon SAVE3" },
  { key: "freebie", emoji: "🎁", name: "Free gift offer", badge: "🎁 FREE GIFT", title: "Free .com domain + 1 month extra", desc: "Pro ya Ultra plan lo, domain free.", type: "freebie" as const, code: "FREEDOMAIN", freebie: "Free .com domain + 1 month extra", theme: "custom", bannerText: "🎁 Free .com domain + 1 month extra — code FREEDOMAIN" },
  { key: "custom", emoji: "🔥", name: "Custom offer", badge: "🔥 SPECIAL OFFER", title: "Mega Sale — 25% OFF", desc: "Limited time offer.", type: "percent" as const, code: "SAVE25", discount: 25, theme: "custom", bannerText: "🔥 Mega Sale LIVE — coupon SAVE25" },
];

export function makeOffer(preset: (typeof OFFER_PRESETS)[number], i = 0): Offer {
  return {
    id: "of_" + Date.now() + "_" + i,
    enabled: true,
    emoji: preset.emoji,
    badge: preset.badge,
    title: preset.title,
    desc: preset.desc,
    type: preset.type,
    code: preset.code,
    discount: (preset as any).discount || 0,
    flatOff: (preset as any).flatOff || 0,
    freebie: (preset as any).freebie || "",
    endsAt: "",
    theme: preset.theme,
    plans: [],
    banner: false,
    bannerText: preset.bannerText,
  };
}

/** settings se offers nikalo, purane single-offer format ko bhi migrate karta hai */
export function getOffers(settings: any): Offer[] {
  const s = settings || {};
  if (Array.isArray(s.offers)) return s.offers as Offer[];
  // legacy migration — sirf jab pehle wala offer sach me chalu tha
  if (s.offersEnabled === true) {
    return [{
      id: "of_legacy", enabled: !!s.offersEnabled, emoji: "🪔",
      badge: s.offerBadge || "SPECIAL OFFER", title: s.offerTitle || "Special Offer",
      desc: s.offerDesc || "", type: "percent", code: s.offerCode || "",
      discount: Number(s.offerDiscount) || 0, flatOff: 0, freebie: "",
      endsAt: s.offerEndsAt || "", theme: s.offerTheme || "diwali",
      plans: s.offerPlans || [], banner: !!s.offerBannerEnabled, bannerText: s.offerBannerText || "",
    }];
  }
  return [];
}

export function offerLive(o: Offer): boolean {
  if (!o.enabled) return false;
  if (o.endsAt && new Date(o.endsAt).getTime() < Date.now()) return false;
  return true;
}

export function findOfferByCode(offers: Offer[], code: string): Offer | null {
  const c = (code || "").trim().toUpperCase();
  if (!c) return null;
  return offers.find(o => offerLive(o) && (o.code || "").toUpperCase() === c) || null;
}

/** price pe discount laga ke final price */
export function applyOffer(price: number, o: Offer | null): number {
  if (!o) return price;
  if (o.type === "percent") return Math.max(0, Number((price * (1 - (Number(o.discount) || 0) / 100)).toFixed(2)));
  if (o.type === "flat") return Math.max(0, Number((price - (Number(o.flatOff) || 0)).toFixed(2)));
  return price; // freebie — price same, gift alag
}

export function offerLabel(o: Offer): string {
  if (o.type === "percent") return `${o.discount}% OFF`;
  if (o.type === "flat") return `$${o.flatOff} OFF`;
  return o.freebie || "FREE GIFT";
}

export function useCountdown(endsAt?: string) {
  const [left, setLeft] = useSafeState<string>("");
  useInterval(() => {
    if (!endsAt) { setLeft(""); return; }
    const ms = new Date(endsAt).getTime() - Date.now();
    if (ms <= 0) { setLeft("Offer khatam"); return; }
    const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
    setLeft(`${d > 0 ? d + "d " : ""}${h}h ${m}m ${s}s`);
  }, 1000);
  return left;
}

// chhoti helpers (SSR safe)
import { useEffect, useState } from "react";
function useSafeState<T>(init: T) { return useState<T>(init); }
function useInterval(fn: () => void, ms: number) {
  useEffect(() => {
    fn();
    const t = setInterval(fn, ms);
    return () => clearInterval(t);
  });
}
