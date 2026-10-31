"use client";
import { create } from "zustand";

export type Plan = {
  id: string;
  name: string;
  price: number;
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

export type CryptoWallet = {
  id: string;
  name: string;
  symbol: string;
  address: string;
  network: string;
};

export type UserType = {
  id: string;
  name: string;
  email: string;
  planId?: string;
  planExpiry?: string;
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
  deployedAt?: string;
  fileSize?: string;
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
};

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

type Store = {
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
  setUsers: (users) => { save("rolax_users", users); set({ users }); },

  hydrate: () => {
    if (get().hydrated) return;
    const plans = load<Plan[]>("rolax_plans", defaultPlans);
    const stacks = load<Stack[]>("rolax_stacks", defaultStacks);
    const wallets = load<CryptoWallet[]>("rolax_wallets", defaultWallets);
    const settings = load<SiteSettings>("rolax_settings", defaultSettings);
    const websites = load<Website[]>("rolax_websites", []);
    const payments = load<Payment[]>("rolax_payments", []);
    const tickets = load<Ticket[]>("rolax_tickets", []);
    const users = load<UserType[]>("rolax_users", []);
    // seed dummy data if empty
    let seededWebsites = websites;
    let seededPayments = payments;
    let seededTickets = tickets;
    let seededUsers = users;

    if (websites.length === 0) {
      seededWebsites = [
        { id: "ws1", userId: "demo1", name: "my-portfolio", url: "my-portfolio.rolax.host", stack: "HTML", status: "Running", cpu: 34, ram: 42, fileType: "HTML Website", botType: "Static Site", errorCount: 0, deployedAt: new Date().toISOString(), fileSize: "2.4 MB", createdAt: new Date().toISOString() },
        { id: "ws2", userId: "demo1", name: "api-backend", url: "api-backend.rolax.host", stack: "Node.js", status: "Running", cpu: 67, ram: 58, fileType: "Node.js Bot", botType: "Discord Bot", errorCount: 0, deployedAt: new Date().toISOString(), fileSize: "15.2 MB", createdAt: new Date().toISOString() },
        { id: "ws3", userId: "demo1", name: "telegram-bot", url: "telegram-bot.rolax.host", stack: "Python", status: "Error", cpu: 12, ram: 18, fileType: "Python Bot", botType: "Telegram Bot", errorCount: 3, lastError: "ModuleNotFoundError: No module named 'telebot'", deployedAt: new Date().toISOString(), fileSize: "8.1 MB", createdAt: new Date().toISOString() },
      ];
    }
    if (payments.length === 0) {
      seededPayments = [
        { id: "pay1", userId: "u2", userEmail: "alex@example.com", planId: "plan_pro", planName: "Pro Hosting", amount: 4.99, coin: "USDT", txid: "0x9a3f...c4e2", status: "pending", createdAt: new Date().toISOString() },
      ];
    }
    if (tickets.length === 0) {
      seededTickets = [
        { id: "t1", userId: "u2", userEmail: "alex@example.com", subject: "Deployment failed", message: "My Python app is not deploying, shows error 500", status: "open", replies: [], createdAt: new Date().toISOString() },
      ];
    }
    if (users.length === 0) {
      seededUsers = [
        { id: "u1", name: "Demo User", email: "demo@rolax.host", planId: "plan_pro", planExpiry: new Date(Date.now() + 30*24*3600000).toISOString(), status: "active", createdAt: new Date().toISOString() },
        { id: "u2", name: "Alex Morgan", email: "alex@example.com", status: "active", createdAt: new Date().toISOString() },
        { id: "u3", name: "Sarah Chen", email: "sarah@example.com", planId: "plan_enterprise", planExpiry: new Date(Date.now() + 60*24*3600000).toISOString(), status: "active", createdAt: new Date().toISOString() },
      ];
    }

    set({ plans, stacks, wallets, settings, websites: seededWebsites, payments: seededPayments, tickets: seededTickets, users: seededUsers, hydrated: true });
    // persist seeds
    save("rolax_websites", seededWebsites);
    save("rolax_payments", seededPayments);
    save("rolax_tickets", seededTickets);
    save("rolax_users", seededUsers);
  },
}));

export const ADMIN_EMAIL = "yanshkumar9090@gmail.com";
export const ADMIN_PASSWORD = "ROLAX@11";
