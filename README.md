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
