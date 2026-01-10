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

## Available routes

### Debrid-Link proxy endpoints

All endpoints from the introduction page are available:

- `/account/infos`, `/account/update`
- `/seedbox/...` (list, activity, add, remove, zip, config, limits, RSS helpers)
- `/downloader/...` (list, add, remove, hosts, domains, regex, limits)
- `/files/:idParent/list`
- `/stream/transcode/...`
- OAuth helpers at `/oauth/token`, `/oauth/device/code`, `/oauth/revoke`

Use the standard HTTP verb described in the Debrid-Link docs. The server forwards headers, body, and query parameters directly to the upstream API.

### Mongo-backed user CRUD

The server now exposes first-class CRUD helpers backed by MongoDB. Every user document stores `email`, `password`, `storage_all`, `storage_used`, `deleted`, `created_at`, and `updated_at`.

- `POST /users` – create a user. Fails with `409` when the email already exists.
- `GET /users` – list non-deleted users. Use `GET /users?includeDeleted=true` to include soft-deleted entries.
- `GET /users/:id` – fetch a single user by identifier.
- `PUT /users/:id` – update any subset of fields. Validation prevents `storage_used` from exceeding `storage_all`.
- `DELETE /users/:id` – marks a user as deleted (soft delete) and updates `updated_at`.

### Email verification flow

- `POST /users/register/request-verification` – accepts an `email`, ensures it is unused, stores a short-lived token in the `verify_email` collection, and dispatches a MailerSend verification email. Responds with `202 Accepted`.
- `POST /users/register` – creates an account only when the request includes a valid `verification_token` (from the email above) along with the usual registration payload. Tokens expire after 24 hours and are single-use.
- Expired verification requests are cleaned up automatically via a TTL index on `verify_email.expires_at_ts`, so MongoDB removes stale documents without manual cron jobs.

## Configuration notes

- `API_TOKEN` is injected into the `Authorization` header when clients do not send one. Leave it blank to force callers to manage auth themselves.
- `API_TIMEOUT_MS` controls the upstream request timeout (default `15000`).
- `MONGODB_URI` points to your MongoDB deployment (defaults to `mongodb://127.0.0.1:27017/debrid`).
- `MONGODB_DB_NAME` selects the database that stores the user collection (defaults to `debrid`).
- `MONGODB_USERS_COLLECTION` customizes the collection that stores user documents (defaults to `users`).
- `MONGODB_VERIFY_EMAIL_COLLECTION` customizes the collection that stores pending email verification tokens (defaults to `verify_email`).
- `EMAIL_VERIFICATION_URL` builds the verification link in outgoing emails. Include `%token%` to control token placement, or omit it to have the API append `?token=...` automatically.
- The proxy currently supports JSON payloads. For file uploads or multipart data you will need to add additional middleware (e.g., `multer`).
- `TEST_ACCOUNT_INFOS_AUTH` overrides the bearer token used by the built-in tester page (defaults to the sample token in `.env.example`).

## Health check

`GET /health` returns a lightweight JSON payload you can use for readiness probes.

## Manual tester UI

Navigate to `http://localhost:4000/tester` (replace the host/port if you changed them) to load a minimal UI that calls `GET https://debrid-link.com/api/v2/account/infos` with the required headers. The UI sends its request to `/tester/account-infos`, which forwards the call with:

- `Authorization: Bearer …` (configure via `TEST_ACCOUNT_INFOS_AUTH`)
- `Accept: application/json`

Use this page to validate your credentials or quickly inspect the upstream payload without writing your own client.
