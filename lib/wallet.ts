"use client";
// ROLAX WALLET — har user ka apna balance, deposit requests, aur usi paise se premium/script kharidna
// Sab localStorage me, per-user.

export type WalletTx = {
  id: string;
  userId: string;
  type: "deposit" | "purchase" | "refund" | "admin_credit" | "admin_debit" | "withdraw";
  amount: number;             // positive = credit, negative = debit
  status: "pending" | "completed" | "rejected";
  note: string;
  ref?: string;               // txid / script id / plan id
  coin?: string;
  createdAt: string;
  settledAt?: string;
};

export type Wallet = { userId: string; balance: number; updatedAt: string };

const W_KEY = "rolax_user_wallets";
const TX_KEY = "rolax_wallet_tx";

function read<T>(k: string, fb: T): T {
  if (typeof window === "undefined") return fb;
  try { const r = localStorage.getItem(k); return r ? (JSON.parse(r) as T) : fb; } catch { return fb; }
}
function write(k: string, v: any) {
  if (typeof window === "undefined") return;
  localStorage.setItem(k, JSON.stringify(v));
  window.dispatchEvent(new CustomEvent("rolax:sync", { detail: { key: k } }));
}

export function getWallets(): Wallet[] { return read<Wallet[]>(W_KEY, []); }
export function getTxs(): WalletTx[] { return read<WalletTx[]>(TX_KEY, []); }
export function walletOf(userId: string): Wallet {
  const w = getWallets().find(x => x.userId === userId);
  return w || { userId, balance: 0, updatedAt: new Date().toISOString() };
}
export function txsOf(userId: string): WalletTx[] {
  return getTxs().filter(t => t.userId === userId).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}
export function pendingDeposits(): WalletTx[] {
  return getTxs().filter(t => t.type === "deposit" && t.status === "pending").sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

function setBalance(userId: string, balance: number) {
  const list = getWallets();
  const i = list.findIndex(w => w.userId === userId);
  const next = { userId, balance: Number(balance.toFixed(2)), updatedAt: new Date().toISOString() };
  if (i >= 0) list[i] = next; else list.push(next);
  write(W_KEY, list);
}

/** deposit request — crypto TXID ke saath, admin approve karega tab balance badhega */
export function requestDeposit(userId: string, amount: number, coin: string, txid: string): WalletTx {
  const tx: WalletTx = {
    id: "wtx_" + Date.now(), userId, type: "deposit", amount: Number(amount.toFixed(2)),
    status: "pending", note: "Wallet top-up (crypto)", ref: txid, coin, createdAt: new Date().toISOString(),
  };
  write(TX_KEY, [tx, ...getTxs()]);
  return tx;
}

/** admin approve — balance credit */
export function approveTx(id: string, adminNote = "") {
  const list = getTxs();
  const tx = list.find(t => t.id === id);
  if (!tx || tx.status !== "pending") return;
  tx.status = "completed";
  tx.settledAt = new Date().toISOString();
  if (adminNote) tx.note = `${tx.note} — ${adminNote}`;
  write(TX_KEY, list);
  const w = walletOf(tx.userId);
  setBalance(tx.userId, w.balance + tx.amount);
}

/** admin reject */
export function rejectTx(id: string, reason = "") {
  const list = getTxs();
  const tx = list.find(t => t.id === id);
  if (!tx) return;
  tx.status = "rejected";
  tx.settledAt = new Date().toISOString();
  if (reason) tx.note = `${tx.note} — ${reason}`;
  write(TX_KEY, list);
}

/** admin manual credit/debit */
export function adminAdjust(userId: string, amount: number, note: string, type: "admin_credit" | "admin_debit" = "admin_credit") {
  const delta = type === "admin_debit" ? -Math.abs(amount) : Math.abs(amount);
  const tx: WalletTx = {
    id: "wtx_" + Date.now(), userId, type, amount: delta, status: "completed",
    note: note || (delta > 0 ? "Admin credit" : "Admin debit"), createdAt: new Date().toISOString(),
    settledAt: new Date().toISOString(),
  };
  write(TX_KEY, [tx, ...getTxs()]);
  const w = walletOf(userId);
  setBalance(userId, Math.max(0, w.balance + delta));
}

/** wallet se paisa katna — purchase. Insufficient ho to false */
export function debit(userId: string, amount: number, note: string, ref = ""): boolean {
  const w = walletOf(userId);
  if (w.balance + 0.001 < amount) return false;
  setBalance(userId, w.balance - amount);
  const tx: WalletTx = {
    id: "wtx_" + Date.now(), userId, type: "purchase", amount: -Math.abs(Number(amount.toFixed(2))),
    status: "completed", note, ref, createdAt: new Date().toISOString(), settledAt: new Date().toISOString(),
  };
  write(TX_KEY, [tx, ...getTxs()]);
  return true;
}

/** refund (agar order fail ho jaye) */
export function refund(userId: string, amount: number, note: string) {
  const tx: WalletTx = {
    id: "wtx_" + Date.now(), userId, type: "refund", amount: Math.abs(amount), status: "completed",
    note, createdAt: new Date().toISOString(), settledAt: new Date().toISOString(),
  };
  write(TX_KEY, [tx, ...getTxs()]);
  const w = walletOf(userId);
  setBalance(userId, w.balance + Math.abs(amount));
}

export function money(n: number) { return `$${Number(n || 0).toFixed(2)}`; }
