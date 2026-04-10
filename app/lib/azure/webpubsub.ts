import { WebPubSubServiceClient } from "@azure/web-pubsub";

import { hasWebPubSubConfig, serverEnv } from "@/app/lib/env";
import type { LeaderboardEvent } from "@/app/lib/types";

declare global {
  var __alfabetsraceWebPubSubClient: WebPubSubServiceClient | undefined;
}

function getWebPubSubClient() {
  if (!serverEnv.webPubSubConnectionString) {
    throw new Error("Missing Azure Web PubSub connection string.");
  }

  if (!globalThis.__alfabetsraceWebPubSubClient) {
    globalThis.__alfabetsraceWebPubSubClient = new WebPubSubServiceClient(
      serverEnv.webPubSubConnectionString,
      serverEnv.webPubSubHubName,
    );
  }

  return globalThis.__alfabetsraceWebPubSubClient;
}

export async function negotiateRealtimeConnection() {
  if (!hasWebPubSubConfig()) {
    return null;
  }

  const client = getWebPubSubClient();
  return client.getClientAccessToken();
}

export async function broadcastLeaderboardEvent(event: LeaderboardEvent) {
  if (!hasWebPubSubConfig()) {
    return false;
  }

  const client = getWebPubSubClient();
  await client.sendToAll(event);

  return true;
}