"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { setAuth, getAuth } from "@/lib/auth";
import { ADMIN_EMAIL, ADMIN_PASSWORD, useStore } from "@/lib/store";
import { toast } from "@/components/ui/Toaster";
import { signInWithGoogle, decodeJwt, getGoogleClientId, useGoogleRedirectBridge, completeGoogleSelection, type GoogleProfile } from "@/lib/google";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [bridgeMode, setBridgeMode] = useState(false);
  const [bridgeEmail, setBridgeEmail] = useState("");
  const hydrate = useStore((s) => s.hydrate);

  useEffect(() => { hydrate(); }, [hydrate]);

  const finishGoogle = useCallback((profile: GoogleProfile) => {
    const isAdmin = profile.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    setAuth({ id: (profile.sub || "g_" + profile.email).slice(0, 40), name: profile.name, email: profile.email, isAdmin });
    if (typeof window !== "undefined") {
      localStorage.setItem("rolax_google_profile", JSON.stringify(profile));
      localStorage.setItem("rolax_login_method", "google");
    }
    toast(`Signed in with Google: ${profile.email}`, "success");
    router.push(isAdmin ? "/admin" : "/dashboard");
  }, [router]);

  // /login?google=1 -> popup window me Google bridge chalega
  useGoogleRedirectBridge(useCallback((p: GoogleProfile) => {
    completeGoogleSelection(p);
    window.close();
  }, []));

  useEffect(() => {
    if (typeof window === "undefined") return;
    setBridgeMode(new URLSearchParams(window.location.search).get("google") === "1");
  }, []);

  const handleGoogle = () => {
    setGoogleLoading(true);
    signInWithGoogle(
      (profile) => { setGoogleLoading(false); finishGoogle(profile); },
      (msg) => { setGoogleLoading(false); toast(msg, "error"); }
    );
    setTimeout(() => setGoogleLoading(false), 20000);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    setTimeout(() => {
      // Check admin credentials
      if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        setAuth({ id: "admin_001", name: "ROLAX Admin", email, isAdmin: true });
        toast("Welcome back, Admin!", "success");
        router.push("/admin");
        setLoading(false);
        return;
      }

      // Check existing users from localStorage
      try {
        const users = JSON.parse(localStorage.getItem("rolax_users") || "[]");
        const found = users.find((u: any) => u.email === email);
        // Also check if there's a registered user via register page (stored separately)
        const registered = JSON.parse(localStorage.getItem("rolax_registered") || "[]");
        const regFound = registered.find((u: any) => u.email === email && u.password === password);

        if (regFound || found) {
          // If found but password check needed - for demo allow any password for non-admin if user exists, or check regFound
          if (regFound || found) {
            const name = regFound?.name || found?.name || email.split("@")[0];
            // Simple password validation: if regFound exists, password already matched. If only in users list, accept.
            setAuth({ id: found?.id || regFound?.id || "u_" + Date.now(), name, email, isAdmin: false });
            toast("Login successful!", "success");
            router.push("/dashboard");
            setLoading(false);
            return;
          }
        }
        // For demo: allow any non-admin login to create session
        if (email && password.length >= 3) {
          // Check if email exists in registered, if password mismatch -> error
          if (registered.find((u: any) => u.email === email && u.password !== password)) {
            toast("Invalid password", "error");
            setLoading(false);
            return;
          }
          setAuth({ id: "u_" + Date.now(), name: email.split("@")[0], email, isAdmin: false });
          toast("Login successful!", "success");
          router.push("/dashboard");
        } else {
          toast("Invalid credentials", "error");
        }
      } catch {
        toast("Login failed", "error");
      }
      setLoading(false);
    }, 600);
  };

  // ---- Google popup bridge screen (/login?google=1) ----
  if (bridgeMode) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="w-full max-w-[420px] rounded-2xl bg-white border border-[#dadce0] p-8 shadow-sm">
          <div className="flex items-center justify-center gap-2 mb-6">
            <svg width="24" height="24" viewBox="0 0 48 48" aria-hidden>
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.8 6.1C12.2 13.3 17.6 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.1 24.5c0-1.6-.15-3.1-.43-4.5H24v9h12.4c-.54 2.9-2.2 5.4-4.7 7l7.6 5.9c4.4-4.1 6.8-10.1 6.8-17.4z"/>
              <path fill="#FBBC05" d="M10.3 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.8-6.1C.9 16.3 0 20 0 24s.9 7.7 2.5 10.7l7.8-6.1z"/>
              <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.3-5.6l-7.6-5.9c-2.1 1.4-4.8 2.3-7.7 2.3-6.4 0-11.8-3.8-13.7-9.2l-7.8 6.1C6.4 42.6 14.6 48 24 48z"/>
            </svg>
            <span className="text-sm text-[#3c4043] font-medium">Sign in with Google</span>
          </div>

          <h1 className="text-lg font-medium text-[#202124]">Choose an account</h1>
          <p className="text-sm text-[#5f6368] mt-1">to continue to <span className="font-medium">ROLAX HOST</span></p>

          {bridgeEmail ? (
            <div className="mt-6 rounded-xl border border-[#dadce0] p-4">
              <p className="text-xs text-[#5f6368]">Selected account</p>
              <p className="text-sm font-medium text-[#202124] mt-1 break-all">{bridgeEmail}</p>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => {
                    completeGoogleSelection({ name: bridgeEmail.split("@")[0], email: bridgeEmail });
                    window.close();
                  }}
                  className="flex-1 py-2.5 rounded-full bg-[#1a73e8] text-white text-sm font-medium"
                >
                  Continue
                </button>
                <button onClick={() => setBridgeEmail("")} className="px-4 py-2.5 rounded-full border border-[#dadce0] text-sm text-[#3c4043]">Back</button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); if (bridgeEmail.trim()) return; }}
              className="mt-6"
            >
              <input
                value={bridgeEmail}
                onChange={(e) => setBridgeEmail(e.target.value)}
                type="email"
                autoFocus
                placeholder="your.name@gmail.com"
                className="w-full px-4 py-3 rounded-lg border border-[#dadce0] text-sm text-[#202124] focus:outline-none focus:border-[#1a73e8]"
              />
              <button
                type="button"
                onClick={() => {
                  if (!bridgeEmail.trim()) return;
                  completeGoogleSelection({ name: bridgeEmail.split("@")[0], email: bridgeEmail.trim() });
                  window.close();
                }}
                className="mt-3 w-full py-2.5 rounded-full bg-[#1a73e8] text-white text-sm font-medium disabled:opacity-50"
                disabled={!bridgeEmail.trim()}
              >
                Next
              </button>
              <p className="text-[11px] text-[#5f6368] mt-3">
                Ye window Google account chooser se khuli hai. Apna Gmail daalo — parent tab me automatic sign in ho jayega.
              </p>
            </form>
          )}

          <button onClick={() => { window.location.href = "/login"; }} className="mt-5 text-xs text-[#1a73e8]">← Email se sign in karein</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-30" />
      <div className="absolute -top-32 -left-32 w-[600px] h-[600px] bg-[#6C5CE7] rounded-full glow-orb" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-[#00D4FF] rounded-full glow-orb" />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-[420px]">
        <Link href="/" className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6C5CE7] to-[#00D4FF] flex items-center justify-center font-bold text-sm">R</div>
          <span className="font-grotesk font-bold text-lg">ROLAX HOST</span>
        </Link>

        <div className="rounded-2xl bg-[#111] border border-[#222] p-6 md:p-8 shadow-2xl">
          <h1 className="font-grotesk text-2xl font-bold">Welcome back</h1>
          <p className="text-sm text-[#888] mt-1">Sign in to your hosting dashboard</p>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label className="text-xs text-[#888]">Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" required className="mt-1 w-full px-4 py-3 rounded-xl bg-black border border-[#222] text-sm placeholder:text-[#555] focus:outline-none focus:border-[#6C5CE7]/50" />
            </div>
            <div>
              <label className="text-xs text-[#888]">Password</label>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" required className="mt-1 w-full px-4 py-3 rounded-xl bg-black border border-[#222] text-sm placeholder:text-[#555] focus:outline-none focus:border-[#6C5CE7]/50" />
            </div>

            <button type="submit" disabled={loading} className="w-full py-3 rounded-full bg-white text-black font-medium text-sm hover:bg-zinc-100 transition disabled:opacity-50">
              {loading ? "Signing in..." : "Sign in →"}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-[#222]" />
            <span className="text-[11px] text-[#666] uppercase tracking-wider">or</span>
            <div className="h-px flex-1 bg-[#222]" />
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            className="w-full py-3 rounded-full bg-white text-black font-medium text-sm flex items-center justify-center gap-3 hover:bg-zinc-100 transition disabled:opacity-60"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.8 6.1C12.2 13.3 17.6 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.1 24.5c0-1.6-.15-3.1-.43-4.5H24v9h12.4c-.54 2.9-2.2 5.4-4.7 7l7.6 5.9c4.4-4.1 6.8-10.1 6.8-17.4z"/>
              <path fill="#FBBC05" d="M10.3 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.8-6.1C.9 16.3 0 20 0 24s.9 7.7 2.5 10.7l7.8-6.1z"/>
              <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.3-5.6l-7.6-5.9c-2.1 1.4-4.8 2.3-7.7 2.3-6.4 0-11.8-3.8-13.7-9.2l-7.8 6.1C6.4 42.6 14.6 48 24 48z"/>
            </svg>
            {googleLoading ? "Connecting to Google..." : "Continue with Google"}
          </button>
          <p className="text-center text-[11px] text-[#666] mt-2">
            Google account se instant sign in — password ki zarurat nahi
          </p>

          <p className="text-center text-sm text-[#888] mt-6">
            Don&apos;t have an account? <Link href="/register" className="text-white hover:underline">Create account</Link>
          </p>
          <p className="text-center mt-3">
            <Link href="/" className="text-xs text-[#666] hover:text-white">← Back to home</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
