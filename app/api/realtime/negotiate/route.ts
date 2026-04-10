import { NextResponse } from "next/server";

import { negotiateRealtimeConnection } from "@/app/lib/azure/webpubsub";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = await negotiateRealtimeConnection();

  if (!token?.url) {
    return NextResponse.json({ enabled: false });
  }

  return NextResponse.json({ enabled: true, url: token.url });
}