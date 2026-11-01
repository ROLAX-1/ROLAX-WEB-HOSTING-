"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, clearAuth } from "@/lib/auth";
import { useStore, ADMIN_EMAIL } from "@/lib/store";
import { analyzeSite, autoFixSite, needsManualAction, runDeployChecks, detectFromFileName, MAX_ERRORS } from "@/lib/hosting";
import { toast } from "@/components/ui/Toaster";
import Link from "next/link";

export default function DashboardPage() {
  const router = useRouter();
  const { hydrate, hydrated, plans, stacks, wallets, settings, websites, setWebsites, payments, setPayments, tickets, setTickets, users } = useStore();
  const [auth, setAuth] = useState<any>(null);
  const [tab, setTab] = useState("overview");
  const [showDeploy, setShowDeploy] = useState(false);
  const [deployData, setDeployData] = useState({ name: "", stack: "HTML", github: "", zip: null as any });
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [payCoin, setPayCoin] = useState("USDT");
  const [txid, setTxid] = useState("");
  const [screenshot, setScreenshot] = useState("");
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketMsg, setTicketMsg] = useState("");
  const [fileManagerSite, setFileManagerSite] = useState<any>(null);
  const [errorSite, setErrorSite] = useState<any>(null);
  const [alertSite, setAlertSite] = useState<any>(null);
  const [logsSite, setLogsSite] = useState<any>(null);

  useEffect(() => { hydrate(); }, [hydrate]);
  useEffect(() => {
    const a = getAuth();
    if (!a) { router.push("/login"); return; }
    if (a.email === ADMIN_EMAIL) { router.push("/admin"); return; }
    setAuth(a);
  }, [router]);

  if (!hydrated || !auth) return <div className="min-h-screen bg-black flex items-center justify-center text-[#888]">Loading...</div>;

  const myWebsites = websites.filter(w => w.userId === auth.id);
  const myPayments = payments.filter(p => p.userId === auth.id);
  const myTickets = tickets.filter(t => t.userId === auth.id);
  const myPlan = plans.find(p => p.id === (users.find(u => u.email === auth.email)?.planId || ""));
  const pendingPayment = myPayments.find(p => p.status === "pending");
  const rate = settings?.usdToInr || 88;
  const inr = (usd: number) => Math.round(usd * rate);
  const priceLabel = (usd: number) => (usd === 0 ? "Free" : `$${usd} / ₹${inr(usd)}`);

  const handleDeploy = () => {
    if (!deployData.name.trim()) { toast("Project name required", "error"); return; }
    const url = `${deployData.name.toLowerCase().replace(/\s+/g, "-")}.rolax.host`;
    // File type upload se detect karo
    const det = deployData.zip?.name ? detectFromFileName(deployData.zip.name) : { fileType: deployData.stack + (deployData.stack === "HTML" ? " Website" : " Bot"), botType: deployData.stack === "HTML" ? "Static Site" : "Bot", stack: deployData.stack };
    let newSite: any = {
      id: "ws_" + Date.now(),
      userId: auth.id,
      name: deployData.name,
      url,
      stack: det.stack || deployData.stack,
      status: "Running" as const,
      cpu: Math.floor(Math.random() * 40) + 10,
      ram: Math.floor(Math.random() * 40) + 20,
      fileType: det.fileType,
      botType: det.botType,
      errorCount: 0,
      deployedAt: new Date().toISOString(),
      fileSize: deployData.zip?.size ? (deployData.zip.size / 1024 / 1024).toFixed(1) + " MB" : (Math.random() * 10 + 1).toFixed(1) + " MB",
      createdAt: new Date().toISOString()
    };
    // Deploy ke baad automatic health-check
    newSite = runDeployChecks(newSite);
    setWebsites([...websites, newSite]);
    setShowDeploy(false);
    setDeployData({ name: "", stack: "HTML", github: "", zip: null });
    if (newSite.status === "Error") {
      setAlertSite(newSite);
      toast("Deploy hua par error mila — neeche error details dekho", "error");
    } else {
      toast("Deployed successfully! Site live hai 🚀", "success");
    }
  };

  const handleAction = (site: any, action: string) => {
    if (action === "delete") {
      if (!confirm("Delete this site?")) return;
      setWebsites(websites.filter(w => w.id !== site.id));
      toast("Site deleted", "info");
    } else if (action === "stop") {
      setWebsites(websites.map(w => w.id === site.id ? { ...w, status: w.status === "Running" ? "Stopped" as const : "Running" as const } : w));
      toast(site.status === "Running" ? "Site stopped" : "Site started", "success");
    } else if (action === "restart") {
      toast("Restarting... done!", "success");
    } else if (action === "open") {
      toast(`Opening https://${site.url}`, "info");
      window.open(`https://${site.url}`, "_blank");
    }
  };

  const handleBuyPlan = (plan: any) => {
    setSelectedPlan(plan);
    setTab("billing");
  };

  const submitPayment = () => {
    if (!txid.trim()) { toast("Enter TXID/Hash", "error"); return; }
    const newPay = {
      id: "pay_" + Date.now(),
      userId: auth.id,
      userEmail: auth.email,
      planId: selectedPlan.id,
      planName: selectedPlan.name,
      amount: selectedPlan.price,
      coin: payCoin,
      txid,
      screenshot,
      status: "pending" as const,
      createdAt: new Date().toISOString()
    };
    setPayments([...payments, newPay]);
    toast("Payment submitted! Awaiting admin approval.", "success");
    setTxid(""); setScreenshot("");
  };

  const createTicket = () => {
    if (!ticketSubject.trim() || !ticketMsg.trim()) { toast("Fill all fields", "error"); return; }
    const t = {
      id: "tik_" + Date.now(),
      userId: auth.id,
      userEmail: auth.email,
      subject: ticketSubject,
      message: ticketMsg,
      status: "open" as const,
      replies: [],
      createdAt: new Date().toISOString()
    };
    setTickets([...tickets, t]);
    toast("Ticket created!", "success");
    setTicketSubject(""); setTicketMsg("");
  };

  const currentWallet = wallets.find(w => w.symbol === payCoin) || wallets[0];

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Topbar */}
      <div className="sticky top-0 z-40 bg-black/80 backdrop-blur-xl border-b border-[#222]">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-[60px] flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6C5CE7] to-[#00D4FF] flex items-center justify-center font-bold text-sm">R</div>
              <span className="font-grotesk font-bold">ROLAX HOST</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1 ml-4">
              {[
                { id: "overview", label: "Overview" },
                { id: "sites", label: "My Websites" },
                { id: "billing", label: "Billing" },
                { id: "support", label: "Support" },
              ].map(item => (
                <button key={item.id} onClick={() => setTab(item.id)} className={`px-4 py-2 rounded-full text-sm transition ${tab === item.id ? "bg-white text-black font-medium" : "text-[#888] hover:text-white"}`}>{item.label}</button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:inline text-xs text-[#888]">{auth.email}</span>
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${myPlan ? "bg-[#00ff88]/10 text-[#00ff88] border-[#00ff88]/20" : "bg-[#888]/10 text-[#888] border-[#222]"}`}>{myPlan?.name || "Free Plan"}</span>
            <button onClick={() => { clearAuth(); router.push("/"); }} className="px-4 py-2 rounded-full bg-[#111] border border-[#222] text-sm hover:border-[#333]">Logout</button>
          </div>
        </div>
        {/* Mobile tabs */}
        <div className="md:hidden flex gap-1 px-4 pb-3 overflow-x-auto">
          {["overview", "sites", "billing", "support"].map(id => (
            <button key={id} onClick={() => setTab(id)} className={`px-4 py-2 rounded-full text-sm whitespace-nowrap ${tab === id ? "bg-white text-black" : "bg-[#111] border border-[#222] text-[#888]"}`}>{id}</button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {tab === "overview" && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="font-grotesk text-2xl md:text-3xl font-bold">Welcome back, {auth.name} 👋</h1>
                <p className="text-sm text-[#888] mt-1">Manage your hosting, deployments and billing.</p>
              </div>
              <button onClick={() => setShowDeploy(true)} className="px-6 py-3 rounded-full bg-gradient-to-r from-[#6C5CE7] to-[#00D4FF] text-white font-medium text-sm hover:opacity-90 transition">+ Deploy New Project</button>
            </div>

            <div className="grid md:grid-cols-4 gap-4">
              <div className="rounded-2xl bg-[#111] border border-[#222] p-5">
                <p className="text-xs text-[#888]">Active Sites</p>
                <p className="text-2xl font-bold mt-1">{myWebsites.filter(w => w.status === "Running").length}</p>
                <p className="text-xs text-[#666] mt-1">{myWebsites.length} total projects</p>
              </div>
              <div className="rounded-2xl bg-[#111] border border-[#222] p-5">
                <p className="text-xs text-[#888]">Current Plan</p>
                <p className="text-lg font-bold mt-1">{myPlan?.name || "Free"}</p>
                <p className="text-xs text-[#666] mt-1">{myPlan ? `${myPlan.ram} • ${myPlan.cpu}` : "Upgrade to get more resources"}</p>
              </div>
              <div className="rounded-2xl bg-[#111] border border-[#222] p-5">
                <p className="text-xs text-[#888]">Plan Expiry</p>
                <p className="text-sm font-semibold mt-1">{users.find(u => u.email === auth.email)?.planExpiry ? new Date(users.find(u => u.email === auth.email)!.planExpiry!).toLocaleDateString() : "—"}</p>
                <p className="text-xs text-[#666] mt-1">{pendingPayment ? "Pending approval" : "Active"}</p>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-[#6C5CE7]/20 to-[#00D4FF]/20 border border-[#6C5CE7]/20 p-5">
                <p className="text-xs text-[#a89bff]">Need help?</p>
                <p className="text-sm font-semibold mt-1">Support Tickets</p>
                <button onClick={() => setTab("support")} className="mt-2 text-xs px-3 py-1 rounded-full bg-white text-black">Open Ticket →</button>
              </div>
            </div>

            <div className="rounded-2xl bg-[#111] border border-[#222] p-6">
              <h3 className="font-grotesk font-semibold">Pricing Plans</h3>
              <p className="text-xs text-[#888] mt-1">Upgrade instantly with crypto payment</p>
              <div className="grid md:grid-cols-3 gap-4 mt-4">
                {plans.map(plan => (
                  <div key={plan.id} className={`rounded-2xl p-5 border flex flex-col ${plan.popular ? "bg-black border-[#6C5CE7]/40" : "bg-black border-[#222]"}`}>
                    <h4 className="font-semibold">{plan.name}</h4>
                    <p className="text-xl font-bold mt-1">{plan.price === 0 ? "Free" : `$${plan.price}`}<span className="text-xs text-[#888] font-normal">{plan.price === 0 ? "" : " /mo"}</span></p>
                    {plan.price > 0 && <p className="text-[11px] text-[#00D4FF]">≈ ₹{inr(plan.price)} / month</p>}
                    <ul className="mt-3 space-y-1 text-xs text-[#888]">
                      <li>{plan.ram} RAM • {plan.cpu}</li>
                      <li>{plan.storage} Storage</li>
                      {plan.features.slice(0, 3).map(f => <li key={f}>✓ {f}</li>)}
                    </ul>
                    <button onClick={() => handleBuyPlan(plan)} className={`mt-4 w-full py-2 rounded-full text-sm font-medium ${plan.popular ? "bg-white text-black" : "bg-[#111] border border-[#222]"}`}>{plan.price === 0 ? "Current" : "Buy Now"}</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "sites" && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <h2 className="font-grotesk text-xl font-bold">My Websites</h2>
              <button onClick={() => setShowDeploy(true)} className="px-5 py-2 rounded-full bg-white text-black text-sm font-medium">+ Deploy New</button>
            </div>

            {/* LIVE ALERTS for user */}
            {myWebsites.filter(w => w.status === "Error" || (w.errorCount || 0) > 0).length > 0 && (
              <div className="space-y-2">
                {myWebsites.filter(w => w.status === "Error" || (w.errorCount || 0) > 0).map(w => {
                  const critical = needsManualAction(w);
                  const errs = analyzeSite(w);
                  return (
                    <div key={w.id} className={`rounded-2xl p-4 border ${critical ? "bg-red-500/10 border-red-500/30" : "bg-yellow-500/10 border-yellow-500/30"}`}>
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                        <div>
                          <p className={`text-sm font-semibold ${critical ? "text-red-300" : "text-yellow-300"}`}>
                            {critical ? "🚨" : "⚠️"} {w.name} me {w.errorCount || 1} error hai
                          </p>
                          <p className="text-xs text-[#bbb] mt-1">{errs[0]?.title}: {errs[0]?.detail}</p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => setErrorSite(w)} className="px-4 py-2 rounded-full bg-black border border-[#333] text-xs">Details</button>
                          <button onClick={() => {
                            const fixed = autoFixSite(w);
                            setWebsites(websites.map(x => x.id === w.id ? fixed : x));
                            if (fixed.status === "Running") toast("Auto-fix ✅ " + w.name + " ab live hai", "success");
                            else toast("Auto-fix se theek nahi hua — Telegram @Rolax112 pe help lo", "error");
                          }} className="px-4 py-2 rounded-full bg-white text-black text-xs font-medium">⚡ Auto-Fix</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {myWebsites.length === 0 ? (
              <div className="rounded-2xl bg-[#111] border border-[#222] p-12 text-center">
                <p className="text-[#888]">No websites yet. Deploy your first project!</p>
                <button onClick={() => setShowDeploy(true)} className="mt-4 px-6 py-2 rounded-full bg-gradient-to-r from-[#6C5CE7] to-[#00D4FF] text-white text-sm">Deploy Now</button>
              </div>
            ) : (
              <div className="rounded-2xl bg-[#111] border border-[#222] overflow-hidden overflow-x-auto">
                <table className="w-full text-sm min-w-[800px]">
                  <thead className="bg-black border-b border-[#222] text-[#888] text-xs">
                    <tr>
                      <th className="text-left px-4 py-3">Name</th>
                      <th className="text-left px-4 py-3">URL</th>
                      <th className="text-left px-4 py-3">Stack</th>
                      <th className="text-left px-4 py-3">File Type</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-left px-4 py-3">CPU / RAM</th>
                      <th className="text-left px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myWebsites.map(site => (
                      <tr key={site.id} className="border-b border-[#222]/50 hover:bg-black/50">
                        <td className="px-4 py-3 font-medium">{site.name}</td>
                        <td className="px-4 py-3"><span className="text-[#00D4FF] text-xs">{site.url}</span></td>
                        <td className="px-4 py-3"><span className="px-2 py-1 rounded-full bg-black border border-[#222] text-xs">{site.stack}</span></td>
                        <td className="px-4 py-3">
                          <p className="text-xs">{site.fileType || site.stack + " File"}</p>
                          <p className="text-[10px] text-[#666]">{site.botType || "—"} • {site.fileSize || "—"}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs border ${site.status === "Running" ? "bg-[#00ff88]/10 text-[#00ff88] border-[#00ff88]/20" : site.status === "Error" ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>{site.status === "Error" ? "⚠ Error" : "● " + site.status}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <div className="w-16">
                              <div className="text-[10px] text-[#888]">CPU {site.cpu}%</div>
                              <div className="h-1.5 rounded-full bg-black border border-[#222] overflow-hidden"><div className="h-full bg-gradient-to-r from-[#6C5CE7] to-[#00D4FF]" style={{ width: `${site.cpu}%` }} /></div>
                            </div>
                            <div className="w-16">
                              <div className="text-[10px] text-[#888]">RAM {site.ram}%</div>
                              <div className="h-1.5 rounded-full bg-black border border-[#222] overflow-hidden"><div className="h-full bg-gradient-to-r from-[#6C5CE7] to-[#00D4FF]" style={{ width: `${site.ram}%` }} /></div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 flex-wrap">
                            <button onClick={() => handleAction(site, "open")} className="px-2 py-1 rounded-full bg-[#1a1a1a] border border-[#222] text-xs hover:bg-white hover:text-black transition">Open</button>
                            <button onClick={() => handleAction(site, "stop")} className="px-2 py-1 rounded-full bg-[#1a1a1a] border border-[#222] text-xs hover:bg-white hover:text-black transition">{site.status === "Running" ? "Stop" : "Start"}</button>
                            <button onClick={() => handleAction(site, "restart")} className="px-2 py-1 rounded-full bg-[#1a1a1a] border border-[#222] text-xs hover:bg-white hover:text-black transition">Restart</button>
                            {(site.status === "Error" || (site.errorCount || 0) > 0) && (
                              <button onClick={() => {
                                const fixed = autoFixSite(site);
                                setWebsites(websites.map(x => x.id === site.id ? fixed : x));
                                if (fixed.status === "Running") toast("Auto-fix ✅ errors clear ho gaye", "success");
                                else toast("Manual fix needed — Telegram @Rolax112", "error");
                              }} className="px-2 py-1 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-300 text-xs">⚡ Fix</button>
                            )}
                            <button onClick={() => setFileManagerSite(site)} className="px-2 py-1 rounded-full bg-[#1a1a1a] border border-[#222] text-xs hover:bg-white hover:text-black transition">Files</button>
                            <button onClick={() => setLogsSite(site)} className="px-2 py-1 rounded-full bg-[#1a1a1a] border border-[#222] text-xs hover:bg-white hover:text-black transition">Logs</button>
                            <button onClick={() => handleAction(site, "delete")} className="px-2 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-xs text-red-400 hover:bg-red-500 hover:text-white transition">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "billing" && (
          <div className="space-y-6 max-w-4xl">
            <h2 className="font-grotesk text-xl font-bold">Billing & Checkout</h2>

            {!selectedPlan ? (
              <div>
                <p className="text-sm text-[#888]">Select a plan to pay with crypto (BEP-20 Only) • Contact: <a href="https://t.me/Rolax112" target="_blank" className="text-[#00D4FF]">t.me/Rolax112</a> only</p>
                <div className="grid md:grid-cols-3 gap-4 mt-4">
                  {plans.map(plan => (
                    <div key={plan.id} className={`rounded-2xl p-5 border ${plan.price === 0 ? "bg-[#111] border-[#222] opacity-75" : "bg-[#111] border-[#222]"}`}>
                      <h4 className="font-semibold">{plan.name}</h4>
                      <p className="text-xl font-bold">{plan.price === 0 ? "Free" : `$${plan.price}`} <span className="text-xs text-[#666]">{plan.price === 0 ? "" : "/mo"}</span></p>
                      {plan.price > 0 && <p className="text-[11px] text-[#00D4FF]">≈ ₹{inr(plan.price)} / month</p>}
                      <p className="text-xs text-[#666] mt-1">{plan.price === 0 ? "Free Forever" : "BEP-20 Crypto Only"}</p>
                      <button onClick={() => { if (plan.price === 0) { toast("Starter is free! No payment needed.", "info"); return; } setSelectedPlan(plan); }} className={`mt-3 w-full py-2 rounded-full text-sm font-medium ${plan.price === 0 ? "bg-[#222] text-[#666] border border-[#333]" : "bg-white text-black"}`}>{plan.price === 0 ? "Free - Active" : "Select Plan"}</button>
                    </div>
                  ))}
                </div>
                {myPayments.length > 0 && (
                  <div className="mt-6 rounded-2xl bg-[#111] border border-[#222] p-5">
                    <h4 className="font-semibold">Payment History</h4>
                    <div className="mt-3 space-y-2">
                      {myPayments.map(p => (
                        <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-black border border-[#222] text-sm">
                          <span>{p.planName} - {p.amount} USDT ({p.coin})</span>
                          <span className={`px-2 py-1 rounded-full text-xs ${p.status === "pending" ? "bg-yellow-500/10 text-yellow-400" : p.status === "approved" ? "bg-[#00ff88]/10 text-[#00ff88]" : "bg-red-500/10 text-red-400"}`}>{p.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl bg-[#111] border border-[#222] p-6 md:p-8">
                <button onClick={() => setSelectedPlan(null)} className="text-xs text-[#888] hover:text-white mb-4">← Back to plans</button>
                {selectedPlan.price === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-2xl font-bold">Free Plan - No Payment Required</p>
                    <p className="text-sm text-[#888] mt-2">Starter is free forever. Just deploy your project.</p>
                    <button onClick={() => setSelectedPlan(null)} className="mt-4 px-6 py-2 rounded-full bg-white text-black text-sm">Go to Deploy</button>
                  </div>
                ) : (
                <>
                <h3 className="font-grotesk text-xl font-bold">Pay with Crypto (BEP-20 Only)</h3>
                <p className="text-sm text-[#888] mt-1">Plan: <span className="text-white font-medium">{selectedPlan.name} - ${selectedPlan.price} (≈ ₹{inr(selectedPlan.price)})</span></p>

                <div className="mt-6 flex gap-3 flex-wrap">
                  {wallets.filter(w => ["BNB","USDT"].includes(w.symbol)).map(w => (
                    <button key={w.id} onClick={() => setPayCoin(w.symbol)} className={`px-4 py-2 rounded-full text-sm border ${payCoin === w.symbol ? "bg-white text-black border-white" : "bg-black border-[#222] text-[#888]"}`}>{w.symbol} • {w.network}</button>
                  ))}
                  {wallets.filter(w => ["BNB","USDT"].includes(w.symbol)).length === 0 && <span className="text-xs text-[#666]">No wallets configured</span>}
                </div>
                {wallets.some(w => !["BNB","USDT"].includes(w.symbol)) && <p className="text-[11px] text-[#666] mt-2">* UPI & other methods removed - Crypto only (BEP-20)</p>}

                <div className="mt-6">
                  <div className="space-y-4">
                    <div className="rounded-2xl bg-black border border-[#6C5CE7]/30 p-4">
                      <label className="text-xs text-[#888]">Payment Address ({payCoin} BEP-20)</label>
                      <div className="mt-2 flex gap-2">
                        <input value={currentWallet.address} readOnly className="flex-1 px-3 py-3 rounded-xl bg-[#111] border border-[#222] text-xs font-mono" />
                        <button onClick={() => { navigator.clipboard.writeText(currentWallet.address); toast("Copied!", "success"); }} className="px-5 py-2 rounded-xl bg-white text-black text-xs font-medium">Copy</button>
                      </div>
                      <div className="mt-3 p-3 rounded-xl bg-[#111] border border-[#222] flex justify-between items-center">
                        <div>
                          <p className="text-xs text-[#888]">Amount to Pay</p>
                          <p className="text-white font-bold">{selectedPlan.price} {payCoin}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-[#888]">Network</p>
                          <p className="text-xs text-[#00D4FF]">{currentWallet.network}</p>
                        </div>
                      </div>
                      <p className="text-[11px] text-red-400 mt-3 bg-red-500/10 border border-red-500/20 rounded-lg p-2">⚠️ Only send on BEP-20 (BNB Smart Chain). Other networks will be lost forever!</p>
                      <p className="text-xs text-[#666] mt-2 text-center">Contact only on Telegram: <a href="https://t.me/Rolax112" target="_blank" className="text-[#00D4FF]">t.me/Rolax112</a></p>
                    </div>

                    <div>
                      <label className="text-xs text-[#888]">Transaction Hash / TXID</label>
                      <input value={txid} onChange={e => setTxid(e.target.value)} placeholder="0x..." className="mt-1 w-full px-4 py-3 rounded-xl bg-black border border-[#222] text-sm placeholder:text-[#555] focus:outline-none focus:border-[#6C5CE7]/50" />
                    </div>
                    <div>
                      <label className="text-xs text-[#888]">Upload Screenshot Proof (URL or base64)</label>
                      <input value={screenshot} onChange={e => setScreenshot(e.target.value)} placeholder="https://... or paste image link" className="mt-1 w-full px-4 py-3 rounded-xl bg-black border border-[#222] text-sm placeholder:text-[#555] focus:outline-none focus:border-[#6C5CE7]/50" />
                      <p className="text-[10px] text-[#666] mt-1">Tip: Upload to imgur & paste link</p>
                    </div>
                    <button onClick={submitPayment} className="w-full py-3 rounded-full bg-gradient-to-r from-[#6C5CE7] to-[#00D4FF] text-white font-medium text-sm">Submit for Approval →</button>
                    <p className="text-xs text-[#666] text-center">Your plan will be activated after admin approves (within 24h)</p>
                  </div>
                </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "support" && (
          <div className="space-y-6 max-w-3xl">
            <h2 className="font-grotesk text-xl font-bold">Support Tickets</h2>

            <div className="rounded-2xl bg-[#111] border border-[#222] p-6">
              <h3 className="font-semibold">Create New Ticket</h3>
              <input value={ticketSubject} onChange={e => setTicketSubject(e.target.value)} placeholder="Subject (e.g. Deployment failed)" className="mt-4 w-full px-4 py-3 rounded-xl bg-black border border-[#222] text-sm placeholder:text-[#555]" />
              <textarea value={ticketMsg} onChange={e => setTicketMsg(e.target.value)} placeholder="Describe your issue..." rows={4} className="mt-3 w-full px-4 py-3 rounded-xl bg-black border border-[#222] text-sm placeholder:text-[#555]" />
              <button onClick={createTicket} className="mt-3 px-6 py-2 rounded-full bg-white text-black text-sm font-medium">Create Ticket</button>
            </div>

            <div className="space-y-3">
              {myTickets.length === 0 ? <p className="text-sm text-[#888] text-center py-8">No tickets yet</p> :
                myTickets.map(t => (
                  <div key={t.id} className="rounded-2xl bg-[#111] border border-[#222] p-5">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-sm">{t.subject}</h4>
                      <span className={`px-2 py-1 rounded-full text-xs ${t.status === "open" ? "bg-yellow-500/10 text-yellow-400" : t.status === "replied" ? "bg-[#00D4FF]/10 text-[#00D4FF]" : "bg-[#00ff88]/10 text-[#00ff88]"}`}>{t.status}</span>
                    </div>
                    <p className="text-sm text-[#888] mt-2">{t.message}</p>
                    {t.replies.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {t.replies.map((r, i) => (
                          <div key={i} className="p-3 rounded-xl bg-black border border-[#222] text-sm">
                            <p className="text-xs text-[#6C5CE7] font-medium">{r.from}</p>
                            <p className="text-[#ccc] mt-1">{r.message}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-[#666] mt-2">{new Date(t.createdAt).toLocaleString()}</p>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Deploy Modal */}
      {showDeploy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-[520px] rounded-2xl bg-[#111] border border-[#222] p-6">
            <h3 className="font-grotesk text-lg font-bold">Deploy New Project</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs text-[#888]">Project Name</label>
                <input value={deployData.name} onChange={e => setDeployData({ ...deployData, name: e.target.value })} placeholder="my-awesome-app" className="mt-1 w-full px-4 py-3 rounded-xl bg-black border border-[#222] text-sm" />
                <p className="text-[10px] text-[#666] mt-1">Will be hosted at {deployData.name ? `${deployData.name.toLowerCase().replace(/\s+/g, "-")}.rolax.host` : "yourproject.rolax.host"}</p>
              </div>
              <div>
                <label className="text-xs text-[#888]">Tech Stack</label>
                <div className="mt-1 flex gap-2 flex-wrap">
                  {stacks.map(s => (
                    <button key={s.id} onClick={() => setDeployData({ ...deployData, stack: s.name })} className={`px-4 py-2 rounded-full text-sm border ${deployData.stack === s.name ? "bg-white text-black border-white" : "bg-black border-[#222] text-[#888]"}`}>{s.icon} {s.name}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-[#888]">GitHub URL (optional)</label>
                <input value={deployData.github} onChange={e => setDeployData({ ...deployData, github: e.target.value })} placeholder="https://github.com/user/repo" className="mt-1 w-full px-4 py-3 rounded-xl bg-black border border-[#222] text-sm" />
              </div>
              <div>
                <label className="text-xs text-[#888]">Or Upload ZIP</label>
                <input type="file" accept=".zip,.py,.js,.html" onChange={e => setDeployData({ ...deployData, zip: e.target.files?.[0] })} className="mt-1 w-full px-4 py-3 rounded-xl bg-black border border-[#222] text-sm file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:bg-white file:text-black file:text-xs" />
                {deployData.zip?.name && (
                  <p className="text-[11px] text-[#00D4FF] mt-1">Detected: {detectFromFileName(deployData.zip.name).fileType} • {(deployData.zip.size / 1024 / 1024).toFixed(2)} MB</p>
                )}
                <p className="text-[10px] text-[#666] mt-1">Supported: .zip, .py (bot), .js (bot), .html — error aaye to deploy ke baad alert milega</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowDeploy(false)} className="flex-1 py-3 rounded-full bg-black border border-[#222] text-sm">Cancel</button>
                <button onClick={handleDeploy} className="flex-1 py-3 rounded-full bg-white text-black font-medium text-sm">Deploy 🚀</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Details Modal */}
      {errorSite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-[680px] rounded-2xl bg-[#111] border border-[#222] p-6 max-h-[80vh] overflow-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-grotesk font-bold">Error Details - {errorSite.name}</h3>
              <button onClick={() => setErrorSite(null)} className="w-8 h-8 rounded-full bg-black border border-[#222]">✕</button>
            </div>
            <p className="text-xs text-[#888] mt-1">{errorSite.fileType} • {errorSite.botType} • {errorSite.url}</p>
            <div className="mt-4 space-y-2">
              {analyzeSite(errorSite).map((e, i) => (
                <div key={i} className="rounded-xl bg-black border border-[#222] p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-red-300">❌ {e.title}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${e.canAutoFix ? "bg-yellow-500/10 text-yellow-400" : "bg-red-500/10 text-red-400"}`}>{e.canAutoFix ? "auto-fix" : "manual"}</span>
                  </div>
                  <p className="text-xs text-[#888] mt-1">{e.detail}</p>
                  <p className="text-xs text-[#00ff88] mt-1">💡 {e.fix}</p>
                </div>
              ))}
              {analyzeSite(errorSite).length === 0 && <p className="text-xs text-[#00ff88]">✓ Koi error nahi — sab clear hai.</p>}
            </div>
            {needsManualAction(errorSite) && (
              <div className="mt-4 rounded-xl bg-red-500/10 border border-red-500/30 p-3">
                <p className="text-xs text-red-300">🚨 {MAX_ERRORS}+ errors — auto-fix kaam nahi karega. File delete karke dobara upload karo ya Telegram @Rolax112 pe help lo.</p>
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button onClick={() => {
                const fixed = autoFixSite(errorSite);
                setWebsites(websites.map(x => x.id === errorSite.id ? fixed : x));
                setErrorSite(fixed.status === "Running" ? null : fixed);
                toast(fixed.status === "Running" ? "Auto-fix ✅" : "Kuch errors manual fix chahiye", fixed.status === "Running" ? "success" : "error");
              }} className="flex-1 py-3 rounded-full bg-white text-black text-sm font-medium">⚡ Auto-Fix Now</button>
              <button onClick={() => { setWebsites(websites.filter(x => x.id !== errorSite.id)); setErrorSite(null); toast("Deleted", "info"); }} className="flex-1 py-3 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-sm">Delete File</button>
            </div>
            <p className="text-[11px] text-[#666] mt-3 text-center">Contact only on Telegram: <a href="https://t.me/Rolax112" target="_blank" className="text-[#00D4FF]">t.me/Rolax112</a></p>
          </div>
        </div>
      )}

      {/* File Manager Modal */}
      {fileManagerSite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-[700px] rounded-2xl bg-[#111] border border-[#222] p-6 max-h-[80vh] overflow-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-grotesk font-bold">File Manager - {fileManagerSite.name}</h3>
              <button onClick={() => setFileManagerSite(null)} className="w-8 h-8 rounded-full bg-black border border-[#222]">✕</button>
            </div>
            <div className="mt-4 rounded-xl bg-black border border-[#222] overflow-hidden">
              <div className="px-4 py-2 border-b border-[#222] text-xs text-[#888] flex items-center gap-2">📁 /var/www/{fileManagerSite.name}</div>
              <div className="p-2 space-y-1 text-sm">
                {["index.html", "package.json", "server.js", "README.md", ".env", "public/", "node_modules/"].map(f => (
                  <div key={f} className="flex items-center justify-between px-3 py-2 hover:bg-[#111] rounded-lg">
                    <span className="flex items-center gap-2">{f.endsWith("/") ? "📁" : "📄"} {f}</span>
                    <span className="text-xs text-[#666]">Edit • Delete</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-[#666] mt-3">Demo file manager - connect to real server for actual files</p>
          </div>
        </div>
      )}

      {/* Logs Modal */}
      {logsSite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-[700px] rounded-2xl bg-[#111] border border-[#222] p-6 max-h-[80vh] overflow-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-grotesk font-bold">Logs - {logsSite.name}</h3>
              <button onClick={() => setLogsSite(null)} className="w-8 h-8 rounded-full bg-black border border-[#222]">✕</button>
            </div>
            <div className="mt-4 rounded-xl bg-black border border-[#222] p-4 font-mono text-xs leading-6 overflow-auto">
              <div className="text-[#00ff88]">[start] Starting {logsSite.stack} app ({logsSite.fileType})...</div>
              {analyzeSite(logsSite).length === 0 ? (
                <>
                  <div className="text-white">[build] Build successful</div>
                  <div className="text-white">[run] Listening on port 8080</div>
                  <div className="text-[#00D4FF]">[http] GET / 200 - 12ms</div>
                  <div className="text-[#888]">[health] Health check OK — bot online</div>
                </>
              ) : (
                <>
                  {analyzeSite(logsSite).map((e, i) => (
                    <div key={i} className="text-red-400">[{e.code}] {e.title}: {e.detail}</div>
                  ))}
                  <div className="text-yellow-400">[exit] Process crashed (code 1) — {logsSite.errorCount || 1} error(s)</div>
                  <div className="text-[#00D4FF]">[hint] {analyzeSite(logsSite)[0]?.fix}</div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
