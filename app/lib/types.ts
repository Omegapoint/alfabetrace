export type StorageMode = "azure" | "memory";

export type HighscoreEntry = {
  id: string;
  username: string;
  normalizedUsername: string;
  bestTimeMs: number;
  attempts: number;
  updatedAt: string;
  lastCompletedAt: string;
};

export type LeaderboardEvent =
  | {
      type: "leaderboard.updated";
      entry: HighscoreEntry;
      leaderboard: HighscoreEntry[];
    }
  | {
      type: "leaderboard.reset";
      leaderboard: HighscoreEntry[];
    };

export type LeaderboardResponse = {
  leaderboard: HighscoreEntry[];
  storageMode: StorageMode;
  realtimeEnabled: boolean;
};

export type RaceSubmissionRequest = {
  username: string;
  durationMs: number;
  sequence: string;
};

export type RaceSubmissionResponse = {
  entry: HighscoreEntry;
  leaderboard: HighscoreEntry[];
  improved: boolean;
  storageMode: StorageMode;
};

export type RealtimeNegotiationResponse =
  | {
      enabled: true;
      url: string;
    }
  | {
      enabled: false;
    };

export type WipeResponse = {
  wiped: number;
  leaderboard: HighscoreEntry[];
  storageMode: StorageMode;
};