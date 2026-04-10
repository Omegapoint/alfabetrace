import { NextResponse } from "next/server";

import { listHighscores } from "@/app/lib/azure/cosmos";
import { hasWebPubSubConfig } from "@/app/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const { leaderboard, storageMode } = await listHighscores();

  return NextResponse.json({
    leaderboard,
    storageMode,
    realtimeEnabled: hasWebPubSubConfig(),
  });
}