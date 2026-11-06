"use client";

import { useEffect } from "react";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Dashboard error", error); }, [error]);
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <section className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-[#111] p-6 text-center">
        <p className="text-3xl">⚠️</p>
        <h1 className="mt-3 text-xl font-bold">Dashboard temporarily stuck</h1>
        <p className="mt-2 text-sm text-[#aaa]">Retry karne se session ya deployed files delete nahi hoti.</p>
        <div className="mt-5 flex justify-center gap-2">
          <button onClick={() => reset()} className="rounded-full bg-white px-5 py-2 text-sm font-medium text-black">Retry</button>
          <button onClick={() => window.location.reload()} className="rounded-full border border-[#333] bg-black px-5 py-2 text-sm">Reload</button>
        </div>
      </section>
    </main>
  );
}
