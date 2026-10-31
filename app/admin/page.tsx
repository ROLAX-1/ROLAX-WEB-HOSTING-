"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, clearAuth } from "@/lib/auth";
import { useStore, ADMIN_EMAIL } from "@/lib/store";
import { toast } from "@/components/ui/Toaster";
import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function AdminPage() {
  const router = useRouter();
  const { hydrate, hydrated, plans, setPlans, stacks, setStacks, wallets, setWallets, settings, setSettings, websites, setWebsites, payments, setPayments, tickets, setTickets, users, setUsers } = useStore();
  const [auth, setAuth] = useState<any>(null);
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");

  useEffect(() => { hydrate(); }, [hydrate]);
  useEffect(() => {
    const a = getAuth();
    if (!a || a.email !== ADMIN_EMAIL) { router.push("/login"); return; }
    setAuth(a);
  }, [router]);

  if (!hydrated || !auth) return <div className="min-h-screen bg-black flex items-center justify-center text-[#888]">Loading admin...</div>;

  const revenue = payments.filter(p => p.status === "approved").reduce((sum, p) => sum + p.amount, 0);
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
            <span className="font-grotesk font-bold">ROLAX ADMIN</span>
          </div>
          <p className="text-xs text-[#666] mt-1">Super Admin Panel</p>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {[
            { id: "overview", label: "Overview", icon: "📊" },
            { id: "customizer", label: "Site Customizer", icon: "🎨" },
            { id: "plans", label: "Plan Manager", icon: "💳" },
            { id: "stacks", label: "Stack Manager", icon: "⚙️" },
            { id: "wallets", label: "Crypto Wallets", icon: "₿" },
            { id: "payments", label: "Payments", icon: "💰", badge: pendingCount },
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
        <div className="md:hidden sticky top-0 z-40 bg-black border-b border-[#222] p-3 flex items-center justify-between">
          <span className="font-grotesk font-bold">ROLAX ADMIN</span>
          <button onClick={() => { clearAuth(); router.push("/"); }} className="px-3 py-1 rounded-full bg-[#111] border border-[#222] text-xs">Logout</button>
        </div>
        <div className="md:hidden flex gap-2 p-3 overflow-x-auto border-b border-[#222] bg-black sticky top-[49px] z-30">
          {["overview", "customizer", "plans", "stacks", "wallets", "payments", "users", "websites", "tickets"].map(id => (
            <button key={id} onClick={() => setTab(id)} className={`px-4 py-2 rounded-full text-xs whitespace-nowrap ${tab === id ? "bg-white text-black" : "bg-[#111] border border-[#222] text-[#888]"}`}>{id}</button>
          ))}
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

          {tab === "plans" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="font-grotesk text-xl font-bold">Plan Manager</h2>
                <button onClick={() => {
                  const newPlan = { id: "plan_" + Date.now(), name: "New Plan", price: 9.99, ram: "4 GB", cpu: "2 vCPU", storage: "50 GB", bandwidth: "200 GB", features: ["Feature 1", "Feature 2"] };
                  setPlans([...plans, newPlan]);
                  toast("Plan added", "success");
                }} className="px-4 py-2 rounded-full bg-white text-black text-sm font-medium">+ Add Plan</button>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {plans.map((plan, idx) => (
                  <div key={plan.id} className="rounded-2xl bg-[#111] border border-[#222] p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <input value={plan.name} onChange={e => { const arr = [...plans]; arr[idx].name = e.target.value; setPlans(arr); }} className="flex-1 px-3 py-2 rounded-xl bg-black border border-[#222] text-sm font-semibold" />
                      <button onClick={() => { setPlans(plans.filter(p => p.id !== plan.id)); toast("Deleted", "info"); }} className="ml-2 px-3 py-2 rounded-xl bg-red-500/10 text-red-400 text-xs">Delete</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="text-[10px] text-[#888]">Price ($)</label><input type="number" value={plan.price} onChange={e => { const arr = [...plans]; arr[idx].price = parseFloat(e.target.value) || 0; setPlans(arr); }} className="w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" /></div>
                      <div><label className="text-[10px] text-[#888]">RAM</label><input value={plan.ram} onChange={e => { const arr = [...plans]; arr[idx].ram = e.target.value; setPlans(arr); }} className="w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" /></div>
                      <div><label className="text-[10px] text-[#888]">CPU</label><input value={plan.cpu} onChange={e => { const arr = [...plans]; arr[idx].cpu = e.target.value; setPlans(arr); }} className="w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" /></div>
                      <div><label className="text-[10px] text-[#888]">Storage</label><input value={plan.storage} onChange={e => { const arr = [...plans]; arr[idx].storage = e.target.value; setPlans(arr); }} className="w-full px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" /></div>
                    </div>
                    <div>
                      <label className="text-[10px] text-[#888]">Features (one per line)</label>
                      <textarea value={plan.features.join("\n")} onChange={e => { const arr = [...plans]; arr[idx].features = e.target.value.split("\n").filter(Boolean); setPlans(arr); }} rows={4} className="w-full mt-1 px-3 py-2 rounded-xl bg-black border border-[#222] text-sm" />
                    </div>
                    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!plan.popular} onChange={e => { const arr = [...plans]; arr[idx].popular = e.target.checked; setPlans(arr); }} /> Popular Badge</label>
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
                  <div className="flex justify-center bg-white p-3 rounded-xl">
                    <QRCodeSVG value={w.address} size={100} />
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
                          <p className="text-xs text-[#888] font-mono mt-1 break-all">TXID: {p.txid}</p>
                          {p.screenshot && <a href={p.screenshot} target="_blank" className="text-xs text-[#00D4FF] hover:underline">View Screenshot</a>}
                          <p className="text-[10px] text-[#666] mt-1">{new Date(p.createdAt).toLocaleString()}</p>
                        </div>
                        <div className="flex gap-2">
                          <span className={`px-3 py-1 rounded-full text-xs ${p.status === "pending" ? "bg-yellow-500/10 text-yellow-400" : p.status === "approved" ? "bg-[#00ff88]/10 text-[#00ff88]" : "bg-red-500/10 text-red-400"}`}>{p.status}</span>
                          {p.status === "pending" && (
                            <>
                              <button onClick={() => {
                                setPayments(payments.map(x => x.id === p.id ? { ...x, status: "approved" as const } : x));
                                // assign plan to user
                                const updatedUsers = users.map(u => u.email === p.userEmail ? { ...u, planId: p.planId, planExpiry: new Date(Date.now() + 30 * 24 * 3600000).toISOString() } : u);
                                setUsers(updatedUsers);
                                toast("Payment approved! Plan activated.", "success");
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
                        <td className="px-4 py-3 flex gap-1">
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
              <h2 className="font-grotesk text-xl font-bold">Website Manager (All Users)</h2>
              <div className="rounded-2xl bg-[#111] border border-[#222] overflow-hidden overflow-x-auto">
                <table className="w-full text-sm min-w-[800px]">
                  <thead className="bg-black border-b border-[#222] text-[#888] text-xs">
                    <tr><th className="text-left px-4 py-3">Name</th><th className="text-left px-4 py-3">URL</th><th className="text-left px-4 py-3">User</th><th className="text-left px-4 py-3">Stack</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Actions</th></tr>
                  </thead>
                  <tbody>
                    {websites.map(w => (
                      <tr key={w.id} className="border-b border-[#222]/30">
                        <td className="px-4 py-3 font-medium">{w.name}</td>
                        <td className="px-4 py-3 text-[#00D4FF] text-xs">{w.url}</td>
                        <td className="px-4 py-3 text-xs text-[#888]">{users.find(u => u.id === w.userId)?.email || w.userId}</td>
                        <td className="px-4 py-3"><span className="px-2 py-1 rounded-full bg-black border border-[#222] text-xs">{w.stack}</span></td>
                        <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs ${w.status === "Running" ? "bg-[#00ff88]/10 text-[#00ff88]" : "bg-red-500/10 text-red-400"}`}>{w.status}</span></td>
                        <td className="px-4 py-3 flex gap-1">
                          <button onClick={() => { setWebsites(websites.map(x => x.id === w.id ? { ...x, status: x.status === "Running" ? "Stopped" as const : "Running" as const } : x)); toast("Status toggled", "success"); }} className="px-2 py-1 rounded-full bg-[#222] text-xs">{w.status === "Running" ? "Stop" : "Start"}</button>
                          <button onClick={() => { if (confirm("Delete site?")) { setWebsites(websites.filter(x => x.id !== w.id)); toast("Deleted", "info"); } }} className="px-2 py-1 rounded-full bg-red-500/10 text-red-400 text-xs">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
