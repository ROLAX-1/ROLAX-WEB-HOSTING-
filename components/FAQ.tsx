"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";

export default function FAQ() {
  const { settings } = useStore();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="py-16 md:py-20">
      <div className="max-w-3xl mx-auto px-4 md:px-6">
        <h2 className="font-grotesk text-[28px] md:text-[36px] font-bold text-center">Frequently asked questions</h2>
        <div className="mt-8 space-y-3">
          {settings.faq.map((item, idx) => (
            <div key={idx} className="rounded-2xl bg-[#111] border border-[#222] overflow-hidden">
              <button onClick={() => setOpen(open === idx ? null : idx)} className="w-full text-left px-6 py-4 flex items-center justify-between gap-4">
                <span className="font-medium text-sm md:text-[15px]">{item.q}</span>
                <span className={`w-8 h-8 rounded-full bg-black border border-[#222] flex items-center justify-center text-[#888] transition ${open === idx ? "rotate-45" : ""}`}>+</span>
              </button>
              {open === idx && <div className="px-6 pb-4 text-sm text-[#888] leading-relaxed">{item.a}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
