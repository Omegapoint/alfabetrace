const defaultCosmosDatabaseName = "alfabetsrace";
const defaultHighscoresContainerName = "highscores";
const defaultWebPubSubHubName = "highscores";

export const serverEnv = {
  cosmosConnectionString: process.env.AZURE_COSMOS_CONNECTION_STRING?.trim(),
  cosmosDatabaseName:
    process.env.AZURE_COSMOS_DATABASE_NAME?.trim() ?? defaultCosmosDatabaseName,
  cosmosHighscoresContainerName:
    process.env.AZURE_COSMOS_HIGHSCORES_CONTAINER?.trim() ??
    defaultHighscoresContainerName,
  webPubSubConnectionString:
    process.env.AZURE_WEB_PUBSUB_CONNECTION_STRING?.trim(),
  webPubSubHubName:
    process.env.NEXT_PUBLIC_WEB_PUBSUB_HUB_NAME?.trim() ??
    defaultWebPubSubHubName,
  adminSecret: process.env.ADMIN_SECRET?.trim(),
};

export function hasCosmosConfig() {
  return Boolean(serverEnv.cosmosConnectionString);
}

export function hasWebPubSubConfig() {
  return Boolean(serverEnv.webPubSubConnectionString);
}

export function getAdminSecret() {
  return serverEnv.adminSecret ?? "";
}