"use client";
// Deploy ke waqt token local rakho — browser API calls ke liye
const KEY = "rolax_bot_tokens";

export function saveBotToken(siteId: string, token: string) {
  if (typeof window === "undefined") return;
  try {
    const map = JSON.parse(localStorage.getItem(KEY) || "{}");
    map[siteId] = token;
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

export function getBotToken(siteId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const map = JSON.parse(localStorage.getItem(KEY) || "{}");
    return map[siteId] || null;
  } catch { return null; }
}

export function removeBotToken(siteId: string) {
  if (typeof window === "undefined") return;
  try {
    const map = JSON.parse(localStorage.getItem(KEY) || "{}");
    delete map[siteId];
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}
