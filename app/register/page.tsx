"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { setAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { toast } from "@/components/ui/Toaster";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const hydrate = useStore((s) => s.hydrate);

  useEffect(() => { hydrate(); }, [hydrate]);

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
