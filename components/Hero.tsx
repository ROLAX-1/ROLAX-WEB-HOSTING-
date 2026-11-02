"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { useStore } from "@/lib/store";

export default function Hero() {
  const { settings } = useStore();

  return (
    <section className="relative overflow-hidden pb-16 md:pb-24" style={{ paddingTop: "calc(var(--banner-h, 0px) + 6rem)" }}>
      {/* grid background */}
      <div className="absolute inset-0 grid-bg opacity-50" />
      {/* glow orbs */}
      <div className="absolute -top-32 -left-32 w-[600px] h-[600px] bg-[#6C5CE7] rounded-full glow-orb" />
      <div className="absolute -top-20 right-0 w-[500px] h-[500px] bg-[#00D4FF] rounded-full glow-orb" />

      <div className="relative max-w-7xl mx-auto px-4 md:px-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#111] border border-[#222] text-xs text-[#888] mb-6">
            <span className="w-2 h-2 rounded-full bg-[#00D4FF] animate-pulse" />
            {settings.heroBadge}
          </div>

          <h1 className="font-grotesk text-[36px] md:text-[64px] font-bold leading-[1.05] tracking-tight">
            {settings.heroTitle.split(" ").slice(0, 3).join(" ")}{" "}
            <span className="gradient-text">{settings.heroTitle.split(" ").slice(3).join(" ")}</span>
          </h1>

          <p className="mt-6 text-[15px] md:text-[18px] text-[#888] leading-relaxed max-w-2xl mx-auto">
            {settings.heroSubtitle}
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/register" className="w-full sm:w-auto px-8 py-3 rounded-full bg-white text-black font-medium text-sm hover:bg-zinc-100 transition flex items-center justify-center gap-2">
              {settings.ctaText} <span>→</span>
            </Link>
            <Link href="#pricing" className="w-full sm:w-auto px-8 py-3 rounded-full bg-[#111] border border-[#222] text-sm font-medium hover:border-[#333] transition">
              View Pricing
            </Link>
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-[#666]">
            <span className="flex -space-x-2">
              <span className="w-6 h-6 rounded-full bg-[#222] border-2 border-black" />
              <span className="w-6 h-6 rounded-full bg-[#333] border-2 border-black" />
              <span className="w-6 h-6 rounded-full bg-[#444] border-2 border-black" />
            </span>
            <span>Trusted by 50,000+ developers • 4.9/5 rating</span>
          </div>
        </motion.div>

        {/* Terminal mock */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.7 }} className="mt-14 max-w-4xl mx-auto">
          <div className="rounded-2xl bg-[#111] border border-[#222] overflow-hidden shadow-2xl">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#222] bg-black/50">
              <span className="w-3 h-3 rounded-full bg-red-500/80" />
              <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <span className="w-3 h-3 rounded-full bg-green-500/80" />
              <span className="ml-3 text-xs text-[#666] font-mono">rolax deploy — production</span>
              <span className="ml-auto text-xs px-2 py-1 rounded-full bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20">● Live</span>
            </div>
            <div className="p-6 font-mono text-xs md:text-sm leading-6">
              <div className="text-[#888]"><span className="text-[#6C5CE7]">$</span> rolax deploy --prod</div>
              <div className="text-white mt-2">✔ Building project... <span className="text-[#00ff88]">done in 1.2s</span></div>
              <div className="text-white">✔ Uploading files... <span className="text-[#00ff88]">42 files</span></div>
              <div className="text-white">✔ Deploying to edge... <span className="text-[#00ff88]">300 regions</span></div>
              <div className="mt-3 p-3 rounded-xl bg-black border border-[#222] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-[#00D4FF]">https://my-app.rolax.host</span>
                <span className="text-[#888] text-xs">Deployed in 2.4s ⚡</span>
              </div>
              <div className="mt-4 flex gap-2">
                <span className="px-3 py-1 rounded-full bg-[#6C5CE7]/20 text-[#a89bff] border border-[#6C5CE7]/30 text-xs">Node.js 20</span>
                <span className="px-3 py-1 rounded-full bg-[#00D4FF]/15 text-[#00D4FF] border border-[#00D4FF]/30 text-xs">Global CDN</span>
                <span className="px-3 py-1 rounded-full bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20 text-xs">SSL ✓</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Premium Hero Image - Single Large Cyber Showcase */}
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mt-12 max-w-3xl mx-auto">
          <div className="relative rounded-[2rem] overflow-hidden bg-black border border-[#222] p-2 md:p-3 shadow-2xl">
            <img src={settings?.heroImageUrl || settings?.logoUrl || "/images/rolax-hero-new.jpg"} alt={settings?.logoText || "ROLAX HOST"} className="w-full h-[380px] md:h-[480px] object-cover rounded-[1.5rem]" />
            <div className="absolute inset-2 md:inset-3 rounded-[1.5rem] bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
            <div className="absolute bottom-6 left-6 right-6 flex flex-wrap gap-2">
              <span className="px-3 py-1 rounded-full bg-black/70 backdrop-blur border border-[#222] text-xs text-white">Elite Hosting</span>
              <span className="px-3 py-1 rounded-full bg-black/70 backdrop-blur border border-[#222] text-xs text-[#00D4FF]">Global Network</span>
              <span className="px-3 py-1 rounded-full bg-black/70 backdrop-blur border border-[#222] text-xs text-[#00ff88]">● Live & Secure</span>
            </div>
          </div>
          <p className="text-center text-xs text-[#666] mt-3">Anonymous • Secure • Premium • Trusted by 50K+ Developers</p>
        </motion.div>

        {/* Logos */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-6 md:gap-10 opacity-30 text-xs tracking-widest">
          <span>NODE.JS</span><span>PYTHON</span><span>HTML</span><span>GITHUB</span><span>GITLAB</span><span>VERCEL</span>
        </div>
      </div>
    </section>
  );
}
