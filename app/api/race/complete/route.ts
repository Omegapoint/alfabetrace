import { NextResponse } from "next/server";

import { SWEDISH_ALPHABET } from "@/app/lib/constants";
import { listHighscores, upsertBestTime } from "@/app/lib/azure/cosmos";
import { broadcastLeaderboardEvent } from "@/app/lib/azure/webpubsub";
import { isValidDuration, isValidUsername, normalizeUsername, normalizeUsernameKey } from "@/app/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload." },
      { status: 400 },
    );
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Missing race payload." }, { status: 400 });
  }

  const { username, durationMs, sequence } = payload as {
    username?: unknown;
    durationMs?: unknown;
    sequence?: unknown;
  };

  if (typeof username !== "string" || !isValidUsername(username)) {
    return NextResponse.json(
      { error: "Choose a username between 2 and 24 characters." },
      { status: 400 },
    );
  }

  if (!isValidDuration(durationMs)) {
    return NextResponse.json(
      { error: "Race duration is invalid." },
      { status: 400 },
    );
  }

  if (sequence !== SWEDISH_ALPHABET) {
    return NextResponse.json(
      { error: "The submitted sequence does not match the Swedish alphabet." },
      { status: 400 },
    );
  }

  const cleanUsername = normalizeUsername(username);
  const normalizedUsername = normalizeUsernameKey(cleanUsername);
  const result = await upsertBestTime({
    username: cleanUsername,
    normalizedUsername,
    durationMs,
  });
  const { leaderboard, storageMode } = await listHighscores();

  await broadcastLeaderboardEvent({
    type: "leaderboard.updated",
    entry: result.entry,
    leaderboard,
  });

  return NextResponse.json({
    entry: result.entry,
    leaderboard,
    improved: result.improved,
    storageMode,
  });
}