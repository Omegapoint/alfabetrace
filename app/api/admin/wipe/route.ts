import { NextResponse } from "next/server";

import { listHighscores, wipeHighscores } from "@/app/lib/azure/cosmos";
import { broadcastLeaderboardEvent } from "@/app/lib/azure/webpubsub";
import { getAdminSecret } from "@/app/lib/env";

export const dynamic = "force-dynamic";

async function extractSecret(request: Request) {
  const headerSecret = request.headers.get("x-admin-secret");

  if (headerSecret) {
    return headerSecret;
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return "";
  }

  try {
    const body = (await request.json()) as { secret?: string };
    return typeof body.secret === "string" ? body.secret : "";
  } catch {
    return "";
  }
}

export async function DELETE(request: Request) {
  const expectedSecret = getAdminSecret();

  if (!expectedSecret) {
    return NextResponse.json(
      { error: "ADMIN_SECRET is not configured." },
      { status: 503 },
    );
  }

  const providedSecret = await extractSecret(request);

  if (providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { wiped, storageMode } = await wipeHighscores();
  const { leaderboard } = await listHighscores();

  await Promise.all([
    broadcastLeaderboardEvent({
      type: "leaderboard.reset",
      mode: "normal",
      leaderboard: [],
    }),
    broadcastLeaderboardEvent({
      type: "leaderboard.reset",
      mode: "hard",
      leaderboard: [],
    }),
  ]);

  return NextResponse.json({
    wiped,
    leaderboard,
    storageMode,
  });
}