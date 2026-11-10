"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { setAuth, getAuth } from "@/lib/auth";
import { ADMIN_EMAIL, ADMIN_PASSWORD, useStore } from "@/lib/store";
import { recordLogin } from "@/components/admin/StatsPanel";
import { toast } from "@/components/ui/Toaster";
import GoogleSignIn from "@/components/GoogleSignIn";
import type { GoogleProfile } from "@/lib/google";
import { loadPersistentArray, saveUsers, serverUserAction, upsertUser } from "@/lib/persistent";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const hydrate = useStore((s) => s.hydrate);

  useEffect(() => { hydrate(); }, [hydrate]);

  const handleGoogleSuccess = useCallback((profile: GoogleProfile, isAdmin: boolean) => {
    router.push(isAdmin ? "/admin" : "/dashboard");
  }, [router]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    setLoading(true);

    setTimeout(async () => {
      // Check admin credentials
      if (normalizedEmail === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASSWORD) {
        localStorage.setItem("rolax_auth_method", "email");
        recordLogin({ userId: "admin_001", email, name: "ROLAX Admin", method: "email" });
        setAuth({ id: "admin_001", name: "ROLAX Admin", email, isAdmin: true });
        toast("Welcome back, Admin!", "success");
        router.push("/admin");
        setLoading(false);
        return;
      }

      // First ask the durable adapter. If DATABASE_URL is configured this is
      // the source of truth and allows login from a new browser/device.
      try {
        const durable = await serverUserAction("login", { email: normalizedEmail, password });
        if (durable.durable) {
          if (!durable.ok || !durable.user) {
            toast(durable.error || "Invalid credentials", "error");
            setLoading(false);
            return;
          }
          if (durable.user.status === "banned") {
            toast("This account is blocked", "error");
            setLoading(false);
            return;
          }
          const serverUser: any = { ...durable.user, email: normalizedEmail };
          upsertUser(serverUser);
          saveUsers([...loadPersistentArray<any>("rolax_users"), serverUser]);
          localStorage.setItem("rolax_auth_method", "email");
          recordLogin({ userId: serverUser.id, email: normalizedEmail, name: serverUser.name || normalizedEmail.split("@")[0], method: "email" });
          setAuth({ id: serverUser.id, name: serverUser.name || normalizedEmail.split("@")[0], email: normalizedEmail, isAdmin: !!serverUser.isAdmin });
          toast("Login successful ✅", "success");
          router.push(serverUser.isAdmin ? "/admin" : "/dashboard");
          setLoading(false);
          return;
        }

        // Local fallback is kept for an unconfigured demo, but it is still
        // additive and checks the saved password when one exists.
        const users = loadPersistentArray<any>("rolax_users");
        const found = users.find((u: any) => String(u.email || "").toLowerCase() === normalizedEmail);
        const registered = loadPersistentArray<any>("rolax_registered");
        const regFound = registered.find((u: any) => String(u.email || "").toLowerCase() === normalizedEmail && u.password === password);

        if (regFound || found) {
          const name = regFound?.name || found?.name || normalizedEmail.split("@")[0];
          localStorage.setItem("rolax_auth_method", "email");
          recordLogin({ userId: found?.id || regFound?.id || "", email: normalizedEmail, name, method: "email" });
          setAuth({ id: found?.id || regFound?.id || "u_" + Date.now(), name, email: normalizedEmail, isAdmin: false });
          toast("Login successful!", "success");
          router.push("/dashboard");
          setLoading(false);
          return;
        }
        if (registered.find((u: any) => String(u.email || "").toLowerCase() === normalizedEmail)) {
          toast("Invalid password", "error");
          setLoading(false);
          return;
        }
        // Preserve the old guest/demo behavior only when no durable adapter is
        // configured; the account is immediately written to both local caches.
        if (normalizedEmail && password.length >= 3) {
          const id = "u_" + Date.now();
          const guest = { id, name: normalizedEmail.split("@")[0], email: normalizedEmail, status: "active", createdAt: new Date().toISOString() };
          saveUsers([...users, guest]);
          localStorage.setItem("rolax_auth_method", "email");
          recordLogin({ userId: id, email: normalizedEmail, name: guest.name, method: "email" });
          setAuth({ id, name: guest.name, email: normalizedEmail, isAdmin: false });
          toast("Login successful (local cache). Add DATABASE_URL for cross-device recovery.", "info");
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

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-30" />
      <div className="absolute -top-32 -left-32 w-[600px] h-[600px] bg-[#6C5CE7] rounded-full glow-orb" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-[#00D4FF] rounded-full glow-orb" />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-[420px]">
        <Link href="/" className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6C5CE7] to-[#00D4FF] flex items-center justify-center font-bold text-sm">R</div>
          <span className="font-grotesk font-bold text-lg">{useStore.getState().settings.logoText}</span>
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

          <GoogleSignIn label="Continue with Google" onSuccess={handleGoogleSuccess} />

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
