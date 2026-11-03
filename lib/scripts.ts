"use client";
// ROLAX SCRIPT STORE — admin scripts/bots/websites upload karta hai (naam + price + plan access),
// user search karta hai aur kharidta hai. 100% localStorage-backed, koi server nahi.
import { useCallback, useEffect, useState } from "react";
import { debit, walletOf } from "./wallet";

export type StoreScript = {
  id: string;
  name: string;
  category: "Telegram Bot" | "Website" | "Python Script" | "Node Script" | "Other";
  description: string;
  price: number;              // 0 = free
  access: "free" | "paid" | "plan";   // free = sabko, paid = kharidna padega, plan = sirf plan wale
  planIds?: string[];         // access=plan -> kaun se plans
  stack: "Python" | "Node.js" | "HTML";
  fileName: string;
  content: string;            // source ya zip ka base64
  isZip?: boolean;
  icon?: string;
  tags?: string[];
  downloads: number;
  active: boolean;
  createdAt: string;
};

export type Purchase = { id: string; scriptId: string; userId: string; email: string; price: number; at: string; paidWith?: "wallet" | "free" | "plan"; orderId?: string };

const SCRIPTS_KEY = "rolax_store_scripts";
const BUYS_KEY = "rolax_store_purchases";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}
function write(key: string, val: any) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(val));
  window.dispatchEvent(new CustomEvent("rolax:sync", { detail: { key } }));
}

export function getScripts(): StoreScript[] { return read<StoreScript[]>(SCRIPTS_KEY, []); }
export function setScripts(list: StoreScript[]) { write(SCRIPTS_KEY, list); }
export function getPurchases(): Purchase[] { return read<Purchase[]>(BUYS_KEY, []); }
export function setPurchases(list: Purchase[]) { write(BUYS_KEY, list); }

export function saveScript(s: StoreScript) {
  const list = getScripts();
  const i = list.findIndex(x => x.id === s.id);
  if (i >= 0) list[i] = s; else list.unshift(s);
  setScripts(list);
}
export function deleteScript(id: string) { setScripts(getScripts().filter(s => s.id !== id)); }

/** Price > 0 hai to paid hi mana jayega, chahe admin ne free chuna ho */
export function effectiveAccess(s: StoreScript): "free" | "paid" | "plan" {
  if (s.access === "plan") return (s.planIds || []).length ? "plan" : (s.price > 0 ? "paid" : "free");
  if ((s.price || 0) > 0) return "paid";
  return "free";
}

export function hasAccess(script: StoreScript, user: { planId?: string; email?: string; id?: string } | null): boolean {
  if (!script.active) return false;
  if (effectiveAccess(script) === "free") return true;
  if (!user) return false;
  if (getPurchases().some(p => p.scriptId === script.id && (p.userId === user.id || p.email === user.email))) return true;
  if (effectiveAccess(script) === "plan") return (script.planIds || []).includes(user.planId || "");
  return false;
}

export function buyScript(script: StoreScript, user: { id?: string; email?: string }, paidWith: "wallet" | "free" | "plan" = "free") {
  const buys = getPurchases();
  if (buys.some(b => b.scriptId === script.id && b.userId === user.id)) return;
  buys.push({ id: "buy_" + Date.now(), scriptId: script.id, userId: user.id || "", email: user.email || "", price: script.price, at: new Date().toISOString(), paidWith, orderId: "ord_" + Date.now() });
  setPurchases(buys);
  const list = getScripts();
  const i = list.findIndex(x => x.id === script.id);
  if (i >= 0) { list[i].downloads = (list[i].downloads || 0) + 1; setScripts(list); }
}

/** Wallet se purchase — paisa katega, phir access milega. Error string return karta hai ya null */
export function purchaseWithWallet(script: StoreScript, user: { id?: string; email?: string; name?: string }): string | null {
  if (!user.id) return "Pehle login karo";
  if (hasAccess(script, user as any)) return null; // already owned
  const w = walletOf(user.id);
  if (w.balance + 0.001 < script.price) {
    return `Wallet me paisa kam hai — chahiye ${money(script.price)}, hai ${money(w.balance)}. Wallet me add karo.`;
  }
  const ok = debit(user.id, script.price, `Script purchase: ${script.name}`, script.id);
  if (!ok) return "Payment fail — dobara try karo";
  buyScript(script, user, "wallet");
  return null;
}

export function money(n: number) { return `$${Number(n || 0).toFixed(2)}`; }

export function downloadScript(script: StoreScript) {
  const a = document.createElement("a");
  if (script.isZip) {
    const bin = atob(script.content);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    a.href = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
    a.download = script.fileName || `${script.name}.zip`;
  } else {
    a.href = URL.createObjectURL(new Blob([script.content], { type: "text/plain" }));
    a.download = script.fileName || `${script.name}.txt`;
  }
  a.click();
}

export function useScripts() {
  const [scripts, setLocal] = useState<StoreScript[]>([]);
  const [purchases, setP] = useState<Purchase[]>([]);
  const load = useCallback(() => { setLocal(getScripts()); setP(getPurchases()); }, []);
  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener("storage", on);
    window.addEventListener("focus", on);
    window.addEventListener("rolax:sync", on);
    return () => { window.removeEventListener("storage", on); window.removeEventListener("focus", on); window.removeEventListener("rolax:sync", on); };
  }, [load]);
  return { scripts, purchases, reload: load };
}
