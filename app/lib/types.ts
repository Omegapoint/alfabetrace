export type StorageMode = "azure" | "memory";
export type RaceMode = "normal" | "hard";

export type HighscoreEntry = {
  id: string;
  mode: RaceMode;
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
      mode: RaceMode;
      entry: HighscoreEntry;
      leaderboard: HighscoreEntry[];
    }
  | {
      type: "leaderboard.reset";
      mode: RaceMode;
      leaderboard: HighscoreEntry[];
    };

export type LeaderboardResponse = {
  mode: RaceMode;
  leaderboard: HighscoreEntry[];
  storageMode: StorageMode;
  realtimeEnabled: boolean;
};

export type RaceSubmissionRequest = {
  mode: RaceMode;
  username: string;
  durationMs: number;
  sequence: string;
};

export type RaceSubmissionResponse = {
  mode: RaceMode;
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