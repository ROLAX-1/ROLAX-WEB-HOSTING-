import { NextRequest, NextResponse } from "next/server";
import { GET as registryGet, POST as registryPost } from "../register/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron -> GET /api/bots/tick (Hobby par daily; Pro par frequent)
 * Serverless pe setInterval zinda nahi rehta, isliye cron watchdog ka ek round chalata hai.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (req.nextUrl.searchParams.get("secret") !== secret && auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }
  const list = await (await registryGet(req)).json();
  return NextResponse.json({
    ok: true,
    tickedAt: new Date().toISOString(),
    count: list.count || 0,
    bots: (list.bots || []).map((b: any) => ({ siteId: b.siteId, status: b.stat?.status, username: b.stat?.username, responses: b.stat?.responses })),
  });
}

export async function POST(req: NextRequest) {
  return registryPost(req);
}
