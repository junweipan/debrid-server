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

## Deploy to Netlify

1. Install dependencies (`npm install`) and add `serverless-http` is already listed in `package.json` for bundling the Express app into a Netlify Function.
2. Create a Netlify site:
   - `netlify init` to link the local folder, or use the Netlify UI and point it at your Git repository.
   - Keep the default build command empty (the API requires no build step) and let Netlify use the provided [`netlify.toml`](netlify.toml).
3. Configure environment variables in **Site settings → Build & deploy → Environment**. Set the same keys you would place in `.env` (`API_TOKEN`, `API_BASE_URL`, `OAUTH_BASE_URL`, `API_TIMEOUT_MS`, `PORT` is ignored in serverless environments).
4. Deploy (`git push` to your main branch or run `netlify deploy --prod`). Netlify uploads the API-only `public/` folder as the static artifact while compiling the function located at [`netlify/functions/api.js`](netlify/functions/api.js).
5. Call your endpoints at `https://<your-site>.netlify.app/api/...`. The redirect in `netlify.toml` rewrites `/api/*` traffic to the function entry point (`/.netlify/functions/api/:splat`).

For local parity you can run `netlify dev`, which proxies `/.netlify/functions/api` to the same Express stack defined in [`src/app.js`](src/app.js). This lets you hit `http://localhost:8888/api/account/infos` without starting the standalone Express server.

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
