"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { setAuth, getAuth } from "@/lib/auth";
import { ADMIN_EMAIL, ADMIN_PASSWORD, useStore } from "@/lib/store";
import { toast } from "@/components/ui/Toaster";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const hydrate = useStore((s) => s.hydrate);

  useEffect(() => { hydrate(); }, [hydrate]);

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
