import { NextResponse } from "next/server";

import { REVERSED_SWEDISH_ALPHABET, SWEDISH_ALPHABET } from "@/app/lib/constants";
import { listHighscores, upsertBestTime } from "@/app/lib/azure/cosmos";
import { broadcastLeaderboardEvent } from "@/app/lib/azure/webpubsub";
import { isValidAlphabetSequence, isValidDuration, isValidMode, isValidUsername, normalizeUsername, normalizeUsernameKey } from "@/app/lib/validation";
import type { RaceMode } from "@/app/lib/types";

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
    mode?: unknown;
    username?: unknown;
    durationMs?: unknown;
    sequence?: unknown;
  };

  const mode: RaceMode = isValidMode((payload as { mode?: unknown }).mode)
    ? (payload as { mode: RaceMode }).mode
    : "normal";

  const expectedSequence =
    mode === "hard" ? REVERSED_SWEDISH_ALPHABET : SWEDISH_ALPHABET;

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

  if (typeof sequence !== "string" || !isValidAlphabetSequence(sequence, expectedSequence)) {
    return NextResponse.json(
      { error: "The submitted sequence does not match the Swedish alphabet." },
      { status: 400 },
    );
  }

  const cleanUsername = normalizeUsername(username);
  const normalizedUsername = normalizeUsernameKey(cleanUsername);
  const result = await upsertBestTime({
    mode,
    username: cleanUsername,
    normalizedUsername,
    durationMs,
  });
  const { leaderboard, storageMode } = await listHighscores(undefined, mode);

  await broadcastLeaderboardEvent({
    type: "leaderboard.updated",
    mode,
    entry: result.entry,
    leaderboard,
  });

  return NextResponse.json({
    mode,
    entry: result.entry,
    leaderboard,
    improved: result.improved,
    storageMode,
  });
}