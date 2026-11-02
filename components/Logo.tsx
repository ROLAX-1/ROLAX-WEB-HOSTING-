"use client";
import { useStore } from "@/lib/store";

/** Ek hi jagah se logo + naam — Site Customizer me change karo, poori site pe badal jata hai */
export function useBrand() {
  const { settings } = useStore();
  return {
    name: settings?.logoText || "ROLAX HOST",
    logo: settings?.logoUrl || "/images/rolax-hero-new.jpg",
    accent: (settings as any)?.accentColor || "#6C5CE7",
    favicon: (settings as any)?.faviconUrl || "",
  };
}

export default function Logo({ size = 40, className = "", rounded = "rounded-full", showName = false, nameClass = "" }: {
  size?: number; className?: string; rounded?: string; showName?: boolean; nameClass?: string;
}) {
  const { name, logo } = useBrand();
  const isUrl = !!logo && (logo.startsWith("data:") || logo.startsWith("http") || logo.startsWith("/"));
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      {isUrl ? (
        <img
          src={logo}
          alt={name}
          width={size}
          height={size}
          style={{ width: size, height: size }}
          className={`object-cover border border-[#222] bg-black shadow-glow ${rounded} ${className}`}
        />
      ) : (
        <span
          style={{ width: size, height: size, background: "linear-gradient(135deg,#6C5CE7,#00D4FF)" }}
          className={`flex items-center justify-center font-bold text-black ${rounded} ${className}`}
        >
          {(logo || name || "R").slice(0, 1).toUpperCase()}
        </span>
      )}
      {showName && <span className={nameClass || "font-grotesk font-bold"}>{name}</span>}
    </span>
  );
}
