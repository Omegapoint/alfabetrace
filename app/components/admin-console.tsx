"use client";

import Link from "next/link";
import { useState } from "react";

import type { WipeResponse } from "@/app/lib/types";

const confirmationPhrase = "WIPE HIGHSCORES";

export function AdminConsole() {
  const [secret, setSecret] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState(
    "Provide the shared admin secret and exact confirmation phrase to clear the board.",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function wipeScores() {
    if (confirmation !== confirmationPhrase) {
      setMessage(`Type ${confirmationPhrase} exactly before wiping.`);
      return;
    }

    setIsSubmitting(true);
    setMessage("Wiping highscore records...");

    try {
      const response = await fetch("/api/admin/wipe", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ secret }),
      });

      const payload = (await response.json()) as WipeResponse | { error: string };

      if (!response.ok || "error" in payload) {
        throw new Error(
          "error" in payload ? payload.error : "Unable to wipe highscores.",
        );
      }

      setMessage(
        `Wiped ${payload.wiped} records from the ${payload.storageMode} leaderboard store.`,
      );
      setConfirmation("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to wipe highscores.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-8 sm:px-6">
      <section className="panel panel-glow w-full p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <p className="eyebrow">operator console</p>
            <h1 className="font-display text-2xl uppercase text-white sm:text-3xl">
              Admin wipe
            </h1>
          </div>
          <Link href="/" className="text-sm uppercase tracking-[0.3em] text-[var(--color-copy-soft)] transition hover:text-white">
            return to race
          </Link>
        </div>

        <div className="mt-6 grid gap-4">
          <label className="space-y-2">
            <span className="field-label">admin secret</span>
            <input
              type="password"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              className="retro-input"
              placeholder="shared server secret"
            />
          </label>

          <label className="space-y-2">
            <span className="field-label">confirmation phrase</span>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="retro-input"
              placeholder={confirmationPhrase}
              autoCapitalize="characters"
              spellCheck={false}
            />
          </label>

          <div className="panel-subtle">
            <p className="text-lg text-white">{message}</p>
            <p className="mt-2 text-base text-[var(--color-copy-soft)]">
              This clears the leaderboard and broadcasts a reset event to connected clients.
            </p>
          </div>

          <button
            type="button"
            className="pixel-button w-full justify-center sm:w-auto"
            onClick={wipeScores}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Wiping..." : "Wipe database"}
          </button>
        </div>
      </section>
    </main>
  );
}