# AETHER — setup and operations

## Local development

Requirements: Node 20+, a local Postgres 14+.

```bash
npm install
createdb aether_dev
export DATABASE_URL=postgres://postgres@127.0.0.1:5432/aether_dev
export AUTH_SECRET=$(openssl rand -base64 48)
export DEV_OUTBOX=true          # confirmation links are shown in the app instead of emailed
npm run db:migrate              # applies db/migrations in order
npm run dev:api                 # API on http://localhost:8787
npm run dev                     # frontend on http://localhost:5173, proxies /api and /p to the API
```

Without AI credentials Muse runs the development fallback and says so everywhere. To use a real model locally set `MUSE_PROVIDER` and the matching key (see `.env.example`). Uploaded files go to `.data/uploads`.

`npm start` serves the built frontend and the API together on one port (what the end-to-end tests use).

## Environment variables

`.env.example` lists every variable with an explanation. Only `DATABASE_URL` and `AUTH_SECRET` are required. Put real values in `.env.local` (git-ignored) or in Vercel → Project → Settings → Environment Variables. Never in the repository, never in chat.

## Database migrations

- Add a new file `db/migrations/000N_name.sql`. Migrations are forward-only; never edit one that has been applied.
- `npm run db:migrate` applies pending files, each in a transaction, and records them in `schema_migrations`.
- On Vercel, `npm run build:deploy` runs the migrations for that environment's `DATABASE_URL` before building. A failing migration fails the deployment and leaves the database unchanged.
- To change or remove a column safely: add the new shape in one release, move the data, remove the old shape in a later release. Do not put `drop` statements for live data in a migration without a backup.

## Tests

```bash
npm test            # API, permissions, security, Muse, assets, publishing (needs a local Postgres; set TEST_DATABASE_URL)
npm run test:e2e    # Playwright: visitor → idea → sign-up → workspace → Muse → approval → versions → upload → publish
npm run typecheck
```

Both suites rebuild their database from the migrations on every run and refuse to run against a non-local database.

## Deployment

Staging is the Vercel preview of the `stage-03-backend` branch; production is `main`. The same repository and build serve both; only environment variables differ.

Vercel settings: framework Vite, build command `npm run build:deploy`, output `dist` (all in `vercel.json`). The API is `api/index.ts`, one function, 60 s limit.

### Staging (set for the Preview environment)

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | pooled connection string of the Neon project `aether-staging` |
| `AUTH_SECRET` | random, 48+ characters |
| `DEV_OUTBOX` | `true` (until an email key is added) |
| `BLOB_READ_WRITE_TOKEN` | token of the private Blob store `aether-staging-assets` |

| `MUSE_PROVIDER` | `fallback`, temporarily: AI Gateway refuses requests until a card is on file. Delete it to use the real model |

Without `MUSE_PROVIDER`, Muse uses AI Gateway through the deployment's own identity; no key is stored. `GET /api/muse/selftest` (staging and local only) makes one tiny real request and reports what the provider answered.

### Production cutover (not done; needs approval)

1. Create a separate Neon project and a separate private Blob store for production.
2. In Vercel, for the Production environment only, set `DATABASE_URL`, `AUTH_SECRET` (new value), `BLOB_READ_WRITE_TOKEN`, `RESEND_API_KEY`, `EMAIL_FROM`. Do not set `DEV_OUTBOX`.
3. Merge `stage-03-backend` into `main`. The production build migrates the production database, then deploys.
4. Check `/api/health`, sign up, create a project, publish.

## Authentication configuration

- Email: create a Resend API key, verify a sending domain, set `RESEND_API_KEY` and `EMAIL_FROM`. Until then, confirmation links are only available through the staging outbox and password-reset emails cannot be delivered.
- Google sign-in (optional): Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID → Web application. Authorised redirect URI: `<app origin>/api/auth/callback/google`. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. The button appears automatically.

## AI provider configuration

- Default on Vercel: AI Gateway, model `anthropic/claude-haiku-5.5`. Change the model with `MUSE_MODEL` (any id from the gateway catalogue). The free monthly credit only covers free-tier models; if the chosen model is not covered, either pick one that is or add credits in Vercel → AI Gateway.
- Another provider: `MUSE_PROVIDER=openai` with `OPENAI_API_KEY` (and `MUSE_BASE_URL` for a compatible API), or `MUSE_PROVIDER=anthropic` with `ANTHROPIC_API_KEY`.
- Spend limits: `MUSE_DAILY_BUDGET_USD` (whole environment) and `MUSE_WORKSPACE_DAILY_BUDGET_USD`. Set `MUSE_PRICE_INPUT_PER_M` / `MUSE_PRICE_OUTPUT_PER_M` to the model's list price so the estimates are right.
- Usage: Team page (admins), or the `ai_usage` table.

## Storage configuration

Vercel → Storage → Create → Blob, access **private**. Copy its read-write token into `BLOB_READ_WRITE_TOKEN` for the right environment. One store per environment.

## Publishing configuration

The built-in adapter needs nothing. For `<address>.<your domain>`: register the domain, add `*.<domain>` to the Vercel project and point wildcard DNS at Vercel, then set `PUBLISH_ADAPTER=subdomain`, `PUBLISH_ROOT_DOMAIN` and `PUBLISH_WILDCARD_READY=true`. Routing a wildcard host to `/p/<address>` also needs a rewrite in `vercel.json`; that part is not written yet.

## Rollback

- **Frontend or API:** Vercel → Deployments → pick the previous good deployment → Promote (instant). The approved Stage 02 version is also kept as the branch `release/stage-02-approved`.
- **Database:** migrations are forward-only. To undo a schema change, ship a new migration. To recover data, use Neon's point-in-time restore (project → Restore) to a moment before the problem.
- **A published project:** Launch page → Publishing history → Restore on an earlier build, or Unpublish.
- **A project's design:** canvas → History → Restore. The state before the restore is kept as its own version.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `/api/health` returns 503 | The API cannot reach Postgres. Check `DATABASE_URL` for that environment; on Neon the first request after idle can take a second or two |
| Every API call returns 500 and the log says `AUTH_SECRET must be set` | Set `AUTH_SECRET` (32+ characters) and redeploy |
| "This request did not come from the AETHER app" (403) | A state-changing request arrived without the app's own `Origin`. If the app is served from an extra domain, add it to `ALLOWED_ORIGINS` |
| Signed in on one preview URL, signed out on another | Cookies belong to one host. Use the branch URL consistently; confirmation links point at it |
| Confirmation email never arrives | No `RESEND_API_KEY`, or the sender domain is not verified. On staging use the link shown on the confirm screen |
| Muse answers "Development fallback" | No provider is configured for this environment (expected locally) |
| Muse fails with a provider error | The gateway rejected the request: model not on the free tier, credit used up, or rate limited. See the function log, change `MUSE_MODEL` or add credits |
| "Muse has reached its daily usage limit" | The spend cap was hit. Raise `MUSE_DAILY_BUDGET_USD` or wait for the next day (UTC) |
| Upload says storage is not configured | No `BLOB_READ_WRITE_TOKEN` for this environment |
| Publishing says it is not set up | The selected adapter reports missing requirements; the message lists them |
| Build fails at "Migration … failed" | The SQL error is in the build log. Nothing was applied; fix the migration and push again |
