"use client";
import { useStore } from "@/lib/store";
import { motion } from "framer-motion";

export default function Features() {
  const { settings } = useStore();

  return (
    <section id="features" className="py-16 md:py-20 bg-[#050505] border-y border-[#222]">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="font-grotesk text-[28px] md:text-[40px] font-bold">Everything you need to ship</h2>
          <p className="mt-3 text-[#888]">Developer experience inspired by Vercel and Linear — fast, clean, and powerful.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {settings.features.map((f, idx) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.08 }}
              className="rounded-2xl bg-[#111] border border-[#222] p-6 hover:border-[#6C5CE7]/30 hover:shadow-glow transition group"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6C5CE7]/20 to-[#00D4FF]/20 border border-[#6C5CE7]/20 flex items-center justify-center text-lg group-hover:scale-105 transition">
                {f.icon}
              </div>
              <h3 className="mt-4 font-grotesk font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-[#888] leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-12 md:mt-16 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h3 className="font-grotesk text-2xl md:text-3xl font-bold">{settings.whyUsTitle}</h3>
            <p className="mt-3 text-[#888] leading-relaxed">{settings.whyUsDesc}</p>
            <ul className="mt-6 space-y-3">
              {settings.whyUsPoints.map((p) => (
                <li key={p} className="flex items-center gap-3 text-sm text-[#ccc]">
                  <span className="w-6 h-6 rounded-full bg-[#6C5CE7]/15 flex items-center justify-center text-[#6C5CE7] text-xs">✓</span> {p}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-[#111] border border-[#222] p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium">Usage Overview</span>
              <span className="text-xs px-2 py-1 rounded-full bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20">Live</span>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs text-[#888] mb-1"><span>CPU Usage</span><span>67%</span></div>
                <div className="h-2 rounded-full bg-black border border-[#222] overflow-hidden"><div className="h-full w-[67%] bg-gradient-to-r from-[#6C5CE7] to-[#00D4FF]" /></div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-[#888] mb-1"><span>Memory</span><span>1.2 GB / 2 GB</span></div>
                <div className="h-2 rounded-full bg-black border border-[#222] overflow-hidden"><div className="h-full w-[60%] bg-gradient-to-r from-[#6C5CE7] to-[#00D4FF]" /></div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-[#888] mb-1"><span>Bandwidth</span><span>42 GB / 100 GB</span></div>
                <div className="h-2 rounded-full bg-black border border-[#222] overflow-hidden"><div className="h-full w-[42%] bg-gradient-to-r from-[#6C5CE7] to-[#00D4FF]" /></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
