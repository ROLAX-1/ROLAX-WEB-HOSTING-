"use client";
import { useEffect, useState } from "react";

type Toast = { id: number; message: string; type: "success" | "error" | "info" };

let pushToastFn: (m: string, t?: Toast["type"]) => void = () => {};

export function toast(message: string, type: Toast["type"] = "info") {
  pushToastFn(message, type);
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    pushToastFn = (message, type = "info") => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev.slice(-2), { id, message, type }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2600);
    };
    setReady(true);
  }, []);

  if (!ready) return null;

  return (
    <div className="fixed top-[70px] right-3 z-[9999] flex flex-col items-end gap-1.5 w-[300px] max-w-[calc(100vw-1.5rem)] pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-3 py-2 rounded-lg text-[11px] leading-snug font-medium border backdrop-blur-xl shadow-lg ${
            t.type === "success" ? "bg-[#00ff88]/10 border-[#00ff88]/20 text-white" :
            t.type === "error" ? "bg-red-500/10 border-red-500/20 text-white" :
            "bg-[#111] border-[#222] text-white"
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
