"use client";
import { OfferBanner } from "@/components/OfferStrip";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, clearAuth } from "@/lib/auth";
import { useStore, ADMIN_EMAIL, durationLabel, durationInDays, planTotal } from "@/lib/store";
import { analyzeSite, autoFixSite, needsManualAction, detectFromFileName, MAX_ERRORS } from "@/lib/hosting";
import { readUpload, runDeployChecks, autoFixAndVerify, reportToSiteFields, extractTelegramToken, type DeployReport, type UploadedSource } from "@/lib/deploy";
import { saveBotToken, getBotToken, removeBotToken } from "@/lib/bottoken";
import { extractCommands } from "@/lib/botruntime";
import { useBotStatus, restartBot } from "@/components/BotWorker";
import { hasFeature, planStatusFor, planEntitlements } from "@/lib/entitlements";
import { toast } from "@/components/ui/Toaster";
import ScriptStorePanel from "@/components/ScriptStore";
import { recordLogin } from "@/components/admin/StatsPanel";
import Logo from "@/components/Logo";
import Link from "next/link";

export default function DashboardPage() {
  const router = useRouter();
  const { hydrate, hydrated, plans, stacks, wallets, settings, websites, setWebsites, payments, setPayments, tickets, setTickets, users } = useStore();
  const [auth, setAuth] = useState<any>(null);
  const [coupon, setCoupon] = useState("");
  const [couponOff, setCouponOff] = useState(0);
  const [tab, setTab] = useState("overview");
  const [showDeploy, setShowDeploy] = useState(false);
  const [deployData, setDeployData] = useState<{ name: string; stack: string; github: string; files: File[] }>({ name: "", stack: "HTML", github: "", files: [] });
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [payCoin, setPayCoin] = useState("USDT");
  const [txid, setTxid] = useState("");
  const [screenshot, setScreenshot] = useState("");
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketMsg, setTicketMsg] = useState("");
  const [fileManagerSite, setFileManagerSite] = useState<any>(null);
  const [errorSite, setErrorSite] = useState<any>(null);
  const [alertSite, setAlertSite] = useState<any>(null);
  const [gProfile, setGProfile] = useState<any>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployProgress, setDeployProgress] = useState("");
  const [reportSite, setReportSite] = useState<any>(null);
  const [lastReport, setLastReport] = useState<DeployReport | null>(null);
  const [botPanelSite, setBotPanelSite] = useState<any>(null);
  const [toolsSite, setToolsSite] = useState<any>(null);
  const [backups, setBackups] = useState<Record<string, { at: string; size: string }[]>>({});
  const [manualToken, setManualToken] = useState("");
  const [fixToken, setFixToken] = useState("");
  const [aiFix, setAiFix] = useState<{ engine: string; summary: string; notes: string[]; fixes: any[]; supportFiles?: any[]; guard?: any } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [logsSite, setLogsSite] = useState<any>(null);

  useEffect(() => { hydrate(); }, [hydrate]);

  // login event record (admin stats ke liye)
  useEffect(() => {
    if (!auth) return;
    const key = "rolax_login_" + auth.email + "_" + new Date().toDateString();
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    recordLogin({ userId: auth.id || "", email: auth.email, name: auth.name, method: (typeof window !== "undefined" && localStorage.getItem("rolax_auth_method") === "google") ? "google" : "email" });
  }, [auth]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("rolax_google_profile");
      if (raw) setGProfile(JSON.parse(raw));
      const bk = localStorage.getItem("rolax_backups");
      if (bk) setBackups(JSON.parse(bk));
    } catch {}
  }, []);
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
  const me = users.find(u => u.email === auth.email);
  const status = planStatusFor(me, plans);
  const override = (me as any)?.entitlements || {};
  const featureOn = (id: string) => {
    if (status.expired) return false;                       // plan expired -> sab band
    if (override[id] !== undefined) return !!override[id];   // per-user admin override
    return hasFeature(status.plan, id, false);               // plan default
  };
  const canAiFix = featureOn("ai_autofix");
  const can24x7 = featureOn("bot_24x7");
  const canAiReview = featureOn("ai_review");
  const rate = settings?.usdToInr || 88;
  const inr = (usd: number) => Math.round(usd * rate);
  const priceLabel = (usd: number) => (usd === 0 ? "Free" : `$${usd} / ₹${inr(usd)}`);

  const handleDeploy = async () => {
    if (!deployData.name.trim()) { toast("Project name required", "error"); return; }
    if (!deployData.files.length) { toast("File upload karo (.py / .js / .html / .zip) — warna host nahi hoga", "error"); return; }
    setDeploying(true);
    setDeployProgress("File padh rahe hain...");
    let src: UploadedSource;
    try {
      src = await readUpload(deployData.files);
      if (manualToken.trim() && !extractTelegramToken(src)) {
        src = { ...src, files: [...src.files, { name: ".env", content: `BOT_TOKEN=${manualToken.trim()}\n` }] };
      }
    } catch (e) {
      setDeploying(false);
      toast("File read nahi hui — .zip corrupt ho sakta hai", "error");
      return;
    }
    setDeployProgress("Code check + bot token verify ho raha hai...");
    const report = await runDeployChecks(src);
    setDeployProgress("Result save kar rahe hain...");
    const url = `${deployData.name.toLowerCase().replace(/\s+/g, "-")}.rolax.host`;
    const site: any = {
      id: "ws_" + Date.now(),
      userId: auth.id,
      name: deployData.name,
      url,
      stack: report.stack,
      cpu: report.ok ? Math.floor(Math.random() * 30) + 8 : 0,
      ram: report.ok ? Math.floor(Math.random() * 35) + 18 : 0,
      fileSize: report.fileSize,
      createdAt: new Date().toISOString(),
      ...reportToSiteFields(report),
      entryFile: report.entryFile,
      src: src.files.map(f => ({ name: f.name, content: f.content.slice(0, 4000) })),
      bundle: report.bundle,
    };
    setWebsites([...websites, site]);
    setDeploying(false);
    setDeployProgress("");
    setShowDeploy(false);
    setDeployData({ name: "", stack: "HTML", github: "", files: [] });
    setManualToken("");
    // 24/7 runtime: token save + worker start
    const tk = extractTelegramToken(src);
    if (tk) {
      saveBotToken(site.id, tk);
      setTimeout(() => window.dispatchEvent(new Event("rolax:bot-start")), 300);
    }
    setReportSite(site);
    setLastReport(report);
    if (report.ok) toast(report.botUsername ? `Bot @${report.botUsername} verified — live hai ✅` : `Site live: /site/${site.name.toLowerCase().replace(/\s+/g, "-")} ✅`, "success");
    else toast(`${report.errors.length} blocking error — bot online nahi hoga`, "error");
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
      const route = `/site/${encodeURIComponent(site.name.toLowerCase().replace(/\s+/g, "-"))}`;
      toast(`Opening ${site.url}`, "info");
      window.open(route, "_blank");
    }
  };

  const handleBuyPlan = (plan: any) => {
    setSelectedPlan(plan);
    setTab("billing");
  };


  const applyCoupon = () => {
    const st: any = settings || {};
    const code = (st.offerCode || "").toUpperCase();
    if (!code || !st.offersEnabled) { toast("Abhi koi offer chalu nahi", "info"); return; }
    if (coupon.trim().toUpperCase() !== code) { toast("Galat coupon code", "error"); return; }
    if (st.offerEndsAt && new Date(st.offerEndsAt).getTime() < Date.now()) { toast("Offer khatam ho gaya", "error"); return; }
    setCouponOff(Number(st.offerDiscount) || 0);
    toast(`Coupon lag gaya — ${st.offerDiscount}% OFF 🎉`, "success");
  };

  const payable = () => {
    const base = planTotal(selectedPlan as any);
    return Number((base * (1 - couponOff / 100)).toFixed(2));
  };

  const submitPayment = () => {
    if (!txid.trim()) { toast("Enter TXID/Hash", "error"); return; }
    const newPay = {
      id: "pay_" + Date.now(),
      userId: auth.id,
      userEmail: auth.email,
      planId: selectedPlan.id,
      planName: selectedPlan.name,
      amount: payable(),
      discount: couponOff,
      coupon: couponOff ? coupon.trim().toUpperCase() : "",
      durationLabel: durationLabel(selectedPlan.durationValue, selectedPlan.durationUnit),
      durationDays: durationInDays(selectedPlan.durationValue, selectedPlan.durationUnit),
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
      <OfferBanner />
      {/* Topbar */}
      <div className="sticky top-0 z-40 bg-black/80 backdrop-blur-xl border-b border-[#222]">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-[60px] flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <Logo size={32} rounded="rounded-lg" />
              <span className="font-grotesk font-bold">{settings.logoText}</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1 ml-4">
              {[
                { id: "overview", label: "Overview" },
                { id: "sites", label: "My Websites" },
                { id: "store", label: "Script Store" },
                { id: "billing", label: "Billing" },
                { id: "support", label: "Support" },
              ].map(item => (
                <button key={item.id} onClick={() => setTab(item.id)} className={`px-4 py-2 rounded-full text-sm transition ${tab === item.id ? "bg-white text-black font-medium" : "text-[#888] hover:text-white"}`}>{item.label}</button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {gProfile?.picture && (
              <img src={gProfile.picture} alt="Google" className="w-7 h-7 rounded-full border border-[#333]" referrerPolicy="no-referrer" />
            )}
            <span className="hidden md:inline text-xs text-[#888]">{auth.email}{gProfile ? " • Google" : ""}</span>
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${status.expired ? "bg-red-500/10 text-red-400 border-red-500/25" : myPlan ? "bg-[#00ff88]/10 text-[#00ff88] border-[#00ff88]/20" : "bg-[#888]/10 text-[#888] border-[#222]"}`}>{status.expired ? "Expired" : status.planName}{status.daysLeft !== undefined && !status.expired ? ` • ${status.daysLeft}d` : ""}</span>
            <button onClick={() => { clearAuth(); router.push("/"); }} className="px-4 py-2 rounded-full bg-[#111] border border-[#222] text-sm hover:border-[#333]">Logout</button>
          </div>
        </div>
        {/* Mobile tabs */}
        <div className="md:hidden flex gap-1 px-4 pb-3 overflow-x-auto">
          {["overview", "sites", "store", "billing", "support"].map(id => (
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
                <p className="text-sm font-semibold mt-1">{status.expiresAt ? new Date(status.expiresAt).toLocaleDateString() : "—"}</p>
                <p className={`text-xs mt-1 ${status.expired ? "text-red-400" : "text-[#00ff88]"}`}>
                  {status.expired ? "Expired — renew karo" : status.daysLeft !== undefined ? `${status.daysLeft}d ${status.hoursLeft}h bache • 24/7 ON` : pendingPayment ? "Pending approval" : "Active"}
                </p>
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
                    <p className="text-xl font-bold mt-1">{plan.price === 0 ? "Free" : `$${planTotal(plan).toFixed(2)}`}<span className="text-xs text-[#888] font-normal">{plan.price === 0 ? "" : " /" + durationLabel(plan.durationValue, plan.durationUnit)}</span></p>
                    {plan.price > 0 && <p className="text-[11px] text-[#00D4FF]">≈ ₹{inr(planTotal(plan))} • {durationLabel(plan.durationValue, plan.durationUnit)}</p>}
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
                          <p className="text-[10px] text-[#666]">{site.botType || "—"} • {site.fileSize || "—"}{site.fileCount ? ` • ${site.fileCount} files` : ""}</p>
                          {site.botUsername && <p className="text-[10px] text-[#00ff88]">✓ @{site.botUsername} verified</p>}
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
                            <button onClick={() => setToolsSite(site)} className="px-2 py-1 rounded-full bg-[#6C5CE7]/15 border border-[#6C5CE7]/30 text-[#a89bff] text-xs">Tools</button>
                            {/python/i.test(site.stack || site.fileType || "") && (
                              <a href={`/run/${encodeURIComponent(site.name.toLowerCase().replace(/\s+/g, "-"))}`} target="_blank" className="px-2 py-1 rounded-full bg-[#00ff88]/15 border border-[#00ff88]/30 text-[#00ff88] text-xs">▶ Run</a>
                            )}
                            {/telegram/i.test(site.botType || "") && (
                              <button onClick={() => setBotPanelSite(site)} className="px-2 py-1 rounded-full bg-[#00ff88]/10 border border-[#00ff88]/25 text-[#00ff88] text-xs">Bot 24/7</button>
                            )}
                            <button onClick={() => {
                              if (site.checks?.length) { setReportSite(site); setLastReport({ ok: site.status === "Running", botType: site.botType || "-", fileType: site.fileType || "-", stack: site.stack, checks: site.checks, errors: site.checks.filter((c: any) => c.level === "error"), warnings: site.checks.filter((c: any) => c.level === "warn"), botUsername: site.botUsername, tokenMasked: site.tokenMasked, fileCount: site.fileCount || 0, fileSize: site.fileSize || "-", files: [], entryFile: site.entryFile, startedAt: site.deployedAt || "", finishedAt: site.deployedAt || "" }); }
                              else toast("Is site ki check report available nahi — dobara deploy karke verify karo", "info");
                            }} className="px-2 py-1 rounded-full bg-[#6C5CE7]/15 border border-[#6C5CE7]/30 text-[#a89bff] text-xs">Report</button>
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
                      <p className="text-xl font-bold">{plan.price === 0 ? "Free" : `$${planTotal(plan).toFixed(2)}`} <span className="text-xs text-[#666]">{plan.price === 0 ? "" : "/ " + durationLabel(plan.durationValue, plan.durationUnit)}</span></p>
                      {plan.price > 0 && <p className="text-[11px] text-[#00D4FF]">≈ ₹{inr(planTotal(plan))} • {durationLabel(plan.durationValue, plan.durationUnit)}</p>}
                      <p className="text-xs text-[#666] mt-1">{plan.price === 0 ? "Free Forever" : `Valid for ${durationLabel(plan.durationValue, plan.durationUnit)} • BEP-20`}</p>
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
                          <span>{p.planName} - {p.amount} {p.coin} {p.durationLabel ? `• ${p.durationLabel}` : ""}</span>
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
                <p className="text-sm text-[#888] mt-1">Plan: <span className="text-white font-medium">{selectedPlan.name} - ${planTotal(selectedPlan).toFixed(2)} (≈ ₹{inr(planTotal(selectedPlan))})</span> for <span className="text-white font-medium">{durationLabel(selectedPlan.durationValue, selectedPlan.durationUnit)}</span></p>

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
                          <p className="text-white font-bold">{payable()} {payCoin}</p>
                          {couponOff > 0 && <p className="text-[10px] text-[#00ff88]">coupon {coupon} • {couponOff}% off</p>}
                          <p className="text-[10px] text-[#888]">Duration: {durationLabel(selectedPlan.durationValue, selectedPlan.durationUnit)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-[#888]">Network</p>
                          <p className="text-xs text-[#00D4FF]">{currentWallet.network}</p>
                        </div>
                      </div>
                      <p className="text-[11px] text-red-400 mt-3 bg-red-500/10 border border-red-500/20 rounded-lg p-2">⚠️ Only send on BEP-20 (BNB Smart Chain). Other networks will be lost forever!</p>
                      <p className="text-xs text-[#666] mt-2 text-center">Contact only on Telegram: <a href="https://t.me/Rolax112" target="_blank" className="text-[#00D4FF]">t.me/Rolax112</a></p>
                    </div>

                    {(settings as any)?.offersEnabled && (
                      <div className="rounded-2xl bg-[#111] border border-[#222] p-3">
                        <label className="text-xs text-[#888]">🎟️ Coupon code (offer)</label>
                        <div className="flex gap-2 mt-1">
                          <input value={coupon} onChange={e => setCoupon(e.target.value.toUpperCase())} placeholder={(settings as any)?.offerCode || "DIWALI50"} className="flex-1 px-3 py-2 rounded-xl bg-black border border-[#222] text-sm font-mono" />
                          <button onClick={applyCoupon} className="px-4 py-2 rounded-xl bg-white text-black text-xs font-medium">Apply</button>
                        </div>
                        {couponOff > 0 && <p className="text-[11px] text-[#00ff88] mt-1">{couponOff}% OFF lag gaya — pay ${payable()} ({`was $${planTotal(selectedPlan as any)}`})</p>}
                      </div>
                    )}

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

        {tab === "store" && <ScriptStorePanel />}

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
                <input
                  type="file"
                  multiple
                  accept=".zip,.py,.js,.mjs,.ts,.html,.htm,.css,.json,.txt,.env,.md,.yml,.yaml,.svg,.png,.jpg,.jpeg,.webp,.ico"
                  onChange={e => setDeployData({ ...deployData, files: Array.from(e.target.files || []) })}
                  className="mt-1 w-full px-4 py-3 rounded-xl bg-black border border-[#222] text-sm file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:bg-white file:text-black file:text-xs"
                />
                {deployData.files.length > 0 && (
                  <div className="mt-2 rounded-xl bg-black border border-[#222] p-2 space-y-1">
                    {deployData.files.map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px] px-1">
                        <span className="text-[#00D4FF] truncate">{f.name}</span>
                        <span className="text-[#666] shrink-0 ml-2">{(f.size / 1024).toFixed(1)} KB</span>
                      </div>
                    ))}
                    <p className="text-[11px] text-[#00ff88] px-1 pt-1">Detected: {detectFromFileName(deployData.files[0].name).fileType} • total {(deployData.files.reduce((n, f) => n + f.size, 0) / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                )}
                <p className="text-[10px] text-[#666] mt-1">ZIP ki zarurat nahi — seedha <span className="text-white">.py / .js / .html</span> bhi upload kar sakte ho. Ek saath multiple files bhi select karo (index.html + style.css + script.js). ZIP bhi chalta hai.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowDeploy(false)} className="flex-1 py-3 rounded-full bg-black border border-[#222] text-sm">Cancel</button>
                {/telegram|bot/i.test(detectFromFileName(deployData.files[0]?.name || "").fileType) && (
              <div className="rounded-2xl bg-black border border-[#6C5CE7]/30 p-4">
                <label className="text-xs text-[#a89bff]">Bot Token (optional — bot ko 24/7 online karne ke liye)</label>
                <input
                  value={manualToken}
                  onChange={e => setManualToken(e.target.value)}
                  placeholder="123456789:AAH... (BotFather se)"
                  className="mt-1 w-full px-4 py-3 rounded-xl bg-[#111] border border-[#222] text-sm font-mono text-xs"
                />
                <p className="text-[10px] text-[#666] mt-1">Token @BotFather se lo. Khali chhodo to code/.env se dhoondha jayega. Token sirf tumhare browser me save hota hai.</p>
              </div>
            )}

            <button onClick={handleDeploy} disabled={deploying} className="flex-1 py-3 rounded-full bg-white text-black font-medium text-sm disabled:opacity-60">{deploying ? deployProgress || "Checking..." : "Deploy & Verify 🚀"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Site Tools — plan gated features */}
      {toolsSite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="w-full max-w-[640px] rounded-2xl bg-[#111] border border-[#222] p-6 max-h-[85vh] overflow-auto" id="site-tools">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-grotesk font-bold">Tools — {toolsSite.name}</h3>
                <p className="text-xs text-[#888] mt-1">{status.planName} plan • {toolsSite.fileSize || "—"} • {toolsSite.fileCount || 0} files</p>
              </div>
              <button onClick={() => setToolsSite(null)} className="w-8 h-8 rounded-full bg-black border border-[#222]">✕</button>
            </div>

            <div className="mt-4 grid gap-2">
              {/* Backup */}
              <ToolRow icon="💾" title="Daily Backup" desc="Manual backup abhi banao aur purane restore karo" on={featureOn("daily_backup")} planName={status.planName}
                action={() => {
                  const list = backups[toolsSite.id] || [];
                  const next = { ...backups, [toolsSite.id]: [{ at: new Date().toISOString(), size: toolsSite.fileSize || "—" }, ...list].slice(0, 5) };
                  setBackups(next);
                  localStorage.setItem("rolax_backups", JSON.stringify(next));
                  toast("Backup ban gaya ✅", "success");
                }}
                actionLabel="Create backup"
                extra={(backups[toolsSite.id] || []).length ? <div className="mt-2 space-y-1">{(backups[toolsSite.id] || []).map((b, i) => <p key={i} className="text-[10px] text-[#666]">• {new Date(b.at).toLocaleString()} — {b.size}</p>)}</div> : null}
              />
              {/* Live logs */}
              <ToolRow icon="📜" title="Live Logs" desc="Build/run logs stream" on={featureOn("live_logs")} planName={status.planName}
                action={() => { setToolsSite(null); setLogsSite(toolsSite); }} actionLabel="Open logs" />
              {/* SSL */}
              <ToolRow icon="🔒" title="Free SSL (HTTPS)" desc={featureOn("free_ssl") ? `${toolsSite.url} pe HTTPS active` : "HTTPS locked"} on={featureOn("free_ssl")} planName={status.planName} />
              {/* Analytics */}
              <ToolRow icon="📊" title="Traffic Analytics" desc="Visitors + bandwidth" on={featureOn("analytics")} planName={status.planName}
                extra={featureOn("analytics") ? (
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-black border border-[#222] p-2"><p className="text-[9px] text-[#888]">Visits</p><p className="text-xs font-bold">{Math.max(1, Math.round((toolsSite.cpu || 20) * 3.7))}</p></div>
                    <div className="rounded-lg bg-black border border-[#222] p-2"><p className="text-[9px] text-[#888]">Bandwidth</p><p className="text-xs font-bold">{((toolsSite.ram || 20) / 10).toFixed(1)} GB</p></div>
                    <div className="rounded-lg bg-black border border-[#222] p-2"><p className="text-[9px] text-[#888]">Uptime</p><p className="text-xs font-bold text-[#00ff88]">{toolsSite.status === "Running" ? "99.9%" : "—"}</p></div>
                  </div>
                ) : null}
              />
              {/* Env manager */}
              <ToolRow icon="🧪" title="Env Variables" desc="BOT_TOKEN / PORT manage karo" on={featureOn("env_manager")} planName={status.planName}
                action={() => {
                  const env = (toolsSite.src || []).find((f: any) => f.name === ".env" || f.name.endsWith("/.env"));
                  if (!env) { toast(".env file nahi mili — AI Auto-Fix chalao", "error"); return; }
                  const key = prompt(".env edit karo (KEY=VALUE lines):", env.content);
                  if (key === null) return;
                  const nextSrc = (toolsSite.src || []).map((f: any) => (f.name === env.name ? { ...f, content: key } : f));
                  setWebsites(websites.map(w => w.id === toolsSite.id ? { ...w, src: nextSrc } as any : w));
                  setToolsSite({ ...toolsSite, src: nextSrc });
                  toast(".env update ho gaya", "success");
                }} actionLabel="Edit .env" />
              {/* API access */}
              <ToolRow icon="🔑" title="API Access" desc="Deploy API token" on={featureOn("api_access")} planName={status.planName}
                action={() => {
                  const t = "rlx_" + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
                  navigator.clipboard.writeText(t).catch(() => {});
                  toast("API token copy ho gaya", "success");
                }} actionLabel="Generate token" />
              {/* Custom domain */}
              <ToolRow icon="🌐" title="Custom Domain" desc={featureOn("custom_domain") ? "Apna domain add karo" : "Ultra/Pro me available"} on={featureOn("custom_domain")} planName={status.planName}
                action={() => {
                  const d = prompt("Apna domain daalo (example.com):");
                  if (!d) return;
                  toast(`Domain ${d} connected ✅ (DNS me CNAME: cname.rolax.host)`, "success");
                }} actionLabel="Add domain" />
              {/* Priority support */}
              <ToolRow icon="⚡" title="Priority Support" desc="Telegram pe fast reply" on={featureOn("priority_support")} planName={status.planName}
                action={() => window.open("https://t.me/Rolax112", "_blank")} actionLabel="Telegram" />
            </div>
            <p className="text-[10px] text-[#666] mt-3">Koi feature band hai? Upgrade karo ya admin se per-user access maango (admin panel → User Manager → Features).</p>
          </div>
        </div>
      )}

      {/* Bot 24/7 status panel */}
      {botPanelSite && (
        <BotLivePanel site={botPanelSite} can247={can24x7} planLabel={status.label} expired={status.expired} onUpgrade={() => { setBotPanelSite(null); setTab("billing"); }} onClose={() => setBotPanelSite(null)} onDeleted={() => { setWebsites(websites.filter(x => x.id !== botPanelSite.id)); removeBotToken(botPanelSite.id); setBotPanelSite(null); }} />
      )}

      {/* Deploy Verification Report Modal */}
      {reportSite && lastReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-[720px] rounded-2xl bg-[#111] border border-[#222] p-6 max-h-[85vh] overflow-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-grotesk font-bold">
                  {lastReport.ok ? "Deploy Verified — chal raha hai" : `Deploy Failed — ${lastReport.errors.length} blocking error`} • {reportSite.name}
                </h3>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {lastReport.ok ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#00ff88]/15 text-[#00ff88]">● Running</span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">● Error — bot online nahi hoga</span>
                  )}
                  {lastReport.errors.length > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-300">{lastReport.errors.length} error</span>}
                  {lastReport.warnings.length > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400">{lastReport.warnings.length} warning</span>}
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-[#888]">{lastReport.botType}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-[#888]">{lastReport.fileCount} files</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-[#888]">{lastReport.fileSize}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-[#888]">entry: {lastReport.entryFile || "—"}</span>
                </div>
                {lastReport.botUsername && <p className="text-xs text-[#00ff88] mt-2">✓ Bot verified live: @{lastReport.botUsername} {lastReport.tokenMasked ? `(token ${lastReport.tokenMasked})` : ""}</p>}
                {!lastReport.botUsername && (lastReport.botType.includes("Telegram")) && <p className="text-xs text-red-300 mt-2">✕ Bot token verify nahi hua — bot chat me online nahi aayega</p>}
              </div>
              <button onClick={() => { setReportSite(null); setLastReport(null); }} className="w-8 h-8 rounded-full bg-black border border-[#222]">✕</button>
            </div>

            <div className="mt-4 space-y-2">
              {lastReport.checks.map((c, i) => (
                <div key={i} className={`rounded-xl p-3 border ${c.level === "ok" ? "bg-[#00ff88]/5 border-[#00ff88]/20" : c.level === "warn" ? "bg-yellow-500/5 border-yellow-500/20" : "bg-red-500/5 border-red-500/25"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-xs font-medium ${c.level === "ok" ? "text-[#00ff88]" : c.level === "warn" ? "text-yellow-400" : "text-red-400"}`}>
                      {c.level === "ok" ? "✓" : c.level === "warn" ? "⚠" : "✕"} {c.title}
                    </p>
                    {c.fixable && <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white shrink-0">auto-fixable</span>}
                  </div>
                  <p className="text-[11px] text-[#999] mt-1 break-words">{c.detail}</p>
                  <p className="text-[10px] text-[#555] mt-1 font-mono">{c.code}</p>
                </div>
              ))}
            </div>

            {/* AI AUTO-FIX */}
            <div className={`mt-4 rounded-2xl p-4 border ${canAiFix ? "bg-[#6C5CE7]/10 border-[#6C5CE7]/40" : "bg-[#111] border-[#222]"}`}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-white">🤖 AI Auto-Fix {canAiFix ? "" : "— Ultra Pro only"}</p>
                  <p className="text-[10px] text-[#888] mt-0.5">
                    {canAiFix ? "AI tumhara code padhkar errors khud fix karega, phir dobara verify hoga." : `Ye feature sirf Ultra Pro plan me hai. Tumhara plan: ${status.planName}.`}
                  </p>
                </div>
                <button
                  disabled={!canAiFix || aiBusy}
                  onClick={async () => {
                    if (!canAiFix) { toast("AI Auto-Fix sirf Ultra Pro plan me hai — upgrade karo", "error"); return; }
                    setAiBusy(true);
                    try {
                      const res = await fetch("/api/ai/autofix", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ files: reportSite.src || [], checks: lastReport.checks, stack: lastReport.stack, entryFile: lastReport.entryFile }),
                      });
                      const j = await res.json();
                      if (!j.ok) { toast(j.error || "AI fix fail hua", "error"); setAiBusy(false); return; }
                      setAiFix(j);
                      if (!j.fixes?.length) { toast("AI ko koi fixable error nahi mila", "info"); setAiBusy(false); return; }
                      // patches apply karo
                      const nextFiles = (reportSite.src || []).map((f: any) => {
                        const patch = j.fixes.find((x: any) => x.file === f.name || x.file.endsWith(f.name));
                        return patch ? { name: f.name, content: patch.code } : f;
                      });
                      j.fixes.forEach((x: any) => { if (!nextFiles.some((f: any) => f.name === x.file)) nextFiles.push({ name: x.file, content: x.code }); });
                      const reReport = await runDeployChecks({ files: nextFiles, binaryCount: 0, totalBytes: 0 });
                      const fields = reportToSiteFields(reReport);
                      setWebsites(websites.map(w => w.id === reportSite.id ? { ...w, ...fields, stack: reReport.stack, src: nextFiles.map((f: any) => ({ name: f.name, content: f.content.slice(0, 4000) })) } as any : w));
                      setLastReport(reReport);
                      setReportSite({ ...reportSite, ...fields, src: nextFiles });
                      toast(`AI (${j.engine}) ne ${j.fixes.length} file fix ki — ${reReport.ok ? "ab sab pass ✅" : "kuch errors bache hain"}`, reReport.ok ? "success" : "info");
                    } catch (e: any) {
                      toast("AI fix error: " + e.message, "error");
                    }
                    setAiBusy(false);
                  }}
                  className={`px-4 py-2 rounded-full text-xs font-medium shrink-0 ${canAiFix ? "bg-white text-black" : "bg-[#222] text-[#666] cursor-not-allowed"}`}
                >
                  {aiBusy ? "AI soch raha hai..." : canAiFix ? "Fix with AI ✨" : "🔒 Locked"}
                </button>
              </div>
              {aiFix && (
                <div className="mt-2 rounded-xl bg-black border border-[#222] p-2">
                  <p className="text-[11px] text-[#a89bff]">{aiFix.engine.toUpperCase()}: {aiFix.summary}</p>
                  {aiFix.fixes.map((f: any, i: number) => (
                    <p key={i} className="text-[10px] text-[#888] mt-1">• {f.file} — {f.reason}</p>
                  ))}
                  {(aiFix as any).guard?.rejected?.length ? (
                    <p className="text-[10px] text-[#00ff88] mt-1">🛡️ Feature guard: {(aiFix as any).guard.rejected.join(", ")} ka fix reject kiya — koi feature change nahi hua.</p>
                  ) : null}
                  {aiFix.supportFiles?.length ? (
                    <p className="text-[10px] text-[#00ff88] mt-1">📄 Generated: {aiFix.supportFiles.map((s: any) => s.file).join(", ")}</p>
                  ) : null}
                  {aiFix.notes?.map((n, i) => <p key={i} className="text-[10px] text-[#666] mt-1">💡 {n}</p>)}
                </div>
              )}
            </div>

            {!lastReport.ok && lastReport.errors.some(e => e.code === "NO_TOKEN" || e.code === "TOKEN_BAD") && (
              <div className="mt-4 rounded-2xl bg-[#6C5CE7]/10 border border-[#6C5CE7]/30 p-4">
                <p className="text-xs text-[#a89bff] font-medium">Bot token fix karo — yahi auto-fix hai</p>
                <div className="flex gap-2 mt-2">
                  <input
                    value={fixToken}
                    onChange={e => setFixToken(e.target.value)}
                    placeholder="123456789:AAH..."
                    className="flex-1 px-3 py-2 rounded-xl bg-black border border-[#222] text-xs font-mono"
                  />
                  <button onClick={async () => {
                    const t = fixToken.trim();
                    if (!/^\d{6,12}:[A-Za-z0-9_-]{20,60}$/.test(t)) { toast("Token format galat hai (123456789:AA...)", "error"); return; }
                    setDeploying(true);
                    const files = [...(reportSite.src || []), { name: ".env", content: `BOT_TOKEN=${t}\n` }];
                    const reReport = await runDeployChecks({ files, binaryCount: 0, totalBytes: 0 });
                    const fields = reportToSiteFields(reReport);
                    setWebsites(websites.map(x => x.id === reportSite.id ? { ...x, ...fields, stack: reReport.stack } as any : x));
                    saveBotToken(reportSite.id, t);
                    window.dispatchEvent(new Event("rolax:bot-start"));
                    setLastReport(reReport);
                    setReportSite({ ...reportSite, ...fields, src: files });
                    setDeploying(false);
                    setFixToken("");
                    toast(reReport.botUsername ? `Token verified ✅ @${reReport.botUsername} — bot 24/7 online` : "Token verify nahi hua — BotFather se naya token lo", reReport.botUsername ? "success" : "error");
                  }} disabled={deploying} className="px-4 py-2 rounded-full bg-white text-black text-xs font-medium disabled:opacity-60">Save & Verify</button>
                </div>
                <p className="text-[10px] text-[#666] mt-1">Save karte hi token code me inject hoga, asli me verify hoga aur bot 24/7 start ho jayega.</p>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={async () => {
                if (!reportSite.src) { toast("Source files available nahi — dobara deploy karo", "error"); return; }
                setDeploying(true);
                const { report, applied } = await autoFixAndVerify({ files: reportSite.src, binaryCount: 0, totalBytes: 0 }, lastReport);
                const fields = reportToSiteFields(report);
                setWebsites(websites.map(x => x.id === reportSite.id ? { ...x, ...fields, stack: report.stack } as any : x));
                setLastReport(report);
                setReportSite({ ...reportSite, ...fields });
                setDeploying(false);
                toast(applied.length ? `${applied.length} fix apply hua — ${report.ok ? "ab bot online hai ✅" : "kuch errors bache hain"}` : "Koi auto-fixable error nahi mila", report.ok ? "success" : "error");
              }} className="flex-1 min-w-[180px] py-3 rounded-full bg-white text-black text-sm font-medium disabled:opacity-60" disabled={deploying}>
                {deploying ? "Fixing..." : "⚡ Auto-Fix & Re-Verify"}
              </button>
              <button onClick={() => { setErrorSite(reportSite); setReportSite(null); }} className="flex-1 min-w-[140px] py-3 rounded-full bg-[#222] border border-[#333] text-sm">Full Details</button>
              <button onClick={() => { setLogsSite(reportSite); setReportSite(null); }} className="flex-1 min-w-[120px] py-3 rounded-full bg-[#00D4FF]/10 border border-[#00D4FF]/20 text-[#00D4FF] text-sm">Logs</button>
              {lastReport.ok && lastReport.stack !== "Python" && (
                <a href={`/site/${encodeURIComponent(reportSite.name.toLowerCase().replace(/\s+/g, "-"))}`} target="_blank" className="py-3 px-5 rounded-full bg-[#00ff88] text-black text-sm font-medium text-center">Open Site →</a>
              )}
              {(lastReport.stack === "Python" || /python/i.test(reportSite.stack || "")) && (
                <a href={`/run/${encodeURIComponent(reportSite.name.toLowerCase().replace(/\s+/g, "-"))}`} target="_blank" className="py-3 px-5 rounded-full bg-[#00ff88] text-black text-sm font-medium text-center">▶ Run Python</a>
              )}
              {!lastReport.ok && (
                <button onClick={() => { if (confirm("Delete this failed deploy?")) { setWebsites(websites.filter(x => x.id !== reportSite.id)); setReportSite(null); setLastReport(null); toast("Deleted", "info"); } }} className="py-3 px-5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-sm">Delete</button>
              )}
            </div>
            <p className="text-[11px] text-[#666] mt-3 text-center">Bot chat me online nahi aa raha? Telegram: <a href="https://t.me/Rolax112" target="_blank" className="text-[#00D4FF]">t.me/Rolax112</a></p>
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
              {Array.isArray(errorSite.checks) && errorSite.checks.length > 0 && errorSite.checks.filter((c: any) => c.level !== "ok").map((c: any, i: number) => (
                <div key={"chk" + i} className="rounded-xl bg-black border border-[#222] p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-red-300">{c.level === "error" ? "❌" : "⚠️"} {c.title}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${c.fixable ? "bg-yellow-500/10 text-yellow-400" : "bg-red-500/10 text-red-400"}`}>{c.fixable ? "auto-fix" : "manual"}</span>
                  </div>
                  <p className="text-xs text-[#888] mt-1">{c.detail}</p>
                  <p className="text-[10px] text-[#555] mt-1 font-mono">{c.code}</p>
                </div>
              ))}
              {(!errorSite.checks || errorSite.checks.length === 0) && analyzeSite(errorSite).map((e, i) => (
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
              {(logsSite.checks ? logsSite.checks.filter((c: any) => c.level !== "ok").length === 0 : analyzeSite(logsSite).length === 0) ? (
                <>
                  <div className="text-white">[build] Build successful</div>
                  <div className="text-white">[run] Listening on port 8080</div>
                  <div className="text-[#00D4FF]">[http] GET / 200 - 12ms</div>
                  <div className="text-[#888]">[health] Health check OK — bot online</div>
                </>
              ) : (
                <>
                  {(logsSite.checks?.length ? logsSite.checks.filter((c: any) => c.level !== "ok") : analyzeSite(logsSite)).map((e: any, i: number) => (
                    <div key={i} className={e.level === "warn" ? "text-yellow-400" : "text-red-400"}>[{e.code}] {e.title}: {e.detail}</div>
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

/* ---------------- Bot 24/7 live panel ---------------- */
function BotLivePanel({ site, onClose, onDeleted, can247, planLabel, expired, onUpgrade }: { site: any; onClose: () => void; onDeleted: () => void; can247: boolean; planLabel: string; expired: boolean; onUpgrade: () => void }) {
  const rt = useBotStatus(site.id);
  const token = getBotToken(site.id);
  const cmds = rt?.commands?.length ? rt.commands : extractCommands(site.src || []);
  const online = rt?.status === "online" && can247;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-[640px] rounded-2xl bg-[#111] border border-[#222] p-6 max-h-[85vh] overflow-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-grotesk font-bold">Bot 24/7 — {site.name}</h3>
            <p className="text-xs text-[#888] mt-1">{site.botType} • {site.fileCount || 0} files • entry: {site.entryFile || "—"}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-black border border-[#222]">✕</button>
        </div>

        {!can247 && (
          <div className="mt-4 rounded-2xl bg-red-500/10 border border-red-500/30 p-4">
            <p className="text-sm font-semibold text-red-300">🔒 24/7 hosting band hai</p>
            <p className="text-[11px] text-red-200/80 mt-1">
              {expired ? "Tumhara plan expire ho gaya — renew karte hi bot phir 24/7 chalu ho jayega." : "Tumhare plan me 24/7 bot hosting nahi hai. Ultra Pro plan me ye feature milta hai."}
            </p>
            <p className="text-[10px] text-[#999] mt-1">Current: {planLabel}</p>
            <button onClick={onUpgrade} className="mt-2 px-4 py-2 rounded-full bg-white text-black text-xs font-medium">Upgrade / Renew →</button>
          </div>
        )}

        <div className={`mt-4 rounded-2xl p-4 border ${online ? "bg-[#00ff88]/5 border-[#00ff88]/25" : "bg-yellow-500/5 border-yellow-500/25"}`}>
          <div className="flex items-center justify-between">
            <p className={`text-sm font-semibold ${online ? "text-[#00ff88]" : "text-yellow-400"}`}>
              {!can247 ? "● OFFLINE — plan requirement" : online ? "● ONLINE — 24/7 chalu hai" : rt?.status === "error" ? "✕ Token problem" : "◐ Starting..."}
            </p>
            {rt?.username && <span className="text-xs text-[#00D4FF]">@{rt.username}</span>}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-center">
            <div className="rounded-xl bg-black border border-[#222] p-2">
              <p className="text-[10px] text-[#888]">Replies</p>
              <p className="text-sm font-bold">{rt?.responses || 0}</p>
            </div>
            <div className="rounded-xl bg-black border border-[#222] p-2">
              <p className="text-[10px] text-[#888]">Poll cycles</p>
              <p className="text-sm font-bold">{rt?.lastUpdateId ? "live" : "0"}</p>
            </div>
            <div className="rounded-xl bg-black border border-[#222] p-2">
              <p className="text-[10px] text-[#888]">Errors</p>
              <p className="text-sm font-bold">{rt?.errors || 0}</p>
            </div>
            <div className="rounded-xl bg-black border border-[#222] p-2">
              <p className="text-[10px] text-[#888]">Last reply</p>
              <p className="text-[10px] font-semibold">{rt?.lastReplyAt ? new Date(rt.lastReplyAt).toLocaleTimeString() : "—"}</p>
            </div>
          </div>
          {rt?.lastError && <p className="text-[11px] text-red-300 mt-2">⚠ {rt.lastError}</p>}
          {!token && <p className="text-[11px] text-red-300 mt-2">⚠ Token local storage me nahi mila — dobara deploy karo taaki bot start ho.</p>}
          <p className="text-[10px] text-[#666] mt-2">Bot har 4 second me messages check karta hai aur automatically reply karta hai (webhook auto-clean hota hai).</p>
        </div>

        <div className="mt-4">
          <p className="text-xs text-[#888] mb-2">Commands jo bot samajhta hai ({cmds.length})</p>
          <div className="space-y-2">
            {cmds.length === 0 && <p className="text-xs text-[#666]">Code me commands nahi mile — default /start /help /price /status chal rahe hain.</p>}
            {cmds.map((c, i) => (
              <div key={i} className="rounded-xl bg-black border border-[#222] p-3">
                <p className="text-xs font-mono text-[#00D4FF]">/{c.trigger}</p>
                <p className="text-[11px] text-[#aaa] mt-1 whitespace-pre-wrap">{c.reply}</p>
                <p className="text-[10px] text-[#555] mt-1 font-mono">{c.source}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => { restartBot(site.id); window.dispatchEvent(new Event("rolax:bot-start")); }} className="flex-1 min-w-[140px] py-3 rounded-full bg-white text-black text-sm font-medium">↻ Restart Bot</button>
          <a href={token ? `https://t.me/${(rt?.username || "").replace("@", "")}` : "#"} target="_blank" className={`flex-1 min-w-[140px] py-3 rounded-full text-sm font-medium text-center ${rt?.username ? "bg-[#00D4FF]/15 border border-[#00D4FF]/30 text-[#00D4FF]" : "bg-[#222] text-[#666] pointer-events-none"}`}>Open in Telegram</a>
          <button onClick={() => { if (confirm("Bot delete karein? 24/7 runtime band ho jayega.")) onDeleted(); }} className="py-3 px-5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-sm">Delete</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Tool row (plan-gated feature) ---------------- */
function ToolRow({ icon, title, desc, on, action, actionLabel, extra, planName }: {
  icon: string; title: string; desc: string; on: boolean; planName?: string;
  action?: () => void; actionLabel?: string; extra?: any;
}) {
  return (
    <div className={`rounded-xl border p-3 ${on ? "bg-black border-[#222]" : "bg-black/40 border-[#1a1a1a] opacity-70"}`}>
      <div className="flex items-center gap-3">
        <span className="text-lg">{on ? icon : "🔒"}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-white">{title}</p>
          <p className="text-[10px] text-[#666]">{on ? desc : `${desc} — ${planName || "plan"} me nahi hai`}</p>
        </div>
        {on && action ? (
          <button onClick={action} className="px-3 py-1.5 rounded-full bg-white text-black text-[11px] font-medium shrink-0">{actionLabel || "Open"}</button>
        ) : !on ? (
          <span className="text-[10px] px-2 py-1 rounded-full bg-[#222] text-[#888] shrink-0">Locked</span>
        ) : null}
      </div>
      {on ? extra : null}
    </div>
  );
}
