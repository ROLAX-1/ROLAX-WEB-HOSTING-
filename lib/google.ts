"use client";
import { useEffect, useState } from "react";
import { setAuth } from "./auth";

const CLIENT_ID_KEY = "rolax_google_client_id";
const STORAGE_KEY = "rolax_google_pending";
// Public OAuth client for ROLAX HOST (overridable from admin panel or env)
const DEFAULT_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

export function getGoogleClientId(): string {
  if (typeof window === "undefined") return DEFAULT_CLIENT_ID;
  return localStorage.getItem(CLIENT_ID_KEY) || DEFAULT_CLIENT_ID;
}

export function setGoogleClientId(id: string) {
  if (typeof window !== "undefined") localStorage.setItem(CLIENT_ID_KEY, id.trim());
}

export function decodeJwt(token: string): any {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(payload)
        .split("")
        .map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export type GoogleProfile = { name: string; email: string; picture?: string; sub?: string };

/** Google account se login karo (GIS if configured, warna Google chooser popup) */
export function signInWithGoogle(onDone: (profile: GoogleProfile) => void, onError: (msg: string) => void) {
  if (typeof window === "undefined") return;

  const clientId = getGoogleClientId();
  if (clientId && (window as any).google?.accounts?.id) {
    try {
      (window as any).google.accounts.id.initialize({
        client_id: clientId,
        callback: (res: any) => {
          const p = decodeJwt(res.credential);
          if (p?.email) onDone({ name: p.name || p.email.split("@")[0], email: p.email, picture: p.picture, sub: p.sub });
          else onError("Google credential padhne me dikkat aayi");
        },
      });
      (window as any).google.accounts.id.prompt();
      return;
    } catch {
      /* fall through to popup chooser */
    }
  }

  openGoogleChooser(onDone, onError);
}

/** Fallback: Google account chooser popup (koi client id ki zarurat nahi) */
export function openGoogleChooser(onDone: (profile: GoogleProfile) => void, onError: (msg: string) => void) {
  const origin = window.location.origin;
  const popup = window.open(
    "https://accounts.google.com/AccountChooser?continue=" + encodeURIComponent(origin + "/login?google=1"),
    "rolax_google_signin",
    "width=480,height=640,menubar=no,toolbar=no"
  );

  if (!popup) {
    onError("Popup block ho gaya — browser me popup allow karo ya email se login karo");
    return;
  }

  // Naya window jaise hi /login?google=1 load hoga, wahan se email localStorage me aa jayega.
  sessionStorage.setItem("rolax_google_flow", "1");

  const started = Date.now();
  const timer = window.setInterval(() => {
    try {
      if (popup.closed) {
        window.clearInterval(timer);
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          localStorage.removeItem(STORAGE_KEY);
          onDone(JSON.parse(raw));
        }
        return;
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        window.clearInterval(timer);
        localStorage.removeItem(STORAGE_KEY);
        popup.close();
        onDone(JSON.parse(raw));
      }
      if (Date.now() - started > 180000) {
        window.clearInterval(timer);
        popup.close();
      }
    } catch {
      /* ignore cross-origin access errors */
    }
  }, 800);
}

/** /login?google=1 par Google account ka email pakad ke parent flow ko de do */
export function useGoogleRedirectBridge(onProfile: (p: GoogleProfile) => void) {
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") !== "1") return;

    const clientId = getGoogleClientId();
    if (clientId) {
      // Real Google Identity Services: one tap / button render
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = () => {
        try {
          (window as any).google.accounts.id.initialize({
            client_id: clientId,
            callback: (res: any) => {
              const p = decodeJwt(res.credential);
              if (p?.email) onProfile({ name: p.name || p.email.split("@")[0], email: p.email, picture: p.picture, sub: p.sub });
            },
          });
          (window as any).google.accounts.id.prompt();
        } catch { /* ignore */ }
      };
      document.head.appendChild(script);
    }

    // Email based bridge (Google session se email khud bhar jata hai)
    setWaiting(true);
  }, [onProfile]);

  return { waiting };
}

export function completeGoogleSelection(profile: GoogleProfile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}
