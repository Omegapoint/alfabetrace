# Alfabetsrace

Retro Swedish alphabet time trial built with Next.js 16. Players enter a username, type `abcdefghijklmnopqrstuvwxyzåäö` as fast as possible, and compete on a persistent leaderboard where each username keeps only its best time.

## Features

- Retro single-screen race UI using the provided wordmark and square logo.
- Best-time-per-username storage using Azure Cosmos DB when configured.
- Live leaderboard fan-out through Azure Web PubSub.
- Admin wipe console at `/admin` protected by a shared secret.
- Local in-memory fallback for development when Azure credentials are not configured.

## Local development

Install dependencies and start the app:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

Create `.env.local` with the values you want to use:

```bash
AZURE_COSMOS_CONNECTION_STRING="AccountEndpoint=https://...;AccountKey=...;"
AZURE_COSMOS_DATABASE_NAME="alfabetsrace"
AZURE_COSMOS_HIGHSCORES_CONTAINER="highscores"
AZURE_WEB_PUBSUB_CONNECTION_STRING="Endpoint=https://...;AccessKey=...;Version=1.0;"
NEXT_PUBLIC_WEB_PUBSUB_HUB_NAME="highscores"
ADMIN_SECRET="replace-with-a-long-random-secret"
```

Notes:

- If `AZURE_COSMOS_CONNECTION_STRING` is missing, the app stores highscores in memory and resets on restart.
- If `AZURE_WEB_PUBSUB_CONNECTION_STRING` is missing, the app still works but live multi-client leaderboard updates are disabled.
- `ADMIN_SECRET` is required for the wipe endpoint and `/admin` workflow.

## Azure resource shape

Minimum services for the intended production setup:

1. Azure Cosmos DB for NoSQL.
2. Azure Web PubSub.
3. Azure Static Web Apps with hybrid Next.js hosting, or Azure App Service if you want a more mature runtime target.

Recommended Cosmos settings:

- Database: `alfabetsrace`
- Container: `highscores`
- Partition key: `/normalizedUsername`

The app creates the database and container on demand if the configured account allows it.

## Admin wipe flow

Visit `/admin`, enter the shared secret, and type `WIPE HIGHSCORES` exactly. The app deletes all leaderboard records and broadcasts a reset event to connected clients.

## Verification

Run these checks before deploying:

```bash
npm run lint
npm run build
```

Manual checks:

1. Complete a race with a new username and confirm it appears on the leaderboard.
2. Repeat with the same username and a slower time; confirm the best time does not worsen.
3. Repeat with the same username and a faster time; confirm the existing row updates.
4. Open two browser sessions with Azure Web PubSub configured and confirm a new score appears live in both.
5. Type a wrong character during a race, confirm the timer keeps running, backspace the bad tail, and finish successfully.

## Deployment notes

Azure Static Web Apps hybrid Next.js supports App Router and Route Handlers, which is enough for this app. Realtime transport is delegated to Azure Web PubSub, so the app runtime does not need to host raw WebSocket sessions directly.

If Static Web Apps preview constraints become a problem, move the same app to Azure App Service and keep the rest of the architecture unchanged.

## Infrastructure as Code (Bicep)

The repository includes Bicep templates in `infra/` for a low-cost Azure setup:

1. Cosmos DB for NoSQL in serverless mode.
2. Web PubSub in Free tier (`Free_F1`).
3. Static Web Apps in Free tier.

### Prerequisites

1. Azure CLI installed and authenticated.
2. Access to an Azure subscription.

```bash
az login
az account set --subscription "<subscription-id-or-name>"
```

### Deploy from local machine

Create the resource group:

```bash
az group create --name alfabetsrace-prod-rg --location westeurope --tags "Creation date=2026-04-10" "Keep until=2027-04-10" "Responsible email=erik.rundberg@omegapoint.se"
```

Validate infrastructure:

```bash
az deployment group validate \
	--resource-group alfabetsrace-prod-rg \
	--template-file infra/main.bicep \
	--parameters infra/parameters/prod.bicepparam
```

Deploy infrastructure:

```bash
az deployment group create \
	--name infra-prod-$(date +%Y%m%d%H%M%S) \
	--resource-group alfabetsrace-prod-rg \
	--template-file infra/main.bicep \
	--parameters infra/parameters/prod.bicepparam
```

Read deployment outputs (resource names, hostnames):

```bash
az deployment group show \
	--resource-group alfabetsrace-prod-rg \
	--name <deployment-name> \
	--query properties.outputs
```

### GitHub Actions: infrastructure deployment

Workflow: `.github/workflows/infra-deploy.yml`

Required repository secret:

- `AZURE_CREDENTIALS`: Service principal JSON for `azure/login`.

Run from GitHub Actions (workflow is fixed to `prod`).

### GitHub Actions: app deployment

Workflow: `.github/workflows/app-deploy.yml`

Required repository secrets:

- `AZURE_STATIC_WEB_APPS_API_TOKEN`
- `AZURE_COSMOS_CONNECTION_STRING`
- `AZURE_WEB_PUBSUB_CONNECTION_STRING`
- `ADMIN_SECRET`

Optional repository variables (defaults exist in workflow):

- `AZURE_COSMOS_DATABASE_NAME` (default `alfabetsrace`)
- `AZURE_COSMOS_HIGHSCORES_CONTAINER` (default `highscores`)
- `NEXT_PUBLIC_WEB_PUBSUB_HUB_NAME` (default `highscores`)

The app deployment workflow runs on push to `main`.

### Static Web Apps runtime app settings (required)

For hybrid Next.js, environment variables passed in GitHub Actions are used during build, but SSR/API runtime settings are read from the Static Web Apps resource.

Set these in Azure Portal under Static Web App -> Environment variables (Production), or with Azure CLI:

```bash
az staticwebapp appsettings set \
	--name <static-web-app-name> \
	--resource-group alfabetsrace-prod-rg \
	--setting-names \
	AZURE_COSMOS_CONNECTION_STRING="<cosmos-connection-string>" \
	AZURE_COSMOS_DATABASE_NAME="alfabetsrace" \
	AZURE_COSMOS_HIGHSCORES_CONTAINER="highscores" \
	AZURE_WEB_PUBSUB_CONNECTION_STRING="<webpubsub-connection-string>" \
	NEXT_PUBLIC_WEB_PUBSUB_HUB_NAME="highscores" \
	ADMIN_SECRET="<admin-secret>"
```

After updating app settings, trigger a new deployment or restart the app so runtime picks up the new values.

### One-time secret wiring after infra deployment

After infrastructure deployment, get runtime secrets with Azure CLI and add them to GitHub repository secrets.

Get Cosmos DB connection string:

```bash
az cosmosdb keys list \
	--resource-group alfabetsrace-prod-rg \
	--name alfrace-prod-cosmos-ljwqk3vakfmme \
	--type connection-strings \
	--query "connectionStrings[0].connectionString" \
	-o tsv
```

Get Web PubSub connection string:

```bash
az webpubsub key show \
	--resource-group alfabetsrace-prod-rg \
	--name alfrace-prod-wps-ljwqk3vakfmme \
	--query primaryConnectionString \
	-o tsv
```

Get Static Web Apps deployment token:

```bash
az staticwebapp secrets list \
	--resource-group alfabetsrace-prod-rg \
	--name <static-web-app-name> \
	--query properties.apiKey \
	-o tsv
```

Set these GitHub repository secrets:

1. `AZURE_COSMOS_CONNECTION_STRING`
2. `AZURE_WEB_PUBSUB_CONNECTION_STRING`
3. `AZURE_STATIC_WEB_APPS_API_TOKEN`

Also generate and set:

1. `ADMIN_SECRET` with a long random value.

Example generator:

```bash
openssl rand -hex 32
```
