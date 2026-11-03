"use client";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { getPurchases } from "@/lib/scripts";
import { summarizeRevenue, money } from "@/lib/revenue";
import { toast } from "@/components/ui/Toaster";

export type LoginEvent = { id: string; userId: string; email: string; name?: string; method: "email" | "google"; at: string; device?: string };

const LOGIN_KEY = "rolax_logins";
export function recordLogin(e: Omit<LoginEvent, "id" | "at">) {
  if (typeof window === "undefined") return;
  try {
    const list: LoginEvent[] = JSON.parse(localStorage.getItem(LOGIN_KEY) || "[]");
    list.push({ ...e, id: "lg_" + Date.now(), at: new Date().toISOString(), device: navigator?.userAgent?.slice(0, 60) });
    localStorage.setItem(LOGIN_KEY, JSON.stringify(list.slice(-500)));
  } catch {}
}
export function getLogins(): LoginEvent[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(LOGIN_KEY) || "[]"); } catch { return []; }
}

export default function StatsPanel() {
  const { users, websites, payments, tickets, plans } = useStore();
  const [logins, setLogins] = useState<LoginEvent[]>([]);
  const [revealIds, setRevealIds] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");

  useEffect(() => {
    const load = () => setLogins(getLogins());
    load();
    window.addEventListener("focus", load);
    window.addEventListener("rolax:sync", load);
    return () => { window.removeEventListener("focus", load); window.removeEventListener("rolax:sync", load); };
  }, []);

  const purchases = typeof window !== "undefined" ? getPurchases() : [];

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const now = Date.now();
    const activeToday = logins.filter(l => new Date(l.at).toDateString() === today);
    const active7 = logins.filter(l => now - new Date(l.at).getTime() < 7 * 86400000);
    const active30 = logins.filter(l => now - new Date(l.at).getTime() < 30 * 86400000);
    const googleUsers = new Set(logins.filter(l => l.method === "google").map(l => l.email));
    const emailUsers = new Set(logins.filter(l => l.method === "email").map(l => l.email));
    const rev = summarizeRevenue(payments as any[]);
    const revenue = rev.total;
    const planCounts = (plans || []).map(p => ({ ...p, count: (users || []).filter((u: any) => u.planId === p.id).length }));
    const expiring = (users || []).filter((u: any) => u.planExpiry && new Date(u.planExpiry).getTime() - now < 3 * 86400000 && new Date(u.planExpiry).getTime() > now);
    return {
      totalUsers: (users || []).length, activeToday: new Set(activeToday.map(l => l.email)).size,
      active7: new Set(active7.map(l => l.email)).size, active30: new Set(active30.map(l => l.email)).size,
      google: googleUsers.size, email: emailUsers.size, logins: logins.length,
      revenue, planCounts, expiring: expiring.length,
      sites: (websites || []).length, bots: (websites || []).filter((w: any) => /bot/i.test(w.botType || w.stack || "")).length,
      sitesHosted: (websites || []).filter((w: any) => /html|website/i.test(w.stack || w.fileType || "")).length,
      tickets: (tickets || []).filter((t: any) => t.status === "open").length,
      scriptBuys: purchases.length,
    };
  }, [users, websites, payments, tickets, plans, logins, purchases.length]);

  const creds = (users || []).filter((u: any) => !q || (u.email || "").toLowerCase().includes(q.toLowerCase()) || (u.name || "").toLowerCase().includes(q.toLowerCase()));

  const exportCsv = () => {
    const rows = [["name", "email", "password", "plan", "status", "created"]];
    (users || []).forEach((u: any) => rows.push([u.name || "", u.email || "", u.password || "(google)", (plans || []).find(p => p.id === u.planId)?.name || "Free", u.status || "active", u.createdAt || ""]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "rolax-users.csv"; a.click(); toast("CSV download ho gaya", "success");
  };

  const cards = [
    { label: "Total Users", value: stats.totalUsers, icon: "👥" },
    { label: "Aaj Active", value: stats.activeToday, icon: "🟢" },
    { label: "7 din Active", value: stats.active7, icon: "📅" },
    { label: "30 din Active", value: stats.active30, icon: "🗓️" },
    { label: "Email Login", value: stats.email, icon: "✉️" },
    { label: "Google Login", value: stats.google, icon: "🔵" },
    { label: "Total Logins", value: stats.logins, icon: "🔐" },
    { label: "Revenue (approved)", value: money(stats.revenue), icon: "💰" },
    { label: "Websites", value: stats.sites, icon: "🌐" },
    { label: "Telegram Bots", value: stats.bots, icon: "🤖" },
    { label: "Scripts Sold", value: stats.scriptBuys, icon: "🛒" },
    { label: "Open Tickets", value: stats.tickets, icon: "🎫" },
  ];

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-grotesk text-xl font-bold">📊 Stats & Accounts</h2>
          <p className="text-sm text-[#888]">Kitne users, kitne active, email vs Google login, aur har account ka ID/password.</p>
        </div>
        <button onClick={exportCsv} className="px-4 py-2 rounded-full bg-white text-black text-xs font-medium">⬇ Export CSV</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {cards.map(c => (
          <div key={c.label} className="rounded-xl bg-[#111] border border-[#222] p-3">
            <p className="text-[10px] text-[#888]">{c.icon} {c.label}</p>
            <p className="font-grotesk text-xl font-bold mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      {/* plan wise users */}
      <div className="rounded-2xl bg-[#111] border border-[#222] p-4">
        <h4 className="text-sm font-semibold mb-2">Plan wise users</h4>
        <div className="flex flex-wrap gap-2">
          {stats.planCounts.map(p => (
            <div key={p.id} className="rounded-xl bg-black border border-[#222] px-3 py-2">
              <p className="text-[11px] text-[#888]">{p.name}</p>
              <p className="text-sm font-semibold">{p.count}</p>
            </div>
          ))}
          <div className="rounded-xl bg-black border border-[#222] px-3 py-2">
            <p className="text-[11px] text-[#888]">Expiring &lt; 3 din</p>
            <p className={`text-sm font-semibold ${stats.expiring ? "text-yellow-400" : ""}`}>{stats.expiring}</p>
          </div>
        </div>
      </div>

      {/* credentials */}
      <div className="rounded-2xl bg-[#111] border border-[#222] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h4 className="text-sm font-semibold">🔑 Account Credentials ({creds.length})</h4>
          <div className="flex gap-2">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search email/naam" className="px-3 py-1.5 rounded-full bg-black border border-[#222] text-xs w-44" />
            <button onClick={() => { const all: Record<string, boolean> = {}; creds.forEach((u: any) => { all[u.id] = true; }); setRevealIds(prev => Object.keys(prev).length ? {} : all); }} className="px-3 py-1.5 rounded-full bg-[#111] border border-[#222] text-xs">{Object.keys(revealIds).length ? "Hide all" : "Show all"}</button>
          </div>
        </div>
        <p className="text-[10px] text-[#666] mb-2">Password dikhane ke liye 👁 dabao. Google se aaye users ka password nahi hota.</p>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead className="text-[#888] text-[10px]">
              <tr className="text-left">
                <th className="py-2">Naam</th><th className="py-2">Email (ID)</th><th className="py-2">Password</th><th className="py-2">Plan</th><th className="py-2">Last login</th><th className="py-2">Purchases</th>
              </tr>
            </thead>
            <tbody>
              {creds.length === 0 && <tr><td colSpan={6} className="py-3 text-[#666]">Koi user nahi.</td></tr>}
              {creds.map((u: any) => {
                const lastLogin = logins.filter(l => l.email === u.email).slice(-1)[0];
                const buys = purchases.filter(p => p.userId === u.id || p.email === u.email).length;
                return (
                  <tr key={u.id} className="border-t border-[#1a1a1a]">
                    <td className="py-2 pr-2 text-[#ddd]">{u.name || "—"}</td>
                    <td className="py-2 pr-2 font-mono text-[11px] text-[#ccc]">{u.email}</td>
                    <td className="py-2 pr-2 font-mono text-[11px]">
                      {u.password ? (
                        <span className="flex items-center gap-1">
                          <span className="text-[#00ff88]">{revealIds[u.id] ? u.password : "••••••••"}</span>
                          <button onClick={() => setRevealIds(p => ({ ...p, [u.id]: !p[u.id] }))} className="text-[#888]">👁</button>
                          <button onClick={() => { navigator.clipboard?.writeText(u.password); toast("Password copy ho gaya", "success"); }} className="text-[#888]">📋</button>
                        </span>
                      ) : <span className="text-[#666]">Google login</span>}
                    </td>
                    <td className="py-2 pr-2 text-[#ccc]">{(plans || []).find(p => p.id === u.planId)?.name || "Free"}</td>
                    <td className="py-2 pr-2 text-[#777]">{lastLogin ? new Date(lastLogin.at).toLocaleString() : "—"}</td>
                    <td className="py-2 text-[#00ff88]">{buys || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* login log */}
      <div className="rounded-2xl bg-[#111] border border-[#222] p-4">
        <h4 className="text-sm font-semibold mb-2">🕐 Login history (last 20)</h4>
        {logins.length === 0 ? <p className="text-[11px] text-[#666]">Koi login record nahi.</p> : (
          <div className="space-y-1 max-h-64 overflow-auto">
            {logins.slice(-20).reverse().map(l => (
              <div key={l.id} className="flex items-center justify-between text-[11px] rounded-lg bg-black border border-[#222] px-2 py-1.5">
                <span className="text-[#ccc] font-mono">{l.email}</span>
                <span className={l.method === "google" ? "text-[#00D4FF]" : "text-[#a89bff]"}>{l.method}</span>
                <span className="text-[#666]">{new Date(l.at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
