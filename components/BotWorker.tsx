"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore, type Website } from "@/lib/store";
import { getBotToken } from "@/lib/bottoken";
import { extractCommands, type BotCommand, type BotRuntimeState } from "@/lib/botruntime";
import { toast } from "@/components/ui/Toaster";
import { hasFeature, planStatusFor } from "@/lib/entitlements";

/**
 * BotWorker — poore app me background me chalta hai.
 * Har turn pe /api/bot/poll call karta hai: bot ka status, naye messages ka auto-reply.
 * Same Telegram update do baar reply na kare iske liye server-side last-update guard + local lastId.
 */
const POLL_MS = 4000;
const SERVER_SYNC_MS = 8000;
const LAST_KEY = "rolax_bot_last_ids";

const state: Record<string, BotRuntimeState> = {};
let running = false;

function loadLastIds(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(LAST_KEY) || "{}"); } catch { return {}; }
}
function saveLastIds(m: Record<string, number>) {
  try { localStorage.setItem(LAST_KEY, JSON.stringify(m)); } catch { /* ignore */ }
}

export function getRuntimeState(siteId: string): BotRuntimeState | undefined {
  return state[siteId];
}

export default function BotWorker() {
  const { hydrate, hydrated, websites } = useStore();
  const [, force] = useState(0);
  const timer = useRef<any>(null);

  useEffect(() => { hydrate(); }, [hydrate]);

  const pollOne = useCallback(async (site: Website) => {
    // agar server watchdog is bot ko chala raha hai to client poll skip (double reply nahi hoga)
    if (site.heartbeat?.mode === "python" && site.botRuntime?.status === "online") return;
    const token = getBotToken(site.id);
    if (!token) {
      state[site.id] = { ...(state[site.id] || { responses: 0, errors: 0, commands: [] }), status: "error", lastError: "Token missing — dobara deploy karo" };
      return;
    }
    if (!state[site.id]) {
      const cmds: BotCommand[] = extractCommands((site.src as any[]) || []);
      state[site.id] = { status: "starting", responses: 0, errors: 0, commands: cmds, startedAt: new Date().toISOString() };
    }

    const cmds = state[site.id].commands || [];
    try {
      const res = await fetch("/api/bot/poll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, commands: cmds, ownerName: site.name, since: loadLastIds()[site.id] || 0 }),
      });
      const j = await res.json();

      if (!j.ok) {
        state[site.id] = {
          ...state[site.id],
          status: j.fatal ? "error" : state[site.id].status === "online" ? "online" : "starting",
          lastError: j.error,
          errors: (state[site.id].errors || 0) + 1,
        };
        return;
      }

      const lastIds = loadLastIds();
      const prev = lastIds[site.id] || 0;
      const lastUpdateId = j.lastUpdateId || 0;
      const newResponses = (j.replies || []).length;

      // duplicate guard: same update id pe dobara reply nahi
      const isNew = lastUpdateId > prev;
      if (lastUpdateId > 0) { lastIds[site.id] = lastUpdateId; saveLastIds(lastIds); }

      state[site.id] = {
        ...state[site.id],
        status: "online",
        username: j.bot?.username,
        lastUpdateId,
        responses: (state[site.id].responses || 0) + (isNew ? newResponses : 0),
        lastMessage: isNew && newResponses ? (j.replies[0]?.to || "") : state[site.id].lastMessage,
        lastReplyAt: isNew && newResponses ? new Date().toISOString() : state[site.id].lastReplyAt,
        lastError: undefined,
        startedAt: state[site.id].startedAt || new Date().toISOString(),
      };

      // store me bhi status sync
      if (site.status === "Error") {
        useStore.getState().setWebsites(websites.map(w => w.id === site.id ? { ...w, status: "Running" as const, errorCount: 0 } : w));
      }
    } catch (e: any) {
      state[site.id] = { ...state[site.id], status: "online", errors: (state[site.id].errors || 0) + 1, lastError: e?.message };
    }
  }, [websites]);

  /** Server-side 24/7 watchdog ka status pull karo (bot browser band hone par bhi online) */
  const serverSync = useCallback(async () => {
    if (!hydrated) return;
    try {
      const r = await fetch("/api/bots/register", { cache: "no-store" });
      const j = await r.json();
      if (!j?.ok || !Array.isArray(j.bots)) return;
      const byId: Record<string, any> = {};
      // self-heal: registry khali/ephemeral ho to apne bots dobara register karo
      const registered = new Set(j.bots.map((b: any) => b.siteId));
      const mine = useStore.getState().websites.filter(w => /telegram/i.test(w.botType || "") && !registered.has(w.id) && getBotToken(w.id) && (w.src as any[])?.length);
      for (const site of mine.slice(0, 5)) {
        const token = getBotToken(site.id);
        if (!token) continue;
        fetch("/api/bots/register", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({
            siteId: site.id, token, name: site.name, entry: site.entryFile || "bot.py",
            files: site.src, ownerEmail: site.userId,
          }),
        }).catch(() => {});
      }

      // self-heal: registry ephemeral ho to apne bots dobara register karo
      try {
        const registered = new Set((j.bots || []).map((b: any) => b.siteId));
        const mine = useStore.getState().websites.filter(w => /telegram/i.test(w.botType || "") && !registered.has(w.id) && getBotToken(w.id) && (w.src as any[])?.length);
        for (const site of mine.slice(0, 5)) {
          const token = getBotToken(site.id);
          if (!token) continue;
          fetch("/api/bots/register", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ siteId: site.id, token, name: site.name, entry: site.entryFile || "bot.py", files: site.src, ownerEmail: site.userId }),
          }).catch(() => {});
        }
      } catch { /* ignore */ }

      j.bots.forEach((b: any) => { if (b?.siteId) byId[b.siteId] = b; });
      const w = useStore.getState().websites;
      let changed = false;
      const next = w.map(site => {
        const srv = byId[site.id];
        if (!srv) return site;
        const st = srv.stat || {};
        changed = true;
        return {
          ...site,
          botUsername: st.username || site.botUsername,
          heartbeat: { at: st.checkedAt || new Date().toISOString(), status: st.status || "online", responses: st.responses || 0, mode: st.mode || "python" },
          botRuntime: {
            status: st.status || "online",
            username: st.username || site.botRuntime?.username,
            responses: st.responses || 0,
            lastReplyAt: st.lastReplyAt,
            lastReplyMessage: st.lastMessage,
            lastError: st.lastError,
            commands: site.botRuntime?.commands || [],
          } as any,
        };
      });
      if (changed) useStore.getState().setWebsites(next);
      // local state bhi update karo taaki dashboard turant dikhaye
      j.bots.forEach((b: any) => {
        const st = b.stat || {};
        if (!st.status) return;
        state[b.siteId] = {
          ...(state[b.siteId] || { responses: 0, errors: 0, commands: [] }),
          status: st.status,
          username: st.username,
          responses: st.responses || 0,
          lastReplyAt: st.lastReplyAt,
          lastMessage: st.lastMessage,
          lastError: st.lastError,
        };
      });
      force(n => n + 1);
    } catch { /* ignore */ }
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    serverSync();
    const i = setInterval(serverSync, SERVER_SYNC_MS);
    return () => clearInterval(i);
  }, [hydrated, serverSync]);

  const tick = useCallback(async () => {
    if (!hydrated || running) return;
    running = true;
    try {
      const store = useStore.getState();
      const plans = store.plans;
      const users = store.users;
      const bots = store.websites.filter(w => {
        if (w.status === "Error") return false;
        if (!/telegram/i.test(w.botType || "")) return false;
        if (!getBotToken(w.id)) return false;
        // plan gate: plan chalu hai ya expired?
        const owner = users.find(u => u.id === w.userId || u.email === w.userId) as any;
        const st = planStatusFor(owner, plans);
        if (st.expired) return false;
        if (owner?.entitlements && owner.entitlements["bot_24x7"] !== undefined) return !!owner.entitlements["bot_24x7"];
        // plan chalu hai to 24/7
        return hasFeature(st.plan, "bot_24x7", false);
      });
      // expired plan wale bots ko offline mark karo
      store.websites.filter(w => /telegram/i.test(w.botType || "")).forEach(w => {
        const owner = users.find(u => u.id === w.userId || u.email === w.userId) as any;
        const st = planStatusFor(owner, plans);
        const allowed = !st.expired && (owner?.entitlements?.["bot_24x7"] !== undefined ? !!owner.entitlements["bot_24x7"] : hasFeature(st.plan, "bot_24x7", false));
        if (allowed === false) {
          state[w.id] = { ...(state[w.id] || { responses: 0, errors: 0, commands: [] }), status: "offline", lastError: st.expired ? "Plan expired — renew karo" : "Is plan me 24/7 hosting nahi hai (Ultra Pro lo)" };
        }
      });
      await Promise.all(bots.map(b => pollOne(b)));
      force(n => n + 1);
    } finally {
      running = false;
    }
  }, [hydrated, pollOne]);

  useEffect(() => {
    if (!hydrated) return;
    tick();
    timer.current = setInterval(tick, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(timer.current); document.removeEventListener("visibilitychange", onVisible); };
  }, [hydrated, tick]);

  // dashboard update event -> turant poll (naya deploy)
  useEffect(() => {
    const h = () => tick();
    window.addEventListener("rolax:bot-start", h);
    return () => window.removeEventListener("rolax:bot-start", h);
  }, [tick]);

  return null;
}

/** Site ke liye runtime status + commands (dashboard card ke liye) */
export function useBotStatus(siteId: string) {
  const [s, setS] = useState<BotRuntimeState | undefined>(getRuntimeState(siteId));
  useEffect(() => {
    const i = setInterval(() => setS(getRuntimeState(siteId)), 2000);
    return () => clearInterval(i);
  }, [siteId]);
  return s;
}

export function restartBot(siteId: string) {
  const lastIds = loadLastIds();
  delete lastIds[siteId];
  saveLastIds(lastIds);
  delete state[siteId];
  window.dispatchEvent(new Event("rolax:bot-start"));
  toast("Bot restart ho raha hai...", "info");
}
