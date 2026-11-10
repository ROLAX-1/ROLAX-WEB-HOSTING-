"use client";
import { create } from "zustand";
import { loadUsers, saveUsers, loadServerUsers, syncUsersToServer, type PersistentUser } from "./persistent";

export type Plan = {
  id: string;
  name: string;
  price: number;            // poore duration ka price (total)
  durationValue?: number;   // jaise 3
  durationUnit?: DurationUnit; // "days" | "months" | "years"
  pricePerMonth?: boolean;  // price ko per-month treat karna hai (total = price x months)
  entitlements?: { [k: string]: boolean | undefined }; // kaun se features is plan me milte hain
  ram: string;
  cpu: string;
  storage: string;
  bandwidth: string;
  features: string[];
  popular?: boolean;
  color?: string;
};

export type Stack = {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
};

export type DurationUnit = "days" | "months" | "years";

export const DURATION_PRESETS: { label: string; value: number; unit: DurationUnit; short: string }[] = [
  { label: "15 Days", value: 15, unit: "days", short: "15 days" },
  { label: "1 Month", value: 1, unit: "months", short: "1 month" },
  { label: "3 Months", value: 3, unit: "months", short: "3 months" },
  { label: "6 Months", value: 6, unit: "months", short: "6 months" },
  { label: "1 Year", value: 1, unit: "years", short: "1 year" },
  { label: "2 Years", value: 2, unit: "years", short: "2 years" },
];

/** Duration ko dinon me badlo (approval par expiry set karne ke liye) */
export function durationInDays(value?: number, unit?: DurationUnit): number {
  const v = value && value > 0 ? value : 1;
  if (unit === "days") return v;
  if (unit === "years") return v * 365;
  return v * 30;
}

/** "3 months" jaisa readable label */
export function durationLabel(value?: number, unit?: DurationUnit): string {
  const v = value && value > 0 ? value : 1;
  const u = unit || "months";
  const name = u === "days" ? "day" : u === "years" ? "year" : "month";
  return `${v} ${name}${v > 1 ? "s" : ""}`;
}

/** Plan ka total price (per-month toggle ke hisaab se) */
export function planTotal(plan: Plan): number {
  const price = Number(plan.price) || 0;
  if (!plan.pricePerMonth) return price;
  const months = durationInDays(plan.durationValue, plan.durationUnit) / 30;
  return Math.round(price * months * 100) / 100;
}

export type CryptoWallet = {
  id: string;
  name: string;
  symbol: string;
  address: string;
  network: string;
};

export type FeatureDef = {
  id: string;
  label: string;
  desc: string;
  icon: string;
  builtin?: boolean;
};

export type UserType = {
  id: string;
  name: string;
  email: string;
  planId?: string;
  planExpiry?: string;
  entitlements?: { [k: string]: boolean | undefined }; // per-user override (admin panel se)
  status: "active" | "banned";
  createdAt: string;
};

export type Website = {
  id: string;
  userId: string;
  name: string;
  url: string;
  stack: string;
  status: "Running" | "Stopped" | "Error";
  cpu: number;
  ram: number;
  fileType?: string;
  botType?: string;
  errorCount?: number;
  lastError?: string;
  lastFixAt?: string;
  deployedAt?: string;
  fileSize?: string;
  checks?: { code: string; title: string; detail: string; level: "ok" | "warn" | "error"; fixable: boolean }[];
  bundle?: { path: string; content: string; type: string }[];
  src?: { name: string; content: string }[];
  botRuntime?: { status: string; username?: string; responses?: number; lastReplyAt?: string; lastReplyMessage?: string; lastError?: string; commands?: { trigger: string; reply: string; source: string }[] };
  botUsername?: string;
  tokenMasked?: string;
  fileCount?: number;
  entryFile?: string;
  pythonTest?: { tested: boolean; syntaxOk: boolean; loaded: boolean; commands: string[]; replies: string[]; error: string; entry?: string };
  heartbeat?: { at: string; status: string; responses?: number; mode?: string };
  createdAt: string;
};

export type Payment = {
  id: string;
  userId: string;
  userEmail: string;
  planId: string;
  planName: string;
  amount: number;
  coin: string;
  durationLabel?: string;
  durationDays?: number;
  txid: string;
  screenshot?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

export type Ticket = {
  id: string;
  userId: string;
  userEmail: string;
  subject: string;
  message: string;
  status: "open" | "closed" | "replied";
  replies: { from: string; message: string; at: string }[];
  createdAt: string;
};

export type SiteSettings = {
  logoText: string;
  heroTitle: string;
  heroSubtitle: string;
  heroBadge: string;
  ctaText: string;
  features: { title: string; desc: string; icon: string }[];
  whyUsTitle: string;
  whyUsDesc: string;
  whyUsPoints: string[];
  faq: { q: string; a: string }[];
  footerTelegram: string;
  footerText: string;
  contactTelegram: string;
  contactNote: string;
  usdToInr: number;
  /* brand — ek jagah se poori site */
  logoUrl?: string;
  faviconUrl?: string;
  accentColor?: string;
  footerLogoUrl?: string;
  heroImageUrl?: string;
  /* offers / festival */
  offers?: any[];
  offersEnabled?: boolean;
  offerBadge?: string;
  offerTitle?: string;
  offerDesc?: string;
  offerCode?: string;
  offerDiscount?: number;
  offerEndsAt?: string;
  offerTheme?: string;
  offerPlans?: string[];
  offerBannerEnabled?: boolean;
  offerBannerText?: string;
  announcements?: { id: string; text: string; emoji?: string; active: boolean }[];
};

export const DEFAULT_FEATURES: FeatureDef[] = [
  { id: "deploy", label: "Basic Deploy", desc: "File upload + site live", icon: "📦", builtin: true },
  { id: "ai_autofix", label: "AI Auto-Fix", desc: "Code ke errors AI se khud fix (features nahi badalte)", icon: "🛠️", builtin: true },
  { id: "ai_review", label: "AI Code Review", desc: "Uploaded code ka AI analysis report", icon: "🤖", builtin: true },
  { id: "bot_24x7", label: "24/7 Bot Hosting", desc: "Plan khatam hone tak bot online", icon: "♾️", builtin: true },
  { id: "custom_domain", label: "Custom Domain", desc: "Apna domain connect", icon: "🌐", builtin: true },
  { id: "priority_support", label: "Priority Support", desc: "Telegram pe fast support", icon: "⚡", builtin: true },
  { id: "daily_backup", label: "Daily Backup", desc: "Roz automatic backup", icon: "💾", builtin: true },
  { id: "live_logs", label: "Live Logs", desc: "Real-time build/run logs", icon: "📜", builtin: true },
  { id: "free_ssl", label: "Free SSL", desc: "HTTPS auto certificate", icon: "🔒", builtin: true },
  { id: "analytics", label: "Traffic Analytics", desc: "Visitors + bandwidth stats", icon: "📊", builtin: true },
  { id: "api_access", label: "API Access", desc: "Deploy via API token", icon: "🔑", builtin: true },
  { id: "env_manager", label: "Env Variables Manager", desc: "Dashboard se env edit", icon: "🧪", builtin: true },
];

const defaultPlans: Plan[] = [
  {
    id: "plan_free",
    name: "Starter",
    price: 0,
    ram: "512 MB",
    cpu: "0.5 vCPU",
    storage: "2 GB",
    bandwidth: "10 GB",
    features: ["1 Website", "512 MB RAM", "Community Support", "Free SSL"],
    durationValue: 1,
    durationUnit: "months",
  },
  {
    id: "plan_pro",
    name: "Pro Hosting",
    price: 4.99,
    ram: "2 GB",
    cpu: "2 vCPU",
    storage: "20 GB",
    bandwidth: "100 GB",
    features: ["10 Websites", "2 GB RAM", "Priority Support", "Free SSL", "Daily Backups", "Custom Domain"],
    popular: true,
    durationValue: 1,
    durationUnit: "months",
  },
  {
    id: "plan_enterprise",
    name: "Enterprise",
    price: 14.99,
    ram: "8 GB",
    cpu: "4 vCPU",
    storage: "100 GB",
    bandwidth: "Unlimited",
    features: ["Unlimited Websites", "8 GB RAM", "24/7 Support", "Free SSL", "Hourly Backups", "DDoS Protection", "Dedicated IP"],
    durationValue: 1,
    durationUnit: "months",
  },
];

const defaultStacks: Stack[] = [
  { id: "s1", name: "HTML", icon: "🌐", color: "#E34F26", description: "Static HTML/CSS/JS" },
  { id: "s2", name: "Node.js", icon: "🟢", color: "#339933", description: "Node.js 18/20 LTS" },
  { id: "s3", name: "Python", icon: "🐍", color: "#3776AB", description: "Python 3.10/3.11" },
];

const defaultWallets: CryptoWallet[] = [
  { id: "w1", name: "BNB", symbol: "BNB", address: "0xdB5e1b18C90166eeFc77C9C404AB84a078a069E8", network: "BNB Smart Chain (BEP-20)" },
  { id: "w2", name: "USDT", symbol: "USDT", address: "0xdB5e1b18C90166eeFc77C9C404AB84a078a069E8", network: "BNB Smart Chain (BEP-20)" },
];

const defaultSettings: SiteSettings = {
  logoText: "ROLAX HOST",
  logoUrl: "/images/rolax-hero-new.jpg",
  faviconUrl: "",
  accentColor: "#6C5CE7",
  heroImageUrl: "/images/rolax-hero-new.jpg",
  offersEnabled: false,
  offers: [],
  offerBadge: "🪔 DIWALI DHAMAKA",
  offerTitle: "Diwali Special — 50% OFF",
  offerDesc: "Har plan pe flat 50% off. Sirf Diwali tak!",
  offerCode: "",
  offerDiscount: 0,
  offerEndsAt: "",
  offerTheme: "diwali",
  offerPlans: [],
  offerBannerEnabled: false,
  offerBannerText: "🪔 Diwali Sale LIVE — coupon DIWALI50 se 50% OFF",
  announcements: [],
  heroTitle: "Host Python, Node.js & HTML at Lightning Speed",
  heroSubtitle: "Deploy your projects in seconds. 99.9% uptime, global CDN, and developer-first experience trusted by 50,000+ developers worldwide.",
  heroBadge: "⚡ Now with 10x faster deployments",
  ctaText: "Deploy Now",
  features: [
    { title: "Lightning Fast", desc: "Deploy in under 30 seconds with our global edge network.", icon: "⚡" },
    { title: "99.9% Uptime", desc: "Enterprise-grade infrastructure with automatic failover.", icon: "🛡️" },
    { title: "Global CDN", desc: "Your site delivered from 300+ edge locations worldwide.", icon: "🌍" },
    { title: "Auto SSL", desc: "Free HTTPS for all your projects with auto renewal.", icon: "🔒" },
    { title: "Git Integration", desc: "Deploy directly from GitHub with auto builds.", icon: "🔗" },
    { title: "24/7 Support", desc: "Expert help whenever you need it via tickets.", icon: "💬" },
  ],
  whyUsTitle: "Why 50,000+ Developers Choose ROLAX HOST",
  whyUsDesc: "We combine the simplicity of Vercel with the power of traditional hosting. No complexity, just pure performance.",
  whyUsPoints: ["Deploy from GitHub or ZIP in one click", "Real-time logs and file manager", "CPU/RAM monitoring dashboard", "Free subdomains: yourproject.rolax.host"],
  faq: [
    { q: "What stacks do you support?", a: "We support HTML, Node.js, and Python out of the box. More stacks can be added by admin anytime." },
    { q: "How does crypto payment work?", a: "Select a plan, send crypto to our BEP-20 address, submit TXID + screenshot. Admin approves within 24h." },
    { q: "Can I use custom domain?", a: "Yes, Pro and Enterprise plans include custom domain support with free SSL." },
    { q: "What is your uptime guarantee?", a: "We guarantee 99.9% uptime with automatic failover and global CDN." },
  ],
  footerTelegram: "@rolaxexploitsz",
  footerText: "© 2025 ROLAX HOST. Premium hosting for modern developers.",
  contactTelegram: "https://t.me/Rolax112",
  contactNote: "Contact only on Telegram - No other support",
  usdToInr: 88,
};

// Helper to load from localStorage
function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}
function save(key: string, val: any) {
  if (typeof window !== "undefined") localStorage.setItem(key, JSON.stringify(val));
}

// ---- Sanity sanitizers: purane/kharab localStorage data auto-repair ----
function num(v: any): number {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
    return isFinite(n) ? n : 0;
  }
  return 0;
}

function sanitizePlans(input: any): Plan[] {
  const arr = Array.isArray(input) ? input : [];
  const clean = arr
    .filter((p: any) => p && typeof p === "object")
    .map((p: any, i: number) => {
      const features = Array.isArray(p.features) ? p.features.map((f: any) => String(f)).filter(Boolean) : [];
      return {
        id: String(p.id || "plan_" + i + "_" + Date.now()),
        name: String(p.name || "Unnamed Plan"),
        price: Math.max(0, num(p.price)),
        ram: String(p.ram || "-"),
        cpu: String(p.cpu || "-"),
        storage: String(p.storage || "-"),
        bandwidth: String(p.bandwidth || "-"),
        features: features.length ? features : ["Basic Support"],
        popular: !!p.popular,
        color: p.color ? String(p.color) : undefined,
        durationValue: p.durationValue ? Math.max(1, Math.floor(num(p.durationValue))) : 1,
        durationUnit: p.durationUnit === "days" || p.durationUnit === "years" || p.durationUnit === "months" ? p.durationUnit : "months",
        pricePerMonth: !!p.pricePerMonth,
        entitlements: p.entitlements && typeof p.entitlements === "object" ? p.entitlements : undefined,
      } as Plan;
    });
  return clean.length ? clean : defaultPlans;
}

function sanitizeWallets(input: any): CryptoWallet[] {
  const arr = Array.isArray(input) ? input : [];
  const clean = arr
    .filter((w: any) => w && typeof w === "object")
    .map((w: any, i: number) => ({
      id: String(w.id || "w_" + i),
      name: String(w.name || w.symbol || "Coin"),
      symbol: String(w.symbol || w.name || "COIN").toUpperCase(),
      address: String(w.address || ""),
      network: String(w.network || "BNB Smart Chain (BEP-20)"),
    }));
  return clean;
}

function sanitizeWebsites(input: any): Website[] {
  const arr = Array.isArray(input) ? input : [];
  return arr
    .filter((w: any) => w && typeof w === "object" && w.id)
    .map((w: any) => ({
      id: String(w.id),
      userId: String(w.userId || "u1"),
      name: String(w.name || "untitled"),
      url: String(w.url || (String(w.name || "site").toLowerCase().replace(/\s+/g, "-") + ".rolax.host")),
      stack: String(w.stack || "HTML"),
      status: w.status === "Error" || w.status === "Stopped" ? w.status : "Running",
      cpu: num(w.cpu),
      ram: num(w.ram),
      fileType: w.fileType ? String(w.fileType) : undefined,
      botType: w.botType ? String(w.botType) : undefined,
      errorCount: Math.max(0, Math.floor(num(w.errorCount))),
      checks: Array.isArray(w.checks) ? w.checks : undefined,
      bundle: Array.isArray(w.bundle) ? w.bundle : undefined,
      src: Array.isArray(w.src) ? w.src : undefined,
      botRuntime: w.botRuntime && typeof w.botRuntime === "object" ? w.botRuntime : undefined,
      botUsername: w.botUsername ? String(w.botUsername) : undefined,
      tokenMasked: w.tokenMasked ? String(w.tokenMasked) : undefined,
      fileCount: w.fileCount ? Math.floor(num(w.fileCount)) : undefined,
      entryFile: w.entryFile ? String(w.entryFile) : undefined,
      lastError: w.lastError ? String(w.lastError) : undefined,
      lastFixAt: w.lastFixAt ? String(w.lastFixAt) : undefined,
      deployedAt: w.deployedAt ? String(w.deployedAt) : undefined,
      fileSize: w.fileSize ? String(w.fileSize) : undefined,
      createdAt: String(w.createdAt || new Date().toISOString()),
    })) as Website[];
}

type Store = {
  features: FeatureDef[];
  setFeatures: (f: FeatureDef[]) => void;
  plans: Plan[];
  setPlans: (p: Plan[]) => void;
  stacks: Stack[];
  setStacks: (s: Stack[]) => void;
  wallets: CryptoWallet[];
  setWallets: (w: CryptoWallet[]) => void;
  settings: SiteSettings;
  setSettings: (s: SiteSettings) => void;
  websites: Website[];
  setWebsites: (w: Website[]) => void;
  payments: Payment[];
  setPayments: (p: Payment[]) => void;
  tickets: Ticket[];
  setTickets: (t: Ticket[]) => void;
  users: UserType[];
  setUsers: (u: UserType[]) => void;
  hydrated: boolean;
  hydrate: () => void;
};

export const useStore = create<Store>((set, get) => ({
  features: DEFAULT_FEATURES,
  setFeatures: (features) => { save("rolax_features", features); set({ features }); },
  plans: defaultPlans,
  stacks: defaultStacks,
  wallets: defaultWallets,
  settings: defaultSettings,
  websites: [],
  payments: [],
  tickets: [],
  users: [],
  hydrated: false,

  setPlans: (plans) => { save("rolax_plans", plans); set({ plans }); },
  setStacks: (stacks) => { save("rolax_stacks", stacks); set({ stacks }); },
  setWallets: (wallets) => { save("rolax_wallets", wallets); set({ wallets }); },
  setSettings: (settings) => { save("rolax_settings", settings); set({ settings }); },
  setWebsites: (websites) => { save("rolax_websites", websites); set({ websites }); },
  setPayments: (payments) => { save("rolax_payments", payments); set({ payments }); },
  setTickets: (tickets) => { save("rolax_tickets", tickets); set({ tickets }); },
  setUsers: (users) => {
    // User rows are merge-preserved: an admin update or a temporary empty
    // state can never silently delete a previously seen account.
    const merged = saveUsers(users as unknown as PersistentUser[]) as UserType[];
    set({ users: merged });
    void syncUsersToServer(merged).catch(() => {});
  },

  hydrate: () => {
    if (get().hydrated) return;
    if (typeof window !== "undefined") {
      // admin panel change kare to doosre tab/page pe turant sync
      if (!(window as any).__rolaxSyncBound) {
        (window as any).__rolaxSyncBound = true;
        const sync = () => {
          const s = get() as any;
          const next: any = {};
          ["plans", "features", "settings", "websites", "payments", "tickets", "stacks", "wallets"].forEach(k => {
            const raw = localStorage.getItem("rolax_" + k);
            if (raw) { try { next[k] = JSON.parse(raw); } catch {} }
          });
          const localUsers = loadUsers();
          if (localUsers.length) next.users = localUsers;
          if (Object.keys(next).length) set(next);
        };
        window.addEventListener("storage", sync);
        window.addEventListener("focus", sync);
        window.addEventListener("rolax:sync", sync);
      }
    }
    const plans = sanitizePlans(load<any>("rolax_plans", defaultPlans));
    const stacks = load<Stack[]>("rolax_stacks", defaultStacks);
    const wallets = sanitizeWallets(load<any>("rolax_wallets", defaultWallets));
    const rawSettings = load<any>("rolax_settings", defaultSettings);
    const settings: SiteSettings = {
      ...defaultSettings,
      ...(rawSettings || {}),
      usdToInr: num(rawSettings?.usdToInr) || defaultSettings.usdToInr,
    };
    const websites = sanitizeWebsites(load<any>("rolax_websites", []));
    const payments = load<Payment[]>("rolax_payments", []);
    const tickets = load<Ticket[]>("rolax_tickets", []);
    const users = loadUsers() as UserType[];
    const features = load<FeatureDef[]>("rolax_features", DEFAULT_FEATURES);
    // NOTE: koi dummy/demo data nahi — jo user khud kamayega wahi revenue me dikhega

    set({ plans, stacks, wallets, settings, features: features.length ? features : DEFAULT_FEATURES, websites, payments, tickets, users, hydrated: true });
    // A configured database is the durable source of truth. Merge it into the
    // browser cache; never replace local rows with an empty/error response.
    void loadServerUsers().then(result => {
      if (!result.ok || !result.durable || !result.users?.length) return;
      const merged = saveUsers([...loadUsers(), ...result.users]) as UserType[];
      set({ users: merged });
    }).catch(() => {});
  },
}));

export const ADMIN_EMAIL = "yanshkumar9090@gmail.com";
export const ADMIN_PASSWORD = "ROLAX@11";
