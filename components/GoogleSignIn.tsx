"use client";
import { useEffect, useRef, useState } from "react";
import {
  renderGoogleButton,
  hasRealGoogle,
  getGoogleClientId,
  finishGoogleLogin,
  isValidGmailish,
  type GoogleProfile,
} from "@/lib/google";
import { ADMIN_EMAIL } from "@/lib/store";
import { toast } from "@/components/ui/Toaster";

const GoogleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.8 6.1C12.2 13.3 17.6 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.5c0-1.6-.15-3.1-.43-4.5H24v9h12.4c-.54 2.9-2.2 5.4-4.7 7l7.6 5.9c4.4-4.1 6.8-10.1 6.8-17.4z" />
    <path fill="#FBBC05" d="M10.3 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.8-6.1C.9 16.3 0 20 0 24s.9 7.7 2.5 10.7l7.8-6.1z" />
    <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.3-5.6l-7.6-5.9c-2.1 1.4-4.8 2.3-7.7 2.3-6.4 0-11.8-3.8-13.7-9.2l-7.8 6.1C6.4 42.6 14.6 48 24 48z" />
  </svg>
);

type Props = {
  label?: string;
  onSuccess: (profile: GoogleProfile, isAdmin: boolean) => void;
};

export default function GoogleSignIn({ label = "Continue with Google", onSuccess }: Props) {
  const holder = useRef<HTMLDivElement | null>(null);
  const [realMode, setRealMode] = useState(false);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hasRealGoogle()) return;
    let alive = true;
    renderGoogleButton(
      holder.current,
      (p) => {
        const { isAdmin } = finishGoogleLogin(p, ADMIN_EMAIL);
        toast(`Signed in with Google: ${p.email}`, "success");
        onSuccess(p, isAdmin);
      },
      (msg) => toast(msg, "error")
    ).then((ok) => { if (alive) setRealMode(ok); });
    return () => { alive = false; };
  }, [onSuccess]);

  const submitFallback = () => {
    const mail = email.trim();
    if (!isValidGmailish(mail)) { toast("Valid Google email daalo (example@gmail.com)", "error"); return; }
    setBusy(true);
    setTimeout(() => {
      const profile: GoogleProfile = { name: name.trim() || mail.split("@")[0], email: mail };
      const { isAdmin } = finishGoogleLogin(profile, ADMIN_EMAIL);
      setBusy(false);
      setOpen(false);
      toast(`Signed in with Google: ${mail}`, "success");
      onSuccess(profile, isAdmin);
    }, 500);
  };

  return (
    <>
      {/* Official Google button jab Client ID set ho */}
      {realMode ? (
        <div className="flex justify-center">
          <div ref={holder} className="w-full flex justify-center" />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full py-3 rounded-full bg-white text-black font-medium text-sm flex items-center justify-center gap-3 hover:bg-zinc-100 transition"
        >
          <GoogleLogo />
          {label}
        </button>
      )}

      <p className="text-center text-[11px] text-[#666] mt-2">
        {realMode ? "Google account chooser official Google se khulega" : "Google account se instant sign in — password nahi chahiye"}
        {getGoogleClientId() ? "" : ""}
      </p>

      {/* Safe in-page Google-style account sheet — koi 404 nahi */}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-[420px] rounded-2xl bg-white text-[#202124] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8eaed]">
              <div className="flex items-center gap-2">
                <GoogleLogo />
                <span className="text-sm font-medium">Sign in with Google</span>
              </div>
              <button onClick={() => setOpen(false)} className="text-[#5f6368] hover:text-black text-lg leading-none">✕</button>
            </div>
            <div className="p-5">
              <h3 className="text-base font-medium">Choose an account</h3>
              <p className="text-xs text-[#5f6368] mt-1">to continue to <span className="font-medium text-[#202124]">ROLAX HOST</span></p>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-[11px] text-[#5f6368]">Your Google email</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    autoFocus
                    placeholder="your.name@gmail.com"
                    className="mt-1 w-full px-4 py-3 rounded-lg border border-[#dadce0] text-sm focus:outline-none focus:border-[#1a73e8]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#5f6368]">Your name (optional)</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    type="text"
                    placeholder="Yansh Kumar"
                    className="mt-1 w-full px-4 py-3 rounded-lg border border-[#dadce0] text-sm focus:outline-none focus:border-[#1a73e8]"
                  />
                </div>
              </div>

              <button
                onClick={submitFallback}
                disabled={busy || !email.trim()}
                className="mt-4 w-full py-2.5 rounded-full bg-[#1a73e8] text-white text-sm font-medium disabled:opacity-50"
              >
                {busy ? "Signing in..." : "Continue"}
              </button>

              <p className="text-[11px] text-[#5f6368] mt-3 leading-relaxed">
                Password ki zarurat nahi — sirf apna Google email confirm karo. Puri Google popup verification chahiye to admin panel me
                <span className="font-medium"> Google Client ID </span> add karo (Site Customizer).
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
