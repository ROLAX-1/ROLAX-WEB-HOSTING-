// ROLAX HOST — FEATURE LOCK GUARD (pure logic, server + client dono)
// AI / auto-fix code ko chhu sakta hai, par user ke FEATURES (commands, replies, routes, costs) kabhi nahi badal sakte.
// Guard fail ho to fix reject -> original code wapas.

export type CodeFile = { name: string; content: string };

/** Feature fingerprint: commands, replies, handlers, routes, costs */
export function featureFingerprint(code: string): {
  commands: string[];
  replies: string[];
  handlers: number;
  routes: string[];
  numbers: string[];
} {
  const commands = Array.from(new Set(
    (code.match(/commands\s*=\s*\[([^\]]+)\]/g) || []).flatMap(m => (m.match(/["']([a-zA-Z0-9_]{2,30})["']/g) || []).map(s => s.replace(/["']/g, "")))
      .concat((code.match(/\.command\(\s*["']([a-zA-Z0-9_]{2,30})["']/g) || []).map(m => m.replace(/.*["']([^"']+)["'].*/, "$1")))
      .concat((code.match(/onText\(\s*\/\\?\/([a-zA-Z0-9_]{2,30})/g) || []).map(m => m.replace(/.*\/([a-zA-Z0-9_]+)$/, "$1")))
  ));

  const replies = Array.from(new Set(
    (code.match(/(?:reply_to|send_message|sendMessage|reply|answer)\s*\([^)]*?["'`]([^"'`]{3,300})["'`]/gs) || [])
      .map(m => m.replace(/.*["'`]([^"'`]{3,300})["'`]\s*$/s, "$1").trim())
      .filter(Boolean)
  ));

  const handlers = (code.match(/message_handler|onText|\.command\(|callback_query_handler|add_handler/g) || []).length;
  const routes = Array.from(new Set((code.match(/(?:@app\.(?:get|post|route)|router\.(?:get|post)|app\.(?:get|post))\s*\(\s*["']([^"']+)["']/g) || []).map(m => m.replace(/.*["']([^"']+)["'].*/, "$1"))));
  const numbers = Array.from(new Set((code.match(/\b\d+(?:\.\d+)?\b/g) || []).filter(n => n.length <= 8)));

  return { commands, replies, handlers, routes, numbers };
}

/** Kya naya code user ke features preserve karta hai? */
export function featuresPreserved(before: string, after: string): { ok: boolean; lost: string[] } {
  const a = featureFingerprint(before);
  const b = featureFingerprint(after);
  const lost: string[] = [];

  a.commands.forEach(c => { if (!b.commands.includes(c)) lost.push(`command /${c}`); });
  a.replies.forEach(r => { if (!b.replies.includes(r)) lost.push(`reply "${r.slice(0, 40)}"`); });
  a.routes.forEach(r => { if (!b.routes.includes(r)) lost.push(`route ${r}`); });
  if (b.handlers < a.handlers) lost.push(`${a.handlers - b.handlers} handler(s) gayab`);

  return { ok: lost.length === 0, lost };
}

/** Poora file-set guard: har file ka comparison */
export function guardFiles(before: CodeFile[], after: CodeFile[]): { ok: boolean; rejected: string[]; details: string[] } {
  const rejected: string[] = [];
  const details: string[] = [];
  for (const oldFile of before) {
    const newFile = after.find(f => f.name === oldFile.name);
    if (!newFile) { rejected.push(oldFile.name); details.push(`${oldFile.name}: file gayab ho gayi`); continue; }
    const res = featuresPreserved(oldFile.content, newFile.content);
    if (!res.ok) { rejected.push(oldFile.name); details.push(`${oldFile.name}: ${res.lost.join(", ")}`); }
  }
  return { ok: rejected.length === 0, rejected, details };
}

/** Support files (requirements/.env/README) guard se exempt hain — wo naye ho sakte hain */
export const SUPPORT_FILES = ["requirements.txt", ".env", ".env.example", "package.json", "Procfile", "README.md", "runtime.txt", "Dockerfile"];
export function isSupportFile(name: string) {
  const base = name.split("/").pop() || name;
  return SUPPORT_FILES.includes(base);
}
