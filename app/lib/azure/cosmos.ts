import { CosmosClient, type Container } from "@azure/cosmos";

import { LEADERBOARD_LIMIT } from "@/app/lib/constants";
import { hasCosmosConfig, serverEnv } from "@/app/lib/env";
import type { HighscoreEntry, StorageMode } from "@/app/lib/types";

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

export async function listHighscores(limit = LEADERBOARD_LIMIT) {
  if (!hasCosmosConfig()) {
    return {
      leaderboard: sortLeaderboard(getMemoryStore().values()).slice(0, limit),
      storageMode: getStorageMode(),
    };
  }

  const container = await getHighscoresContainer();
  const { resources } = await container.items
    .query<HighscoreEntry>({
      query:
        "SELECT * FROM c ORDER BY c.bestTimeMs ASC, c.updatedAt ASC OFFSET 0 LIMIT @limit",
      parameters: [{ name: "@limit", value: limit }],
    })
    .fetchAll();

  return {
    leaderboard: resources,
    storageMode: getStorageMode(),
  };
}

export async function upsertBestTime(input: {
  username: string;
  normalizedUsername: string;
  durationMs: number;
}) {
  const now = new Date().toISOString();

  if (!hasCosmosConfig()) {
    const store = getMemoryStore();
    const existing = store.get(input.normalizedUsername);

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
          id: input.normalizedUsername,
          username: input.username,
          normalizedUsername: input.normalizedUsername,
          bestTimeMs: input.durationMs,
          attempts: 1,
          updatedAt: now,
          lastCompletedAt: now,
        };

    store.set(input.normalizedUsername, nextEntry);

    return {
      entry: nextEntry,
      improved: !existing || input.durationMs < existing.bestTimeMs,
      storageMode: getStorageMode(),
    };
  }

  const container = await getHighscoresContainer();
  let existing: HighscoreEntry | undefined;

  try {
    const { resource } = await container
      .item(input.normalizedUsername, input.normalizedUsername)
      .read<HighscoreEntry>();
    existing = resource;
  } catch {
    existing = undefined;
  }

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
        id: input.normalizedUsername,
        username: input.username,
        normalizedUsername: input.normalizedUsername,
        bestTimeMs: input.durationMs,
        attempts: 1,
        updatedAt: now,
        lastCompletedAt: now,
      };

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