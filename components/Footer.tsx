"use client";
import { useStore } from "@/lib/store";

export default function Footer() {
  const { settings } = useStore();
  return (
    <footer className="border-t border-[#222] bg-black">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-12">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <img src="/images/rolax-hero-new.jpg" alt="ROLAX HOST" className="w-9 h-9 rounded-full object-cover border border-[#222] bg-black shadow-glow" />
              <span className="font-grotesk font-bold">{settings.logoText}</span>
            </div>
            <p className="text-sm text-[#888] leading-relaxed">{settings.footerText}</p>
            <a href="https://t.me/Rolax112" target="_blank" className="inline-flex mt-4 px-5 py-2.5 rounded-full bg-gradient-to-r from-[#6C5CE7] to-[#00D4FF] text-white text-sm font-medium hover:opacity-90 transition">Telegram @Rolax112</a>
            <p className="text-xs text-[#666] mt-2">{settings.contactNote}</p>
          </div>
          <div>
            <h4 className="font-grotesk font-semibold mb-3">Product</h4>
            <ul className="space-y-2 text-sm text-[#888]">
              <li><a href="#features" className="hover:text-white">Features</a></li>
              <li><a href="#pricing" className="hover:text-white">Pricing</a></li>
              <li><a href="#pricing" className="hover:text-white">Deploy Bot</a></li>
              <li><a href="#" className="hover:text-white">Status: All Systems Operational</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-grotesk font-semibold mb-3">Contact</h4>
            <ul className="space-y-2 text-sm text-[#888]">
              <li><a href="https://t.me/Rolax112" target="_blank" className="text-[#00D4FF] hover:underline">Telegram Only: t.me/Rolax112</a></li>
              <li className="text-xs text-[#666]">Baat sirf Telegram par hi ho sakta hai</li>
              <li><a href="#" className="hover:text-white">Support Ticket</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-grotesk font-semibold mb-3">Legal</h4>
            <ul className="space-y-2 text-sm text-[#888]">
              <li><a href="#" className="hover:text-white">Privacy</a></li>
              <li><a href="#" className="hover:text-white">Terms</a></li>
              <li><a href="#" className="hover:text-white">Refund Policy</a></li>
            </ul>
          </div>
        </div>
        <div className="pt-8 border-t border-[#222] flex flex-col md:flex-row justify-between gap-4 text-sm text-[#666]">
          <span>© 2025 ROLAX HOST. All rights reserved. Contact only via Telegram.</span>
          <span>Built with ❤️ • Hosted on ROLAX HOST</span>
        </div>
      </div>
    </footer>
  );
}
