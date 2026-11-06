import { readFileSync } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const file = path.join(process.cwd(), "hosted", "ROLAX HOSTING FINAL.py");
  const content = readFileSync(file, "utf8");
  return new Response(content, {
    headers: {
      "content-type": "text/x-python; charset=utf-8",
      "content-disposition": 'attachment; filename="ROLAX_HOSTING_FINAL_fixed.py"',
      "cache-control": "no-store",
    },
  });
}
