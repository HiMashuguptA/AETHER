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

### Environments

| Variable | Production | Preview (staging) |
| --- | --- | --- |
| `DATABASE_URL` | pooled string of the Neon project `aether-production` | pooled string of the Neon project `aether-staging` |
| `AUTH_SECRET` | its own random value | its own random value |
| `BLOB_READ_WRITE_TOKEN` | private Blob store `aether-production-blob` | private Blob store `aether-staging-files` |
| `CRON_SECRET` | random; Vercel Cron sends it to `/api/cron/cleanup` | not set (cron runs on production only) |
| `MUSE_PROVIDER` | `auto` | `auto` |
| `DEV_OUTBOX` | never set | `true` until an email key exists |

With `MUSE_PROVIDER=auto`, adding `GROQ_API_KEY` or `GEMINI_API_KEY` is the only step needed to switch Muse to a real model. `GET /api/muse/selftest` (staging and local only) makes one tiny real request and reports what the provider answered.

The build migrates the database of the environment it builds for (`npm run build:deploy`), so production migrations happen when `main` deploys. Migrations are additive.

### Releasing a change

1. Push to `stage-03-backend`; check the preview (`/api/health`, sign up, a project, publish).
2. Merge into `main`. The production build migrates the production database, then deploys.
3. Check `https://aether-delta-lime.vercel.app/api/health`.

## Authentication configuration

- Email: create a Resend API key and verify a sending domain you own in Resend, then set `RESEND_API_KEY` and `EMAIL_FROM` (for example `AETHER <hello@your-domain>`). From then on sign-up asks people to confirm their email, password reset works, and invitations are emailed. Until then production does not ask for confirmation (nothing could reach the inbox) and password reset is unavailable.
- Google sign-in (optional): Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID → Web application. Authorised redirect URI: `<app origin>/api/auth/callback/google`. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. The button appears automatically.

## AI provider configuration

Muse works with any of these; the first key present decides when `MUSE_PROVIDER` is `auto` or unset.

| Provider | Free tier | Key | Default model |
| --- | --- | --- | --- |
| Groq | Yes, no card | console.groq.com → API Keys → Create | `openai/gpt-oss-120b` |
| Google Gemini | Yes, no card | aistudio.google.com → Get API key | `gemini-2.5-flash` |
| Any OpenAI-compatible API (OpenRouter and others) | Depends | `OPENAI_API_KEY` with `MUSE_BASE_URL` | set `MUSE_MODEL` |
| Anthropic | No | `ANTHROPIC_API_KEY` | `claude-haiku-5-5` |
| Vercel AI Gateway | Free monthly credit, but Vercel asks for a card on file first | `MUSE_PROVIDER=gateway` (no key on Vercel) | `anthropic/claude-haiku-5.5` |

To switch on a free tier: create the key yourself (never paste it into a chat), then Vercel → Project → Settings → Environment Variables → add `GROQ_API_KEY` (or `GEMINI_API_KEY`) as **Sensitive** for Production and Preview → Deployments → Redeploy. On staging, `/api/muse/selftest` should then say `"ok": true`.

- Free tiers are rate limited by the provider. When a limit is hit, Muse says so and changes nothing; it never falls back to canned answers.
- Muse asks for strict JSON Schema output. If a provider rejects that, it asks for plain JSON with the schema in the prompt instead; every answer is validated on the server either way.
- `MUSE_MODEL` overrides the default model. Spend limits: `MUSE_DAILY_BUDGET_USD` (whole environment) and `MUSE_WORKSPACE_DAILY_BUDGET_USD`. Free usage is still costed at the provider's paid list price, so these limits keep working if billing is ever turned on for the key.
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
| Confirmation email never arrives | The sender domain is not verified in Resend. On staging use the link shown on the confirm screen |
| Cleanup did not run | Cron runs once a day on production only and needs `CRON_SECRET`. Vercel → Project → Cron Jobs shows each run |
| Muse answers "Development fallback" | No provider is configured for this environment (expected locally) |
| Muse fails with a provider error | The provider rejected the request: wrong key, unknown model, or the free tier's limit. See the function log (keys are redacted), check the key or `MUSE_MODEL`, or wait for the limit to reset |
| "Muse has used its AI allowance for the moment" | The provider's free-tier rate limit. It resets on the provider's schedule |
| "Muse has reached its daily usage limit" | The spend cap was hit. Raise `MUSE_DAILY_BUDGET_USD` or wait for the next day (UTC) |
| Upload says storage is not configured | No `BLOB_READ_WRITE_TOKEN` for this environment |
| Publishing says it is not set up | The selected adapter reports missing requirements; the message lists them |
| Build fails at "Migration … failed" | The SQL error is in the build log. Nothing was applied; fix the migration and push again |
