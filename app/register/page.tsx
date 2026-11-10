"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { setAuth } from "@/lib/auth";
import { recordLogin } from "@/components/admin/StatsPanel";
import { useStore } from "@/lib/store";
import { toast } from "@/components/ui/Toaster";
import GoogleSignIn from "@/components/GoogleSignIn";
import type { GoogleProfile } from "@/lib/google";
import { loadPersistentArray, savePersistentArray, saveUsers, serverUserAction } from "@/lib/persistent";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const hydrate = useStore((s) => s.hydrate);

  useEffect(() => { hydrate(); }, [hydrate]);

  const handleGoogleSuccess = useCallback((profile: GoogleProfile, isAdmin: boolean) => {
    router.push(isAdmin ? "/admin" : "/dashboard");
  }, [router]);

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (password !== confirm) {
      toast("Passwords do not match", "error");
      return;
    }
    if (password.length < 6) {
      toast("Password must be at least 6 characters", "error");
      return;
    }
    setLoading(true);
    setTimeout(async () => {
      try {
        const registered = loadPersistentArray<any>("rolax_registered");
        if (registered.find((u: any) => String(u.email || "").toLowerCase() === normalizedEmail)) {
          toast("Email already registered", "error");
          setLoading(false);
          return;
        }
        const newUser = { id: "u_" + Date.now(), name: name.trim(), email: normalizedEmail, password, createdAt: new Date().toISOString() };
        const publicUser = { id: newUser.id, name: newUser.name, email: newUser.email, status: "active", createdAt: newUser.createdAt };

        // Try the durable database first when configured. A missing database
        // keeps demo/local mode usable; a real server rejection does not.
        const durable = await serverUserAction("register", { ...publicUser, password });
        if (durable.durable && !durable.ok) {
          toast(durable.error || "Email already registered", "error");
          setLoading(false);
          return;
        }

        // Both browser collections are additive and backed up; an empty or
        // partial write cannot erase older accounts.
        savePersistentArray("rolax_registered", [...registered, newUser]);
        saveUsers([...loadPersistentArray<any>("rolax_users"), publicUser]);

        localStorage.setItem("rolax_auth_method", "email");
        recordLogin({ userId: newUser.id, email: normalizedEmail, name: newUser.name, method: "email" });
        setAuth({ id: newUser.id, name: newUser.name, email: normalizedEmail, isAdmin: false });
        toast(durable.ok ? "Account created and saved securely ✅" : "Account created locally. Add DATABASE_URL for cross-device recovery.", durable.ok ? "success" : "info");
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
          <span className="font-grotesk font-bold text-lg">{useStore.getState().settings.logoText}</span>
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

          <GoogleSignIn label="Sign up with Google" onSuccess={handleGoogleSuccess} />

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
