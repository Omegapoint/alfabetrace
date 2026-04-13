import { NextResponse } from "next/server";

import { listHighscores } from "@/app/lib/azure/cosmos";
import { hasWebPubSubConfig } from "@/app/lib/env";
import { isValidMode } from "@/app/lib/validation";
import type { RaceMode } from "@/app/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedMode = searchParams.get("mode");
  const mode: RaceMode = isValidMode(requestedMode) ? requestedMode : "normal";
  const { leaderboard, storageMode } = await listHighscores(undefined, mode);

  return NextResponse.json({
    mode,
    leaderboard,
    storageMode,
    realtimeEnabled: hasWebPubSubConfig(),
  });
}