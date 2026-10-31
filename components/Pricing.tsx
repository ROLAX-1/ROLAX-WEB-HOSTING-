"use client";
import { useStore } from "@/lib/store";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

export default function Pricing() {
  const { plans } = useStore();

  return (
    <section id="pricing" className="py-16 md:py-24 bg-black relative">
      <div className="absolute inset-0 grid-bg opacity-20" />
      <div className="relative max-w-7xl mx-auto px-4 md:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="font-grotesk text-[28px] md:text-[42px] font-bold">Simple, transparent pricing</h2>
          <p className="mt-3 text-[#888]">Start free, scale when you need. No hidden fees. Crypto payments supported.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan, idx) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className={`relative rounded-2xl p-6 md:p-8 flex flex-col ${plan.popular ? "bg-gradient-to-b from-[#111] to-[#111] border border-[#6C5CE7]/40 shadow-glow" : "bg-[#111] border border-[#222]"} hover:border-[#6C5CE7]/30 transition`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-[#6C5CE7] to-[#00D4FF] text-white text-xs font-semibold">
                  Most Popular
                </div>
              )}

              <h3 className="font-grotesk font-semibold text-lg">{plan.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-bold">${plan.price}</span>
                <span className="text-[#888] text-sm">/month</span>
              </div>
              <div className="mt-2 flex gap-2 text-xs">
                <span className="px-2 py-1 rounded-full bg-black border border-[#222] text-[#888]">{plan.ram} RAM</span>
                <span className="px-2 py-1 rounded-full bg-black border border-[#222] text-[#888]">{plan.cpu}</span>
              </div>

              <ul className="mt-6 space-y-3 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-[#ccc]">
                    <span className="w-5 h-5 rounded-full bg-[#00ff88]/10 border border-[#00ff88]/20 flex items-center justify-center flex-shrink-0">
                      <Check size={12} className="text-[#00ff88]" />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href="/register"
                className={`mt-8 w-full py-3 rounded-full text-sm font-medium text-center transition ${plan.popular ? "bg-white text-black hover:bg-zinc-100" : "bg-[#1a1a1a] border border-[#222] text-white hover:bg-[#222]"}`}
              >
                {plan.price === 0 ? "Start Free" : "Get Started"}
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
