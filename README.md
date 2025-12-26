# Debrid-Link Express Server

This package exposes every API endpoint documented in the [Debrid-Link v2 introduction](https://debrid-link.com/api_doc/v2/introduction) through a local Express app. Each route forwards requests to the official API, so you can add rate limiting, auth helpers, or custom logging without touching the upstream service.

## Quick start

1. Copy the environment template: `cp .env.example .env` (PowerShell: `Copy-Item .env.example .env`).
2. Add your Debrid-Link OAuth token or API key to `API_TOKEN` (optional but avoids resending headers in each request).
3. Install dependencies: `npm install`.
4. Launch the server:
   - Development (auto-reload): `npm run dev`
   - Production: `npm start`

The server listens on the port defined in `.env` (`4000` by default).

## Deploying to Vercel

1. Install the Vercel CLI (`npm i -g vercel`) and authenticate with `vercel login`.
2. Link this project (`vercel link`) and deploy once (`vercel`) so Vercel creates the dashboard entry.
3. In the Vercel dashboard (or via `vercel env`), add the same environment variables you use locally (`API_BASE_URL`, `OAUTH_BASE_URL`, `API_TIMEOUT_MS`, `API_TOKEN`). Vercel injects them into the serverless function automatically; secrets should never be committed to Git.
4. Trigger a production deployment with `vercel --prod` (or from the dashboard). All routes rewrite to `api/index.js`, which reuses the Express app defined in `src/app.js`.

`vercel.json` already contains the build/rewrites needed for the serverless deployment, so no further configuration is required.

## Available routes

All endpoints from the introduction page are available:

- `/account/infos`, `/account/update`
- `/seedbox/...` (list, activity, add, remove, zip, config, limits, RSS helpers)
- `/downloader/...` (list, add, remove, hosts, domains, regex, limits)
- `/files/:idParent/list`
- `/stream/transcode/...`
- OAuth helpers at `/oauth/token`, `/oauth/device/code`, `/oauth/revoke`

Use the standard HTTP verb described in the Debrid-Link docs. The server forwards headers, body, and query parameters directly to the upstream API.

## Configuration notes

- `API_TOKEN` is injected into the `Authorization` header when clients do not send one. Leave it blank to force callers to manage auth themselves.
- `API_TIMEOUT_MS` controls the upstream request timeout (default `15000`).
- The proxy currently supports JSON payloads. For file uploads or multipart data you will need to add additional middleware (e.g., `multer`).
- `TEST_ACCOUNT_INFOS_AUTH` overrides the bearer token used by the built-in tester page (defaults to the sample token in `.env.example`).

## Health check

`GET /health` returns a lightweight JSON payload you can use for readiness probes.

## Manual tester UI

Navigate to `http://localhost:4000/tester` (replace the host/port if you changed them) to load a minimal UI that calls `GET https://debrid-link.com/api/v2/account/infos` with the required headers. The UI sends its request to `/tester/account-infos`, which forwards the call with:

- `Authorization: Bearer …` (configure via `TEST_ACCOUNT_INFOS_AUTH`)
- `Accept: application/json`

Use this page to validate your credentials or quickly inspect the upstream payload without writing your own client.
