"use client";
import { useEffect, useState } from "react";

type Toast = { id: number; message: string; type: "success" | "error" | "info" };

let pushToastFn: (m: string, t?: Toast["type"]) => void = () => {};

export function toast(message: string, type: Toast["type"] = "info") {
  pushToastFn(message, type);
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    pushToastFn = (message, type = "info") => {
      const id = Date.now();
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
    };
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-xl text-sm font-medium border backdrop-blur-xl min-w-[280px] max-w-sm ${
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
