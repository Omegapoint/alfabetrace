import {
  MAX_RACE_DURATION_MS,
  MAX_USERNAME_LENGTH,
  MIN_USERNAME_LENGTH,
  RACE_MODES,
  SWEDISH_ALPHABET,
  SWEDISH_ALPHABET_CHARACTERS,
} from "@/app/lib/constants";
import type { RaceMode } from "@/app/lib/types";

export function normalizeUsername(value: string) {
  return value
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}_ -]/gu, "")
    .slice(0, MAX_USERNAME_LENGTH);
}

export function normalizeUsernameKey(value: string) {
  return normalizeUsername(value).toLocaleLowerCase("sv-SE");
}

export function isValidUsername(value: string) {
  const normalized = normalizeUsername(value);

  return (
    normalized.length >= MIN_USERNAME_LENGTH &&
    normalized.length <= MAX_USERNAME_LENGTH
  );
}

export function sanitizeRaceInput(value: string) {
  const lowered = value.normalize("NFC").toLocaleLowerCase("sv-SE");

  return [...lowered]
    .filter((character) => SWEDISH_ALPHABET_CHARACTERS.has(character))
    .join("");
}

export function isValidAlphabetSequence(value: string, sequence = SWEDISH_ALPHABET) {
  return sanitizeRaceInput(value) === sequence;
}

export function isValidMode(value: unknown): value is RaceMode {
  return typeof value === "string" && RACE_MODES.includes(value as RaceMode);
}

export function isValidDuration(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= MAX_RACE_DURATION_MS
  );
}

export function isCorrectPrefix(value: string, sequence = SWEDISH_ALPHABET) {
  return sequence.startsWith(sanitizeRaceInput(value));
}