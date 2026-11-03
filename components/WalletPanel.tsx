"use client";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { toast } from "@/components/ui/Toaster";
import { money, requestDeposit, txsOf, walletOf, type WalletTx } from "@/lib/wallet";

const PRESETS = [5, 10, 25, 50, 100];

export default function WalletPanel({ auth, onGoBilling }: { auth: any; onGoBilling?: () => void }) {
  const { wallets } = useStore();
  const [balance, setBalance] = useState(0);
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [amount, setAmount] = useState<string>("10");
  const [coin, setCoin] = useState("USDT");
  const [txid, setTxid] = useState("");
  const [screenshot, setScreenshot] = useState("");
  const [tab, setTab] = useState<"add" | "history">("add");

  const load = () => {
    if (!auth?.id) return;
    setBalance(walletOf(auth.id).balance);
    setTxs(txsOf(auth.id));
  };
  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener("focus", on);
    window.addEventListener("storage", on);
    window.addEventListener("rolax:sync", on);
    return () => { window.removeEventListener("focus", on); window.removeEventListener("storage", on); window.removeEventListener("rolax:sync", on); };
  }, [auth?.id]);

  const wallet = useMemo(() => (wallets || []).find((w: any) => w.symbol === coin) || (wallets || [])[0], [wallets, coin]);

  const submit = () => {
    const amt = parseFloat(amount);
    if (!amt || amt < 1) { toast("Kam se kam $1 add karo", "error"); return; }
    if (!txid.trim()) { toast("Crypto TXID / hash daalo", "error"); return; }
    requestDeposit(auth.id, amt, coin, txid.trim());
    setTxid(""); setScreenshot("");
    load();
    toast("Deposit request bhej di — admin approve karega (usually 24h ke andar)", "success");
    setTab("history");
  };

  const pending = txs.filter(t => t.status === "pending");
  const spent = txs.filter(t => t.amount < 0 && t.status === "completed").reduce((a, t) => a + Math.abs(t.amount), 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-grotesk text-xl font-bold">💳 My Wallet</h2>
        <p className="text-sm text-[#888]">Wallet me paise add karo, phir usi balance se scripts aur premium plans kharido — instant, bina wait.</p>
      </div>

      {/* balance card */}
      <div className="rounded-3xl p-[1.5px] bg-gradient-to-br from-[#6C5CE7] to-[#00D4FF]">
        <div className="rounded-3xl bg-[#0a0a0f] p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] text-[#a89bff]">AVAILABLE BALANCE</p>
            <p className="font-grotesk text-4xl font-bold mt-1">{money(balance)}</p>
            <p className="text-[11px] text-[#666] mt-1">{auth?.email} • {pending.length} deposit pending • {money(spent)} spent</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setTab("add")} className="px-5 py-2.5 rounded-full bg-white text-black text-sm font-semibold">+ Add money</button>
            {onGoBilling && <button onClick={onGoBilling} className="px-5 py-2.5 rounded-full bg-[#111] border border-[#222] text-sm">Buy premium →</button>}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        {[["add", "Add money"], ["history", `History (${txs.length})`]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as any)} className={`px-4 py-2 rounded-full text-xs ${tab === k ? "bg-white text-black font-medium" : "bg-[#111] border border-[#222] text-[#888]"}`}>{l}</button>
        ))}
      </div>

      {tab === "add" && (
        <div className="rounded-2xl bg-[#111] border border-[#222] p-4 space-y-3">
          <div>
            <label className="text-[11px] text-[#888]">Amount (USD)</label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {PRESETS.map(p => (
                <button key={p} onClick={() => setAmount(String(p))} className={`px-3 py-1.5 rounded-full text-xs border ${amount === String(p) ? "bg-white text-black border-white" : "bg-black border-[#222] text-[#888]"}`}>${p}</button>
              ))}
              <input value={amount} onChange={e => setAmount(e.target.value)} type="number" className="w-24 px-3 py-1.5 rounded-full bg-black border border-[#222] text-xs" />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-[#888]">Coin</label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {["USDT", "BNB"].map(c => (
                <button key={c} onClick={() => setCoin(c)} className={`px-3 py-1.5 rounded-full text-xs border ${coin === c ? "bg-white text-black border-white" : "bg-black border-[#222] text-[#888]"}`}>{c}</button>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-black border border-[#6C5CE7]/30 p-3">
            <p className="text-[11px] text-[#888]">Payment address ({coin} • {wallet?.network || "BNB Smart Chain (BEP-20)"})</p>
            <div className="flex gap-2 mt-1">
              <input readOnly value={wallet?.address || "0xdB5e1b18C90166eeFc77C9C404AB84a078a069E8"} className="flex-1 px-3 py-2 rounded-lg bg-[#111] border border-[#222] text-[11px] font-mono" />
              <button onClick={() => { navigator.clipboard?.writeText(wallet?.address || ""); toast("Address copy ho gaya", "success"); }} className="px-3 py-1.5 rounded-lg bg-white text-black text-[11px] font-medium">Copy</button>
            </div>
            <p className="text-[10px] text-red-400 mt-2">⚠️ Sirf BEP-20 network pe bhejo. Galat network = paisa loss.</p>
          </div>

          <div>
            <label className="text-[11px] text-[#888]">Transaction hash / TXID</label>
            <input value={txid} onChange={e => setTxid(e.target.value)} placeholder="0x..." className="mt-1 w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm font-mono" />
          </div>
          <div>
            <label className="text-[11px] text-[#888]">Screenshot proof (URL, optional)</label>
            <input value={screenshot} onChange={e => setScreenshot(e.target.value)} placeholder="https://..." className="mt-1 w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" />
          </div>

          <button onClick={submit} className="w-full py-3 rounded-full bg-gradient-to-r from-[#6C5CE7] to-[#00D4FF] text-white text-sm font-semibold">Submit deposit → {money(parseFloat(amount) || 0)}</button>
          <p className="text-[10px] text-[#666] text-center">Admin approve karega → balance turant wallet me add ho jayega. Support: t.me/Rolax112</p>
        </div>
      )}

      {tab === "history" && (
        <div className="rounded-2xl bg-[#111] border border-[#222] p-4">
          {txs.length === 0 && <p className="text-[11px] text-[#666]">Abhi koi transaction nahi.</p>}
          <div className="space-y-2 max-h-[420px] overflow-auto">
            {txs.map(t => (
              <div key={t.id} className="flex items-center justify-between gap-2 rounded-xl bg-black border border-[#222] px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs text-[#ddd] truncate">{t.note}</p>
                  <p className="text-[10px] text-[#666]">{new Date(t.createdAt).toLocaleString()}{t.coin ? ` • ${t.coin}` : ""}{t.ref ? ` • ${String(t.ref).slice(0, 14)}` : ""}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-semibold ${t.amount >= 0 ? "text-[#00ff88]" : "text-red-400"}`}>{t.amount >= 0 ? "+" : ""}{money(t.amount)}</p>
                  <p className={`text-[10px] ${t.status === "completed" ? "text-[#00ff88]" : t.status === "pending" ? "text-yellow-400" : "text-red-400"}`}>{t.status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
