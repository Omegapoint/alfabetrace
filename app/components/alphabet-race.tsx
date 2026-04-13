"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import {
  APP_NAME,
  LEADERBOARD_LIMIT,
  REVERSED_SWEDISH_ALPHABET,
  SWEDISH_ALPHABET,
} from "@/app/lib/constants";
import type {
  LeaderboardEvent,
  LeaderboardResponse,
  RaceMode,
  RaceSubmissionResponse,
  RealtimeNegotiationResponse,
} from "@/app/lib/types";
import {
  isCorrectPrefix,
  isValidMode,
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

function isLeaderboardEvent(value: unknown): value is LeaderboardEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const event = value as Partial<LeaderboardEvent>;
  return (
    (event.type === "leaderboard.updated" || event.type === "leaderboard.reset") &&
    Array.isArray(event.leaderboard)
  );
}

function parseRealtimeMessage(data: unknown) {
  if (typeof data !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as unknown;

    if (isLeaderboardEvent(parsed)) {
      return parsed;
    }

    if (
      parsed &&
      typeof parsed === "object" &&
      "type" in parsed &&
      (parsed as { type?: unknown }).type === "message" &&
      "data" in parsed
    ) {
      const wrapped = (parsed as { data?: unknown }).data;

      if (isLeaderboardEvent(wrapped)) {
        return wrapped;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function getSequenceForMode(mode: RaceMode) {
  return mode === "hard" ? REVERSED_SWEDISH_ALPHABET : SWEDISH_ALPHABET;
}

export function AlphabetRace() {
  const [username, setUsername] = useState("");
  const [committedUsername, setCommittedUsername] = useState("");
  const [raceInput, setRaceInput] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse["leaderboard"]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [phase, setPhase] = useState<RacePhase>("idle");
  const [hasMistake, setHasMistake] = useState(false);
  const [realtimeEnabled, setRealtimeEnabled] = useState(false);
  const [selectedMode, setSelectedMode] = useState<RaceMode>("normal");
  const [leaderboardMode, setLeaderboardMode] = useState<RaceMode>("normal");

  const startedAtRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const raceInputRef = useRef<HTMLInputElement | null>(null);
  const usernameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadLeaderboard() {
      try {
        const response = await fetch(`/api/highscores?mode=${leaderboardMode}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Unable to load highscores.");
        }

        const payload = (await response.json()) as LeaderboardResponse;

        if (cancelled) {
          return;
        }

        setLeaderboard(payload.leaderboard.slice(0, LEADERBOARD_LIMIT));
        setRealtimeEnabled(payload.realtimeEnabled);
      } catch {
        if (cancelled) {
          return;
        }
      }
    }

    void loadLeaderboard();

    return () => {
      cancelled = true;
    };
  }, [leaderboardMode]);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const scheduleReconnect = () => {
      if (cancelled) {
        return;
      }

      reconnectTimeout = setTimeout(() => {
        void connectRealtime();
      }, 1200);
    };

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
          const message = parseRealtimeMessage(event.data);

          if (message) {
            const eventMode = isValidMode((message as { mode?: unknown }).mode)
              ? (message as { mode: RaceMode }).mode
              : "normal";

            if (eventMode === leaderboardMode) {
              setLeaderboard(message.leaderboard.slice(0, LEADERBOARD_LIMIT));
            }
          }
        };

        socket.onclose = () => {
          if (socketRef.current === socket) {
            socketRef.current = null;
          }

          scheduleReconnect();
        };
      } catch {
        if (!cancelled) {
          // Realtime is optional; keep UI working without it.
          scheduleReconnect();
        }
      }
    }

    void connectRealtime();

    return () => {
      cancelled = true;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [leaderboardMode]);

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
      return;
    }

    setUsername(cleanUsername);
    setCommittedUsername(cleanUsername);
    setRaceInput("");
    setHasMistake(false);
    setElapsedMs(0);
    setPhase("racing");
    startedAtRef.current = null;

    window.requestAnimationFrame(() => {
      raceInputRef.current?.focus();
    });
  }

  async function finishRace(durationMs: number, mode: RaceMode, sequence: string) {
    setPhase("finished");
    setElapsedMs(durationMs);

    try {
      const response = await fetch("/api/race/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
          username: committedUsername,
          durationMs,
          sequence,
        }),
      });

      const payload = (await response.json()) as RaceSubmissionResponse | { error: string };

      if (!response.ok || "error" in payload) {
        throw new Error(
          "error" in payload ? payload.error : "Unable to submit race.",
        );
      }

      if (payload.mode === leaderboardMode) {
        setLeaderboard(payload.leaderboard.slice(0, LEADERBOARD_LIMIT));
      }
    } catch {
      // Keep UX uninterrupted even if persistence fails.
    }
  }

  async function handleRaceInput(value: string) {
    const sanitized = sanitizeRaceInput(value);
    const activeSequence = getSequenceForMode(selectedMode);

    if (phase !== "racing") {
      setRaceInput(sanitized);
      return;
    }

    if (sanitized.length > 0 && startedAtRef.current === null) {
      startedAtRef.current = performance.now();
    }

    const correctPrefix = isCorrectPrefix(sanitized, activeSequence);

    setRaceInput(sanitized);
    setHasMistake(!correctPrefix);

    if (!correctPrefix) {
      return;
    }

    if (sanitized === activeSequence && startedAtRef.current !== null) {
      const durationMs = performance.now() - startedAtRef.current;
      await finishRace(durationMs, selectedMode, activeSequence);
    }
  }

  function backToStart() {
    setRaceInput("");
    setHasMistake(false);
    setElapsedMs(0);
    setPhase("idle");
    startedAtRef.current = null;

    window.requestAnimationFrame(() => {
      usernameInputRef.current?.focus();
    });
  }

  function startNewAttempt() {
    if (!committedUsername) {
      return;
    }

    setRaceInput("");
    setHasMistake(false);
    setElapsedMs(0);
    setPhase("racing");
    startedAtRef.current = null;

    window.requestAnimationFrame(() => {
      raceInputRef.current?.focus();
    });
  }

  function changeMode(mode: RaceMode) {
    if (phase === "racing") {
      return;
    }

    setSelectedMode(mode);
    setLeaderboardMode(mode);

    if (phase === "finished") {
      startNewAttempt();
      return;
    }

    setRaceInput("");
    setHasMistake(false);
  }

  const activeSequence = getSequenceForMode(selectedMode);

  const progressCount = (() => {
    let count = 0;

    while (
      count < raceInput.length &&
      activeSequence.slice(0, count + 1) === raceInput.slice(0, count + 1)
    ) {
      count += 1;
    }

    return count;
  })();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="panel panel-glow relative overflow-hidden p-5 sm:p-6">
          <div className="relative flex flex-col gap-5">
            <div className="max-w-2xl space-y-4">
              <Image
                src="/wordmark.svg"
                alt={`${APP_NAME} ordmärke`}
                width={320}
                height={142}
                priority
                className="h-auto w-[200px] sm:w-[280px]"
              />
            </div>

            <div className="panel-subtle">
              <span className="field-label">spelläge</span>
              <div className="mode-switch mt-2">
                <button
                  type="button"
                  className={`mode-switch__button ${selectedMode === "normal" ? "mode-switch__button--active" : ""}`}
                  onClick={() => changeMode("normal")}
                  disabled={phase === "racing"}
                >
                  Normal
                </button>
                <button
                  type="button"
                  className={`mode-switch__button ${selectedMode === "hard" ? "mode-switch__button--active" : ""}`}
                  onClick={() => changeMode("hard")}
                  disabled={phase === "racing"}
                >
                  Hard
                </button>
              </div>
            </div>

            {phase === "idle" ? (
              <div className="min-h-[220px] rounded-[22px] border border-[rgba(28,41,64,0.12)] bg-[rgba(233,241,252,0.62)] p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22)]">
                <p className="field-label">så här kör du</p>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-[var(--color-copy)]">
                  <li>Skriv in alfabetet från A till Ö så snabbt du kan</li>
                  <li>Bokstäverna måste skrivas i rätt ordning</li>
                  <li>Använd samma namn för att slå ditt rekord - din bästa tid visas i Topplistan!</li>
                  <li>Hard mode kräver alfabetet baklänges utan synliga ledtrådar</li>
                </ul>
                <p className="mt-4 text-sm italic leading-5 text-[var(--color-copy-soft)]">
                  OBS! Efter eventet kommer all speldata att raderas från databasen - men du är välkommen att använda ett smeknamn/fiktivt namn när du spelar
                </p>
              </div>
            ) : (
              <div className="min-h-[220px] rounded-[22px] border border-[rgba(28,41,64,0.12)] bg-[rgba(233,241,252,0.62)] p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22)]">
                <div className="mb-3 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-[var(--color-copy-soft)]">
                  <span className={`status-lamp ${phase === "racing" ? "status-lamp--hot" : ""}`} />
                </div>

                <div className="alphabet-strip" aria-hidden="true">
                  {[...activeSequence].map((character, index) => {
                    const isLocked = index < progressCount;

                    return (
                      <span
                        key={`${character}-${index}`}
                        className={[
                          "alphabet-strip__character",
                          isLocked ? "alphabet-strip__character--locked" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {isLocked ? character.toUpperCase() : ""}
                      </span>
                    );
                  })}
                </div>

                <label className="mt-4 block space-y-2">
                  <span className="field-label">
                    skriv det svenska alfabetet{selectedMode === "hard" ? " baklänges" : ""}
                  </span>
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
                    placeholder={selectedMode === "hard" ? "öäåzyx..." : SWEDISH_ALPHABET.toUpperCase()}
                    disabled={phase === "finished"}
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
              </div>
            )}

            {phase === "idle" ? (
              <div className="panel-subtle min-h-[96px]">
                <span className="field-label">namn</span>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_190px] sm:items-center">
                  <input
                    ref={usernameInputRef}
                    value={username}
                    onChange={(event) => setUsername(normalizeUsername(event.target.value))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        startRace();
                      }
                    }}
                    className="retro-input"
                    placeholder="Namn"
                    maxLength={24}
                    autoComplete="nickname"
                  />
                  <button
                    type="button"
                    className="pixel-button pixel-button--flat h-[50px] w-full justify-center"
                    onClick={startRace}
                  >
                    Start
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_190px] md:items-stretch">
                <div className="retro-meter min-h-[96px]">
                  <span className="retro-meter__label">tid</span>
                  <strong className="retro-meter__value">{formatDuration(elapsedMs)}</strong>
                  <span className="retro-meter__hint">
                    {phase === "racing" ? "Pågår" : phase === "finished" ? "Klar" : "Redo"}
                  </span>
                </div>

                <div className="retro-meter min-h-[96px]">
                  <span className="retro-meter__label">kör som</span>
                  <strong className="retro-meter__value truncate text-[var(--color-copy)]">
                    {committedUsername}
                  </strong>
                </div>

                <div className="flex h-full min-h-[96px] flex-col justify-center gap-2">
                  <button
                    type="button"
                    className="pixel-button pixel-button--ghost w-full justify-center"
                    onClick={backToStart}
                  >
                    Tillbaka
                  </button>
                  <button
                    type="button"
                    className="pixel-button w-full justify-center"
                    onClick={startNewAttempt}
                  >
                    Nytt försök
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>

        <aside className="panel p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4 border-b border-[rgba(28,41,64,0.12)] pb-4">
            <div>
              <p className="eyebrow">topplista</p>
              <h2 className="font-display text-lg uppercase text-[var(--color-copy)] sm:text-xl">
                Bästa tider
              </h2>
              <div className="mode-switch mode-switch--compact mt-3">
                <button
                  type="button"
                  className={`mode-switch__button ${leaderboardMode === "normal" ? "mode-switch__button--active" : ""}`}
                  onClick={() => setLeaderboardMode("normal")}
                >
                  Normal
                </button>
                <button
                  type="button"
                  className={`mode-switch__button ${leaderboardMode === "hard" ? "mode-switch__button--active" : ""}`}
                  onClick={() => setLeaderboardMode("hard")}
                >
                  Hard
                </button>
              </div>
            </div>
            <span className={`status-lamp ${realtimeEnabled ? "status-lamp--hot" : ""}`} />
          </div>

          <div className="mt-4 space-y-2.5">
            {leaderboard.length > 0 ? (
              leaderboard.map((entry, index) => (
                <div key={entry.id} className="leaderboard-row">
                  <span className="leaderboard-row__rank">#{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg text-[var(--color-copy)]">{entry.username}</p>
                  </div>
                  <strong className="text-base text-[var(--color-accent)]">
                    {formatDuration(entry.bestTimeMs)}
                  </strong>
                </div>
              ))
            ) : (
              <div className="panel-subtle">
                <p className="text-lg text-[var(--color-copy)]">Inga tider på tavlan än.</p>
                <p className="mt-2 text-sm text-[var(--color-copy-soft)]">Bli först med att sätta en tid.</p>
              </div>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}