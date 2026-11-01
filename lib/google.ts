"use client";
import { setAuth } from "./auth";

const CLIENT_ID_KEY = "rolax_google_client_id";
const DEFAULT_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

export function getGoogleClientId(): string {
  if (typeof window === "undefined") return DEFAULT_CLIENT_ID;
  return (localStorage.getItem(CLIENT_ID_KEY) || DEFAULT_CLIENT_ID || "").trim();
}

export function setGoogleClientId(id: string) {
  if (typeof window !== "undefined") localStorage.setItem(CLIENT_ID_KEY, id.trim());
}

export function hasRealGoogle(): boolean {
  return !!getGoogleClientId();
}

export type GoogleProfile = { name: string; email: string; picture?: string; sub?: string };

export function decodeJwt(token: string): any {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(
      decodeURIComponent(
        atob(payload)
          .split("")
          .map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      )
    );
  } catch {
    return null;
  }
}

let scriptPromise: Promise<boolean> | null = null;

/** Google Identity Services script load (idempotent, koi 404 nahi) */
export function loadGoogleScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if ((window as any).google?.accounts?.id) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-rolax-gsi="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(!!(window as any).google?.accounts?.id));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.rolaxGsi = "1";
    script.onload = () => resolve(!!(window as any).google?.accounts?.id);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  return scriptPromise;
}

/** Official Google button ko element me render karo (real Google OAuth) */
export async function renderGoogleButton(
  el: HTMLElement | null,
  onDone: (p: GoogleProfile) => void,
  onError: (msg: string) => void
): Promise<boolean> {
  const clientId = getGoogleClientId();
  if (!el || !clientId) return false;
  const ok = await loadGoogleScript();
  if (!ok) { onError("Google script load nahi hui — internet/domain check karo"); return false; }

  try {
    (window as any).google.accounts.id.initialize({
      client_id: clientId,
      ux_mode: "popup",
      callback: (res: any) => {
        const p = decodeJwt(res?.credential || "");
        if (p?.email) onDone({ name: p.name || p.email.split("@")[0], email: p.email, picture: p.picture, sub: p.sub });
        else onError("Google se email nahi mili — dobara try karo");
      },
    });
    el.innerHTML = "";
    (window as any).google.accounts.id.renderButton(el, {
      theme: "filled_blue",
      size: "large",
      text: "continue_with",
      shape: "pill",
      width: 300,
      logo_alignment: "left",
    });
    return true;
  } catch {
    onError("Google button render nahi hua — Client ID / Authorized origin check karo");
    return false;
  }
}

/** Google profile se local session banao (shared by both modes) */
export function finishGoogleLogin(profile: GoogleProfile, adminEmail: string) {
  const isAdmin = profile.email.toLowerCase() === adminEmail.toLowerCase();
  const id = (profile.sub || "g_" + profile.email).slice(0, 40);
  setAuth({ id, name: profile.name, email: profile.email, isAdmin });
  try {
    localStorage.setItem("rolax_google_profile", JSON.stringify(profile));
    localStorage.setItem("rolax_login_method", "google");
    const users = JSON.parse(localStorage.getItem("rolax_users") || "[]");
    if (!users.find((u: any) => u.email === profile.email)) {
      users.push({ id, name: profile.name, email: profile.email, status: "active", createdAt: new Date().toISOString() });
      localStorage.setItem("rolax_users", JSON.stringify(users));
    }
  } catch { /* ignore storage errors */ }
  return { isAdmin };
}

/** Email validate — Gmail/Google account format */
export function isValidGmailish(email: string) {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim());
}
