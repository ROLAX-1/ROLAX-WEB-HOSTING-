"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, clearAuth } from "@/lib/auth";
import { useStore, ADMIN_EMAIL, DURATION_PRESETS, durationInDays, durationLabel, planTotal, type DurationUnit } from "@/lib/store";
import { toast } from "@/components/ui/Toaster";
import Link from "next/link";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { analyzeSite, autoFixSite, needsManualAction, MAX_ERRORS } from "@/lib/hosting";
import { getGoogleClientId, setGoogleClientId } from "@/lib/google";
import { planEntitlements } from "@/lib/entitlements";
import { DEFAULT_FEATURES } from "@/lib/store";
import { getBotToken } from "@/lib/bottoken";
import { analyzeProject } from "@/lib/aianalyze";
import OffersPanel from "@/components/admin/OffersPanel";
import ScriptStorePanel from "@/components/admin/ScriptStorePanel";
import StatsPanel from "@/components/admin/StatsPanel";

export default function AdminPage() {
  const router = useRouter();
  const { hydrate, hydrated, features, setFeatures, plans, setPlans, stacks, setStacks, wallets, setWallets, settings, setSettings, websites, setWebsites, payments, setPayments, tickets, setTickets, users, setUsers } = useStore();
  const [auth, setAuth] = useState<any>(null);
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [gClientId, setGClientId] = useState("");
  const [openCheckSite, setOpenCheckSite] = useState<string | null>(null);
  const [filesSite, setFilesSite] = useState<any>(null);
  const [featUser, setFeatUser] = useState<any>(null);
  const [viewFile, setViewFile] = useState<{ name: string; content: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string>("");

  useEffect(() => { hydrate(); }, [hydrate]);
  useEffect(() => { setGClientId(getGoogleClientId()); }, []);
  useEffect(() => {
    const a = getAuth();
    if (!a || a.email !== ADMIN_EMAIL) { router.push("/login"); return; }
    setAuth(a);
  }, [router]);

  if (!hydrated || !auth) return <div className="min-h-screen bg-black flex items-center justify-center text-[#888]">Loading admin...</div>;

  const saveEverything = () => {
    // sab kuch localStorage me forcibly likho (agar store miss hua ho to bhi)
    try {
      localStorage.setItem("rolax_settings", JSON.stringify(settings));
      localStorage.setItem("rolax_plans", JSON.stringify(plans));
      localStorage.setItem("rolax_features", JSON.stringify(features));
      localStorage.setItem("rolax_stacks", JSON.stringify(stacks));
      localStorage.setItem("rolax_wallets", JSON.stringify(wallets));
      localStorage.setItem("rolax_users", JSON.stringify(users));
      window.dispatchEvent(new CustomEvent("rolax:sync", { detail: { key: "all" } }));
      setSavedAt(new Date().toLocaleTimeString());
      setDirty(false);
      toast("✅ Sab settings save ho gayi — landing page pe turant live hai", "success");
    } catch {
      toast("Save fail — dobara try karo", "error");
    }
  };

  const revenue = payments.filter(p => p.status === "approved").reduce((sum, p) => sum + p.amount, 0);

  const defaultPlansReset = () => ([
    { id: "plan_free", name: "Starter", price: 0, ram: "512 MB", cpu: "0.5 vCPU", storage: "2 GB", bandwidth: "10 GB", features: ["1 Website", "512 MB RAM", "Community Support", "Free SSL"], durationValue: 1, durationUnit: "months" },
    { id: "plan_pro", name: "Pro Hosting", price: 4.99, ram: "2 GB", cpu: "2 vCPU", storage: "20 GB", bandwidth: "100 GB", features: ["10 Websites", "2 GB RAM", "Priority Support", "Free SSL", "Daily Backups", "Custom Domain"], popular: true, durationValue: 1, durationUnit: "months" },
    { id: "plan_enterprise", name: "Enterprise", price: 14.99, ram: "8 GB", cpu: "4 vCPU", storage: "100 GB", bandwidth: "Unlimited", features: ["Unlimited Websites", "8 GB RAM", "24/7 Support", "Free SSL", "Hourly Backups", "DDoS Protection", "Dedicated IP"], durationValue: 1, durationUnit: "months" },
  ] as any[]);

  // ---- Hosting error center ----
  const allErrors = websites.flatMap(w => analyzeSite(w).map(e => ({ site: w, error: e })));
  const brokenSites = websites.filter(w => w.status === "Error" || (w.errorCount || 0) > 0);
  const criticalSites = websites.filter(w => needsManualAction(w));

  const fixOneSite = (site: any) => {
    const fixed = autoFixSite(site);
    setWebsites(websites.map(x => (x.id === site.id ? fixed : x)));
    if (fixed.status === "Running") {
      toast(`Auto-fix successful: ${site.name} ab live hai ✅`, "success");
    } else {
      toast(`${site.name}: kuch errors manual fix chahiye (BOT_TOKEN / syntax)`, "error");
    }
  };

  const fixAllSites = () => {
    let fixedCount = 0;
    let still = 0;
    const next = websites.map(w => {
      if (w.status === "Error" || (w.errorCount || 0) > 0) {
        const fixed = autoFixSite(w);
        if (fixed.status === "Running") fixedCount++; else still++;
        return fixed;
      }
      return w;
    });
    setWebsites(next);
    toast(`Auto-fix complete: ${fixedCount} fixed, ${still} need manual help`, still ? "error" : "success");
  };
  const pendingCount = payments.filter(p => p.status === "pending").length;

  const chartData = [
    { name: "Mon", revenue: 120 },
    { name: "Tue", revenue: 200 },
    { name: "Wed", revenue: 150 },
    { name: "Thu", revenue: 300 },
    { name: "Fri", revenue: 250 },
    { name: "Sat", revenue: 400 },
    { name: "Sun", revenue: revenue || 320 },
  ];

  return (
    <div className="min-h-screen bg-black text-white flex">
      {/* Sidebar */}
      <aside className="w-[260px] hidden md:flex flex-col border-r border-[#222] bg-[#050505] sticky top-0 h-screen overflow-auto">
        <div className="p-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6C5CE7] to-[#00D4FF] flex items-center justify-center font-bold text-sm">R</div>
            <span className="font-grotesk font-bold">{settings.logoText} ADMIN</span>
          </div>
          <p className="text-xs text-[#666] mt-1">Super Admin Panel</p>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {[
            { id: "overview", label: "Overview", icon: "📊" },
            { id: "customizer", label: "Site Customizer", icon: "🎨" },
            { id: "offers", label: "Offers & Festivals", icon: "🎉" },
            { id: "store", label: "Script Store", icon: "🛒" },
            { id: "stats", label: "Stats & Accounts", icon: "📊" },
            { id: "features", label: "Feature Manager", icon: "🧩" },
            { id: "plans", label: "Plan Manager", icon: "💳" },
            { id: "stacks", label: "Stack Manager", icon: "⚙️" },
            { id: "wallets", label: "Crypto Wallets", icon: "₿" },
            { id: "payments", label: "Payments", icon: "💰", badge: pendingCount },
            { id: "hosting", label: "Hosting Errors", icon: "🚨", badge: brokenSites.length },
            { id: "users", label: "User Manager", icon: "👥" },
            { id: "websites", label: "Website Manager", icon: "🌐" },
            { id: "tickets", label: "Ticket Manager", icon: "🎫" },
          ].map(item => (
            <button key={item.id} onClick={() => setTab(item.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${tab === item.id ? "bg-white text-black font-medium" : "text-[#888] hover:bg-[#111] hover:text-white"}`}>
              <span>{item.icon}</span> {item.label}
              {item.badge ? <span className="ml-auto bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full">{item.badge}</span> : null}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-[#222]">
          <p className="text-xs text-[#888]">{auth.email}</p>
          <div className="flex gap-2 mt-2">
            <Link href="/" className="flex-1 text-center py-2 rounded-full bg-[#111] border border-[#222] text-xs">View Site</Link>
            <button onClick={() => { clearAuth(); router.push("/login"); }} className="flex-1 py-2 rounded-full bg-red-500/10 border border-red-500/20 text-xs text-red-400">Logout</button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0">
        {/* Topbar Mobile */}
        <div style={{ top: "var(--banner-h, 0px)" }} className="md:hidden sticky z-40 bg-black border-b border-[#222] p-3 flex items-center justify-between">
          <span className="font-grotesk font-bold">{settings.logoText} ADMIN</span>
          <button onClick={() => { clearAuth(); router.push("/"); }} className="px-3 py-1 rounded-full bg-[#111] border border-[#222] text-xs">Logout</button>
        </div>
        <div className="md:hidden flex gap-2 p-3 overflow-x-auto border-b border-[#222] bg-black sticky top-[49px] z-30">
          {["overview", "customizer", "offers", "store", "stats", "features", "plans", "stacks", "wallets", "payments", "hosting", "users", "websites", "tickets"].map(id => (
            <button key={id} onClick={() => setTab(id)} className={`px-4 py-2 rounded-full text-xs whitespace-nowrap ${tab === id ? "bg-white text-black" : "bg-[#111] border border-[#222] text-[#888]"}`}>{id}</button>
          ))}
        </div>

        {/* SAVE BAR — har setting ke liye, logout ka koi risk nahi */}
        <div style={{ top: "var(--banner-h, 0px)" }} className="sticky z-30 bg-[#0a0a0f]/95 backdrop-blur border-b border-[#222] px-4 md:px-8 py-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">Admin — {tab}</p>
            <p className="text-[10px] text-[#666]">{savedAt ? `Last saved ${savedAt}` : "Changes auto-save hote hain, phir bhi Save dabao"}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => { setDirty(true); toast("Unsaved changes mark kiye", "info"); }} className="hidden md:inline px-3 py-1.5 rounded-full bg-[#111] border border-[#222] text-[11px]">Mark unsaved</button>
            <button onClick={saveEverything} className={`px-4 py-2 rounded-full text-xs font-semibold ${dirty ? "bg-[#00ff88] text-black" : "bg-white text-black"}`}>💾 Save all settings</button>
            <button onClick={() => router.push("/")} className="hidden md:inline px-3 py-2 rounded-full bg-[#111] border border-[#222] text-xs">View site</button>
          </div>
        </div>

        <div className="p-4 md:p-8">
          {tab === "overview" && (
            <div className="space-y-6">
              <h1 className="font-grotesk text-2xl font-bold">Dashboard Overview</h1>
              <div className="grid md:grid-cols-4 gap-4">
                <div className="rounded-2xl bg-[#111] border border-[#222] p-5">
                  <p className="text-xs text-[#888]">Total Users</p>
                  <p className="text-2xl font-bold mt-1">{users.length}</p>
                  <p className="text-xs text-[#00ff88] mt-1">↗ +12% this week</p>
                </div>
                <div className="rounded-2xl bg-[#111] border border-[#222] p-5">
                  <p className="text-xs text-[#888]">Total Sites</p>
                  <p className="text-2xl font-bold mt-1">{websites.length}</p>
                  <p className="text-xs text-[#00ff88] mt-1">↗ +8% this week</p>
                </div>
                <div className="rounded-2xl bg-[#111] border border-[#222] p-5">
                  <p className="text-xs text-[#888]">Pending Payments</p>
                  <p className="text-2xl font-bold mt-1">{pendingCount}</p>
                  <p className="text-xs text-yellow-400 mt-1">Needs approval</p>
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-[#6C5CE7] to-[#00D4FF] p-5 text-white">
                  <p className="text-xs text-white/80">Total Revenue</p>
                  <p className="text-2xl font-bold mt-1">${revenue.toFixed(2)}</p>
                  <p className="text-xs text-white/60 mt-1">All time</p>
                </div>
              </div>

              <div className="rounded-2xl bg-[#111] border border-[#222] p-6">
                <h3 className="font-semibold">Revenue Chart</h3>
                <div className="mt-4 h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <XAxis dataKey="name" stroke="#444" fontSize={12} />
                      <YAxis stroke="#444" fontSize={12} />
                      <Tooltip contentStyle={{ background: "#111", border: "1px solid #222", borderRadius: "12px" }} />
                      <Area type="monotone" dataKey="revenue" stroke="#6C5CE7" fill="url(#grad)" strokeWidth={2} />
                      <defs><linearGradient id="grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6C5CE7" stopOpacity={0.4} /><stop offset="100%" stopColor="#6C5CE7" stopOpacity={0} /></linearGradient></defs>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-2xl bg-[#111] border border-[#222] p-5">
                  <h4 className="font-semibold text-sm">Recent Users</h4>
                  <div className="mt-3 space-y-2">
                    {users.slice(0, 4).map(u => (
                      <div key={u.id} className="flex items-center justify-between p-2 rounded-xl bg-black border border-[#222]">
                        <span className="text-sm">{u.name}</span>
                        <span className="text-xs text-[#888]">{u.email}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl bg-[#111] border border-[#222] p-5">
                  <h4 className="font-semibold text-sm">Recent Payments</h4>
                  <div className="mt-3 space-y-2">
                    {payments.slice(0, 4).map(p => (
                      <div key={p.id} className="flex items-center justify-between p-2 rounded-xl bg-black border border-[#222]">
                        <span className="text-sm">{p.userEmail}</span>
                        <span className={`text-xs px-2 py-1 rounded-full ${p.status === "pending" ? "bg-yellow-500/10 text-yellow-400" : p.status === "approved" ? "bg-[#00ff88]/10 text-[#00ff88]" : "bg-red-500/10 text-red-400"}`}>{p.status}</span>
                      </div>
                    ))}
                    {payments.length === 0 && <p className="text-xs text-[#888]">No payments</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "hosting" && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h2 className="font-grotesk text-xl font-bold">Hosting Errors Center 🚨</h2>
                  <p className="text-xs text-[#888] mt-1">Yahan har hosted file ka error dikhega. Auto-fix ek click me, zyada error ho to delete alert.</p>
                </div>
                <button onClick={fixAllSites} className="px-5 py-2 rounded-full bg-gradient-to-r from-[#6C5CE7] to-[#00D4FF] text-white text-sm font-medium">⚡ Auto-Fix All</button>
              </div>

              {criticalSites.length > 0 && (
                <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-4">
                  <p className="text-sm font-semibold text-red-300">🚨 {criticalSites.length} file(s) me {MAX_ERRORS}+ errors hain</p>
                  <p className="text-xs text-red-200/70 mt-1">Ye files auto-fix se theek nahi hongi — inko delete karke dobara upload karo.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {criticalSites.map(w => (
                      <button key={w.id} onClick={() => {
                        if (confirm(`${w.name} delete karein? (${w.errorCount} errors)`)) {
                          setWebsites(websites.filter(x => x.id !== w.id));
                          toast("Deleted: " + w.name, "info");
                        }
                      }} className="px-3 py-1.5 rounded-full bg-red-500 text-white text-xs">Delete {w.name}</button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid md:grid-cols-3 gap-3">
                <div className="rounded-xl bg-[#00ff88]/5 border border-[#00ff88]/20 p-4">
                  <p className="text-xs text-[#888]">Healthy</p>
                  <p className="text-2xl font-bold text-[#00ff88]">{websites.filter(w => w.status === "Running" && !(w.errorCount || 0)).length}</p>
                </div>
                <div className="rounded-xl bg-yellow-500/5 border border-yellow-500/20 p-4">
                  <p className="text-xs text-[#888]">Errors (auto-fix possible)</p>
                  <p className="text-2xl font-bold text-yellow-400">{brokenSites.length}</p>
                </div>
                <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-4">
                  <p className="text-xs text-[#888]">Critical (delete needed)</p>
                  <p className="text-2xl font-bold text-red-400">{criticalSites.length}</p>
                </div>
              </div>

              {brokenSites.length === 0 ? (
                <div className="rounded-2xl bg-[#111] border border-[#222] p-10 text-center">
                  <p className="text-3xl">✅</p>
                  <p className="text-sm text-[#888] mt-2">Sab hosting healthy hai — koi error nahi mila.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {brokenSites.map(w => {
                    const errs = analyzeSite(w);
                    const critical = needsManualAction(w);
                    return (
                      <div key={w.id} className={`rounded-2xl bg-[#111] border p-5 ${critical ? "border-red-500/40" : "border-yellow-500/30"}`}>
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm">{w.name} <span className="text-xs text-[#666]">({w.stack})</span></p>
                            <p className="text-xs text-[#00D4FF]">{w.url}</p>
                            <p className="text-[11px] text-[#666] mt-1">{w.botType || w.fileType || "—"} • User: {users.find(u => u.id === w.userId)?.email || w.userId}</p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button onClick={() => fixOneSite(w)} className="px-4 py-2 rounded-full bg-white text-black text-xs font-medium">{critical ? "Try Fix" : "Auto-Fix"}</button>
                            <button onClick={() => {
                              if (confirm("Delete this hosted file?")) {
                                setWebsites(websites.filter(x => x.id !== w.id));
                                toast("Deleted: " + w.name, "info");
                              }
                            }} className="px-4 py-2 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-xs">Delete</button>
                          </div>
                        </div>
                        <div className="mt-3 space-y-2">
                          {Array.isArray(w.checks) && w.checks.filter(c => c.level !== "ok").length > 0 ? (
                            w.checks.filter(c => c.level !== "ok").map((c, i) => (
                              <div key={"real" + i} className="rounded-xl bg-black border border-[#222] p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-medium text-red-300">{c.level === "error" ? "❌" : "⚠️"} {c.title}</p>
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${c.fixable ? "bg-yellow-500/10 text-yellow-400" : "bg-red-500/10 text-red-400"}`}>{c.fixable ? "auto-fix possible" : "manual fix"}</span>
                                </div>
                                <p className="text-[11px] text-[#888] mt-1">{c.detail}</p>
                                <p className="text-[10px] text-[#555] mt-1 font-mono">{c.code}</p>
                              </div>
                            ))
                          ) : (errs.length ? errs : [{ code: "UNKNOWN", title: w.lastError || "Unknown error", detail: "Logs check karo", fix: "Re-deploy karke dekho", canAutoFix: false }]).map((e, i) => (
                            <div key={i} className="rounded-xl bg-black border border-[#222] p-3">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-medium text-red-300">❌ {e.title}</p>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full ${e.canAutoFix ? "bg-yellow-500/10 text-yellow-400" : "bg-red-500/10 text-red-400"}`}>{e.canAutoFix ? "auto-fix possible" : "manual fix"}</span>
                              </div>
                              <p className="text-[11px] text-[#888] mt-1">{e.detail}</p>
                              <p className="text-[11px] text-[#00ff88] mt-1">💡 {e.fix}</p>
                            </div>
                          ))}
                        </div>
                        {w.lastFixAt && <p className="text-[10px] text-[#666] mt-2">Last auto-fix attempt: {new Date(w.lastFixAt).toLocaleString()}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === "offers" && <OffersPanel />}
          {tab === "store" && <ScriptStorePanel />}
          {tab === "stats" && <StatsPanel />}

          {tab === "customizer" && (
            <div className="space-y-6 max-w-3xl">
              <h2 className="font-grotesk text-xl font-bold">Site Customizer</h2>
              <p className="text-sm text-[#888]">Edit all landing page text. Changes show instantly.</p>

              {[
                { key: "logoText", label: "Logo Text" },
                { key: "heroBadge", label: "Hero Badge" },
                { key: "heroTitle", label: "Hero Title" },
                { key: "heroSubtitle", label: "Hero Subtitle" },
                { key: "ctaText", label: "CTA Button Text" },
                { key: "whyUsTitle", label: "Why Us Title" },
                { key: "whyUsDesc", label: "Why Us Description" },
                { key: "footerTelegram", label: "Telegram Handle" },
                { key: "footerText", label: "Footer Text" },
              ].map(field => (
                <div key={field.key} className="rounded-2xl bg-[#111] border border-[#222] p-4">
                  <label className="text-xs text-[#888]">{field.label}</label>
                  <input value={(settings as any)[field.key]} onChange={e => setSettings({ ...settings, [field.key]: e.target.value })} className="mt-1 w-full px-4 py-3 rounded-xl bg-black border border-[#222] text-sm" />
                </div>
              ))}

              {/* ===== BRAND: logo image + favicon ek jagah se ===== */}
              <div className="rounded-2xl bg-[#111] border border-[#222] p-4 space-y-3">
                <h4 className="text-sm font-semibold">🖼️ Logo & Brand (ek jagah se poori site)</h4>
                <div className="flex items-center gap-3">
                  <img src={(settings as any).logoUrl || "/images/rolax-hero-new.jpg"} alt="logo" className="w-14 h-14 rounded-full object-cover border border-[#222] bg-black" />
                  <div className="flex-1">
                    <label className="text-[11px] text-[#888]">Logo upload (PNG/JPG/SVG — 1MB tak)</label>
                    <input type="file" accept="image/*" onChange={async e => {
                      const f = e.target.files?.[0]; if (!f) return;
                      if (f.size > 1024 * 1024) { toast("1MB se chhoti image chuno", "error"); return; }
                      const r = new FileReader();
                      r.onload = () => { setSettings({ ...settings, logoUrl: String(r.result) }); toast("Logo set ho gaya — Save dabao", "success"); };
                      r.readAsDataURL(f);
                    }} className="mt-1 w-full text-[11px] file:mr-2 file:px-3 file:py-1 file:rounded-full file:bg-white file:text-black file:border-0 text-[#888]" />
                  </div>
                </div>
                <input value={(settings as any).logoUrl || ""} onChange={e => setSettings({ ...settings, logoUrl: e.target.value })} placeholder="ya image URL paste karo" className="w-full px-4 py-2 rounded-xl bg-black border border-[#222] text-xs font-mono" />
                <div>
                  <label className="text-[11px] text-[#888]">Hero image (landing page badi image)</label>
                  <div className="flex gap-2">
                    <input value={(settings as any).heroImageUrl || ""} onChange={e => setSettings({ ...settings, heroImageUrl: e.target.value })} placeholder="/images/rolax-hero-new.jpg" className="flex-1 px-4 py-2 rounded-xl bg-black border border-[#222] text-xs font-mono" />
                    <input type="file" accept="image/*" onChange={async e => {
                      const f = e.target.files?.[0]; if (!f) return;
                      const r = new FileReader();
                      r.onload = () => { setSettings({ ...settings, heroImageUrl: String(r.result) }); toast("Hero image set — Save dabao", "success"); };
                      r.readAsDataURL(f);
                    }} className="w-32 text-[10px] file:px-2 file:py-1 file:rounded-full file:bg-white file:text-black file:border-0 text-[#888]" />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-[#888]">Accent color</label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={(settings as any).accentColor || "#6C5CE7"} onChange={e => setSettings({ ...settings, accentColor: e.target.value })} className="w-12 h-9 rounded-lg bg-black border border-[#222]" />
                    <input value={(settings as any).accentColor || "#6C5CE7"} onChange={e => setSettings({ ...settings, accentColor: e.target.value })} className="w-32 px-3 py-2 rounded-lg bg-black border border-[#222] text-xs font-mono" />
                    <button onClick={() => { setSettings({ ...settings, logoUrl: "/images/rolax-hero-new.jpg", heroImageUrl: "/images/rolax-hero-new.jpg", accentColor: "#6C5CE7" }); toast("Default brand wapas", "info"); }} className="px-3 py-2 rounded-full bg-[#111] border border-[#222] text-[11px]">Reset brand</button>
                  </div>
                </div>
                <p className="text-[10px] text-[#666]">Logo + naam puri site pe badal jayega: navbar, footer, hero, dashboard. Sab jagah automatic.</p>
              </div>

              <div className="rounded-2xl bg-[#111] border border-[#222] p-4">
                <label className="text-xs text-[#888]">Google Sign-In Client ID (optional)</label>
                <input value={gClientId} onChange={e => setGClientId(e.target.value)} placeholder="xxxxx.apps.googleusercontent.com" className="mt-1 w-full px-4 py-3 rounded-xl bg-black border border-[#222] text-sm font-mono text-xs" />
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={() => { setGoogleClientId(gClientId); toast("Google Client ID saved", "success"); }} className="px-4 py-2 rounded-full bg-white text-black text-xs">Save</button>
                  <span className="text-[11px] text-[#666]">Khali chhodne par Google account chooser fallback chalega</span>
                </div>
                <p className="text-[11px] text-[#666] mt-2">Google Cloud Console → APIs &amp; Services → Credentials → OAuth client (Web) → Authorized origin: {typeof window !== "undefined" ? window.location.origin : "https://your-domain"}</p>
              </div>

              <div className="rounded-2xl bg-[#111] border border-[#222] p-4">
                <label className="text-xs text-[#888]">USD → INR Rate (pricing me ₹ dikhane ke liye)</label>
                <input type="number" value={settings.usdToInr || 88} onChange={e => setSettings({ ...settings, usdToInr: parseFloat(e.target.value) || 88 })} className="mt-1 w-full px-4 py-3 rounded-xl bg-black border border-[#222] text-sm" />
                <p className="text-[11px] text-[#666] mt-1">Example: plan $4.99 → ₹{Math.round(4.99 * (settings.usdToInr || 88))}</p>
              </div>

              <div className="rounded-2xl bg-[#111] border border-[#222] p-4">
                <label className="text-xs text-[#888]">Why Us Points (one per line)</label>
                <textarea value={settings.whyUsPoints.join("\n")} onChange={e => setSettings({ ...settings, whyUsPoints: e.target.value.split("\n") })} rows={4} className="mt-1 w-full px-4 py-3 rounded-xl bg-black border border-[#222] text-sm" />
              </div>

              <div className="rounded-2xl bg-[#111] border border-[#222] p-4">
                <h4 className="text-sm font-semibold">Features</h4>
                <div className="mt-3 space-y-3">
                  {settings.features.map((f, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-black border border-[#222] space-y-2">
                      <div className="flex gap-2">
                        <input value={f.icon} onChange={e => { const arr = [...settings.features]; arr[idx].icon = e.target.value; setSettings({ ...settings, features: arr }); }} className="w-16 px-2 py-2 rounded-lg bg-[#111] border border-[#222] text-sm" placeholder="Icon" />
                        <input value={f.title} onChange={e => { const arr = [...settings.features]; arr[idx].title = e.target.value; setSettings({ ...settings, features: arr }); }} className="flex-1 px-3 py-2 rounded-lg bg-[#111] border border-[#222] text-sm" placeholder="Title" />
                        <button onClick={() => { const arr = settings.features.filter((_, i) => i !== idx); setSettings({ ...settings, features: arr }); toast("Removed", "info"); }} className="px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-xs">Delete</button>
                      </div>
                      <input value={f.desc} onChange={e => { const arr = [...settings.features]; arr[idx].desc = e.target.value; setSettings({ ...settings, features: arr }); }} className="w-full px-3 py-2 rounded-lg bg-[#111] border border-[#222] text-sm" placeholder="Description" />
                    </div>
                  ))}
                  <button onClick={() => setSettings({ ...settings, features: [...settings.features, { title: "New Feature", desc: "Description", icon: "✨" }] })} className="px-4 py-2 rounded-full bg-white text-black text-sm">+ Add Feature</button>
                </div>
              </div>

              <div className="rounded-2xl bg-[#111] border border-[#222] p-4">
                <h4 className="text-sm font-semibold">FAQ</h4>
                <div className="mt-3 space-y-3">
                  {settings.faq.map((item, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-black border border-[#222] space-y-2">
                      <input value={item.q} onChange={e => { const arr = [...settings.faq]; arr[idx].q = e.target.value; setSettings({ ...settings, faq: arr }); }} className="w-full px-3 py-2 rounded-lg bg-[#111] border border-[#222] text-sm" placeholder="Question" />
                      <textarea value={item.a} onChange={e => { const arr = [...settings.faq]; arr[idx].a = e.target.value; setSettings({ ...settings, faq: arr }); }} rows={2} className="w-full px-3 py-2 rounded-lg bg-[#111] border border-[#222] text-sm" placeholder="Answer" />
                      <button onClick={() => { const arr = settings.faq.filter((_, i) => i !== idx); setSettings({ ...settings, faq: arr }); }} className="px-3 py-1 rounded-full bg-red-500/10 text-red-400 text-xs">Delete</button>
                    </div>
                  ))}
                  <button onClick={() => setSettings({ ...settings, faq: [...settings.faq, { q: "New question?", a: "Answer here." }] })} className="px-4 py-2 rounded-full bg-white text-black text-sm">+ Add FAQ</button>
                </div>
              </div>
            </div>
          )}

          {tab === "features" && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h2 className="font-grotesk text-xl font-bold">Feature Manager</h2>
                  <p className="text-xs text-[#888] mt-1">Naya feature banao — phir har plan aur har user ke liye ON/OFF karo.</p>
                </div>
                <button onClick={() => {
                  const id = "feat_" + Date.now();
                  setFeatures([...(features || DEFAULT_FEATURES), { id, label: "New Feature", desc: "Description likho", icon: "✨" }]);
                  toast("Feature added — ab plan me ON kar sakte ho", "success");
                }} className="px-4 py-2 rounded-full bg-white text-black text-sm font-medium">+ Add Feature</button>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                {(features?.length ? features : DEFAULT_FEATURES).map((f, i) => {
                  const onPlans = plans.filter(p => planEntitlements(p)[f.id]).map(p => p.name);
                  return (
                    <div key={f.id} className="rounded-2xl bg-[#111] border border-[#222] p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <input value={f.icon} onChange={e => { const arr = [...(features || DEFAULT_FEATURES)]; arr[i] = { ...arr[i], icon: e.target.value }; setFeatures(arr); }} className="w-12 px-2 py-2 rounded-xl bg-black border border-[#222] text-sm text-center" />
                        <input value={f.label} onChange={e => { const arr = [...(features || DEFAULT_FEATURES)]; arr[i] = { ...arr[i], label: e.target.value }; setFeatures(arr); }} className="flex-1 px-3 py-2 rounded-xl bg-black border border-[#222] text-sm font-semibold" placeholder="Feature name" />
                        {!f.builtin && (
                          <button onClick={() => { setFeatures((features || DEFAULT_FEATURES).filter(x => x.id !== f.id)); toast("Feature deleted", "info"); }} className="px-3 py-2 rounded-xl bg-red-500/10 text-red-400 text-xs border border-red-500/20 shrink-0">Delete</button>
                        )}
                      </div>
                      <input value={f.desc} onChange={e => { const arr = [...(features || DEFAULT_FEATURES)]; arr[i] = { ...arr[i], desc: e.target.value }; setFeatures(arr); }} className="w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-xs" placeholder="Description" />
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-[#666] font-mono">id: {f.id}</span>
                        <span className={onPlans.length ? "text-[#00ff88]" : "text-[#666]"}>{onPlans.length ? "✓ " + onPlans.join(", ") : "kisi plan me nahi"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-2xl bg-[#111] border border-[#222] p-4">
                <p className="text-xs text-[#888]">💡 Feature add karne ke baad <strong>Plan Manager</strong> me jaake decide karo kaun se plan me milega, aur <strong>User Manager</strong> me kisi ek user ko special access de sakte ho.</p>
              </div>
            </div>
          )}

          {tab === "plans" && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h2 className="font-grotesk text-xl font-bold">Plan Manager</h2>
                  <p className="text-xs text-[#888] mt-1">Price, RAM, CPU — sab kuch apne hisaab se edit karo. Plan delete bhi kar sakte ho.</p>
                </div>
                <button onClick={() => {
                  const newPlan = { id: "plan_" + Date.now(), name: "New Plan", price: 9.99, ram: "4 GB", cpu: "2 vCPU", storage: "50 GB", bandwidth: "200 GB", features: ["Feature 1", "Feature 2"], durationValue: 1, durationUnit: "months" as DurationUnit };
                  
                  setPlans([...plans, newPlan]);
                  toast("Plan added", "success");
                }} className="px-4 py-2 rounded-full bg-white text-black text-sm font-medium">+ Add Plan</button>
              </div>

              {plans.length === 0 && (
                <div className="rounded-2xl bg-[#111] border border-dashed border-[#333] p-8 text-center">
                  <p className="text-sm text-[#888]">Koi plan nahi hai. + Add Plan se naya banao.</p>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                {plans.map((plan, idx) => (
                  <div key={plan.id} className="rounded-2xl bg-[#111] border border-[#222] p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <input value={plan.name} onChange={e => { const arr = [...plans]; arr[idx] = { ...arr[idx], name: e.target.value }; setPlans(arr); }} className="flex-1 px-3 py-2 rounded-xl bg-black border border-[#222] text-sm font-semibold" placeholder="Plan name" />
                      <button onClick={() => {
                        if (confirm(`Delete plan "${plan.name}"? Users ka data safe rahega.`)) {
                          setPlans(plans.filter(p => p.id !== plan.id));
                          toast("Plan deleted: " + plan.name, "info");
                        }
                      }} className="px-3 py-2 rounded-xl bg-red-500/10 text-red-400 text-xs border border-red-500/20 shrink-0">Delete</button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-[#888]">Price in $ (0 = Free)</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={String(plan.price)}
                          onChange={e => {
                            const raw = e.target.value;
                            const parsed = raw === "" ? 0 : parseFloat(raw);
                            const arr = [...plans];
                            arr[idx] = { ...arr[idx], price: isFinite(parsed) ? Math.max(0, parsed) : 0 };
                            setPlans(arr);
                          }}
                          className="w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm"
                          placeholder="4.99"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#888]">RAM</label>
                        <input value={plan.ram} onChange={e => { const arr = [...plans]; arr[idx] = { ...arr[idx], ram: e.target.value }; setPlans(arr); }} className="w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#888]">CPU</label>
                        <input value={plan.cpu} onChange={e => { const arr = [...plans]; arr[idx] = { ...arr[idx], cpu: e.target.value }; setPlans(arr); }} className="w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#888]">Storage</label>
                        <input value={plan.storage} onChange={e => { const arr = [...plans]; arr[idx] = { ...arr[idx], storage: e.target.value }; setPlans(arr); }} className="w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[10px] text-[#888]">Bandwidth</label>
                        <input value={plan.bandwidth} onChange={e => { const arr = [...plans]; arr[idx] = { ...arr[idx], bandwidth: e.target.value }; setPlans(arr); }} className="w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" />
                      </div>
                    </div>

                    {/* ---- Duration / Billing Period ---- */}
                    <div className="rounded-xl bg-black border border-[#6C5CE7]/30 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] text-[#a89bff] font-semibold">Duration (kitne time ke liye)</label>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#6C5CE7]/20 text-[#a89bff]">{durationLabel(plan.durationValue, plan.durationUnit)}</span>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {DURATION_PRESETS.map(preset => {
                          const active = (plan.durationValue || 1) === preset.value && (plan.durationUnit || "months") === preset.unit;
                          return (
                            <button
                              key={preset.label}
                              onClick={() => { const arr = [...plans]; arr[idx] = { ...arr[idx], durationValue: preset.value, durationUnit: preset.unit }; setPlans(arr); toast("Duration set: " + preset.label, "success"); }}
                              className={`px-2.5 py-1 rounded-full text-[11px] border transition ${active ? "bg-[#6C5CE7] text-white border-[#6C5CE7]" : "bg-[#111] text-[#888] border-[#222] hover:text-white"}`}
                            >{preset.label}</button>
                          );
                        })}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-[#888]">Custom value</label>
                          <input
                            type="text" inputMode="numeric"
                            value={String(plan.durationValue ?? 1)}
                            onChange={e => { const raw = e.target.value; const v = raw === "" ? 1 : parseInt(raw.replace(/[^0-9]/g, ""), 10); const arr = [...plans]; arr[idx] = { ...arr[idx], durationValue: isFinite(v) && v > 0 ? v : 1 }; setPlans(arr); }}
                            className="w-full px-3 py-2 rounded-xl bg-[#111] border border-[#222] text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-[#888]">Unit</label>
                          <select
                            value={plan.durationUnit || "months"}
                            onChange={e => { const arr = [...plans]; arr[idx] = { ...arr[idx], durationUnit: e.target.value as DurationUnit }; setPlans(arr); }}
                            className="w-full px-3 py-2 rounded-xl bg-[#111] border border-[#222] text-sm"
                          >
                            <option value="days">Days</option>
                            <option value="months">Months</option>
                            <option value="years">Years</option>
                          </select>
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-[11px] text-[#888]">
                        <input type="checkbox" checked={!!plan.pricePerMonth} onChange={e => { const arr = [...plans]; arr[idx] = { ...arr[idx], pricePerMonth: e.target.checked }; setPlans(arr); }} />
                        Price per month hai (total = price × duration)
                      </label>

                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-[#222]">
                        <span className="text-[#888]">Total charge ({durationLabel(plan.durationValue, plan.durationUnit)}):</span>
                        <span className="font-semibold text-white">${planTotal(plan).toFixed(2)}</span>
                      </div>
                      <p className="text-[10px] text-[#666]">Expiry approve hone par {durationInDays(plan.durationValue, plan.durationUnit)} din baad set hogi</p>
                    </div>

                    {/* ---- Feature access (free vs premium) ---- */}
                    <div className="rounded-xl bg-black border border-[#222] p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] text-[#888] font-semibold">Kaun se features is plan me milenge</label>
                        <div className="flex gap-1">
                          <button onClick={() => { const arr = [...plans]; arr[idx] = { ...arr[idx], entitlements: { deploy: true, custom_domain: false, ai_autofix: false, ai_review: false, bot_24x7: false, priority_support: false } }; setPlans(arr); toast("Free profile lagaya", "success"); }} className="px-2 py-0.5 rounded-full bg-[#222] text-[10px]">Free</button>
                          <button onClick={() => { const arr = [...plans]; arr[idx] = { ...arr[idx], entitlements: { deploy: true, custom_domain: true, ai_autofix: true, ai_review: true, bot_24x7: true, priority_support: true } }; setPlans(arr); toast("Premium profile lagaya", "success"); }} className="px-2 py-0.5 rounded-full bg-[#6C5CE7] text-white text-[10px]">Ultra Pro</button>
                        </div>
                      </div>
                      {(features?.length ? features : DEFAULT_FEATURES).map(f => {
                        const ent = planEntitlements(plan);
                        const on = !!ent[f.id];
                        return (
                          <label key={f.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-[#111] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={e => {
                                const arr = [...plans];
                                const cur = planEntitlements(arr[idx]);
                                arr[idx] = { ...arr[idx], entitlements: { ...cur, [f.id]: e.target.checked } };
                                setPlans(arr);
                              }}
                              className="mt-0.5"
                            />
                            <span className="flex-1">
                              <span className={`text-[11px] ${on ? "text-white" : "text-[#666]"}`}>{f.icon} {f.label}</span>
                              <span className="block text-[10px] text-[#555]">{f.desc}</span>
                            </span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${on ? "bg-[#00ff88]/15 text-[#00ff88]" : "bg-[#333] text-[#888]"}`}>{on ? "ON" : "OFF"}</span>
                          </label>
                        );
                      })}
                    </div>

                    <div>
                      <label className="text-[10px] text-[#888]">Features (one per line)</label>
                      <textarea value={plan.features.join("\n")} onChange={e => { const arr = [...plans]; arr[idx] = { ...arr[idx], features: e.target.value.split("\n") }; setPlans(arr); }} onBlur={e => { const arr = [...plans]; arr[idx] = { ...arr[idx], features: e.target.value.split("\n").map(f => f.trim()).filter(Boolean) }; setPlans(arr); }} rows={4} className="w-full mt-1 px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" />
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!plan.popular} onChange={e => { const arr = [...plans]; arr[idx] = { ...arr[idx], popular: e.target.checked }; setPlans(arr); }} /> Popular Badge</label>
                      <span className="text-[10px] text-[#666]">ID: {plan.id}</span>
                    </div>

                    <div className="flex gap-2">
                      <button onClick={() => { const arr = [...plans]; arr[idx] = { ...arr[idx], price: 0 }; setPlans(arr); toast("Marked as Free plan", "success"); }} className="flex-1 py-2 rounded-full bg-[#222] text-xs">Make Free ($0)</button>
                      <button onClick={() => { const copy = { ...plan, id: "plan_" + Date.now(), name: plan.name + " Copy" }; setPlans([...plans, copy]); toast("Plan duplicated", "success"); }} className="flex-1 py-2 rounded-full bg-[#222] text-xs">Duplicate</button>
                      <button onClick={() => { setPlans(defaultPlansReset()); toast("Plans reset to default", "info"); }} className="flex-1 py-2 rounded-full bg-red-500/10 text-red-400 text-xs border border-red-500/20">Reset All</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "stacks" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="font-grotesk text-xl font-bold">Stack Manager</h2>
                <button onClick={() => {
                  const s = { id: "s_" + Date.now(), name: "PHP", icon: "🐘", color: "#777BB4", description: "PHP 8.x" };
                  setStacks([...stacks, s]);
                  toast("Stack added", "success");
                }} className="px-4 py-2 rounded-full bg-white text-black text-sm font-medium">+ Add Stack</button>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                {stacks.map((stack, idx) => (
                  <div key={stack.id} className="rounded-2xl bg-[#111] border border-[#222] p-5 space-y-3">
                    <div className="flex gap-2">
                      <input value={stack.icon} onChange={e => { const arr = [...stacks]; arr[idx].icon = e.target.value; setStacks(arr); }} className="w-12 px-2 py-2 rounded-xl bg-black border border-[#222] text-sm text-center" />
                      <input value={stack.name} onChange={e => { const arr = [...stacks]; arr[idx].name = e.target.value; setStacks(arr); }} className="flex-1 px-3 py-2 rounded-xl bg-black border border-[#222] text-sm font-semibold" />
                    </div>
                    <input value={stack.description} onChange={e => { const arr = [...stacks]; arr[idx].description = e.target.value; setStacks(arr); }} className="w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" placeholder="Description" />
                    <input value={stack.color} onChange={e => { const arr = [...stacks]; arr[idx].color = e.target.value; setStacks(arr); }} className="w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-xs" placeholder="Color hex" />
                    <button onClick={() => { setStacks(stacks.filter(s => s.id !== stack.id)); toast("Deleted", "info"); }} className="w-full py-2 rounded-full bg-red-500/10 text-red-400 text-xs border border-red-500/20">Delete Stack</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "wallets" && (
            <div className="space-y-6 max-w-2xl">
              <div className="flex items-center justify-between">
                <h2 className="font-grotesk text-xl font-bold">Crypto Wallet Manager</h2>
                <button onClick={() => {
                  const w = { id: "w_" + Date.now(), name: "BTC", symbol: "BTC", address: "bc1q...", network: "Bitcoin" };
                  setWallets([...wallets, w]);
                  toast("Coin added", "success");
                }} className="px-4 py-2 rounded-full bg-white text-black text-sm font-medium">+ Add Coin</button>
              </div>

              {wallets.map((w, idx) => (
                <div key={w.id} className="rounded-2xl bg-[#111] border border-[#222] p-6 space-y-4">
                  <div className="flex gap-2">
                    <div className="flex-1"><label className="text-xs text-[#888]">Coin Name</label><input value={w.name} onChange={e => { const arr = [...wallets]; arr[idx].name = e.target.value; setWallets(arr); }} className="w-full mt-1 px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" /></div>
                    <div className="w-24"><label className="text-xs text-[#888]">Symbol</label><input value={w.symbol} onChange={e => { const arr = [...wallets]; arr[idx].symbol = e.target.value; setWallets(arr); }} className="w-full mt-1 px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" /></div>
                    <button onClick={() => { setWallets(wallets.filter(x => x.id !== w.id)); toast("Deleted", "info"); }} className="self-end px-3 py-2 rounded-xl bg-red-500/10 text-red-400 text-xs">Delete</button>
                  </div>
                  <div><label className="text-xs text-[#888]">Address</label><input value={w.address} onChange={e => { const arr = [...wallets]; arr[idx].address = e.target.value; setWallets(arr); }} className="w-full mt-1 px-3 py-2 rounded-xl bg-black border border-[#222] text-sm font-mono text-xs" /></div>
                  <div><label className="text-xs text-[#888]">Network</label><input value={w.network} onChange={e => { const arr = [...wallets]; arr[idx].network = e.target.value; setWallets(arr); }} className="w-full mt-1 px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" /></div>
                  <div className="p-3 rounded-xl bg-black border border-[#222] flex justify-between items-center">
                    <span className="text-xs text-[#888]">Address (Only BEP-20)</span>
                    <button onClick={() => { navigator.clipboard.writeText(w.address); toast("Copied: " + w.address, "success"); }} className="px-3 py-1 rounded-full bg-white text-black text-xs">Copy Address</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "payments" && (
            <div className="space-y-6">
              <h2 className="font-grotesk text-xl font-bold">Payment Requests</h2>
              {payments.length === 0 ? <p className="text-[#888] text-sm">No payments</p> : (
                <div className="space-y-3">
                  {payments.map(p => (
                    <div key={p.id} className="rounded-2xl bg-[#111] border border-[#222] p-5">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-sm">{p.userEmail} • {p.planName} • ${p.amount} • {p.coin}</p>
                          <p className="text-[11px] text-[#a89bff]">Duration: {p.durationLabel || (() => { const pl = plans.find(x => x.id === p.planId); return pl ? durationLabel(pl.durationValue, pl.durationUnit) : "—"; })()}</p>
                          <p className="text-xs text-[#888] font-mono mt-1 break-all">TXID: {p.txid}</p>
                          {p.screenshot && <a href={p.screenshot} target="_blank" className="text-xs text-[#00D4FF] hover:underline">View Screenshot</a>}
                          <p className="text-[10px] text-[#666] mt-1">{new Date(p.createdAt).toLocaleString()}</p>
                        </div>
                        <div className="flex gap-2">
                          <span className={`px-3 py-1 rounded-full text-xs ${p.status === "pending" ? "bg-yellow-500/10 text-yellow-400" : p.status === "approved" ? "bg-[#00ff88]/10 text-[#00ff88]" : "bg-red-500/10 text-red-400"}`}>{p.status}</span>
                          {p.status === "pending" && (
                            <>
                              <button onClick={() => {
                                const plan = plans.find(x => x.id === p.planId);
                                const days = durationInDays(plan?.durationValue, plan?.durationUnit) || (p.durationDays || 30);
                                setPayments(payments.map(x => x.id === p.id ? { ...x, status: "approved" as const } : x));
                                const expiry = new Date(Date.now() + days * 24 * 3600000).toISOString();
                                const exists = users.some(u => u.email === p.userEmail);
                                const updatedUsers = exists
                                  ? users.map(u => u.email === p.userEmail ? { ...u, planId: p.planId, planExpiry: expiry } : u)
                                  : [...users, { id: p.userId || "u_" + Date.now(), name: p.userEmail.split("@")[0], email: p.userEmail, planId: p.planId, planExpiry: expiry, status: "active" as const, createdAt: new Date().toISOString() }];
                                setUsers(updatedUsers);
                                toast(`Payment approved! Plan active for ${plan ? durationLabel(plan.durationValue, plan.durationUnit) : days + " days"}`, "success");
                              }} className="px-4 py-2 rounded-full bg-[#00ff88] text-black text-xs font-medium">Approve</button>
                              <button onClick={() => { setPayments(payments.map(x => x.id === p.id ? { ...x, status: "rejected" as const } : x)); toast("Rejected", "info"); }} className="px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs">Reject</button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "users" && (
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
                <h2 className="font-grotesk text-xl font-bold">User Manager</h2>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users..." className="px-4 py-2 rounded-full bg-[#111] border border-[#222] text-sm w-full md:w-64" />
              </div>

              <div className="rounded-2xl bg-[#111] border border-[#222] overflow-hidden overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead className="bg-black border-b border-[#222] text-[#888] text-xs">
                    <tr><th className="text-left px-4 py-3">Name</th><th className="text-left px-4 py-3">Email</th><th className="text-left px-4 py-3">Plan</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Actions</th></tr>
                  </thead>
                  <tbody>
                    {users.filter(u => u.email.includes(search) || u.name.toLowerCase().includes(search.toLowerCase())).map(u => (
                      <tr key={u.id} className="border-b border-[#222]/30">
                        <td className="px-4 py-3 font-medium">{u.name}</td>
                        <td className="px-4 py-3 text-[#888] text-xs">{u.email}</td>
                        <td className="px-4 py-3">
                          <select value={u.planId || ""} onChange={e => { const v = e.target.value; setUsers(users.map(x => x.id === u.id ? { ...x, planId: v || undefined } : x)); toast("Plan updated", "success"); }} className="px-2 py-1 rounded-full bg-black border border-[#222] text-xs">
                            <option value="">Free</option>
                            {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs ${u.status === "active" ? "bg-[#00ff88]/10 text-[#00ff88]" : "bg-red-500/10 text-red-400"}`}>{u.status}</span></td>
                        <td className="px-4 py-3 flex gap-1 flex-wrap">
                          <button onClick={() => setFeatUser(u)} className="px-2 py-1 rounded-full bg-[#6C5CE7]/20 border border-[#6C5CE7]/40 text-[#a89bff] text-xs">Features</button>
                          <button onClick={() => { setUsers(users.map(x => x.id === u.id ? { ...x, status: x.status === "active" ? "banned" as const : "active" as const } : x)); toast("Status updated", "info"); }} className="px-2 py-1 rounded-full bg-[#222] text-xs">{u.status === "active" ? "Ban" : "Unban"}</button>
                          <button onClick={() => { if (confirm("Delete user?")) { setUsers(users.filter(x => x.id !== u.id)); toast("Deleted", "info"); } }} className="px-2 py-1 rounded-full bg-red-500/10 text-red-400 text-xs">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "websites" && (
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <h2 className="font-grotesk text-xl font-bold">Website Manager (All Users)</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-3 py-1 rounded-full bg-[#111] border border-[#222] text-[#888]">{websites.length} hosted files</span>
                  {brokenSites.length > 0 && (
                    <button onClick={() => setTab("hosting")} className="text-xs px-3 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-300 animate-pulse">🚨 {brokenSites.length} file(s) with errors — open Error Center</button>
                  )}
                </div>
              </div>
              
              {/* Deployed Status Overview */}
              <div className="grid md:grid-cols-3 gap-3">
                <div className="rounded-xl bg-[#00ff88]/5 border border-[#00ff88]/20 p-3">
                  <p className="text-xs text-[#888]">Deployed Successfully</p>
                  <p className="text-lg font-bold text-[#00ff88]">{websites.filter(w => w.status === "Running").length}</p>
                </div>
                <div className="rounded-xl bg-yellow-500/5 border border-yellow-500/20 p-3">
                  <p className="text-xs text-[#888]">With Errors (Auto-fixing)</p>
                  <p className="text-lg font-bold text-yellow-400">{websites.filter(w => w.status === "Error").length}</p>
                </div>
                <div className="rounded-xl bg-[#111] border border-[#222] p-3">
                  <p className="text-xs text-[#888]">Total Hosted</p>
                  <p className="text-lg font-bold">{websites.length} files</p>
                </div>
              </div>

              <div className="rounded-2xl bg-[#111] border border-[#222] overflow-hidden overflow-x-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead className="bg-black border-b border-[#222] text-[#888] text-xs">
                    <tr><th className="text-left px-3 py-3">Name</th><th className="text-left px-3 py-3">URL</th><th className="text-left px-3 py-3">User</th><th className="text-left px-3 py-3">Type</th><th className="text-left px-3 py-3">File Info</th><th className="text-left px-3 py-3">Status</th><th className="text-left px-3 py-3">Actions</th></tr>
                  </thead>
                  <tbody>
                    {websites.map(w => (
                      <tr key={w.id} className="border-b border-[#222]/30 hover:bg-black/30">
                        <td className="px-3 py-3">
                          <p className="font-medium text-sm">{w.name}</p>
                          <p className="text-[10px] text-[#666]">{w.fileSize || "—"} • {w.deployedAt ? new Date(w.deployedAt).toLocaleDateString() : new Date(w.createdAt).toLocaleDateString()}</p>
                        </td>
                        <td className="px-3 py-3 text-[#00D4FF] text-xs">{w.url}</td>
                        <td className="px-3 py-3 text-xs text-[#888]">{users.find(u => u.id === w.userId)?.email || w.userId.slice(0,8)}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-1">
                            <span className="px-2 py-1 rounded-full bg-black border border-[#222] text-xs text-center">{w.stack}</span>
                            <span className="text-[10px] text-[#888] text-center">{(w as any).botType || (w as any).fileType || "—"}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-xs">
                            <p className="text-white">{w.fileType || w.stack + " File"}</p>
                            {w.botUsername && <p className="text-[10px] text-[#00ff88]">✓ @{w.botUsername}</p>}
                            {w.botType && <p className="text-[10px] text-[#666]">{w.botType}</p>}
                            {analyzeSite(w).length > 0 ? (
                              <p className={`text-[10px] ${needsManualAction(w) ? "text-red-400" : "text-yellow-400"}`}>
                                ⚠ {w.errorCount || 0} error(s) {needsManualAction(w) ? "— delete karo" : "— auto-fix ready"}
                              </p>
                            ) : (
                              <p className="text-[10px] text-[#00ff88]">✓ 0 errors</p>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-1">
                            <span className={`px-2 py-1 rounded-full text-xs text-center ${w.status === "Running" ? "bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20" : w.status === "Error" ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" : "bg-red-500/10 text-red-400"}`}>{w.status === "Running" ? "● Deployed" : w.status === "Error" ? "⚠ Error" : "● " + w.status}</span>
                            {w.status === "Error" && (w as any).lastError && <span className="text-[10px] text-red-400 max-w-[150px] truncate" title={(w as any).lastError}>{(w as any).lastError}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex gap-1 flex-wrap">
                            <button onClick={() => {
                              if (w.status === "Error" || (w.errorCount || 0) > 0) {
                                if (needsManualAction(w)) {
                                  if (confirm(`Ye file ${MAX_ERRORS}+ errors de rahi hai — auto-fix possible nahi. Delete karein?`)) {
                                    setWebsites(websites.filter(x => x.id !== w.id));
                                    toast("Deleted due to excessive errors", "info");
                                  } else {
                                    toast("Telegram @Rolax112 pe contact karo manual fix ke liye", "info");
                                  }
                                } else {
                                  fixOneSite(w);
                                }
                              } else {
                                setWebsites(websites.map(x => x.id === w.id ? { ...x, status: x.status === "Running" ? "Stopped" as const : "Running" as const } : x));
                                toast("Status toggled", "success");
                              }
                            }} className={`px-2 py-1 rounded-full text-xs ${w.status === "Error" ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30" : "bg-[#222]"}`}>{w.status === "Error" ? "⚡ Auto-Fix" : w.status === "Running" ? "Stop" : "Start"}</button>
                            <button onClick={() => { setFilesSite(w); }} className="px-2 py-1 rounded-full bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/20 text-xs">Download</button>
                            <button onClick={() => setOpenCheckSite(openCheckSite === w.id ? null : w.id)} className="px-2 py-1 rounded-full bg-[#6C5CE7]/15 border border-[#6C5CE7]/30 text-[#a89bff] text-xs">Checks</button>
                            <button onClick={() => setFilesSite(w)} className="px-2 py-1 rounded-full bg-white/10 border border-white/20 text-white text-xs">Files</button>
                            <a href={`/site/${encodeURIComponent(w.name.toLowerCase().replace(/\s+/g, "-"))}`} target="_blank" className="px-2 py-1 rounded-full bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/20 text-xs">Open</a>
                            <button onClick={() => { if (confirm("Delete hosted file?")) { setWebsites(websites.filter(x => x.id !== w.id)); toast("Deleted", "info"); } }} className="px-2 py-1 rounded-full bg-red-500/10 text-red-400 text-xs">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Expanded check report for selected site */}
              {openCheckSite && (() => {
                const w = websites.find(x => x.id === openCheckSite);
                if (!w) return null;
                const list = Array.isArray(w.checks) && w.checks.length ? w.checks : [];
                return (
                  <div className="rounded-2xl bg-[#111] border border-[#6C5CE7]/30 p-5">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm">Deploy Report — {w.name}</h3>
                      <button onClick={() => setOpenCheckSite(null)} className="text-xs px-3 py-1 rounded-full bg-[#222]">Close</button>
                    </div>
                    <p className="text-xs text-[#888] mt-1">{w.botType || w.fileType} • {w.fileCount || 0} files • entry: {w.entryFile || "—"} {w.botUsername ? `• ✓ @${w.botUsername}` : ""}</p>
                    <div className="mt-3 space-y-2">
                      {list.length === 0 && <p className="text-xs text-[#666]">Is site ki detailed report nahi hai (purana deploy). User se dobara deploy karwao.</p>}
                      {list.map((c, i) => (
                        <div key={i} className={`rounded-xl p-3 border ${c.level === "ok" ? "bg-[#00ff88]/5 border-[#00ff88]/20" : c.level === "warn" ? "bg-yellow-500/5 border-yellow-500/20" : "bg-red-500/5 border-red-500/25"}`}>
                          <p className={`text-xs font-medium ${c.level === "ok" ? "text-[#00ff88]" : c.level === "warn" ? "text-yellow-400" : "text-red-400"}`}>
                            {c.level === "ok" ? "✓" : c.level === "warn" ? "⚠" : "✕"} {c.title}
                          </p>
                          <p className="text-[11px] text-[#999] mt-1">{c.detail}</p>
                          <p className="text-[10px] text-[#555] font-mono mt-1">{c.code}{c.fixable ? " • auto-fixable" : ""}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <p className="text-xs text-[#666]">💡 Har file ka asli deploy report (bot token verify, dependencies, syntax) — <strong>Checks</strong> button se dekho. Auto-fix: Errors &lt; 5 → fix, ≥5 → delete alert.</p>
            </div>
          )}

          {featUser && (() => {
            const userPlan = plans.find(p => p.id === featUser.planId);
            const planEnt = planEntitlements(userPlan);
            const list = features?.length ? features : DEFAULT_FEATURES;
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
                <div className="w-full max-w-[560px] rounded-2xl bg-[#111] border border-[#222] p-6 max-h-[85vh] overflow-auto">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-grotesk font-bold">Features — {featUser.name}</h3>
                      <p className="text-xs text-[#888] mt-1">{featUser.email} • Plan: {userPlan?.name || "Free (no plan)"}</p>
                    </div>
                    <button onClick={() => setFeatUser(null)} className="w-8 h-8 rounded-full bg-black border border-[#222]">✕</button>
                  </div>

                  <p className="text-[11px] text-[#666] mt-3">Plan se milne wale features default hain. Yahan se kisi ek user ko extra de sakte ho ya band kar sakte ho.</p>

                  <div className="mt-3 space-y-2">
                    {list.map(f => {
                      const override = featUser.entitlements?.[f.id];
                      const effective = override !== undefined ? override : !!planEnt[f.id];
                      return (
                        <div key={f.id} className="rounded-xl bg-black border border-[#222] p-3 flex items-center gap-3">
                          <span className="text-lg">{f.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-white">{f.label}</p>
                            <p className="text-[10px] text-[#666] truncate">{f.desc}</p>
                            <p className="text-[10px] text-[#555]">{override !== undefined ? `custom: ${override ? "ON" : "OFF"}` : `plan default: ${planEnt[f.id] ? "ON" : "OFF"}`}</p>
                          </div>
                          <button
                            onClick={() => {
                              const ent = { ...(featUser.entitlements || {}) };
                              if (override !== undefined) delete ent[f.id];
                              else ent[f.id] = !effective;
                              const next = { ...featUser, entitlements: Object.keys(ent).length ? ent : undefined };
                              setUsers(users.map(u => u.id === featUser.id ? next : u));
                              setFeatUser(next);
                            }}
                            className={`px-3 py-1.5 rounded-full text-[11px] font-medium ${effective ? "bg-[#00ff88] text-black" : "bg-[#333] text-[#999]"}`}
                          >
                            {effective ? "ON" : "OFF"}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button onClick={() => { const next = { ...featUser, entitlements: undefined }; setUsers(users.map(u => u.id === featUser.id ? next : u)); setFeatUser(next); toast("Plan default par reset", "info"); }} className="flex-1 py-2.5 rounded-full bg-[#222] text-xs">Reset to plan</button>
                    <button onClick={() => { setFeatUser(null); toast("Features saved", "success"); }} className="flex-1 py-2.5 rounded-full bg-white text-black text-xs font-medium">Done</button>
                  </div>
                </div>
              </div>
            );
          })()}

          {filesSite && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
              <div className="w-full max-w-[820px] rounded-2xl bg-[#111] border border-[#222] p-6 max-h-[88vh] overflow-auto">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-grotesk font-bold">Uploaded Files — {filesSite.name}</h3>
                    <p className="text-xs text-[#888] mt-1">{filesSite.botType || filesSite.fileType} • {filesSite.fileCount || (filesSite.src?.length ?? 0)} files • entry: {filesSite.entryFile || "—"}</p>
                    <p className="text-[11px] text-[#666]">User: {users.find(u => u.id === filesSite.userId)?.email || filesSite.userId} • {filesSite.fileSize || "—"}</p>
                  </div>
                  <button onClick={() => { setFilesSite(null); setViewFile(null); }} className="w-8 h-8 rounded-full bg-black border border-[#222]">✕</button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button onClick={async () => {
                    const files = filesSite.src || [];
                    if (!files.length) { toast("Is project ka source stored nahi hai", "error"); return; }
                    try {
                      const JSZip = (await import("jszip")).default;
                      const zip = new JSZip();
                      files.forEach((f: any) => zip.file(f.name, f.content));
                      const blob = await zip.generateAsync({ type: "blob" });
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(blob);
                      a.download = `${filesSite.name}.zip`;
                      a.click();
                      toast("Project ZIP download ho gaya ✅", "success");
                    } catch {
                      const all = files.map((f: any) => `// ===== ${f.name} =====\n${f.content}`).join("\n\n");
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(new Blob([all], { type: "text/plain" }));
                      a.download = `${filesSite.name}-source.txt`;
                      a.click();
                    }
                  }} className="px-4 py-2 rounded-full bg-white text-black text-xs font-medium">⬇ Download project (.zip)</button>
                  <button onClick={() => {
                    const all = (filesSite.src || []).map((f: any) => `===== ${f.name} =====\n${f.content}`).join("\n\n");
                    navigator.clipboard.writeText(all);
                    toast("Source clipboard me copy ho gaya", "success");
                  }} className="px-4 py-2 rounded-full bg-[#222] text-xs">Copy all</button>
                  <button onClick={() => {
                    const token = getBotToken(filesSite.id);
                    if (!token) { toast("Is site ka token browser me nahi mila (doosre browser se deploy hua hoga)", "error"); return; }
                    navigator.clipboard.writeText(token);
                    toast("Bot token copy ho gaya", "success");
                  }} className="px-4 py-2 rounded-full bg-[#00ff88]/15 border border-[#00ff88]/25 text-[#00ff88] text-xs">Copy bot token</button>
                  <a href={`/site/${encodeURIComponent(filesSite.name.toLowerCase().replace(/\s+/g, "-"))}`} target="_blank" className="px-4 py-2 rounded-full bg-[#00D4FF]/10 border border-[#00D4FF]/20 text-[#00D4FF] text-xs">Open site</a>
                </div>

                {/* AI ANALYSIS — kya host kiya, kya kaam karta hai */}
                {(() => {
                  const a = analyzeProject(filesSite);
                  return (
                    <div className="mt-3 rounded-xl bg-[#6C5CE7]/10 border border-[#6C5CE7]/30 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-[#a89bff]">🤖 AI Analysis</p>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#6C5CE7] text-white">{a.kind}</span>
                      </div>
                      <p className="text-[11px] text-[#ddd] mt-1">{a.summary}</p>

                      <div className="mt-2 grid md:grid-cols-2 gap-2">
                        <div className="rounded-lg bg-black border border-[#222] p-2">
                          <p className="text-[10px] text-[#888] mb-1">Kya kaam karta hai</p>
                          {a.runs.map((r, i) => <p key={i} className="text-[10px] text-[#00ff88]">✓ {r}</p>)}
                        </div>
                        <div className="rounded-lg bg-black border border-[#222] p-2">
                          <p className="text-[10px] text-[#888] mb-1">Files / Stack</p>
                          <p className="text-[10px] text-[#ccc]">{a.stack} • {a.files.length} files • {a.lineCount} lines</p>
                          <p className="text-[10px] text-[#666] break-words">{a.files.slice(0, 8).join(", ")}</p>
                          {a.packages.length > 0 && <p className="text-[10px] text-[#00D4FF] mt-1">📦 {a.packages.slice(0, 6).join(", ")}</p>}
                        </div>
                      </div>

                      {a.commands.length > 0 && (
                        <div className="mt-2 rounded-lg bg-black border border-[#222] p-2">
                          <p className="text-[10px] text-[#888] mb-1">Telegram commands ({a.commands.length})</p>
                          {a.commands.slice(0, 6).map((c, i) => (
                            <p key={i} className="text-[10px] text-[#ccc]"><span className="text-[#00D4FF]">/{c.trigger}</span>{c.reply ? ` → ${c.reply.slice(0, 55)}` : ""}</p>
                          ))}
                        </div>
                      )}

                      {a.routes.length > 0 && (
                        <div className="mt-2 rounded-lg bg-black border border-[#222] p-2">
                          <p className="text-[10px] text-[#888]">Web routes: <span className="text-[#ccc]">{a.routes.join(", ")}</span></p>
                        </div>
                      )}

                      {a.envKeys.length > 0 && (
                        <p className="text-[10px] text-[#888] mt-2">🔑 Env keys: <span className="text-[#ccc]">{a.envKeys.join(", ")}</span></p>
                      )}

                      {a.riskFlags.length > 0 && (
                        <div className="mt-2 rounded-lg bg-red-500/10 border border-red-500/25 p-2">
                          <p className="text-[10px] text-red-300 font-medium">⚠ Risk flags</p>
                          {a.riskFlags.map((r, i) => <p key={i} className="text-[10px] text-red-200/80">• {r}</p>)}
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="mt-4 grid md:grid-cols-[260px_1fr] gap-3">
                  <div className="rounded-xl bg-black border border-[#222] p-2 max-h-[45vh] overflow-auto">
                    {(!filesSite.src || filesSite.src.length === 0) && <p className="text-[11px] text-[#666] p-2">Source stored nahi hai (purana deploy ya doosra browser).</p>}
                    {(filesSite.src || []).map((f: any, i: number) => (
                      <button key={i} onClick={() => setViewFile(f)} className={`w-full text-left px-3 py-2 rounded-lg text-[11px] font-mono truncate ${viewFile?.name === f.name ? "bg-white text-black" : "text-[#bbb] hover:bg-[#111]"}`}>
                        {viewFile?.name === f.name ? "▸ " : "  "}{f.name}
                      </button>
                    ))}
                  </div>
                  <div className="rounded-xl bg-black border border-[#222] p-3 max-h-[45vh] overflow-auto">
                    {viewFile ? (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[11px] text-[#00D4FF] font-mono">{viewFile.name}</p>
                          <button onClick={() => { navigator.clipboard.writeText(viewFile.content); toast("Copied", "success"); }} className="text-[10px] px-2 py-0.5 rounded-full bg-[#222]">Copy</button>
                        </div>
                        <pre className="text-[11px] text-[#ddd] whitespace-pre-wrap break-words font-mono">{viewFile.content}</pre>
                      </>
                    ) : (
                      <p className="text-[11px] text-[#666]">Koi file select karo (left list se).</p>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-[#555] mt-2">Admin kisi bhi hosted file ka pura code dekh/download kar sakta hai. Token sirf usi browser me copy ho sakta hai jahan deploy hua tha.</p>
              </div>
            </div>
          )}

          {tab === "tickets" && (
            <div className="space-y-4">
              <h2 className="font-grotesk text-xl font-bold">Ticket Manager</h2>
              {tickets.length === 0 ? <p className="text-[#888] text-sm">No tickets</p> : tickets.map(t => (
                <div key={t.id} className="rounded-2xl bg-[#111] border border-[#222] p-5">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">{t.subject} <span className="text-xs text-[#888]">by {t.userEmail}</span></h4>
                    <span className={`px-2 py-1 rounded-full text-xs ${t.status === "open" ? "bg-yellow-500/10 text-yellow-400" : t.status === "replied" ? "bg-[#00D4FF]/10 text-[#00D4FF]" : "bg-[#00ff88]/10 text-[#00ff88]"}`}>{t.status}</span>
                  </div>
                  <p className="text-sm text-[#888] mt-2">{t.message}</p>
                  {t.replies.map((r, i) => (
                    <div key={i} className="mt-2 p-3 rounded-xl bg-black border border-[#222] text-sm">
                      <p className="text-xs text-[#6C5CE7] font-medium">{r.from}</p>
                      <p className="text-[#ccc] mt-1">{r.message}</p>
                    </div>
                  ))}
                  <div className="mt-3 flex gap-2">
                    <input id={`reply-${t.id}`} placeholder="Type reply..." className="flex-1 px-4 py-2 rounded-full bg-black border border-[#222] text-sm" />
                    <button onClick={() => {
                      const input = document.getElementById(`reply-${t.id}`) as HTMLInputElement;
                      if (!input.value.trim()) return;
                      setTickets(tickets.map(x => x.id === t.id ? { ...x, replies: [...x.replies, { from: "Admin", message: input.value, at: new Date().toISOString() }], status: "replied" as const } : x));
                      input.value = "";
                      toast("Replied!", "success");
                    }} className="px-4 py-2 rounded-full bg-white text-black text-xs font-medium">Reply</button>
                    <button onClick={() => { setTickets(tickets.map(x => x.id === t.id ? { ...x, status: "closed" as const } : x)); toast("Closed", "info"); }} className="px-3 py-2 rounded-full bg-[#222] text-xs">Close</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
