"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getAuth, clearAuth, AuthUser } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { useRouter } from "next/navigation";

export default function Navbar() {
  const { settings } = useStore();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setUser(getAuth());
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all ${scrolled ? "bg-black/80 backdrop-blur-xl border-b border-[#222]" : "bg-transparent border-b border-transparent"}`}>
      <div className="max-w-7xl mx-auto px-4 md:px-6 h-[64px] flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <img src="/images/rolax-logo-new.jpg" alt="ROLAX HOST" className="w-10 h-10 rounded-xl object-cover border border-[#222] bg-black" />
          <span className="font-grotesk font-bold text-[18px] tracking-tight">{settings.logoText}</span>
          <span className="hidden md:inline text-[10px] bg-[#111] border border-[#222] px-2 py-1 rounded-full text-[#888] ml-2">BETA</span>
        </Link>

        <div className="hidden md:flex items-center gap-8 text-sm text-[#888]">
          <a href="#features" className="hover:text-white transition">Features</a>
          <a href="#pricing" className="hover:text-white transition">Pricing</a>
          <a href="#faq" className="hover:text-white transition">FAQ</a>
          <a href={`https://t.me/${settings.footerTelegram.replace("@","")}`} target="_blank" className="hover:text-white transition">Telegram</a>
        </div>

        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <>
              <Link href={user.isAdmin ? "/admin" : "/dashboard"} className="px-4 py-2 rounded-full bg-white text-black text-sm font-medium hover:bg-zinc-200 transition">
                Dashboard
              </Link>
              <button onClick={() => { clearAuth(); setUser(null); router.push("/"); }} className="px-4 py-2 rounded-full bg-[#111] border border-[#222] text-sm hover:border-[#333] transition">Logout</button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm text-[#888] hover:text-white px-3 py-2">Log in</Link>
              <Link href="/register" className="px-5 py-2 rounded-full bg-white text-black text-sm font-medium hover:bg-zinc-200 transition">Sign up</Link>
            </>
          )}
        </div>

        <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden w-9 h-9 rounded-xl bg-[#111] border border-[#222] flex items-center justify-center">
          <div className="w-4 flex flex-col gap-1">
            <span className={`h-[2px] bg-white rounded transition ${mobileOpen ? "rotate-45 translate-y-[3px]" : ""}`} />
            <span className={`h-[2px] bg-white rounded transition ${mobileOpen ? "-rotate-45 -translate-y-[3px]" : ""}`} />
          </div>
        </button>
      </div>

      {mobileOpen && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="md:hidden bg-black border-t border-[#222] px-4 py-4 flex flex-col gap-3">
          <a href="#features" className="text-[#888] py-2">Features</a>
          <a href="#pricing" className="text-[#888] py-2">Pricing</a>
          <a href="#faq" className="text-[#888] py-2">FAQ</a>
          {user ? (
            <Link href={user.isAdmin ? "/admin" : "/dashboard"} className="mt-2 px-5 py-3 rounded-full bg-white text-black text-center font-medium">Dashboard</Link>
          ) : (
            <>
              <Link href="/login" className="px-5 py-3 rounded-full bg-[#111] border border-[#222] text-center">Log in</Link>
              <Link href="/register" className="px-5 py-3 rounded-full bg-white text-black text-center font-medium">Get Started</Link>
            </>
          )}
        </motion.div>
      )}
    </nav>
  );
}
