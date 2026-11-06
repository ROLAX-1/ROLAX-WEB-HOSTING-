"use client";

import { useEffect } from "react";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Admin panel error", error); }, [error]);
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <section className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-[#111] p-6 text-center">
        <p className="text-3xl">⚠️</p>
        <h1 className="mt-3 text-xl font-bold">Admin panel temporarily stuck</h1>
        <p className="mt-2 text-sm text-[#aaa]">Page ko reload kiye bina safe recovery try karo. Aapke saved settings delete nahi honge.</p>
        <div className="mt-5 flex justify-center gap-2">
          <button onClick={() => reset()} className="rounded-full bg-white px-5 py-2 text-sm font-medium text-black">Retry panel</button>
          <button onClick={() => window.location.reload()} className="rounded-full border border-[#333] bg-black px-5 py-2 text-sm">Hard reload</button>
        </div>
      </section>
    </main>
  );
}
