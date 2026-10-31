"use client";
import { useStore } from "@/lib/store";

export default function Footer() {
  const { settings } = useStore();
  return (
    <footer className="border-t border-[#222] bg-black">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-12">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6C5CE7] to-[#00D4FF] flex items-center justify-center font-bold text-sm">R</div>
              <span className="font-grotesk font-bold">{settings.logoText}</span>
            </div>
            <p className="text-sm text-[#888] leading-relaxed">{settings.footerText}</p>
            <a href={`https://t.me/${settings.footerTelegram.replace("@","")}`} target="_blank" className="inline-flex mt-4 px-4 py-2 rounded-full bg-[#111] border border-[#222] text-sm hover:border-[#6C5CE7]/50 transition">Telegram {settings.footerTelegram}</a>
          </div>
          <div>
            <h4 className="font-grotesk font-semibold mb-3">Product</h4>
            <ul className="space-y-2 text-sm text-[#888]">
              <li><a href="#features" className="hover:text-white">Features</a></li>
              <li><a href="#pricing" className="hover:text-white">Pricing</a></li>
              <li><a href="#" className="hover:text-white">Changelog</a></li>
              <li><a href="#" className="hover:text-white">Docs</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-grotesk font-semibold mb-3">Company</h4>
            <ul className="space-y-2 text-sm text-[#888]">
              <li><a href="#" className="hover:text-white">About</a></li>
              <li><a href="#" className="hover:text-white">Blog</a></li>
              <li><a href="#" className="hover:text-white">Careers</a></li>
              <li><a href="#" className="hover:text-white">Contact</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-grotesk font-semibold mb-3">Legal</h4>
            <ul className="space-y-2 text-sm text-[#888]">
              <li><a href="#" className="hover:text-white">Privacy</a></li>
              <li><a href="#" className="hover:text-white">Terms</a></li>
              <li><a href="#" className="hover:text-white">Support</a></li>
            </ul>
          </div>
        </div>
        <div className="pt-8 border-t border-[#222] flex flex-col md:flex-row justify-between gap-4 text-sm text-[#666]">
          <span>© 2025 ROLAX HOST. All rights reserved. Crafted for developers.</span>
          <span>Built with ❤️ • Hosted on ROLAX HOST</span>
        </div>
      </div>
    </footer>
  );
}
