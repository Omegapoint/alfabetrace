"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  APP_DESCRIPTION,
  APP_NAME,
  LEADERBOARD_LIMIT,
  SWEDISH_ALPHABET,
} from "@/app/lib/constants";
import type {
  LeaderboardEvent,
  LeaderboardResponse,
  RaceSubmissionResponse,
  RealtimeNegotiationResponse,
} from "@/app/lib/types";
import {
  isCorrectPrefix,
  isValidUsername,
  normalizeUsername,
  sanitizeRaceInput,
} from "@/app/lib/validation";

type RacePhase = "idle" | "racing" | "finished";

const numberFormatter = new Intl.NumberFormat("sv-SE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatDuration(durationMs: number) {
  return `${numberFormatter.format(durationMs / 1000)} s`;
}

export function AlphabetRace() {
  const [username, setUsername] = useState("");
  const [committedUsername, setCommittedUsername] = useState("");
  const [raceInput, setRaceInput] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse["leaderboard"]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [phase, setPhase] = useState<RacePhase>("idle");
  const [hasMistake, setHasMistake] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    "Enter your username to start.",
  );
  const [submissionMessage, setSubmissionMessage] = useState("");
  const [runtimeMessage, setRuntimeMessage] = useState(
    "Connecting to the live scoreboard...",
  );
  const [realtimeEnabled, setRealtimeEnabled] = useState(false);
  const [storageMode, setStorageMode] = useState<LeaderboardResponse["storageMode"]>(
    "memory",
  );
  const [lastResult, setLastResult] = useState<{
    durationMs: number;
    improved: boolean;
  } | null>(null);

  const startedAtRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const raceInputRef = useRef<HTMLInputElement | null>(null);
  const usernameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadLeaderboard() {
      try {
        const response = await fetch("/api/highscores", { cache: "no-store" });

        if (!response.ok) {
          throw new Error("Unable to load highscores.");
        }

        const payload = (await response.json()) as LeaderboardResponse;

        if (cancelled) {
          return;
        }

        setLeaderboard(payload.leaderboard.slice(0, LEADERBOARD_LIMIT));
        setRealtimeEnabled(payload.realtimeEnabled);
        setStorageMode(payload.storageMode);
        setRuntimeMessage(
          payload.realtimeEnabled
            ? "Live updates enabled."
            : "Realtime is offline.",
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        setRuntimeMessage(
          error instanceof Error ? error.message : "Unable to load highscores.",
        );
      }
    }

    void loadLeaderboard();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function connectRealtime() {
      try {
        const response = await fetch("/api/realtime/negotiate", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Realtime negotiation failed.");
        }

        const payload = (await response.json()) as RealtimeNegotiationResponse;

        if (cancelled || !payload.enabled) {
          return;
        }

        const socket = new WebSocket(payload.url);
        socketRef.current = socket;

        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as LeaderboardEvent;

            setLeaderboard(message.leaderboard.slice(0, LEADERBOARD_LIMIT));
            setRuntimeMessage(
              message.type === "leaderboard.reset"
                ? "Scoreboard reset."
                : `Fresh time posted by ${message.entry.username}.`,
            );
          } catch {
            setRuntimeMessage("Received an unreadable realtime event.");
          }
        };

        socket.onclose = () => {
          if (!cancelled) {
            setRuntimeMessage(
              "Realtime disconnected. Refresh to reconnect.",
            );
          }
        };
      } catch (error) {
        if (!cancelled) {
          setRuntimeMessage(
            error instanceof Error
              ? error.message
              : "Unable to establish realtime connection.",
          );
        }
      }
    }

    void connectRealtime();

    return () => {
      cancelled = true;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (phase !== "racing") {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      return;
    }

    const tick = () => {
      if (startedAtRef.current !== null) {
        setElapsedMs(performance.now() - startedAtRef.current);
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [phase]);

  function startRace() {
    const cleanUsername = normalizeUsername(username);

    if (!isValidUsername(cleanUsername)) {
      setStatusMessage("Handles need 2 to 24 visible characters.");
      return;
    }

    setUsername(cleanUsername);
    setCommittedUsername(cleanUsername);
    setRaceInput("");
    setHasMistake(false);
    setElapsedMs(0);
    setPhase("racing");
    setStatusMessage("Type the alphabet.");
    setSubmissionMessage("");
    setLastResult(null);
    startedAtRef.current = null;

    window.requestAnimationFrame(() => {
      raceInputRef.current?.focus();
    });
  }

  async function finishRace(durationMs: number) {
    setPhase("finished");
    setElapsedMs(durationMs);
    setStatusMessage("Saving your time...");

    try {
      const response = await fetch("/api/race/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: committedUsername,
          durationMs,
          sequence: SWEDISH_ALPHABET,
        }),
      });

      const payload = (await response.json()) as RaceSubmissionResponse | { error: string };

      if (!response.ok || "error" in payload) {
        throw new Error(
          "error" in payload ? payload.error : "Unable to submit race.",
        );
      }

      setLeaderboard(payload.leaderboard.slice(0, LEADERBOARD_LIMIT));
      setStorageMode(payload.storageMode);
      setLastResult({ durationMs, improved: payload.improved });
      setSubmissionMessage(
        payload.improved
          ? "New personal best."
          : "Run saved. Best time unchanged.",
      );
      setStatusMessage("Done. You can race again.");
    } catch (error) {
      setSubmissionMessage(
        error instanceof Error ? error.message : "Unable to submit race.",
      );
      setStatusMessage(
        "Finished locally, but score could not be saved.",
      );
    }
  }

  async function handleRaceInput(value: string) {
    const sanitized = sanitizeRaceInput(value);

    if (phase !== "racing") {
      setRaceInput(sanitized);
      return;
    }

    if (sanitized.length > 0 && startedAtRef.current === null) {
      startedAtRef.current = performance.now();
    }

    const correctPrefix = isCorrectPrefix(sanitized);

    setRaceInput(sanitized);
    setHasMistake(!correctPrefix);

    if (!correctPrefix) {
      setStatusMessage("Wrong letter. Backspace and continue.");
      return;
    }

    setStatusMessage(
      sanitized.length === SWEDISH_ALPHABET.length
        ? "Last letter. Sending..."
        : "Keep going.",
    );

    if (sanitized === SWEDISH_ALPHABET && startedAtRef.current !== null) {
      const durationMs = performance.now() - startedAtRef.current;
      await finishRace(durationMs);
    }
  }

  function resetRace() {
    setRaceInput("");
    setHasMistake(false);
    setElapsedMs(0);
    setPhase("idle");
    setSubmissionMessage("");
    setLastResult(null);
    setStatusMessage("Enter your username to start.");
    startedAtRef.current = null;

    window.requestAnimationFrame(() => {
      usernameInputRef.current?.focus();
    });
  }

  const progressCount = (() => {
    let count = 0;

    while (
      count < raceInput.length &&
      SWEDISH_ALPHABET.slice(0, count + 1) === raceInput.slice(0, count + 1)
    ) {
      count += 1;
    }

    return count;
  })();

  const nextLetter = SWEDISH_ALPHABET[progressCount]?.toUpperCase() ?? "DONE";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="panel panel-glow relative overflow-hidden p-5 sm:p-6">
          <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#ff7a00_0%,#ffe600_35%,#5affb1_65%,#2ea8ff_100%)]" />
          <div className="relative flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl space-y-4">
                <Image
                  src="/wordmark.svg"
                  alt={`${APP_NAME} wordmark`}
                  width={320}
                  height={142}
                  priority
                  className="h-auto w-[200px] sm:w-[280px]"
                />
                <p className="max-w-xl text-base leading-6 text-[var(--color-copy)] sm:text-lg">
                  {APP_DESCRIPTION}
                </p>
              </div>

              <div className="retro-meter min-w-[180px]">
                <span className="retro-meter__label">timer</span>
                <strong className="retro-meter__value">{formatDuration(elapsedMs)}</strong>
                <span className="retro-meter__hint">
                  {phase === "racing" ? "Running" : phase === "finished" ? "Done" : "Ready"}
                </span>
              </div>
            </div>

            {phase === "idle" ? (
              <div className="grid gap-4 md:grid-cols-[minmax(0,240px)_1fr]">
                <label className="space-y-2">
                  <span className="field-label">username</span>
                  <input
                    ref={usernameInputRef}
                    value={username}
                    onChange={(event) => setUsername(normalizeUsername(event.target.value))}
                    className="retro-input"
                    placeholder="erik"
                    maxLength={24}
                    autoComplete="nickname"
                  />
                </label>

                <div className="flex flex-wrap items-end gap-3">
                  <button type="button" className="pixel-button" onClick={startRace}>
                    Start
                  </button>
                  <Link href="/admin" className="text-sm uppercase tracking-[0.22em] text-[var(--color-copy-soft)] transition hover:text-white">
                    Admin
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[180px] flex-1">
                    <p className="field-label">racing as</p>
                    <p className="text-lg text-white">{committedUsername}</p>
                  </div>
                  <button
                    type="button"
                    className="pixel-button pixel-button--ghost"
                    onClick={resetRace}
                  >
                    Reset
                  </button>
                </div>

                <div className="rounded-[22px] border border-white/10 bg-black/35 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
                  <div className="mb-3 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-[var(--color-copy-soft)]">
                    <span className={`status-lamp ${phase === "racing" ? "status-lamp--hot" : ""}`} />
                    <span>{phase === "racing" ? "active" : "finished"}</span>
                    <span>next: {nextLetter}</span>
                  </div>

                  <div className="alphabet-strip" aria-hidden="true">
                    {[...SWEDISH_ALPHABET].map((character, index) => {
                      const isLocked = index < progressCount;
                      const isCurrent = index === progressCount;

                      return (
                        <span
                          key={character}
                          className={[
                            "alphabet-strip__character",
                            isLocked ? "alphabet-strip__character--locked" : "",
                            isCurrent ? "alphabet-strip__character--current" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {character.toUpperCase()}
                        </span>
                      );
                    })}
                  </div>

                  <label className="mt-4 block space-y-2">
                    <span className="field-label">type the swedish alphabet</span>
                    <input
                      ref={raceInputRef}
                      value={raceInput}
                      onChange={(event) => {
                        void handleRaceInput(event.target.value);
                      }}
                      onPaste={(event) => {
                        event.preventDefault();
                      }}
                      className={`retro-input retro-input--race ${hasMistake ? "retro-input--error" : ""}`}
                      placeholder={SWEDISH_ALPHABET.toUpperCase()}
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="info-chip">
                      <span className="info-chip__label">progress</span>
                      <strong>{progressCount} / {SWEDISH_ALPHABET.length}</strong>
                    </div>
                    <div className="info-chip">
                      <span className="info-chip__label">storage</span>
                      <strong>{storageMode === "azure" ? "Azure" : "Memory"}</strong>
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="grid gap-3 lg:grid-cols-[1fr_0.8fr]">
              <div className="panel-subtle">
                <p className="field-label">status</p>
                <p className="text-lg text-white">{statusMessage}</p>
                <p className="mt-2 text-sm text-[var(--color-copy-soft)]">{runtimeMessage}</p>
              </div>

              {phase !== "idle" ? (
                <div className="panel-subtle">
                  <p className="field-label">result</p>
                  {lastResult ? (
                    <div className="space-y-2 text-lg text-white">
                      <p>{formatDuration(lastResult.durationMs)}</p>
                      <p className="text-[var(--color-copy-soft)]">
                        {lastResult.improved
                          ? "Personal best improved."
                          : "Best time unchanged."}
                      </p>
                    </div>
                  ) : (
                    <p className="text-lg text-[var(--color-copy-soft)]">{submissionMessage || "No run completed yet."}</p>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <aside className="panel p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <p className="eyebrow">highscores</p>
              <h2 className="font-display text-lg uppercase text-white sm:text-xl">
                Best times
              </h2>
            </div>
            <span className={`status-lamp ${realtimeEnabled ? "status-lamp--hot" : ""}`} />
          </div>

          <div className="mt-4 space-y-2.5">
            {leaderboard.length > 0 ? (
              leaderboard.map((entry, index) => (
                <div key={entry.id} className="leaderboard-row">
                  <span className="leaderboard-row__rank">#{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg text-white">{entry.username}</p>
                  </div>
                  <strong className="text-base text-[var(--color-accent)]">
                    {formatDuration(entry.bestTimeMs)}
                  </strong>
                </div>
              ))
            ) : (
              <div className="panel-subtle">
                <p className="text-lg text-white">No times on the board yet.</p>
                <p className="mt-2 text-sm text-[var(--color-copy-soft)]">Be the first to set a time.</p>
              </div>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}