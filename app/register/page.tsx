"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { setAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { toast } from "@/components/ui/Toaster";
import { signInWithGoogle, type GoogleProfile } from "@/lib/google";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const [googleLoading, setGoogleLoading] = useState(false);
  const hydrate = useStore((s) => s.hydrate);

  useEffect(() => { hydrate(); }, [hydrate]);

  const finishGoogle = useCallback((profile: GoogleProfile) => {
    try {
      const users = JSON.parse(localStorage.getItem("rolax_users") || "[]");
      if (!users.find((u: any) => u.email === profile.email)) {
        users.push({ id: (profile.sub || "g_" + Date.now()).slice(0, 40), name: profile.name, email: profile.email, status: "active", createdAt: new Date().toISOString() });
        localStorage.setItem("rolax_users", JSON.stringify(users));
      }
      localStorage.setItem("rolax_google_profile", JSON.stringify(profile));
      localStorage.setItem("rolax_login_method", "google");
    } catch {}
    setAuth({ id: (profile.sub || "g_" + Date.now()).slice(0, 40), name: profile.name, email: profile.email, isAdmin: false });
    toast(`Account ready: ${profile.email}`, "success");
    router.push("/dashboard");
  }, [router]);

  const handleGoogle = () => {
    setGoogleLoading(true);
    signInWithGoogle(
      (profile) => { setGoogleLoading(false); finishGoogle(profile); },
      (msg) => { setGoogleLoading(false); toast(msg, "error"); }
    );
    setTimeout(() => setGoogleLoading(false), 20000);
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast("Passwords do not match", "error");
      return;
    }
    if (password.length < 6) {
      toast("Password must be at least 6 characters", "error");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      try {
        const registered = JSON.parse(localStorage.getItem("rolax_registered") || "[]");
        if (registered.find((u: any) => u.email === email)) {
          toast("Email already registered", "error");
          setLoading(false);
          return;
        }
        const newUser = { id: "u_" + Date.now(), name, email, password, createdAt: new Date().toISOString() };
        registered.push(newUser);
        localStorage.setItem("rolax_registered", JSON.stringify(registered));

        // Also add to users list
        const users = JSON.parse(localStorage.getItem("rolax_users") || "[]");
        users.push({ id: newUser.id, name, email, status: "active", createdAt: newUser.createdAt });
        localStorage.setItem("rolax_users", JSON.stringify(users));

        setAuth({ id: newUser.id, name, email, isAdmin: false });
        toast("Account created successfully!", "success");
        router.push("/dashboard");
      } catch {
        toast("Registration failed", "error");
      }
      setLoading(false);
    }, 600);
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-30" />
      <div className="absolute -top-32 -left-32 w-[600px] h-[600px] bg-[#6C5CE7] rounded-full glow-orb" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-[#00D4FF] rounded-full glow-orb" />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-[440px]">
        <Link href="/" className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6C5CE7] to-[#00D4FF] flex items-center justify-center font-bold text-sm">R</div>
          <span className="font-grotesk font-bold text-lg">ROLAX HOST</span>
        </Link>

        <div className="rounded-2xl bg-[#111] border border-[#222] p-6 md:p-8 shadow-2xl">
          <h1 className="font-grotesk text-2xl font-bold">Create account</h1>
          <p className="text-sm text-[#888] mt-1">Start hosting in seconds</p>

          <form onSubmit={handleRegister} className="mt-6 space-y-4">
            <div>
              <label className="text-xs text-[#888]">Full Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" required className="mt-1 w-full px-4 py-3 rounded-xl bg-black border border-[#222] text-sm placeholder:text-[#555] focus:outline-none focus:border-[#6C5CE7]/50" />
            </div>
            <div>
              <label className="text-xs text-[#888]">Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" required className="mt-1 w-full px-4 py-3 rounded-xl bg-black border border-[#222] text-sm placeholder:text-[#555] focus:outline-none focus:border-[#6C5CE7]/50" />
            </div>
            <div>
              <label className="text-xs text-[#888]">Password</label>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" required className="mt-1 w-full px-4 py-3 rounded-xl bg-black border border-[#222] text-sm placeholder:text-[#555] focus:outline-none focus:border-[#6C5CE7]/50" />
            </div>
            <div>
              <label className="text-xs text-[#888]">Confirm Password</label>
              <input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" placeholder="••••••••" required className="mt-1 w-full px-4 py-3 rounded-xl bg-black border border-[#222] text-sm placeholder:text-[#555] focus:outline-none focus:border-[#6C5CE7]/50" />
            </div>

            <button type="submit" disabled={loading} className="w-full py-3 rounded-full bg-gradient-to-r from-[#6C5CE7] to-[#00D4FF] text-white font-medium text-sm hover:opacity-90 transition disabled:opacity-50">
              {loading ? "Creating..." : "Create account →"}
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
            {googleLoading ? "Connecting to Google..." : "Sign up with Google"}
          </button>

          <p className="text-center text-sm text-[#888] mt-6">
            Already have an account? <Link href="/login" className="text-white hover:underline">Sign in</Link>
          </p>
          <p className="text-center mt-3">
            <Link href="/" className="text-xs text-[#666] hover:text-white">← Back to home</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
