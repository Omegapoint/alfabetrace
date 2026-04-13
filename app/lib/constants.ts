export const APP_NAME = "Alfabetsrace";
export const APP_DESCRIPTION =
  "Skriv dig genom det svenska alfabetet, jaga din bästa tid och se topplistan uppdateras live i realtid.";

export const SWEDISH_ALPHABET = "abcdefghijklmnopqrstuvwxyzåäö";
export const REVERSED_SWEDISH_ALPHABET = [...SWEDISH_ALPHABET].reverse().join("");
export const RACE_MODES = ["normal", "hard"] as const;
export const LEADERBOARD_LIMIT = 10;
export const MIN_USERNAME_LENGTH = 2;
export const MAX_USERNAME_LENGTH = 24;
export const MAX_RACE_DURATION_MS = 10 * 60 * 1000;

export const SWEDISH_ALPHABET_CHARACTERS = new Set([...SWEDISH_ALPHABET]);