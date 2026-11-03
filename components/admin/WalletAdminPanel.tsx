"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { toast } from "@/components/ui/Toaster";
import { adminAdjust, approveTx, getTxs, getWallets, money, pendingDeposits, rejectTx, type Wallet, type WalletTx } from "@/lib/wallet";

export default function WalletAdminPanel() {
  const { users, plans } = useStore();
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [q, setQ] = useState("");
  const [adjUser, setAdjUser] = useState("");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjNote, setAdjNote] = useState("");

  const reload = () => { setTxs(getTxs()); setWallets(getWallets()); };
  useEffect(() => {
    reload();
    const on = () => reload();
    window.addEventListener("rolax:sync", on); window.addEventListener("focus", on);
    return () => { window.removeEventListener("rolax:sync", on); window.removeEventListener("focus", on); };
  }, []);

  const pending = pendingDeposits();
  const completed = txs.filter(t => t.status === "completed");
  const totalTopups = completed.filter(t => t.type === "deposit" || t.type === "admin_credit").reduce((a, t) => a + t.amount, 0);
  const totalSpent = completed.filter(t => t.amount < 0).reduce((a, t) => a + Math.abs(t.amount), 0);
  const totalFloat = wallets.reduce((a, w) => a + w.balance, 0);

  const emailOf = (uid: string) => (users || []).find((u: any) => u.id === uid)?.email || uid;
  const planOf = (uid: string) => {
    const u: any = (users || []).find((x: any) => x.id === uid);
    return (plans || []).find(p => p.id === u?.planId)?.name || "Free";
  };

  const filtered = txs.filter(t => !q || emailOf(t.userId).toLowerCase().includes(q.toLowerCase()) || t.note.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h2 className="font-grotesk text-xl font-bold">💳 Wallet Manager</h2>
        <p className="text-sm text-[#888]">Users ke deposit approve/reject karo, manually paise do, aur kisi ka bhi balance dekho.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { l: "Pending deposits", v: pending.length, c: pending.length ? "text-yellow-400" : "" },
          { l: "Total top-ups", v: money(totalTopups), c: "text-[#00ff88]" },
          { l: "Total spent", v: money(totalSpent), c: "" },
          { l: "Wallet float (users ke paas)", v: money(totalFloat), c: "text-[#00D4FF]" },
        ].map((x, i) => (
          <div key={i} className="rounded-xl bg-[#111] border border-[#222] p-3">
            <p className="text-[10px] text-[#888]">{x.l}</p>
            <p className={`font-grotesk text-lg font-bold mt-1 ${x.c}`}>{x.v}</p>
          </div>
        ))}
      </div>

      {/* pending approvals */}
      <div className="rounded-2xl bg-[#111] border border-[#222] p-4">
        <h4 className="text-sm font-semibold mb-2">⏳ Deposit requests ({pending.length})</h4>
        {pending.length === 0 && <p className="text-[11px] text-[#666]">Koi pending deposit nahi.</p>}
        <div className="space-y-2">
          {pending.map(t => (
            <div key={t.id} className="rounded-xl bg-black border border-[#222] p-3 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-[#ddd]">{emailOf(t.userId)} <span className="text-[#666]">({planOf(t.userId)})</span></p>
                <p className="text-[11px] text-[#888]">{money(t.amount)} • {t.coin} • TXID {t.ref?.slice(0, 20) || "—"}</p>
                <p className="text-[10px] text-[#666]">{new Date(t.createdAt).toLocaleString()}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { approveTx(t.id); reload(); toast("Approve ho gaya — balance add ho gaya ✅", "success"); }} className="px-4 py-1.5 rounded-full bg-[#00ff88] text-black text-[11px] font-bold">Approve</button>
                <button onClick={() => { rejectTx(t.id, "Invalid TXID"); reload(); toast("Reject kar diya", "info"); }} className="px-4 py-1.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-[11px]">Reject</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* manual credit */}
      <div className="rounded-2xl bg-[#111] border border-[#222] p-4">
        <h4 className="text-sm font-semibold mb-2">➕ Manual credit / debit</h4>
        <div className="grid md:grid-cols-4 gap-2">
          <select value={adjUser} onChange={e => setAdjUser(e.target.value)} className="px-3 py-2 rounded-xl bg-black border border-[#222] text-xs">
            <option value="">User chuno</option>
            {(users || []).map((u: any) => <option key={u.id} value={u.id}>{u.email} — {money(wallets.find(w => w.userId === u.id)?.balance || 0)}</option>)}
          </select>
          <input value={adjAmount} onChange={e => setAdjAmount(e.target.value)} type="number" placeholder="Amount $" className="px-3 py-2 rounded-xl bg-black border border-[#222] text-xs" />
          <input value={adjNote} onChange={e => setAdjNote(e.target.value)} placeholder="Note (bonus / refund)" className="px-3 py-2 rounded-xl bg-black border border-[#222] text-xs" />
          <div className="flex gap-2">
            <button onClick={() => {
              const a = parseFloat(adjAmount);
              if (!adjUser || !a) { toast("User aur amount chuno", "error"); return; }
              adminAdjust(adjUser, a, adjNote || "Admin credit", "admin_credit"); reload(); setAdjAmount(""); setAdjNote("");
              toast("Balance add ho gaya", "success");
            }} className="flex-1 px-3 py-2 rounded-full bg-white text-black text-[11px] font-medium">Credit</button>
            <button onClick={() => {
              const a = parseFloat(adjAmount);
              if (!adjUser || !a) { toast("User aur amount chuno", "error"); return; }
              adminAdjust(adjUser, a, adjNote || "Admin debit", "admin_debit"); reload(); setAdjAmount(""); setAdjNote("");
              toast("Balance se kata", "info");
            }} className="flex-1 px-3 py-2 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-[11px]">Debit</button>
          </div>
        </div>
      </div>

      {/* balances */}
      <div className="rounded-2xl bg-[#111] border border-[#222] p-4">
        <h4 className="text-sm font-semibold mb-2">👥 User balances</h4>
        <div className="space-y-1">
          {(users || []).length === 0 && <p className="text-[11px] text-[#666]">Koi user nahi.</p>}
          {(users || []).map((u: any) => {
            const w = wallets.find(x => x.userId === u.id);
            return (
              <div key={u.id} className="flex items-center justify-between text-[11px] rounded-lg bg-black border border-[#222] px-2 py-1.5">
                <span className="text-[#ccc] truncate">{u.email}</span>
                <span className="text-[#888]">{planOf(u.id)}</span>
                <span className="text-[#00ff88] font-semibold">{money(w?.balance || 0)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* all transactions */}
      <div className="rounded-2xl bg-[#111] border border-[#222] p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold">📜 All transactions ({txs.length})</h4>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search email/note" className="px-3 py-1.5 rounded-full bg-black border border-[#222] text-xs w-44" />
        </div>
        <div className="space-y-1 max-h-[420px] overflow-auto">
          {filtered.length === 0 && <p className="text-[11px] text-[#666]">Koi transaction nahi.</p>}
          {filtered.map(t => (
            <div key={t.id} className="flex items-center justify-between gap-2 text-[11px] rounded-lg bg-black border border-[#222] px-2 py-1.5">
              <span className="text-[#ccc] truncate max-w-[180px]">{emailOf(t.userId)}</span>
              <span className="text-[#777] truncate flex-1">{t.note}</span>
              <span className={t.amount >= 0 ? "text-[#00ff88]" : "text-red-400"}>{t.amount >= 0 ? "+" : ""}{money(t.amount)}</span>
              <span className={t.status === "completed" ? "text-[#00ff88]" : t.status === "pending" ? "text-yellow-400" : "text-red-400"}>{t.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
