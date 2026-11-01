"use client";
// ROLAX HOST — plan entitlements (kaun sa feature free, kaun sa premium)
import type { Plan } from "./store";

export type FeatureId =
  | "deploy"
  | "ai_autofix"
  | "ai_review"
  | "bot_24x7"
  | "custom_domain"
  | "priority_support";

export const FEATURE_CATALOG: { id: FeatureId; label: string; desc: string; icon: string }[] = [
  { id: "deploy", label: "Basic Deploy", desc: "File upload + site live", icon: "📦" },
  { id: "ai_autofix", label: "AI Auto-Fix", desc: "Code ke errors AI se khud fix karna (Ultra Pro)", icon: "🛠️" },
  { id: "ai_review", label: "AI Code Review", desc: "Uploaded code ka pura AI analysis report", icon: "🤖" },
  { id: "bot_24x7", label: "24/7 Bot Hosting", desc: "Bot plan khatam hone tak round-the-clock online", icon: "♾️" },
  { id: "custom_domain", label: "Custom Domain", desc: "Apna domain connect karna", icon: "🌐" },
  { id: "priority_support", label: "Priority Support", desc: "Telegram pe fast support", icon: "⚡" },
];

export type Entitlements = Partial<Record<FeatureId, boolean>>;

export const DEFAULT_ENTITLEMENTS: Record<string, Entitlements> = {
  free: { deploy: true, custom_domain: false, ai_autofix: false, ai_review: false, bot_24x7: false, priority_support: false },
  pro: { deploy: true, ai_autofix: true, ai_review: true, bot_24x7: true, custom_domain: true, priority_support: true },
  ultra: { deploy: true, ai_autofix: true, ai_review: true, bot_24x7: true, custom_domain: true, priority_support: true },
};

export function planEntitlements(plan?: Plan | null): Entitlements {
  if (!plan) return DEFAULT_ENTITLEMENTS.free;
  const custom = (plan as any).entitlements as Entitlements | undefined;
  if (custom && typeof custom === "object") return { ...DEFAULT_ENTITLEMENTS.free, ...custom };
  if (Number(plan.price) === 0) return DEFAULT_ENTITLEMENTS.free;
  const lower = (plan.name || "").toLowerCase();
  if (lower.includes("ultra") || lower.includes("enterprise")) return DEFAULT_ENTITLEMENTS.ultra;
  return DEFAULT_ENTITLEMENTS.pro;
}

export function hasFeature(plan: Plan | null | undefined, feature: FeatureId, expired = false): boolean {
  if (expired) return false;
  return !!planEntitlements(plan)[feature];
}

export type PlanStatus = {
  plan?: Plan;
  planName: string;
  active: boolean;
  expired: boolean;
  expiresAt?: string;
  daysLeft?: number;
  hoursLeft?: number;
  label: string;
};

/** User ka plan + expiry status (24/7 hosting tab tak jab tak plan band na ho) */
export function planStatusFor(user: { planId?: string; planExpiry?: string } | undefined, plans: Plan[]): PlanStatus {
  const plan = plans.find(p => p.id === user?.planId);
  const expiry = user?.planExpiry ? new Date(user.planExpiry) : undefined;
  const msLeft = expiry ? expiry.getTime() - Date.now() : undefined;
  const expired = msLeft !== undefined ? msLeft <= 0 : false;
  const daysLeft = msLeft !== undefined ? Math.max(0, Math.floor(msLeft / 86400000)) : undefined;
  const hoursLeft = msLeft !== undefined ? Math.max(0, Math.floor((msLeft % 86400000) / 3600000)) : undefined;

  if (!plan) {
    return { plan: undefined, planName: "Free", active: true, expired: false, label: "Free plan — koi expiry nahi" };
  }
  if (expired) {
    return { plan, planName: plan.name, active: false, expired: true, expiresAt: expiry?.toISOString(), daysLeft: 0, hoursLeft: 0, label: `${plan.name} expired — renew karo` };
  }
  return {
    plan,
    planName: plan.name,
    active: true,
    expired: false,
    expiresAt: expiry?.toISOString(),
    daysLeft,
    hoursLeft,
    label: expiry ? `${plan.name} • ${daysLeft} din ${hoursLeft} ghante bache` : `${plan.name} • lifetime`,
  };
}
