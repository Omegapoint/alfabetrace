import { CosmosClient, type Container } from "@azure/cosmos";

import { LEADERBOARD_LIMIT } from "@/app/lib/constants";
import { hasCosmosConfig, serverEnv } from "@/app/lib/env";
import type { HighscoreEntry, RaceMode, StorageMode } from "@/app/lib/types";

declare global {
  var __alfabetsraceCosmosClient: CosmosClient | undefined;
  var __alfabetsraceMemoryLeaderboard:
    | Map<string, HighscoreEntry>
    | undefined;
}

function getStorageMode(): StorageMode {
  return hasCosmosConfig() ? "azure" : "memory";
}

function getMemoryStore() {
  if (!globalThis.__alfabetsraceMemoryLeaderboard) {
    globalThis.__alfabetsraceMemoryLeaderboard = new Map<string, HighscoreEntry>();
  }

  return globalThis.__alfabetsraceMemoryLeaderboard;
}

function getCosmosClient() {
  if (!serverEnv.cosmosConnectionString) {
    throw new Error("Missing Azure Cosmos DB connection string.");
  }

  if (!globalThis.__alfabetsraceCosmosClient) {
    globalThis.__alfabetsraceCosmosClient = new CosmosClient(
      serverEnv.cosmosConnectionString,
    );
  }

  return globalThis.__alfabetsraceCosmosClient;
}

async function getHighscoresContainer(): Promise<Container> {
  const client = getCosmosClient();
  const { database } = await client.databases.createIfNotExists({
    id: serverEnv.cosmosDatabaseName,
  });
  const { container } = await database.containers.createIfNotExists({
    id: serverEnv.cosmosHighscoresContainerName,
    partitionKey: "/normalizedUsername",
  });

  return container;
}

function sortLeaderboard(entries: Iterable<HighscoreEntry>) {
  return [...entries].sort((left, right) => {
    if (left.bestTimeMs !== right.bestTimeMs) {
      return left.bestTimeMs - right.bestTimeMs;
    }

    return left.updatedAt.localeCompare(right.updatedAt);
  });
}

function buildEntryId(normalizedUsername: string, mode: RaceMode) {
  return `${normalizedUsername}:${mode}`;
}

export async function listHighscores(limit = LEADERBOARD_LIMIT, mode: RaceMode = "normal") {
  if (!hasCosmosConfig()) {
    const filtered = [...getMemoryStore().values()].filter((entry) => {
      const entryMode = entry.mode ?? "normal";
      return entryMode === mode;
    });

    return {
      leaderboard: sortLeaderboard(filtered).slice(0, limit),
      storageMode: getStorageMode(),
    };
  }

  const container = await getHighscoresContainer();
  const { resources } = await container.items
    .query<HighscoreEntry>({
      query: "SELECT * FROM c",
    })
    .fetchAll();

  const filtered = resources.filter((entry) => {
    const entryMode = entry.mode ?? "normal";
    return entryMode === mode;
  });

  return {
    leaderboard: sortLeaderboard(filtered).slice(0, limit),
    storageMode: getStorageMode(),
  };
}

export async function upsertBestTime(input: {
  mode: RaceMode;
  username: string;
  normalizedUsername: string;
  durationMs: number;
}) {
  const now = new Date().toISOString();

  if (!hasCosmosConfig()) {
    const store = getMemoryStore();
    const entryId = buildEntryId(input.normalizedUsername, input.mode);
    const existing = store.get(entryId);

    const nextEntry: HighscoreEntry = existing
      ? {
          ...existing,
          username: input.username,
          attempts: existing.attempts + 1,
          updatedAt:
            input.durationMs < existing.bestTimeMs ? now : existing.updatedAt,
          bestTimeMs:
            input.durationMs < existing.bestTimeMs
              ? input.durationMs
              : existing.bestTimeMs,
          lastCompletedAt: now,
        }
      : {
          id: entryId,
          mode: input.mode,
          username: input.username,
          normalizedUsername: input.normalizedUsername,
          bestTimeMs: input.durationMs,
          attempts: 1,
          updatedAt: now,
          lastCompletedAt: now,
        };

    store.set(entryId, nextEntry);

    return {
      entry: nextEntry,
      improved: !existing || input.durationMs < existing.bestTimeMs,
      storageMode: getStorageMode(),
    };
  }

  const container = await getHighscoresContainer();
  let existing: HighscoreEntry | undefined;
  let existingDocumentId: string | null = null;
  const entryId = buildEntryId(input.normalizedUsername, input.mode);

  try {
    const { resource } = await container
      .item(entryId, input.normalizedUsername)
      .read<HighscoreEntry>();
    existing = resource;
    existingDocumentId = resource?.id ?? null;
  } catch {
    existing = undefined;
  }

  if (!existing && input.mode === "normal") {
    try {
      const { resource } = await container
        .item(input.normalizedUsername, input.normalizedUsername)
        .read<HighscoreEntry>();
      existing = resource;
      existingDocumentId = resource?.id ?? null;
    } catch {
      existing = undefined;
      existingDocumentId = null;
    }
  }

  const nextEntry: HighscoreEntry = existing
    ? {
        ...existing,
        id: entryId,
        mode: input.mode,
        username: input.username,
        attempts: existing.attempts + 1,
        updatedAt:
          input.durationMs < existing.bestTimeMs ? now : existing.updatedAt,
        bestTimeMs:
          input.durationMs < existing.bestTimeMs
            ? input.durationMs
            : existing.bestTimeMs,
        lastCompletedAt: now,
      }
    : {
        id: entryId,
        mode: input.mode,
        username: input.username,
        normalizedUsername: input.normalizedUsername,
        bestTimeMs: input.durationMs,
        attempts: 1,
        updatedAt: now,
        lastCompletedAt: now,
      };

  if (existingDocumentId && existingDocumentId !== entryId) {
    await container.item(existingDocumentId, input.normalizedUsername).delete();
  }

  await container.items.upsert(nextEntry);

  return {
    entry: nextEntry,
    improved: !existing || input.durationMs < existing.bestTimeMs,
    storageMode: getStorageMode(),
  };
}

export async function wipeHighscores() {
  if (!hasCosmosConfig()) {
    const wiped = getMemoryStore().size;
    getMemoryStore().clear();

    return {
      wiped,
      storageMode: getStorageMode(),
    };
  }

  const container = await getHighscoresContainer();
  const { resources } = await container.items
    .query<Pick<HighscoreEntry, "id" | "normalizedUsername">>(
      "SELECT c.id, c.normalizedUsername FROM c",
    )
    .fetchAll();

  await Promise.all(
    resources.map((resource) =>
      container.item(resource.id, resource.normalizedUsername).delete(),
    ),
  );

  return {
    wiped: resources.length,
    storageMode: getStorageMode(),
  };
}