"use client";
// ROLAX REVENUE — poore app me ek hi source of truth. Chart, cards, stats sab yahi use karte hain.
import type { Payment } from "./store";

const PAID = ["approved", "paid", "success", "completed", "confirmed", "settled"];
const REJECTED = ["rejected", "failed", "cancelled", "canceled", "refunded"];

export function isPaid(p: any): boolean {
  return PAID.includes(String(p?.status || "").toLowerCase());
}
export function isPending(p: any): boolean {
  return String(p?.status || "").toLowerCase() === "pending";
}
export function isRejected(p: any): boolean {
  return REJECTED.includes(String(p?.status || "").toLowerCase());
}
export function amountOf(p: any): number {
  const n = Number(p?.amount ?? p?.total ?? 0);
  return isFinite(n) && n > 0 ? n : 0;
}

export type RevenueSummary = {
  total: number;          // sirf approved/paid payments ka jod
  pending: number;        // approval ka wait
  pendingCount: number;
  paidCount: number;
  rejected: number;
  rejectedCount: number;
  avg: number;
  today: number;
  week: number;           // last 7 din
  month: number;          // last 30 din
  currency: string;
  series: { name: string; revenue: number; label: string }[]; // last 7 din, asli data
  byPlan: { plan: string; amount: number; count: number }[];
  byCoin: { coin: string; amount: number; count: number }[];
  lastPaymentAt: string | null;
};

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function summarizeRevenue(payments: any[] | undefined | null): RevenueSummary {
  const list = Array.isArray(payments) ? payments : [];
  const paid = list.filter(isPaid);
  const pend = list.filter(isPending);
  const rej = list.filter(isRejected);
  const total = paid.reduce((a, p) => a + amountOf(p), 0);
  const pending = pend.reduce((a, p) => a + amountOf(p), 0);

  const now = new Date();
  const todayKey = dayKey(now);
  const days7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    return d;
  });

  const series = days7.map(d => {
    const k = dayKey(d);
    const revenue = paid
      .filter(p => (p.createdAt || p.approvedAt || "").slice(0, 10) === k)
      .reduce((a, p) => a + amountOf(p), 0);
    return {
      name: d.toLocaleDateString("en-US", { weekday: "short" }),
      label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      revenue: Number(revenue.toFixed(2)),
    };
  });

  const today = paid.filter(p => (p.createdAt || "").slice(0, 10) === todayKey).reduce((a, p) => a + amountOf(p), 0);
  const week = paid.filter(p => Date.now() - new Date(p.createdAt || 0).getTime() < 7 * 86400000).reduce((a, p) => a + amountOf(p), 0);
  const month = paid.filter(p => Date.now() - new Date(p.createdAt || 0).getTime() < 30 * 86400000).reduce((a, p) => a + amountOf(p), 0);

  const planMap = new Map<string, { amount: number; count: number }>();
  paid.forEach(p => {
    const key = p.planName || p.planId || "Unknown";
    const cur = planMap.get(key) || { amount: 0, count: 0 };
    planMap.set(key, { amount: cur.amount + amountOf(p), count: cur.count + 1 });
  });

  const coinMap = new Map<string, { amount: number; count: number }>();
  paid.forEach(p => {
    const key = p.coin || "—";
    const cur = coinMap.get(key) || { amount: 0, count: 0 };
    coinMap.set(key, { amount: cur.amount + amountOf(p), count: cur.count + 1 });
  });

  const lastAt = paid.map(p => p.createdAt).filter(Boolean).sort().slice(-1)[0] || null;

  return {
    total: Number(total.toFixed(2)),
    pending: Number(pending.toFixed(2)),
    pendingCount: pend.length,
    paidCount: paid.length,
    rejected: Number(rej.reduce((a, p) => a + amountOf(p), 0).toFixed(2)),
    rejectedCount: rej.length,
    avg: paid.length ? Number((total / paid.length).toFixed(2)) : 0,
    today: Number(today.toFixed(2)),
    week: Number(week.toFixed(2)),
    month: Number(month.toFixed(2)),
    currency: "USD",
    series,
    byPlan: [...planMap.entries()].map(([plan, v]) => ({ plan, ...v })).sort((a, b) => b.amount - a.amount),
    byCoin: [...coinMap.entries()].map(([coin, v]) => ({ coin, ...v })).sort((a, b) => b.amount - a.amount),
    lastPaymentAt: lastAt,
  };
}

export function money(n: number, currency = "USD") {
  return currency === "USD" ? `$${n.toFixed(2)}` : `${n.toFixed(2)} ${currency}`;
}
